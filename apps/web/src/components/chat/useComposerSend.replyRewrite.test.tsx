/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { DEFAULT_UNIFIED_SETTINGS, EnvironmentId, ThreadId, RunId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { AsyncResult } from "effect/reactivity";
import { ComposerAssistTools } from "./ComposerAssistTools";
import { useComposerSendPreviewTarget } from "./useComposerSendPreviewTarget";
import { t } from "~/i18n";
import { resolveComposerDispatchMode } from "@t3tools/client-runtime/state/composer-dispatch";
import type { ComposerDispatchMode } from "@t3tools/client-runtime/state/composer-dispatch";
import { useComposerDraftStore } from "../../composerDraftStore";
import {
  composerSubmissionIntentForKey,
  type ComposerSubmissionIntent,
} from "../../composer-logic";
import {
  DEFAULT_RESOLVED_KEYBINDINGS,
  compileResolvedKeybindingsConfig,
} from "@t3tools/shared/keybindings";
import type { ResolvedKeybindingsConfig, ClientSettings } from "@t3tools/contracts";
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
    sideThread?: boolean;
    tools?: boolean;
    legacy?: boolean;
    editingQueue?: boolean;
    followUp?: "steer" | "queue";
    platform?: string;
    sendShortcut?: ClientSettings["sendShortcut"];
    keybindings?: ResolvedKeybindingsConfig;
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
    const previewTarget = useComposerSendPreviewTarget();
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
        lineage: { sideChat: options.sideThread === true },
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
    const submit = (
      event: { ctrlKey: boolean; metaKey: boolean },
      intent?: ComposerSubmissionIntent,
    ) =>
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
                        alternateModifier:
                          intent === undefined
                            ? event.ctrlKey || event.metaKey
                            : intent === "alternate",
                        activeTurnDefault: options.followUp ?? "steer",
                      })
                    : "auto"),
                intent,
              );
        },
      });
    return (
      <form
        onSubmit={(event) => event.preventDefault()}
        onPointerOverCapture={previewTarget.onPointerOverCapture}
        onKeyDownCapture={previewTarget.onKeyDownCapture}
        onFocusCapture={previewTarget.onFocusCapture}
      >
        {options.tools ? (
          <ComposerAssistTools
            environmentId={environmentId}
            previewButton={previewTarget.previewButton}
            keybindings={options.keybindings ?? DEFAULT_RESOLVED_KEYBINDINGS}
            platform={options.platform ?? "Win32"}
            sendShortcut={options.sendShortcut ?? "enter"}
            draftThread={false}
            softwareKeyboardOpen={false}
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
            sideChatThread={options.sideThread === true}
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
        <textarea
          data-test-editor
          data-testid="composer-editor"
          onKeyDown={(event) => {
            const intent = composerSubmissionIntentForKey({
              event: event.nativeEvent,
              keybindings: options.keybindings ?? DEFAULT_RESOLVED_KEYBINDINGS,
              platform: options.platform ?? "Win32",
              isSoftwareKeyboardOpen: false,
              isDraftThread: false,
              isRunning: options.running ?? false,
              sendShortcut: options.sendShortcut ?? "enter",
              prompt: promptRef.current,
            });
            if (intent !== null) submit(event, intent);
          }}
        />
        <button
          type="button"
          data-test-send
          data-composer-send-preview="button"
          onClick={(event) => submit(event)}
        >
          Send
        </button>
      </form>
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<Harness autoValue={auto} promptValue={promptRef.current} />));
  const press = (
    kind: "button" | "keyboard",
    modifiers: {
      ctrlKey?: boolean;
      metaKey?: boolean;
      altKey?: boolean;
      shiftKey?: boolean;
      key?: string;
    } = {},
  ) => {
    const button = host.querySelector<HTMLButtonElement>("[data-test-send]")!;
    if (kind === "button")
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, ...modifiers }));
    else
      host
        .querySelector("textarea")!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, ...modifiers }));
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
    focusEditor: async () => {
      await act(async () => host.querySelector("textarea")!.focus());
    },
    pointAtSend: async () => {
      await act(async () =>
        host
          .querySelector("[data-test-send]")!
          .dispatchEvent(new Event("pointerover", { bubbles: true })),
      );
    },
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

it("keeps the main reply choice after side-chat success or failure", async () => {
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
    ["Explain this", false],
    ["Explain this", false],
  ]);
  expect(
    store.getComposerDraft(h.target)?.replyRewriteSelections?.[h.target.environmentId]?.enabled,
  ).toBe(true);
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
    await h.pointAtSend();
    await h.key("keydown", key);
    expect(h.toggle().getAttribute("aria-checked")).toBe("true");
    await act(async () => h.toggle().click());
    expect(h.toggle().getAttribute("aria-checked")).toBe("false");
    await act(async () => h.toggle().click());
    expect(h.toggle().getAttribute("aria-checked")).toBe("true");
    await act(async () => {
      const label = document.querySelector<HTMLLabelElement>("label.composer-assist-title")!;
      // Native label activation focuses the associated checkbox before the visible switch.
      document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.focus();
      label.click();
    });
    expect(h.trigger().getAttribute("aria-label")).toContain(t.composer.assist.tools.clickSend);
    expect(h.toggle().getAttribute("aria-disabled")).not.toBe("true");
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
  await using h = await setup({
    tools: true,
    running: true,
    saved: false,
    followUp: "queue",
    platform: "MacIntel",
  });
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

it.each([false, true])("disables rewrite for side chat, existing thread=%s", async (sideThread) => {
  await using h = await setup({
    tools: true,
    running: true,
    saved: false,
    side: true,
    sideThread,
    mode: "queue",
  });
  await h.setDefault(true);
  await h.setPrompt(sideThread ? "Explain this" : "/side Explain this");
  await h.openTools();
  expect(h.toggle().getAttribute("aria-checked")).toBe("false");
  expect(h.toggle().getAttribute("aria-disabled")).toBe("true");
  expect(document.body.textContent).toContain(t.composer.assist.tools.sideChatUnavailable);
  await act(async () => h.toggle().click());
  expect(h.toggle().getAttribute("aria-checked")).toBe("false");
  await act(async () => {
    await h.press("button");
  });
  if (sideThread) {
    expect(fake.start.mock.calls[0]?.[0].input).toMatchObject({ replyRewrite: false });
    expect(fake.side).not.toHaveBeenCalled();
  } else {
    expect(fake.side.mock.calls).toEqual([["Explain this", false]]);
  }
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

const customAlternate = (key: string) =>
  compileResolvedKeybindingsConfig([
    { key, command: "composer.sendAlternate", when: "composerFocus && turnRunning" },
  ]);

it.each([
  {
    platform: "Win32",
    sendShortcut: "enter",
    key: "Enter",
    held: ["Control"],
    ctrlKey: true,
    expected: true,
    mode: "queue",
  },
  {
    platform: "MacIntel",
    sendShortcut: "enter",
    key: "Enter",
    held: ["Meta"],
    metaKey: true,
    expected: true,
    mode: "queue",
  },
  {
    platform: "Win32",
    sendShortcut: "mod-enter",
    key: "Enter",
    held: ["Control"],
    ctrlKey: true,
    expected: false,
    mode: "steer",
  },
  {
    platform: "MacIntel",
    sendShortcut: "mod-enter",
    key: "Enter",
    held: ["Meta"],
    metaKey: true,
    expected: false,
    mode: "steer",
  },
  {
    platform: "Win32",
    sendShortcut: "mod-enter",
    key: "Enter",
    held: ["Control", "Shift"],
    ctrlKey: true,
    shiftKey: true,
    expected: true,
    mode: "queue",
  },
  {
    platform: "MacIntel",
    sendShortcut: "mod-enter",
    key: "Enter",
    held: ["Meta", "Shift"],
    metaKey: true,
    shiftKey: true,
    expected: true,
    mode: "queue",
  },
  {
    platform: "Win32",
    sendShortcut: "enter",
    key: "y",
    held: ["Alt"],
    altKey: true,
    binding: "alt+y",
    expected: true,
    mode: "queue",
  },
  {
    platform: "MacIntel",
    sendShortcut: "mod-enter",
    key: "k",
    held: ["Meta"],
    metaKey: true,
    binding: "mod+k",
    expected: true,
    mode: "queue",
  },
  {
    platform: "Win32",
    sendShortcut: "enter",
    key: "F8",
    held: [],
    binding: "f8",
    expected: true,
    mode: "queue",
  },
] as const)(
  "previews the formally parsed $platform $sendShortcut $key keyboard action ($binding)",
  async (entry) => {
    const keybindings =
      "binding" in entry ? customAlternate(entry.binding) : DEFAULT_RESOLVED_KEYBINDINGS;
    await using h = await setup({
      tools: true,
      running: true,
      saved: false,
      platform: entry.platform,
      sendShortcut: entry.sendShortcut,
      keybindings,
    });
    await h.setDefault(true);
    await h.openTools();
    for (const key of entry.held) await h.key("keydown", key);
    const shown = h.toggle().getAttribute("aria-checked");
    expect(h.trigger().getAttribute("aria-label")).toContain(
      entry.key.length === 1 ? entry.key.toUpperCase() : entry.key,
    );
    await act(async () => {
      await h.press("keyboard", entry);
    });
    expect(fake.start.mock.calls.map(([request]) => request.input)).toMatchObject([
      { dispatchMode: entry.mode, replyRewrite: entry.expected },
    ]);
    expect(shown).toBe(String(entry.expected));
  },
);

it.each([
  { platform: "Win32", held: "Control", ctrlKey: true, label: "Ctrl+Enter" },
  { platform: "MacIntel", held: "Meta", metaKey: true, label: "⌘Enter" },
] as const)(
  "distinguishes the $platform mod-enter keyboard preview from a modified Send click",
  async (entry) => {
    await using h = await setup({
      tools: true,
      running: true,
      saved: false,
      platform: entry.platform,
      sendShortcut: "mod-enter",
    });
    await h.setDefault(true);
    await h.openTools();
    await h.key("keydown", entry.held);
    expect(h.toggle().getAttribute("aria-checked")).toBe("false");
    expect(h.trigger().getAttribute("aria-label")).toContain(
      t.composer.assist.tools.keyboardSend(entry.label),
    );
    await h.pointAtSend();
    expect(h.toggle().getAttribute("aria-checked")).toBe("true");
    expect(h.trigger().getAttribute("aria-label")).toContain(t.composer.assist.tools.clickSend);
    expect(document.body.textContent).toContain(t.composer.assist.tools.clickSend);
    await act(async () => h.toggle().click());
    expect(h.toggle().getAttribute("aria-checked")).toBe("false");
    await act(async () => h.toggle().click());
    expect(h.toggle().getAttribute("aria-checked")).toBe("true");
    await act(async () => {
      await h.press("button", entry);
    });
    expect(fake.start.mock.calls.map(([request]) => request.input)).toMatchObject([
      { dispatchMode: "queue", replyRewrite: true },
    ]);
    await h.openTools();
    await h.focusEditor();
    expect(h.trigger().getAttribute("aria-label")).toContain(
      t.composer.assist.tools.keyboardSend(entry.label),
    );
  },
);

it("clears a custom alternate-key preview on release and window blur", async () => {
  await using h = await setup({
    tools: true,
    running: true,
    saved: false,
    keybindings: customAlternate("alt+y"),
  });
  await h.setDefault(true);
  await h.openTools();
  await h.key("keydown", "Alt");
  expect(h.toggle().getAttribute("aria-checked")).toBe("true");
  expect(h.trigger().getAttribute("aria-label")).toContain("Alt+Y");
  await h.key("keyup", "Alt");
  expect(h.toggle().getAttribute("aria-checked")).toBe("false");
  await h.key("keydown", "Alt");
  expect(h.toggle().getAttribute("aria-checked")).toBe("true");
  await h.blur();
  expect(h.toggle().getAttribute("aria-checked")).toBe("false");
});

it("keeps a mod-enter side chat independent of the active run's keyboard setting", async () => {
  await using h = await setup({
    tools: true,
    running: true,
    saved: false,
    side: true,
    sendShortcut: "mod-enter",
  });
  await h.setDefault(true);
  await h.setPrompt("/side Explain this");
  await h.openTools();
  await h.key("keydown", "Control");
  const shown = h.toggle().getAttribute("aria-checked");
  await act(async () => {
    await h.press("keyboard", { key: "Enter", ctrlKey: true });
  });
  expect(fake.side.mock.calls).toEqual([["Explain this", false]]);
  expect(shown).toBe("false");
});
