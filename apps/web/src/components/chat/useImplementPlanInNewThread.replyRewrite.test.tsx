/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { DEFAULT_UNIFIED_SETTINGS, EnvironmentId, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { AsyncResult } from "effect/reactivity";
import { useImplementPlanInNewThread } from "./useProposedPlanSend";
import { useComposerDraftStore } from "../../composerDraftStore";
import { draftSendState } from "./chatViewSend";
import { threadEnvironment } from "~/state/threads";
import { readEnvironmentScope } from "~/state/session";
import { waitForStartedServerThread } from "../ChatView.logic";

const fake = vi.hoisted(() => ({
  create: vi.fn(),
  start: vi.fn(),
  remove: vi.fn(),
  settings: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("~/hooks/useSettings", () => ({
  useEnvironmentSettings: (environmentId: string, select: (settings: unknown) => unknown) =>
    select(fake.settings(environmentId)),
}));
vi.mock("~/state/session", { spy: true });
vi.mock("../ChatView.logic", { spy: true });
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => fake.navigate }));
vi.mock("~/state/use-orchestration-command", () => ({
  useOrchestrationCommand: (command: unknown) =>
    command === threadEnvironment.create
      ? fake.create
      : command === threadEnvironment.startTurn
        ? fake.start
        : fake.remove,
}));

async function setup(provider = "codex") {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(readEnvironmentScope).mockReturnValue(true);
  vi.mocked(waitForStartedServerThread).mockResolvedValue(true);
  fake.create.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  fake.start.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  fake.remove.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  fake.navigate.mockReset().mockResolvedValue(undefined);
  let auto = true;
  fake.settings.mockReset().mockImplementation(() => ({
    ...DEFAULT_UNIFIED_SETTINGS,
    replyRewrite: { ...DEFAULT_UNIFIED_SETTINGS.replyRewrite, auto },
  }));
  const environmentId = EnvironmentId.make("implementation-env");
  const threadId = ThreadId.make("implementation-source");
  const target = scopeThreadRef(environmentId, threadId);
  const routeKey = JSON.stringify(target);
  draftSendState(routeKey).sendInFlight.current = false;
  useComposerDraftStore.setState({ draftsByThreadKey: {}, draftThreadsByThreadKey: {} });
  let pending: Promise<void> | undefined;
  function Harness() {
    const run = useImplementPlanInNewThread({
      environmentId,
      routeThreadKey: routeKey,
      composerDraftTarget: target,
      activeThread: { id: threadId, environmentId, worktreePath: null },
      activeProject: { id: "project", environmentId },
      activeThreadBranch: "main",
      activeProposedPlan: { id: "plan", planMarkdown: "# Fix the parser" },
      isServerThread: true,
      isSendBusy: false,
      activeEnvironmentUnavailable: false,
      defaultRuntimeMode: "approval-required",
      beginLocalDispatch: () => {},
      resetLocalDispatch: () => {},
      composerRef: {
        current: {
          getSendContext: () => ({
            providerAvailable: true,
            interactionModeEnabled: true,
            selectedProvider: provider,
            selectedModel: "gpt-5",
            selectedProviderModels: [],
            selectedPromptEffort: null,
            selectedModelSelection: { instanceId: provider, model: "gpt-5" },
          }),
        },
      },
    } as unknown as Parameters<typeof useImplementPlanInNewThread>[0]);
    return (
      <button
        onClick={() => {
          pending = run();
        }}
      >
        Implement
      </button>
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<Harness />));
  return {
    target,
    press: () => {
      host.querySelector("button")!.click();
      return pending;
    },
    setDefault: async (value: boolean) => {
      auto = value;
      await act(async () => root.render(<Harness />));
    },
    [Symbol.asyncDispose]: async () => {
      await act(async () => root.unmount());
      host.remove();
      draftSendState(routeKey).sendInFlight.current = false;
      vi.unstubAllGlobals();
    },
  };
}

it.each([
  ["codex", true],
  ["claudeAgent", false],
] as const)(
  "freezes the %s new implementation run decision before thread creation",
  async (provider, expected) => {
    await using h = await setup(provider);
    let finish!: () => void;
    fake.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(AsyncResult.success(undefined));
        }),
    );
    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = h.press();
    });
    await h.setDefault(false);
    await act(async () => {
      finish();
      await pending;
    });
    expect(fake.start.mock.calls.map(([request]) => request.input.replyRewrite)).toEqual([
      expected,
    ]);
  },
);

it("keeps a new source choice when a delayed implementation send succeeds", async () => {
  await using h = await setup();
  const store = useComposerDraftStore.getState();
  store.setReplyRewrite(h.target, false);
  let finish!: () => void;
  fake.create.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(AsyncResult.success(undefined));
      }),
  );
  let pending: Promise<void> | undefined;
  await act(async () => {
    pending = h.press();
  });
  store.setReplyRewrite(h.target, true);
  await h.setDefault(false);
  await act(async () => {
    finish();
    await pending;
  });
  expect(fake.start.mock.calls.map(([request]) => request.input.replyRewrite)).toEqual([false]);
  expect(
    store.getComposerDraft(h.target)?.replyRewriteSelections?.[h.target.environmentId]?.enabled,
  ).toBe(true);
});

it.each([false, true])(
  "clears the accepted choice even if navigation fails: %s",
  async (navigationFails) => {
    await using h = await setup();
    if (navigationFails) {
      fake.navigate.mockRejectedValueOnce(new Error("navigation failed"));
      fake.remove.mockResolvedValueOnce(AsyncResult.fail(new Error("cleanup failed")));
    }
    const store = useComposerDraftStore.getState();
    store.setReplyRewrite(h.target, false);
    await act(async () => {
      await h.press();
    });
    expect(
      store.getComposerDraft(h.target)?.replyRewriteSelections?.[h.target.environmentId],
    ).toBeUndefined();
  },
);

it.each(["create", "start"] as const)(
  "preserves the choice after implementation %s failure and clears it after a successful retry",
  async (operation) => {
    await using h = await setup();
    const store = useComposerDraftStore.getState();
    store.setReplyRewrite(h.target, false);
    fake[operation].mockResolvedValueOnce(AsyncResult.fail(new Error("offline")));
    await act(async () => {
      await h.press();
    });
    expect(
      store.getComposerDraft(h.target)?.replyRewriteSelections?.[h.target.environmentId]?.enabled,
    ).toBe(false);
    await act(async () => {
      await h.press();
    });
    expect(fake.start.mock.calls.at(-1)?.[0].input.replyRewrite).toBe(false);
    expect(
      store.getComposerDraft(h.target)?.replyRewriteSelections?.[h.target.environmentId],
    ).toBeUndefined();
  },
);
