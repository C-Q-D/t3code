/** Exercises improvement through a real editor with a controlled RPC boundary, without a provider. */
import { useRef, useState, useSyncExternalStore } from "react";
import { EnvironmentId, ThreadId, type ComposerOptimizeResult } from "@t3tools/contracts";
import { Atom, AsyncResult } from "effect/reactivity";
import { composerAssistEnvironment } from "~/state/composerAssist";
import { composerShortcutCommands } from "./composerShortcuts";
import { resolveChatShortcutCommand } from "~/keybindings";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { buildOptimizePromptAction } from "../CommandPalette.logic";
import { commandLabel } from "../settings/KeybindingsSettings.logic";
import { activeLocale, installMessages, t } from "~/i18n";
import { en } from "~/i18n/locales/en";
import { messages as zhCN } from "~/i18n/locales/zh-CN";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { act, render } from "../../../test/render";
import { ComposerPromptEditor, type ComposerPromptEditorHandle } from "../ComposerPromptEditor";
import {
  useComposerPromptOptimizer,
  type ComposerPromptOptimizerInput,
} from "./useComposerPromptOptimizer";
import {
  ComposerPromptOptimizeButton,
  ComposerPromptOptimizeTab,
} from "./ComposerPromptOptimizeTab";

/** Lets each test release one RPC response at an explicit milestone. */
function deferredResult() {
  let resolve!: (value: ReturnType<typeof AsyncResult.success<ComposerOptimizeResult>>) => void;
  const promise = new Promise<ReturnType<typeof AsyncResult.success<ComposerOptimizeResult>>>(
    (settle) => {
      resolve = settle;
    },
  );
  return { promise, resolve };
}

const fake = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => fake.run }));
vi.mock("~/state/composerAssist", () => ({
  composerAssistEnvironment: { optimizePrompt: { permissionAtom: () => Atom.make(true) } },
}));

/** Mounts the same editor contract used by ChatComposer; buttons invoke the hook's public operations. */
function Harness({
  thread = "thread",
  options,
}: {
  thread?: string;
  options?: Partial<ComposerPromptOptimizerInput>;
}) {
  const [prompt, setPrompt] = useState("  fix the bug  ");
  const [cursor, setCursor] = useState(15);
  const editorRef = useRef<ComposerPromptEditorHandle | null>(null);
  const optimizer = useComposerPromptOptimizer({
    environmentId: EnvironmentId.make("env"),
    threadId: ThreadId.make(thread),
    draftKey: thread,
    prompt,
    driver: "codex",
    enabled: true,
    running: false,
    editorRef,
    ...options,
  });
  const available = useSyncExternalStore(
    optimizer.availability.subscribe,
    optimizer.availability.getSnapshot,
  );
  const paletteAction = buildOptimizePromptAction({
    available,
    icon: null,
    run: optimizer.trigger,
  });
  return (
    <div
      onKeyDown={(event) => {
        const command = resolveChatShortcutCommand(
          event.nativeEvent,
          DEFAULT_RESOLVED_KEYBINDINGS,
          [],
          { platform: "Win32", context: { composerFocus: true } },
        );
        if (!command) return;
        const handlers = composerShortcutCommands(
          {
            current: {
              optimizePrompt: optimizer.trigger,
              openControl: () => {},
              toggleModelPicker: () => {},
              stepReasoningEffort: () => {},
            },
          },
          { current: null },
        );
        handlers[command]?.({ event: event.nativeEvent, terminalFocusOwner: null });
      }}
    >
      {paletteAction ? (
        <button role="menuitem" onClick={() => void paletteAction.run()}>
          Improve prompt
        </button>
      ) : null}
      <ComposerPromptOptimizeButton optimizer={optimizer} shortcut="Ctrl+Shift+U" />
      <ComposerPromptEditor
        editorRef={editorRef}
        value={prompt}
        cursor={cursor}
        contextRecords={new Map()}
        skills={[]}
        disabled={false}
        placeholder="Draft"
        onChange={(text, nextCursor) => {
          setPrompt(text);
          setCursor(nextCursor);
        }}
        onPaste={() => {}}
      />
      <button onClick={() => void optimizer.trigger()}>Improve</button>
      <pre data-draft>{prompt}</pre>
      <div role="status">
        <ComposerPromptOptimizeTab optimizer={optimizer} />
      </div>
    </div>
  );
}

it("replaces the original untrimmed draft and restores it with one editor undo", async () => {
  fake.run.mockReset().mockResolvedValue(
    AsyncResult.success({
      _tag: "Optimized",
      requestId: "one",
      text: "Fix the bug and run its regression test.",
      cacheMaybeExpired: false,
    } satisfies ComposerOptimizeResult),
  );
  await using screen = await render(<Harness />);
  await screen.getByRole("button", { name: "Improve", exact: true }).click();
  expect(fake.run).toHaveBeenCalledExactlyOnceWith({
    environmentId: "env",
    input: { threadId: "thread", draft: "  fix the bug  ", style: "default" },
  });
  await expect.element(screen.getByText("Improved", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByRole("textbox"))
    .toHaveTextContent("Fix the bug and run its regression test.");
  await screen.getByRole("textbox").click();
  await userEvent.keyboard("{Control>}z{/Control}");
  await expect.element(screen.getByRole("textbox")).toHaveTextContent("fix the bug");
  expect(screen.container.querySelector("[data-draft]")?.textContent).toBe("  fix the bug  ");
});

it("uses the specified localized keybinding labels", () => {
  const previous = { locale: activeLocale, messages: t };
  try {
    installMessages("en", en);
    expect(commandLabel("composer.optimizePrompt")).toBe("Improve prompt");
    installMessages("zh-CN", zhCN);
    expect(commandLabel("composer.optimizePrompt")).toBe("优化提示词");
  } finally {
    installMessages(previous.locale, previous.messages);
  }
});

it("dispatches improvement through Ctrl+Shift+U", async () => {
  fake.run
    .mockReset()
    .mockResolvedValue(
      AsyncResult.success({ _tag: "Filtered", requestId: "key", reason: "unchanged" }),
    );
  await using screen = await render(<Harness />);
  await screen.getByRole("textbox").click();
  await userEvent.keyboard("{Control>}{Shift>}u{/Shift}{/Control}");
  expect(fake.run).toHaveBeenCalledTimes(1);
  await expect.element(screen.getByRole("status")).toHaveTextContent("The draft is already clear");
});

it("dispatches improvement through the palette action", async () => {
  fake.run
    .mockReset()
    .mockResolvedValue(
      AsyncResult.success({ _tag: "Filtered", requestId: "palette", reason: "unchanged" }),
    );
  await using screen = await render(<Harness />);
  await screen.getByRole("menuitem", { name: "Improve prompt" }).click();
  expect(fake.run).toHaveBeenCalledTimes(1);
  await expect.element(screen.getByRole("status")).toHaveTextContent("The draft is already clear");
});

it("dispatches from the visible improvement button", async () => {
  fake.run
    .mockReset()
    .mockResolvedValue(
      AsyncResult.success({ _tag: "Filtered", requestId: "button", reason: "unchanged" }),
    );
  await using screen = await render(<Harness />);
  await screen.getByRole("button", { name: "Improve prompt", exact: true }).click();
  expect(fake.run).toHaveBeenCalledTimes(1);
  await expect.element(screen.getByRole("status")).toHaveTextContent("The draft is already clear");
});

it.each([
  [{ prompt: "" }, "Write a draft first"],
  [{ driver: "cursor" }, "This provider does not support prompt improvement"],
  [{ running: true }, "Wait for the reply to finish"],
] as const)("disables the button for %j and explains why", async (options, reason) => {
  fake.run.mockReset();
  await using screen = await render(<Harness options={options} />);
  await expect
    .element(screen.getByRole("button", { name: "Improve prompt", exact: true }))
    .toBeDisabled();
  await screen.getByRole("group", { name: "Improve prompt" }).hover();
  await expect.element(page.getByText(reason, { exact: true })).toBeVisible();
  expect(fake.run).not.toHaveBeenCalled();
});

it("warns about expired cache before dispatch and during the request", async () => {
  using _now = vi.spyOn(Date, "now").mockReturnValue(1790000000000);
  const pending = deferredResult();
  fake.run.mockReset().mockReturnValue(pending.promise);
  await using screen = await render(
    <Harness
      options={{
        driver: "claudeAgent",
        lastTurnCompletedAt: "2026-01-01T00:00:00Z",
        promptCacheExpiresAt: "2026-01-01T01:00:00Z",
      }}
    />,
  );
  await screen.getByRole("group", { name: "Improve prompt" }).hover();
  await expect
    .element(
      page.getByText("Improve prompt Ctrl+Shift+U · This one may cost full price", { exact: true }),
    )
    .toBeVisible();
  await screen.getByRole("button", { name: "Improve prompt", exact: true }).click();
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Improving… · This one may cost full price");
  await expect
    .element(screen.getByRole("button", { name: "Improve prompt", exact: true }))
    .toBeDisabled();
  await act(async () =>
    pending.resolve(
      AsyncResult.success({ _tag: "Filtered", requestId: "cache", reason: "unchanged" }),
    ),
  );
});

it("does not warn while the cache is fresh", async () => {
  using _now = vi.spyOn(Date, "now").mockReturnValue(1767225900000);
  const pending = deferredResult();
  fake.run.mockReset().mockReturnValue(pending.promise);
  await using screen = await render(
    <Harness options={{ driver: "codex", lastTurnCompletedAt: "2026-01-01T00:00:00Z" }} />,
  );
  await screen.getByRole("group", { name: "Improve prompt" }).hover();
  await expect
    .element(page.getByText("Improve prompt Ctrl+Shift+U", { exact: true }))
    .toBeVisible();
  expect(screen.container.querySelector("[data-composer-cache-warning]")).toBeNull();
  await screen.getByRole("button", { name: "Improve prompt", exact: true }).click();
  await expect.element(screen.getByRole("status")).toHaveTextContent("Improving…");
  await act(async () =>
    pending.resolve(
      AsyncResult.success({ _tag: "Filtered", requestId: "fresh", reason: "unchanged" }),
    ),
  );
});

it.each(["setting", "permission"] as const)(
  "hides improvement and blocks dispatch when %s is off",
  async (gate) => {
    fake.run.mockReset();
    using _permission = vi
      .spyOn(composerAssistEnvironment.optimizePrompt, "permissionAtom")
      .mockReturnValue(Atom.make(gate !== "permission"));
    await using screen = await render(<Harness options={{ enabled: gate !== "setting" }} />);
    await expect
      .element(screen.getByRole("button", { name: "Improve prompt", exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("menuitem", { name: "Improve prompt" }))
      .not.toBeInTheDocument();
    await screen.getByRole("textbox").click();
    await userEvent.keyboard("{Control>}{Shift>}u{/Shift}{/Control}");
    await screen.getByRole("button", { name: "Improve", exact: true }).click();
    expect(fake.run).not.toHaveBeenCalled();
  },
);

it.each(["edited draft", ""])(
  "discards a late result after the draft becomes %j",
  async (nextDraft) => {
    const pending = deferredResult();
    fake.run.mockReset().mockReturnValue(pending.promise);
    await using screen = await render(<Harness />);
    await screen.getByRole("button", { name: "Improve", exact: true }).click();
    await expect.element(screen.getByRole("status")).toHaveTextContent("Improving…");
    await screen.getByRole("textbox").fill(nextDraft);
    await act(async () =>
      pending.resolve(
        AsyncResult.success({
          _tag: "Optimized",
          requestId: "late",
          text: "Stale rewrite",
          cacheMaybeExpired: false,
        }),
      ),
    );
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Draft changed; result discarded");
    expect(screen.container.querySelector("[data-draft]")?.textContent).toBe(nextDraft);
  },
);

it("silently drops a response after changing threads", async () => {
  const pending = deferredResult();
  fake.run.mockReset().mockReturnValue(pending.promise);
  await using screen = await render(<Harness />);
  await screen.getByRole("button", { name: "Improve", exact: true }).click();
  await screen.rerender(<Harness thread="other" />);
  await act(async () =>
    pending.resolve(
      AsyncResult.success({
        _tag: "Optimized",
        requestId: "late",
        text: "Stale rewrite",
        cacheMaybeExpired: false,
      }),
    ),
  );
  await expect.element(screen.getByRole("status")).toBeEmptyDOMElement();
  expect(screen.container.querySelector("[data-draft]")?.textContent).toBe("  fix the bug  ");
});

it("does not dispatch a second request while the first is pending", async () => {
  const pending = deferredResult();
  fake.run.mockReset().mockReturnValue(pending.promise);
  await using screen = await render(<Harness />);
  await screen.getByRole("button", { name: "Improve", exact: true }).click();
  await screen.getByRole("button", { name: "Improve", exact: true }).click();
  expect(fake.run).toHaveBeenCalledTimes(1);
  await act(async () =>
    pending.resolve(
      AsyncResult.success({ _tag: "Filtered", requestId: "one", reason: "unchanged" }),
    ),
  );
});

it("restores the original draft using the explicit undo action", async () => {
  fake.run.mockReset().mockResolvedValue(
    AsyncResult.success({
      _tag: "Optimized",
      requestId: "two",
      text: "Find the root cause first.",
      cacheMaybeExpired: false,
    } satisfies ComposerOptimizeResult),
  );
  await using screen = await render(<Harness />);
  await screen.getByRole("button", { name: "Improve", exact: true }).click();
  await expect.element(screen.getByRole("textbox")).toHaveTextContent("Find the root cause first.");
  expect(window.getSelection()?.anchorOffset).toBe(26);
  await screen.getByRole("button", { name: "Undo", exact: true }).click();
  expect(screen.container.querySelector("[data-draft]")?.textContent).toBe("  fix the bug  ");
});

it.each([
  [{ _tag: "Filtered", reason: "unchanged" }, "The draft is already clear"],
  [{ _tag: "Filtered", reason: "empty" }, "Could not improve: the model returned nothing"],
  [{ _tag: "Filtered", reason: "too_long" }, "Could not improve: the result was too long"],
  [
    { _tag: "Filtered", reason: "references_dropped" },
    "Could not improve: the result dropped a reference or path",
  ],
  [{ _tag: "Failed", reason: "timeout" }, "Could not improve: timed out"],
  [
    { _tag: "Failed", reason: "session_resume_failed" },
    "Could not improve: could not resume the session",
  ],
  [{ _tag: "Failed", reason: "provider_error" }, "Could not improve: provider error"],
  [{ _tag: "Failed", reason: "interrupted" }, "Could not improve: provider error"],
  [{ _tag: "Failed", reason: "usage_limit" }, "Could not improve: usage limit reached"],
  [{ _tag: "Failed", reason: "transport_error" }, "Could not improve: connection lost"],
  [{ _tag: "Suppressed", reason: "disabled" }, "Could not improve: not available right now"],
] as const)("keeps the draft and explains %j", async (result, label) => {
  fake.run.mockReset().mockResolvedValue(AsyncResult.success({ ...result, requestId: "refused" }));
  await using screen = await render(<Harness />);
  await screen.getByRole("button", { name: "Improve", exact: true }).click();
  await vi.waitFor(() =>
    expect(screen.container.querySelector('[role="status"]')?.textContent).toBe(label),
  );
  expect(screen.container.querySelector("[data-draft]")?.textContent).toBe("  fix the bug  ");
});
