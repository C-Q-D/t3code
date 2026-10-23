/** Exercises quota gates and reply races through a fake RPC command, without a server. */
import "../../index.css";
import { RegistryContext, RegistryProvider } from "@effect/atom-react";
import {
  EnvironmentId,
  RunId,
  RuntimeRequestId,
  ThreadId,
  type ComposerSuggestResult,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { AsyncResult, AtomRegistry } from "effect/reactivity";
import { StrictMode, createRef, useState } from "react";
import { userEvent } from "vite-plus/test/browser";
import { expect, it, vi } from "vite-plus/test";
import { act, render } from "../../../test/render";
import { useComposerSuggestion } from "./useComposerSuggestion";
import { ComposerPromptEditor, type ComposerPromptEditorHandle } from "../ComposerPromptEditor";
import { installMessages, t, activeLocale } from "../../i18n";
import { messages as chineseMessages } from "../../i18n/locales/zh-CN";
import { GeneralSettingsPanel, useSettingsRestore } from "../settings/SettingsPanels";
import { useClientSettings, persistClientSettingsPatch } from "../../hooks/useSettings";
import { searchSettings } from "../settings/settingsSearch";
import type { ClientSettings } from "@t3tools/contracts";

const rpc = vi.hoisted(() => ({ run: vi.fn() }));
const storage = vi.hoisted(() => ({ save: vi.fn(), confirm: vi.fn() }));
vi.mock(import("../../localApi"), async (original) => {
  const actual = await original();
  const api = {
    persistence: { getClientSettings: async () => null, setClientSettings: storage.save },
    dialogs: { confirm: storage.confirm },
  };
  return { ...actual, ensureLocalApi: (() => api) as never, readLocalApi: (() => api) as never };
});
vi.mock(import("../settings/SettingsScopeContext"), async (original) => ({
  ...(await original()),
  useSettingsScope: (() => ({
    scope: { kind: "all", environmentIds: [] },
    environments: [],
    connectedEnvironments: [],
    environment: null,
    target: null,
    targets: [],
    search: {},
    selectScope: () => {},
  })) as never,
}));
vi.mock(import("../../state/environments"), async (original) => ({
  ...(await original()),
  useEnvironments: () => ({
    isReady: true,
    networkStatus: "online" as const,
    environments: [],
    presentationById: new Map(),
  }),
  useEnvironmentProviders: () => new Map(),
  usePrimaryEnvironmentId: () => null,
  usePrimaryEnvironment: () => null,
}));
// This client-only settings fixture has no connected environments or server grants to discover.
vi.mock(import("../../state/session"), async (original) => ({
  ...(await original()),
  useEnvironmentsWithScope: () => new Set<EnvironmentId>(),
  useEnvironmentScope: () => false,
}));
vi.mock(import("../../state/composerAssist"), async (original) => {
  const actual = await original();
  return {
    composerAssistEnvironment: {
      ...actual.composerAssistEnvironment,
      suggestNext: { ...actual.composerAssistEnvironment.suggestNext, run: rpc.run },
    },
  };
});

type Input = Parameters<typeof useComposerSuggestion>[0];
const runId = RunId.make("run-2");
const target = {
  environmentId: EnvironmentId.make("suggestion-test"),
  threadId: ThreadId.make("thread-a"),
};
const suggested: ComposerSuggestResult = {
  _tag: "Suggested",
  requestId: "request-a",
  runId,
  text: "跑一下测试",
};

/** Resets only the fake boundary; registry ownership isolates request deduplication per test. */
function setup(): Input {
  rpc.run.mockReset().mockResolvedValue(AsyncResult.success(suggested));
  return {
    target,
    shell: {
      latestRunId: runId,
      status: "idle",
      activeRunId: null,
      interactionMode: "default",
      pendingRuntimeRequest: null,
      lastErrorClass: null,
      usageLimitResetAt: null,
    },
    enabled: true,
    connected: true,
    composerEmpty: true,
    driver: "claudeAgent",
    completedRuns: 2,
    lastTurnCompletedAt: "2026-10-23T10:00:00.000Z",
    promptCacheExpiresAt: null,
  };
}

/** Renders the hook's visible result; the fake supplies transport results, not gate decisions. */
function Probe({ input }: { input: Input }) {
  const { suggestion } = useComposerSuggestion(input);
  return <output aria-label="prediction">{suggestion ?? "none"}</output>;
}

/** Preserves the client registry across rerenders, including StrictMode effect replay. */
function view(input: Input) {
  return (
    <RegistryProvider>
      <StrictMode>
        <Probe input={input} />
      </StrictMode>
    </RegistryProvider>
  );
}

/** Uses the real editor so typing exercises draft invalidation and accessible placeholder updates. */
function EditorProbe({ input }: { input: Input }) {
  const [prompt, setPrompt] = useState("");
  const { suggestion, accept } = useComposerSuggestion({
    ...input,
    composerEmpty: input.composerEmpty && prompt.length === 0,
  });
  return (
    <ComposerPromptEditor
      value={prompt}
      cursor={prompt.length}
      editorRef={createRef<ComposerPromptEditorHandle>()}
      contextRecords={new Map()}
      skills={[]}
      disabled={false}
      placeholder={suggestion ?? "默认占位"}
      suggestion={suggestion === null ? undefined : { text: suggestion, onAccept: accept }}
      onChange={setPrompt}
      onPaste={() => {}}
    />
  );
}

/** Restores global locale after the test, including on assertion failure. */
function chineseLocale() {
  const previous = { locale: activeLocale, messages: t };
  installMessages("zh-CN", chineseMessages);
  return { [Symbol.dispose]: () => installMessages(previous.locale, previous.messages) };
}

/** Shares real client settings between the settings page and the suggestion consumer. */
function SettingsProbe({ input }: { input: Input }) {
  const settings = useClientSettings();
  const { changedSettingLabels, restoreDefaults } = useSettingsRestore();
  return (
    <>
      <GeneralSettingsPanel />
      <button onClick={() => void restoreDefaults()}>Restore all settings</button>
      <output aria-label="changed settings">{changedSettingLabels.join(", ")}</output>
      <Probe input={{ ...input, enabled: settings.composerSuggestionsEnabled }} />
    </>
  );
}

it("turns suggestions off from settings, persists both switches and restores their defaults", async () => {
  const input = setup();
  using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
  storage.save.mockReset().mockResolvedValue(undefined);
  storage.confirm.mockReset().mockResolvedValue(true);
  await persistClientSettingsPatch({
    composerSuggestionsEnabled: true,
    composerPromptOptimizeEnabled: true,
  });
  await using _settings = {
    [Symbol.asyncDispose]: () =>
      persistClientSettingsPatch({
        composerSuggestionsEnabled: true,
        composerPromptOptimizeEnabled: true,
      }),
  };
  const running: Input = {
    ...input,
    shell: { ...input.shell!, status: "running", activeRunId: runId },
  };
  await using screen = await render(
    <RegistryProvider>
      <SettingsProbe input={running} />
    </RegistryProvider>,
  );
  await userEvent.click(screen.getByRole("switch", { name: "Composer suggestions", exact: true }));
  await userEvent.click(screen.getByRole("switch", { name: "Prompt improvement", exact: true }));
  await vi.waitFor(() => {
    const labels = screen.getByLabelText("changed settings").element().textContent;
    expect(labels).toContain("Composer suggestions");
    expect(labels).toContain("Prompt improvement");
  });
  await expect
    .element(
      screen.getByRole("button", { name: "Reset composer suggestions to default", exact: true }),
    )
    .toBeVisible();
  await expect
    .element(
      screen.getByRole("button", { name: "Reset prompt improvement to default", exact: true }),
    )
    .toBeVisible();
  expect(storage.save.mock.calls.at(-1)?.[0] as ClientSettings).toMatchObject({
    composerSuggestionsEnabled: false,
    composerPromptOptimizeEnabled: false,
  });
  await screen.rerender(
    <RegistryProvider>
      <SettingsProbe input={input} />
    </RegistryProvider>,
  );
  expect(rpc.run).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Reset prompt improvement to default", exact: true }),
  );
  await expect
    .element(screen.getByRole("switch", { name: "Prompt improvement", exact: true }))
    .toBeChecked();
  expect(rpc.run).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("switch", { name: "Prompt improvement", exact: true }));
  await userEvent.click(screen.getByRole("button", { name: "Restore all settings", exact: true }));
  await expect
    .element(screen.getByRole("switch", { name: "Composer suggestions", exact: true }))
    .toBeChecked();
  await expect
    .element(screen.getByRole("switch", { name: "Prompt improvement", exact: true }))
    .toBeChecked();
  await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("跑一下测试");
  expect(storage.save.mock.calls.at(-1)?.[0] as ClientSettings).toMatchObject({
    composerSuggestionsEnabled: true,
    composerPromptOptimizeEnabled: true,
  });
  expect(searchSettings("Composer suggestions").map((entry) => entry.id)).toContain(
    "composer-suggestions",
  );
  expect(searchSettings("Prompt improvement").map((entry) => entry.id)).toContain(
    "composer-prompt-optimize",
  );
});

it("shows the suggestion in the empty editor and retires it when the user types", async () => {
  const input = setup();
  using _locale = chineseLocale();
  using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
  await using screen = await render(
    <RegistryProvider>
      <EditorProbe input={input} />
    </RegistryProvider>,
  );
  const editor = screen.getByRole("textbox");
  await expect.element(screen.getByText("跑一下测试", { exact: true })).toBeVisible();
  await expect.element(editor).toHaveAttribute("aria-description", "建议：跑一下测试。按 Tab 填入");
  await userEvent.click(editor);
  await userEvent.keyboard("x");
  await expect.element(editor).toHaveTextContent("x");
  await expect.element(editor).toHaveAttribute("aria-placeholder", "默认占位");
  await expect.element(editor).not.toHaveAttribute("aria-description");
  await userEvent.keyboard("{Backspace}");
  await expect.element(screen.getByText("默认占位", { exact: true })).toBeVisible();
  expect(rpc.run).toHaveBeenCalledTimes(1);
});

it("restores the editor placeholder when a new run starts", async () => {
  const input = setup();
  using _locale = chineseLocale();
  using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
  await using screen = await render(
    <RegistryProvider>
      <EditorProbe input={input} />
    </RegistryProvider>,
  );
  await expect.element(screen.getByText("跑一下测试", { exact: true })).toBeVisible();
  await screen.rerender(
    <RegistryProvider>
      <EditorProbe
        input={{
          ...input,
          shell: { ...input.shell!, latestRunId: RunId.make("next"), status: "running" },
        }}
      />
    </RegistryProvider>,
  );
  await expect.element(screen.getByText("默认占位", { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("textbox")).not.toHaveAttribute("aria-description");
});

it.each(["claudeAgent", "codex"])(
  "requests once when %s finishes and never retries the run",
  async (driver) => {
    const input = { ...setup(), driver };
    using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
    await using screen = await render(
      view({ ...input, shell: { ...input.shell!, status: "running", activeRunId: runId } }),
    );
    expect(rpc.run).not.toHaveBeenCalled();
    await screen.rerender(view(input));
    await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("跑一下测试");
    expect(rpc.run).toHaveBeenCalledTimes(1);
    expect(rpc.run.mock.calls[0]?.[1]).toEqual({
      environmentId: target.environmentId,
      input: { threadId: target.threadId, runId },
    });
    await screen.rerender(view({ ...input, composerEmpty: false }));
    await screen.rerender(view(input));
    await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("none");
    expect(rpc.run).toHaveBeenCalledTimes(1);
  },
);

it.each([
  ["setting off", { enabled: false }],
  ["unsupported provider", { driver: "cursor" }],
  ["draft text, attachment or reference", { composerEmpty: false }],
  ["disconnected", { connected: false }],
  ["early conversation", { completedRuns: 1 }],
  ["expired Claude cache", { promptCacheExpiresAt: "2026-10-23T09:00:00Z" }],
  ["expired Codex cache", { driver: "codex", lastTurnCompletedAt: "2026-10-23T09:00:00Z" }],
] satisfies Array<[string, Partial<Input>]>)(
  "does not spend quota with %s",
  async (_name, override) => {
    const input = setup();
    using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
    await using screen = await render(view({ ...input, ...override }));
    expect(rpc.run).not.toHaveBeenCalled();
    await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("none");
    await screen.rerender(view(input));
    await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("跑一下测试");
  },
);

it.each([
  ["plan", { interactionMode: "plan" }],
  [
    "pending approval",
    {
      pendingRuntimeRequest: {
        id: RuntimeRequestId.make("approval"),
        kind: "command",
        createdAt: DateTime.makeUnsafe("2026-10-23T10:00:00Z"),
      },
    },
  ],
  [
    "pending question",
    {
      pendingRuntimeRequest: {
        id: RuntimeRequestId.make("question"),
        kind: "user_input",
        createdAt: DateTime.makeUnsafe("2026-10-23T10:00:00Z"),
      },
    },
  ],
  ["running status", { status: "running" }],
  ["active run", { activeRunId: runId }],
  ["last error", { lastErrorClass: "provider_error" }],
  ["quota error", { lastErrorClass: "usage_limit" }],
  ["quota reset in future", { usageLimitResetAt: "2026-10-23T11:00:00Z" }],
] satisfies Array<[string, Partial<NonNullable<Input["shell"]>>]>)(
  "does not spend quota with shell %s",
  async (_name, override) => {
    const input = setup();
    using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
    await using screen = await render(view({ ...input, shell: { ...input.shell!, ...override } }));
    expect(rpc.run).not.toHaveBeenCalled();
    await screen.rerender(view(input));
    await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("跑一下测试");
  },
);

it.each([
  { _tag: "Suppressed", requestId: "s", reason: "pending_request" },
  { _tag: "Filtered", requestId: "f", reason: "empty" },
  { _tag: "Failed", requestId: "e", reason: "provider_error" },
] satisfies ComposerSuggestResult[])(
  "silently retires a $_tag response without retry",
  async (result) => {
    const input = setup();
    using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
    rpc.run.mockResolvedValue(AsyncResult.success(result));
    await using screen = await render(view(input));
    await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("none");
    await screen.rerender(view({ ...input, composerEmpty: false }));
    await screen.rerender(view(input));
    expect(rpc.run).toHaveBeenCalledTimes(1);
  },
);

it("does not retry or report a transport rejection", async () => {
  const input = setup();
  using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
  using warn = vi.spyOn(console, "warn");
  using error = vi.spyOn(console, "error");
  rpc.run.mockRejectedValue(new Error("transport closed"));
  await using screen = await render(view(input));
  await screen.rerender(view({ ...input, composerEmpty: false }));
  await screen.rerender(view(input));
  await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("none");
  expect(rpc.run).toHaveBeenCalledTimes(1);
  expect(warn).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
});

it("rejects a Suggested response belonging to another run", async () => {
  const input = setup();
  using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
  rpc.run.mockResolvedValue(AsyncResult.success({ ...suggested, runId: RunId.make("wrong-run") }));
  await using screen = await render(view(input));
  await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("none");
  expect(rpc.run).toHaveBeenCalledTimes(1);
});

it("retires the previous suggestion and requests the next completed run once", async () => {
  const input = setup();
  using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
  await using screen = await render(view(input));
  await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("跑一下测试");
  const next = { ...input, shell: { ...input.shell!, latestRunId: RunId.make("run-3") } };
  rpc.run.mockResolvedValue(
    AsyncResult.success({ ...suggested, runId: RunId.make("run-3"), text: "继续实现" }),
  );
  await screen.rerender(
    view({
      ...next,
      shell: { ...next.shell, status: "running", activeRunId: RunId.make("run-3") },
    }),
  );
  await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("none");
  await screen.rerender(view(next));
  await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("继续实现");
  expect(rpc.run).toHaveBeenCalledTimes(2);
});

it.each(["thread", "run", "draft"])(
  "discards a late reply after the %s changes",
  async (change) => {
    const input = setup();
    using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
    let resolve!: (value: ReturnType<typeof AsyncResult.success<ComposerSuggestResult>>) => void;
    const reply = new Promise<ReturnType<typeof AsyncResult.success<ComposerSuggestResult>>>(
      (done) => {
        resolve = done;
      },
    );
    rpc.run.mockReturnValue(reply);
    await using screen = await render(view(input));
    const next =
      change === "thread"
        ? { ...input, target: { ...target, threadId: ThreadId.make("thread-b") }, enabled: false }
        : change === "run"
          ? {
              ...input,
              shell: {
                ...input.shell!,
                latestRunId: RunId.make("run-3"),
                status: "running" as const,
              },
            }
          : { ...input, composerEmpty: false };
    await screen.rerender(view(next));
    await screen.rerender(view(input));
    await act(async () => {
      resolve(AsyncResult.success(suggested));
      await reply;
    });
    await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("none");
    await screen.rerender(view(input));
    await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("none");
    expect(rpc.run).toHaveBeenCalledTimes(1);
  },
);

it("keeps one deduplication record per thread after consecutive runs", async () => {
  const input = setup();
  using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
  using resources = new DisposableStack();
  const registry = resources.adopt(AtomRegistry.make(), (value) => value.dispose());
  // Observe storage ownership without exporting a production-only inspection API.
  const records: Array<Map<unknown, unknown> | Set<unknown>> = [];
  const originalSet = WeakMap.prototype.set;
  using _storage = {
    [Symbol.dispose]: () => {
      // oxlint-disable-next-line no-extend-native -- Restore the native method after the scoped storage observation.
      WeakMap.prototype.set = originalSet;
    },
  };
  // oxlint-disable-next-line no-extend-native -- Observe the private resource bound without adding a production inspection API; vi.spyOn recurses through its own WeakMap bookkeeping.
  WeakMap.prototype.set = function (owner, value) {
    if (owner === registry && (value instanceof Map || value instanceof Set)) records.push(value);
    originalSet.call(this, owner, value);
    return this;
  };
  await using screen = await render(
    <RegistryContext.Provider value={registry}>
      <Probe input={input} />
    </RegistryContext.Provider>,
  );
  for (const id of ["run-3", "run-4", "run-5"]) {
    const nextRun = RunId.make(id);
    rpc.run.mockResolvedValue(AsyncResult.success({ ...suggested, runId: nextRun, text: id }));
    await screen.rerender(
      <RegistryContext.Provider value={registry}>
        <Probe input={{ ...input, shell: { ...input.shell!, latestRunId: nextRun } }} />
      </RegistryContext.Provider>,
    );
    await expect.element(screen.getByLabelText("prediction")).toHaveTextContent(id);
  }
  expect(rpc.run).toHaveBeenCalledTimes(4);

  expect(records).toHaveLength(1);
  expect(records[0]?.size).toBe(1);
});

it("does not request again after a real unmount with the same registry", async () => {
  const input = setup();
  using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
  using resources = new DisposableStack();
  const registry = resources.adopt(AtomRegistry.make(), (value) => value.dispose());
  await using first = await render(
    <RegistryContext.Provider value={registry}>
      <Probe input={input} />
    </RegistryContext.Provider>,
  );
  await expect.element(first.getByLabelText("prediction")).toHaveTextContent("跑一下测试");
  await first.unmount();
  await using second = await render(
    <RegistryContext.Provider value={registry}>
      <Probe input={input} />
    </RegistryContext.Provider>,
  );
  await expect.element(second.getByLabelText("prediction")).toHaveTextContent("none");
  expect(rpc.run).toHaveBeenCalledTimes(1);
});

it("requests only twice across thread A to B to A", async () => {
  const input = setup();
  using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
  await using screen = await render(view(input));
  await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("跑一下测试");
  await screen.rerender(
    view({ ...input, target: { ...target, threadId: ThreadId.make("thread-b") } }),
  );
  await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("跑一下测试");
  await screen.rerender(view(input));
  await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("none");
  expect(rpc.run).toHaveBeenCalledTimes(2);
});
