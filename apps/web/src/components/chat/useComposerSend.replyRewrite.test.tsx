/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { DEFAULT_UNIFIED_SETTINGS, EnvironmentId, ThreadId, RunId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { AsyncResult } from "effect/reactivity";
import { ComposerAssistTools } from "./ComposerAssistTools";
import { t } from "~/i18n";
import { resolveComposerDispatchMode } from "@t3tools/client-runtime/state/composer-dispatch";
import type { ComposerDispatchMode } from "@t3tools/client-runtime/state/composer-dispatch";
import { useComposerDraftStore } from "../../composerDraftStore";
import { submitComposerDraft } from "./composerSubmission";
import { useComposerSend } from "./useComposerSend";
import { useComposerResume } from "./useComposerResume";
import { draftSendState } from "./chatViewSend";
import { readEnvironmentScope } from "~/state/session";

const fake = vi.hoisted(() => ({
  start: vi.fn(),
  persist: vi.fn(),
  settings: vi.fn(),
  side: vi.fn(),
}));
vi.mock("~/hooks/useSettings", () => ({
  useClientSettingsHydrated: () => true,
  useEnvironmentSettings: (environmentId: string, select: (settings: unknown) => unknown) =>
    select(fake.settings(environmentId)),
}));
vi.mock("~/state/session", { spy: true });
vi.mock("~/state/use-orchestration-command", () => ({ useOrchestrationCommand: () => fake.start }));
vi.mock("~/hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("./useProposedPlanSend", () => ({ usePlanFollowUpSend: () => vi.fn() }));
vi.mock("./useMultipleModelSend", () => ({ useMultipleModelSend: () => vi.fn() }));

async function setup(
  options: {
    mode?: ComposerDispatchMode;
    running?: boolean;
    saved?: boolean;
    provider?: string;
    resume?: boolean;
    side?: boolean;
    tools?: boolean;
    legacy?: boolean;
    editingQueue?: boolean;
    followUp?: "steer" | "queue";
  } = {},
) {
  vi.mocked(readEnvironmentScope).mockReturnValue(true);
  fake.start.mockReset().mockResolvedValue(AsyncResult.success({ sequence: 1 }));
  fake.persist.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  fake.side.mockReset().mockResolvedValue(true);
  let auto = false;
  fake.settings.mockReset().mockImplementation(() => ({
    ...DEFAULT_UNIFIED_SETTINGS,
    replyRewrite: { ...DEFAULT_UNIFIED_SETTINGS.replyRewrite, auto },
  }));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const environmentId = EnvironmentId.make("rewrite-send-env");
  const threadId = ThreadId.make("rewrite-send-thread");
  const target = scopeThreadRef(environmentId, threadId);
  const routeKey = JSON.stringify(target);
  draftSendState(routeKey).sendInFlight.current = false;
  useComposerDraftStore.setState({ draftsByThreadKey: {}, draftThreadsByThreadKey: {} });
  const promptRef = { current: "Keep the user text" };
  const noop = () => {};
  const composerRef = {
    current: {
      resetCursorState: noop,
      validateProviderInput: () => true,
      getSendContext: () => ({
        providerAvailable: true,
        multipleModelSelections: null,
        images: [],
        files: [],
        terminalContexts: [],
        previewAnnotations: [],
        reviewComments: [],
        threadContexts: [],
        environmentContexts: [],
        shownPendingApprovalIds: [],
        selectedProvider: options.provider ?? "codex",
        selectedModel: "gpt-5",
        selectedProviderModels: [],
        selectedPromptEffort: null,
        selectedModelSelection: { instanceId: "codex", model: "gpt-5" },
        interactionMode: "default",
        interactionModeEnabled: false,
      }),
    },
  };
  let pending: Promise<void> | undefined;
  function Harness({ autoValue, promptValue }: { autoValue: boolean; promptValue: string }) {
    const sendInput = {
      environmentId,
      routeThreadKey: routeKey,
      currentRouteThreadKeyRef: { current: routeKey },
      draftId: null,
      draftThread: null,
      activeThread: {
        id: threadId,
        environmentId,
        worktreePath: null,
        createdAt: "2026-01-01T00:00:00Z",
      },
      activeThreadKey: routeKey,
      activeThreadBranch: null,
      activeProject: { id: "project", environmentId, workspaceRoot: "F:/test-project" },
      activeProjectDefaultModelSelection: null,
      activeProposedPlan: null,
      activeMessageCount: 1,
      isServerThread: true,
      isLocalDraftThread: false,
      isGitRepo: false,
      phase: options.running ? "running" : "idle",
      runtimeMode: "full-access",
      sendEnvMode: "local",
      activeReplyRewriteRun: options.legacy ? {} : { replyRewrite: options.saved ?? false },
      startFromOrigin: false,
      localCheckoutBranchMismatch: null,
      logicalProjectEnvironments: [],
      providerInstanceEntries: [],
      composerRef,
      composerDraftTarget: target,
      promptRef,
      composerImagesRef: { current: [] },
      composerFilesRef: { current: [] },
      composerTerminalContextsRef: { current: [] },
      feedbackUploadsInFlightRef: { current: new Set() },
      queuedRunEdit: { isEditing: false },
      isRevertingCheckpoint: false,
      threadDetailLoading: false,
      activeEnvironmentUnavailable: false,
      isSendBusy: false,
      sendQueuesBehindSetup: false,
      isDraftHeroState: false,
      panelAnimationsActive: false,
      panelAnimationDurationMs: 0,
      keepFullHistory: true,
      resumeCompactionTokens: null,
      showPlanFollowUpPrompt: false,
      usageLimitsKey: null,
      usageLimitsOffered: false,
      openUsageLimits: noop,
      clearUsageLimitsFor: noop,
      needsLoadBalancing: false,
      loadBalancing: {},
      readPendingEnvironmentChange: () => null,
      pendingApprovals: [],
      respondingRequestIds: [],
      activePendingProgress: null,
      onAdvanceActivePendingUserInput: noop,
      onRespondToApproval: noop,
      beginLocalDispatch: noop,
      resetLocalDispatch: noop,
      beginWorktreeSetup: noop,
      captureDraftHeroComposerRect: noop,
      setDockedDraftHeroThreadKey: noop,
      setSetupQueueSendThreadKey: noop,
      setOptimisticUserMessages: noop,
      optimisticBlobPreviews: { track: noop, release: noop },
      setFeedbackSubmissionsByThreadKey: noop,
      setThreadError: noop,
      setKeepFullHistory: noop,
      anchorNewTurn: noop,
      acknowledgeActiveThreadWoke: noop,
      handleInteractionModeChange: noop,
      handleNewThreadInActiveProject: noop,
      persistThreadSettingsForNextTurn: fake.persist,
      onSideChat: options.side ? fake.side : undefined,
      sideChatDisabledReason: null,
    } as unknown as Parameters<typeof useComposerSend>[0];
    const { onSend } = useComposerSend(sendInput);
    const { onResume } = useComposerResume({
      ...sendInput,
      interactionMode: "default",
      resumableRunId: RunId.make("interrupted"),
      hasHeldQueuedRuns: false,
      scrollToEnd: noop,
    });
    const submit = (event: { ctrlKey: boolean; metaKey: boolean }) =>
      submitComposerDraft({
        event: undefined,
        prompt: promptRef.current,
        submissionTarget: "provider-turn",
        onSend: () => {
          pending = options.resume
            ? onResume()
            : onSend(
                undefined,
                options.mode ??
                  (options.tools
                    ? resolveComposerDispatchMode({
                        running: options.running ?? false,
                        alternateModifier: event.ctrlKey || event.metaKey,
                        activeTurnDefault: options.followUp ?? "steer",
                      })
                    : "auto"),
              );
        },
      });
    return (
      <>
        {options.tools ? (
          <ComposerAssistTools
            environmentId={environmentId}
            target={target}
            provider={options.provider ?? "codex"}
            defaultEnabled={autoValue}
            running={options.running ?? false}
            followUpBehavior={options.followUp ?? "steer"}
            canSteer={true}
            editingQueue={options.editingQueue ?? false}
            unavailable={false}
            prompt={promptValue}
            sideChatAvailable={options.side ?? false}
            activeRun={options.legacy ? {} : { replyRewrite: options.saved ?? false }}
            optimizer={{
              visible: false,
              disabledReason: null,
              inFlight: false,
              cacheMaybeExpired: false,
              trigger: async () => {},
              undo: () => {},
              label: "",
              done: false,
              availability: {
                getSnapshot: () => false,
                subscribe: () => () => {},
                update: () => {},
              },
            }}
          />
        ) : null}
        <button
          data-test-send
          onClick={submit}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit(event);
          }}
        >
          Send
        </button>
      </>
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<Harness autoValue={auto} promptValue={promptRef.current} />));
  const press = (
    kind: "button" | "keyboard",
    modifiers: { ctrlKey?: boolean; metaKey?: boolean } = {},
  ) => {
    const button = host.querySelector<HTMLButtonElement>("[data-test-send]")!;
    if (kind === "button")
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, ...modifiers }));
    else
      button.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, ...modifiers }),
      );
    return pending;
  };
  return {
    target,
    press,
    promptRef,
    openTools: async () => {
      await act(async () =>
        host.querySelector<HTMLButtonElement>('[data-slot="popover-trigger"]')!.click(),
      );
    },
    trigger: () => host.querySelector<HTMLButtonElement>('[data-slot="popover-trigger"]')!,
    toggle: () => document.querySelector<HTMLElement>('[role="switch"]')!,
    key: async (type: "keydown" | "keyup", key: string) => {
      await act(async () => window.dispatchEvent(new KeyboardEvent(type, { key })));
    },
    blur: async () => {
      await act(async () => window.dispatchEvent(new Event("blur")));
    },
    setPrompt: async (value: string) => {
      promptRef.current = value;
      await act(async () =>
        root.render(<Harness autoValue={auto} promptValue={promptRef.current} />),
      );
    },
    setDefault: async (value: boolean) => {
      auto = value;
      await act(async () =>
        root.render(<Harness autoValue={auto} promptValue={promptRef.current} />),
      );
    },
    [Symbol.asyncDispose]: async () => {
      await act(async () => root.unmount());
      host.remove();
      draftSendState(routeKey).sendInFlight.current = false;
      vi.unstubAllGlobals();
    },
  };
}

it.each(["button", "keyboard"] as const)(
  "freezes the %s send before settings change and ignores a duplicate submit",
  async (kind) => {
    await using h = await setup();
    await h.setDefault(true);
    const store = useComposerDraftStore.getState();
    store.setReplyRewrite(h.target, true);
    let finish!: () => void;
    fake.persist.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(AsyncResult.success(undefined));
        }),
    );
    let sent: Promise<void> | undefined;
    await act(async () => {
      sent = h.press(kind);
      h.press(kind);
    });
    await h.setDefault(false);
    store.setReplyRewrite(h.target, false);
    await act(async () => {
      finish();
      await sent;
    });
    expect(fake.start.mock.calls.map(([request]) => request.input)).toMatchObject([
      { replyRewrite: true, message: { text: "Keep the user text" } },
    ]);
    expect(
      store.getComposerDraft(h.target)?.replyRewriteSelections?.[h.target.environmentId]?.enabled,
    ).toBe(false);
  },
);

it("retains the selection on failure and resets to the latest default on successful retry", async () => {
  await using h = await setup();
  const store = useComposerDraftStore.getState();
  store.setReplyRewrite(h.target, true);
  fake.start.mockResolvedValueOnce(AsyncResult.fail(new Error("offline")));
  await act(async () => {
    await h.press("button");
  });
  expect(
    store.getComposerDraft(h.target)?.replyRewriteSelections?.[h.target.environmentId]?.enabled,
  ).toBe(true);
  expect(h.promptRef.current).toBe("Keep the user text");
  await act(async () => {
    await h.press("keyboard");
  });
  expect(
    store.getComposerDraft(h.target)?.replyRewriteSelections?.[h.target.environmentId],
  ).toBeUndefined();
  h.promptRef.current = "Next message";
  await act(async () => {
    await h.press("button");
  });
  await h.setDefault(true);
  h.promptRef.current = "Use the new default";
  await act(async () => {
    await h.press("button");
  });
  expect(fake.start.mock.calls.map(([request]) => request.input.replyRewrite)).toEqual([
    true,
    true,
    false,
    true,
  ]);
});

it("snapshots resume before settings persistence and resets only after its new run starts", async () => {
  await using h = await setup({ resume: true });
  const store = useComposerDraftStore.getState();
  store.setReplyRewrite(h.target, true);
  fake.start.mockResolvedValueOnce(AsyncResult.fail(new Error("offline")));
  await act(async () => {
    await h.press("button");
  });
  expect(
    store.getComposerDraft(h.target)?.replyRewriteSelections?.[h.target.environmentId]?.enabled,
  ).toBe(true);
  await act(async () => {
    await h.press("button");
  });
  expect(
    store.getComposerDraft(h.target)?.replyRewriteSelections?.[h.target.environmentId],
  ).toBeUndefined();
  expect(fake.start.mock.calls.map(([request]) => request.input)).toMatchObject([
    { replyRewrite: true, manualContinuationOfRunId: "interrupted", dispatchMode: "start" },
    { replyRewrite: true, manualContinuationOfRunId: "interrupted", dispatchMode: "start" },
  ]);
});

it("passes the next reply choice into a side-chat send and retains it on failure", async () => {
  await using h = await setup({ side: true });
  const store = useComposerDraftStore.getState();
  store.setReplyRewrite(h.target, true);
  h.promptRef.current = "/side Explain this";
  fake.side.mockResolvedValueOnce(false);
  await act(async () => {
    await h.press("button");
  });
  expect(
    store.getComposerDraft(h.target)?.replyRewriteSelections?.[h.target.environmentId]?.enabled,
  ).toBe(true);
  await act(async () => {
    await h.press("button");
  });
  expect(fake.side.mock.calls).toEqual([
    ["Explain this", true],
    ["Explain this", true],
  ]);
  expect(
    store.getComposerDraft(h.target)?.replyRewriteSelections?.[h.target.environmentId],
  ).toBeUndefined();
});

it.each([
  ["queue", "codex", true],
  ["steer", "codex", false],
  ["restart", "codex", false],
  ["queue", "claudeAgent", false],
] as const)("sends %s for %s with the right run decision", async (mode, provider, expected) => {
  await using h = await setup({ mode, provider, running: true, saved: false });
  useComposerDraftStore.getState().setReplyRewrite(h.target, true);
  await act(async () => {
    await h.press("button");
  });
  expect(fake.start.mock.calls.map(([request]) => request.input)).toMatchObject([
    { replyRewrite: expected, dispatchMode: mode },
  ]);
});

it.each(["Control", "Meta"])(
  "shows and edits the actual alternate queue decision while %s is held, then resets on release and blur",
  async (key) => {
    await using h = await setup({ tools: true, running: true, saved: false });
    await h.setDefault(true);
    await h.openTools();
    expect(h.toggle().getAttribute("aria-checked")).toBe("false");
    expect(document.body.textContent).toContain(t.composer.assist.tools.inherited);
    await h.key("keydown", key);
    expect(h.toggle().getAttribute("aria-checked")).toBe("true");
    await act(async () => h.toggle().click());
    expect(h.toggle().getAttribute("aria-checked")).toBe("false");
    await act(async () => h.toggle().click());
    expect(h.toggle().getAttribute("aria-checked")).toBe("true");
    await act(async () => {
      await h.press("button", key === "Control" ? { ctrlKey: true } : { metaKey: true });
    });
    expect(fake.start.mock.calls.map(([request]) => request.input)).toMatchObject([
      { replyRewrite: true, dispatchMode: "queue" },
    ]);
    await h.openTools();
    await h.key("keyup", key);
    expect(h.toggle().getAttribute("aria-checked")).toBe("false");
    await h.key("keydown", key);
    expect(h.toggle().getAttribute("aria-checked")).toBe("true");
    await h.blur();
    expect(h.toggle().getAttribute("aria-checked")).toBe("false");
    await act(async () => h.toggle().click());
    expect(h.toggle().getAttribute("aria-checked")).toBe("false");
  },
);

it("switches from the default queue choice to inherited steering while the alternate key is held", async () => {
  await using h = await setup({ tools: true, running: true, saved: false, followUp: "queue" });
  await h.setDefault(true);
  await h.openTools();
  expect(h.toggle().getAttribute("aria-checked")).toBe("true");
  await h.key("keydown", "Meta");
  expect(h.toggle().getAttribute("aria-checked")).toBe("false");
  await act(async () => {
    await h.press("keyboard", { metaKey: true });
  });
  expect(fake.start.mock.calls.map(([request]) => request.input)).toMatchObject([
    { replyRewrite: false, dispatchMode: "steer" },
  ]);
  await h.key("keyup", "Meta");
  expect(h.toggle().getAttribute("aria-checked")).toBe("true");
});

it("shows a side-chat new run's independent choice during an active reply and sends the edited choice", async () => {
  await using h = await setup({
    tools: true,
    running: true,
    saved: false,
    side: true,
    mode: "steer",
  });
  await h.setDefault(true);
  await h.setPrompt("/side Explain this");
  await h.openTools();
  expect(h.toggle().getAttribute("aria-checked")).toBe("true");
  await act(async () => h.toggle().click());
  expect(h.toggle().getAttribute("aria-checked")).toBe("false");
  await act(async () => {
    await h.press("button");
  });
  expect(fake.side.mock.calls).toEqual([["Explain this", false]]);
});

it.each([false, true])(
  "announces an unknown legacy run without calling it off, including queue editing: %s",
  async (editingQueue) => {
    await using h = await setup({ tools: true, running: true, legacy: true, editingQueue });
    expect(h.trigger().getAttribute("aria-label")).toContain(t.composer.assist.tools.unknownRun);
    expect(h.trigger().getAttribute("aria-label")).not.toContain(
      t.composer.assist.tools.rewriteOff,
    );
    await h.openTools();
    expect(h.toggle().getAttribute("aria-checked")).toBe("mixed");
    expect(h.toggle().hasAttribute("data-disabled")).toBe(true);
    expect(document.body.textContent).toContain(t.composer.assist.tools.unknownRun);
    if (editingQueue)
      expect(document.body.textContent).toContain(t.composer.assist.tools.editingQueue);
    await act(async () => h.toggle().click());
    expect(
      useComposerDraftStore.getState().getComposerDraft(h.target)?.replyRewriteSelections,
    ).toBeUndefined();
  },
);

it("announces a non-Codex provider as unavailable instead of an unknown legacy setting", async () => {
  await using h = await setup({
    tools: true,
    running: true,
    legacy: true,
    provider: "claudeAgent",
  });
  expect(h.trigger().getAttribute("aria-label")).toContain(t.composer.assist.tools.codexOnly);
  expect(h.trigger().getAttribute("aria-label")).not.toContain(t.composer.assist.tools.unknownRun);
  expect(h.trigger().getAttribute("aria-label")).not.toContain(t.composer.assist.tools.rewriteOff);
  await h.openTools();
  expect(h.toggle().getAttribute("aria-checked")).toBe("false");
  expect(h.toggle().hasAttribute("data-disabled")).toBe(true);
  expect(document.body.textContent).toContain(t.composer.assist.tools.codexOnly);
  expect(document.body.textContent).not.toContain(t.composer.assist.tools.unknownRun);
  await act(async () => h.toggle().click());
  expect(
    useComposerDraftStore.getState().getComposerDraft(h.target)?.replyRewriteSelections,
  ).toBeUndefined();
});
