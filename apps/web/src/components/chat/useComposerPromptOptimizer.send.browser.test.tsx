/** Exercises an optimization response after the real composer send hook dispatches a turn. */
import { useLayoutEffect, useRef, useState } from "react";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { Atom, AsyncResult } from "effect/reactivity";
import { it, expect, vi } from "vite-plus/test";
import { act, render } from "../../../test/render";
import { ComposerPromptEditor, type ComposerPromptEditorHandle } from "../ComposerPromptEditor";
import { useComposerPromptOptimizer } from "./useComposerPromptOptimizer";
import {
  ComposerPromptOptimizeTab,
  ComposerPromptOptimizeStatus,
} from "./ComposerPromptOptimizeTab";
import { useComposerSend } from "./useComposerSend";
import * as session from "~/state/session";
import * as settings from "~/hooks/useSettings";

vi.mock("~/hooks/useSettings", { spy: true });
vi.mock("~/state/session", { spy: true });
const fake = vi.hoisted(() => ({ optimize: vi.fn(), start: vi.fn() }));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => fake.optimize }));
vi.mock("~/state/use-orchestration-command", () => ({ useOrchestrationCommand: () => fake.start }));
vi.mock("~/state/composerAssist", () => ({
  composerAssistEnvironment: { optimizePrompt: { permissionAtom: () => Atom.make(true) } },
}));

vi.mock("~/hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => vi.fn() }));
vi.mock("./useProposedPlanSend", () => ({ usePlanFollowUpSend: () => vi.fn() }));
vi.mock("./useMultipleModelSend", () => ({ useMultipleModelSend: () => vi.fn() }));

/** Supplies the existing-thread send inputs; fake transport publishes the new server run. */
function SendHarness() {
  const environmentId = EnvironmentId.make("send-env");
  const threadId = ThreadId.make("send-thread");
  const [prompt, setPrompt] = useState("Keep this original draft");
  const [runKey, setRunKey] = useState("old-run");
  const promptRef = useRef(prompt);
  const editorRef = useRef<ComposerPromptEditorHandle | null>(null);
  useLayoutEffect(() => {
    promptRef.current = prompt;
  });
  const optimizer = useComposerPromptOptimizer({
    environmentId,
    threadId,
    draftKey: "send-thread",
    prompt,
    driver: "codex",
    enabled: true,
    running: false,
    runKey,
    editorRef,
  });
  const noop = () => {};
  const composerRef = useRef({
    resetCursorState: () => setPrompt(""),
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
      shownPendingApprovalIds: [],
      selectedProvider: "codex",
      selectedModel: "gpt-5",
      selectedProviderModels: [],
      selectedPromptEffort: null,
      selectedModelSelection: { instanceId: "codex", model: "gpt-5" },
      interactionMode: "default",
      interactionModeEnabled: false,
    }),
  });
  useLayoutEffect(() => {
    fake.start.mockImplementation(async () => {
      // This models the server shell update delivered after the actual send command, not a UI clear.
      setRunKey("new-run-from-send");
      return AsyncResult.success(undefined);
    });
  }, []);
  const input = {
    environmentId,
    routeThreadKey: "send-route",
    currentRouteThreadKeyRef: { current: "send-route" },
    draftId: null,
    draftThread: null,
    activeThread: {
      id: threadId,
      environmentId,
      worktreePath: null,
      createdAt: "2026-01-01T00:00:00Z",
    },
    activeThreadKey: "send-route",
    activeThreadBranch: null,
    activeProject: { id: "project", environmentId, workspaceRoot: "F:/project" },
    activeProjectDefaultModelSelection: null,
    activeProposedPlan: null,
    activeMessageCount: 1,
    isServerThread: true,
    isLocalDraftThread: false,
    isGitRepo: false,
    phase: "idle",
    runtimeMode: "full-access",
    sendEnvMode: "local",
    startFromOrigin: false,
    localCheckoutBranchMismatch: null,
    logicalProjectEnvironments: [],
    providerInstanceEntries: [],
    composerRef,
    composerDraftTarget: { environmentId, threadId },
    promptRef,
    composerImagesRef: { current: [] },
    composerFilesRef: { current: [] },
    composerTerminalContextsRef: { current: [] },
    feedbackUploadsInFlightRef: { current: new Set() },
    queuedRunEdit: { isEditing: false },
    isConnecting: false,
    isRevertingCheckpoint: false,
    threadDetailLoading: false,
    activeEnvironmentUnavailable: false,
    isSendBusy: false,
    sendQueuesBehindSetup: false,
    isDraftHeroState: false,
    panelAnimationsActive: false,
    panelAnimationDurationMs: 0,
    keepFullHistory: false,
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
    setFeedbackSubmissionsByThreadKey: noop,
    setThreadError: noop,
    setKeepFullHistory: noop,
    anchorNewTurn: noop,
    acknowledgeActiveThreadWoke: noop,
    handleInteractionModeChange: noop,
    handleNewThreadInActiveProject: noop,
    persistThreadSettingsForNextTurn: async () => AsyncResult.success(undefined),
  } as unknown as Parameters<typeof useComposerSend>[0];
  const { onSend } = useComposerSend(input);
  return (
    <>
      <ComposerPromptEditor
        editorRef={editorRef}
        value={prompt}
        cursor={prompt.length}
        contextRecords={new Map()}
        skills={[]}
        disabled={false}
        placeholder="Draft"
        onChange={setPrompt}
        onPaste={noop}
      />
      <button onClick={() => void optimizer.trigger()}>Improve</button>
      <button onClick={() => void onSend()}>Send</button>
      <span>{runKey}</span>
      <ComposerPromptOptimizeStatus optimizer={optimizer} />
      <ComposerPromptOptimizeTab optimizer={optimizer} />
    </>
  );
}

it("discards the optimization after the real send path publishes a new run", async () => {
  let finish!: (result: ReturnType<typeof AsyncResult.success>) => void;
  const pending = new Promise<ReturnType<typeof AsyncResult.success>>((resolve) => {
    finish = resolve;
  });
  fake.optimize.mockReset().mockReturnValue(pending);
  fake.start.mockReset();
  using _hydrated = vi.spyOn(settings, "useClientSettingsHydrated").mockReturnValue(true);
  using _settings = vi.spyOn(settings, "useEnvironmentSettings").mockReturnValue(false);
  using _scope = vi.spyOn(session, "readEnvironmentScope").mockReturnValue(true);
  await using screen = await render(<SendHarness />);
  await screen.getByRole("button", { name: "Improve", exact: true }).click();
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await expect.element(screen.getByText("new-run-from-send")).toBeVisible();
  expect(fake.start).toHaveBeenCalledTimes(1);
  await act(() =>
    finish(
      AsyncResult.success({
        _tag: "Optimized",
        requestId: "late-send",
        text: "Stale optimization",
        cacheMaybeExpired: false,
      }),
    ),
  );
  await vi.waitFor(() =>
    expect(screen.getByRole("status").element().textContent).toBe(
      "Draft changed; result discarded",
    ),
  );
  await vi.waitFor(() => expect(screen.getByRole("textbox").element().textContent).toBe(""));
});
