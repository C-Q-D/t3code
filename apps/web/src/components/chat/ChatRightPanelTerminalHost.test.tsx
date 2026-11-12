// @vitest-environment jsdom
import {
  act,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  EnvironmentId,
  ThreadId,
  type TerminalAutomationCandidate,
  type TerminalAutomationBinding,
  type TerminalAutomationClientReply,
  type TerminalAutomationRpcEvent,
} from "@t3tools/contracts";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { expect, it, vi } from "vite-plus/test";
import { TerminalAutomationController } from "../../terminal/automationController";
import { useRightPanelStore, type RightPanelSurface } from "../../rightPanelStore";
import { ChatRightPanelTerminalHost } from "./ChatRightPanelTerminalHost";
import { ThreadRouteView } from "../ThreadRouteView";
import { ChatRightPanel } from "./ChatRightPanel";
import { RightPanelSurfaceContent } from "./RightPanelSurfaceContent";

const state = vi.hoisted(() => ({
  refs: [] as Array<{ environmentId: EnvironmentId; threadId: ThreadId }>,
  allowed: true,
  draftKey: null as string | null,
  renderRevision: 0,
  listeners: new Set<() => void>(),
  deleted: new Set<ThreadId>(),
  render: (_ref: { environmentId: EnvironmentId; threadId: ThreadId }): ReactNode => null,
  mount:
    (_props: {
      threadRef: { environmentId: EnvironmentId; threadId: ThreadId };
      surface: RightPanelSurface;
    }) =>
    () => {},
}));
vi.mock("../../state/entities", () => ({
  useThreadRefs: () => state.refs,
  useEnvironmentThreadRefs: () => state.refs,
  useQuietThreadShell: (ref: { threadId: ThreadId } | null) =>
    state.refs.some((entry) => entry.threadId === ref?.threadId)
      ? { deletedAt: ref && state.deleted.has(ref.threadId) ? "2026-11-12T00:00:00Z" : null }
      : null,
}));
vi.mock("../../state/shell", () => ({ useEnvironmentShellStatus: () => "live" }));
vi.mock("../../state/threads", () => ({ useEnvironmentThread: () => ({ status: "deleted" }) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => () => {}, Navigate: () => null }));
vi.mock("../ui/sidebar", () => ({
  SidebarInset: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("../ChatView", () => ({
  default: (props: { environmentId: EnvironmentId; threadId: ThreadId }) => {
    useSyncExternalStore(
      (listener) => {
        state.listeners.add(listener);
        return () => {
          state.listeners.delete(listener);
        };
      },
      () => state.renderRevision,
    );
    return state.render(props);
  },
}));
vi.mock("../../state/session", () => ({ useEnvironmentScope: () => state.allowed }));
vi.mock("../../composerDraftStore", () => {
  const draftState = () => ({
    draftThreadsByThreadKey: {},
    getDraftSession: () => null,
    getPromotedDraftRedirect: () => null,
    getDraftThreadByRef: () => null,
    getDraftIdByRef: () => state.draftKey,
    hasDraftThreadsInEnvironment: () => false,
  });
  return {
    useComposerDraftStore: (select: (value: ReturnType<typeof draftState>) => unknown) =>
      select(draftState()),
  };
});
vi.mock("../../hooks/usePreviewPanelInlineSize", () => ({ usePreviewPanelInlineSize: () => ({}) }));
vi.mock("../RightPanelTabs", () => ({
  RightPanelTabs: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock("../RightPanelSheet", () => ({
  RightPanelSheet: ({ children }: { children: ReactNode }) => <aside>{children}</aside>,
}));
vi.mock("./SideChatPane", () => ({ default: () => null }));
vi.mock("../pullRequest/pullRequestDetail.logic", () => ({ pullRequestPanelContext: () => null }));
vi.mock("../pullRequest/PullRequestDetailPanel", () => ({ PullRequestDetailPanel: () => null }));
vi.mock("../pullRequest/PullRequestGhosts", () => ({ PullRequestDetailGhost: () => null }));
vi.mock("../pullRequest/PullRequestsUnavailableState", () => ({
  PullRequestsUnavailableState: () => null,
}));
vi.mock("../pullRequest/ThreadPullRequestsPanel", () => ({
  ThreadPullRequestsPanel: () => <output data-pull-requests>requests</output>,
}));
vi.mock("../PersistentThreadTerminals", () => ({
  PersistentThreadTerminalPanel: (props: Parameters<typeof state.mount>[0]) => {
    const [mount] = useState(() => state.mount);
    useLayoutEffect(() => mount(props), [mount]);
    return <output>{props.surface.id}</output>;
  },
}));

it("preserves original candidates through outer panel removal, tab and thread switches, then releases real closures", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const a = { environmentId: EnvironmentId.make("env"), threadId: ThreadId.make("a") };
  const b = { ...a, threadId: ThreadId.make("b") };
  state.refs = [a, b];
  state.allowed = true;
  state.draftKey = null;
  state.renderRevision = 0;
  state.listeners.clear();
  state.deleted.clear();
  const terminalA: Extract<RightPanelSurface, { kind: "terminal" }> = {
    id: "terminal:a",
    kind: "terminal",
    resourceId: "a",
    terminalIds: ["a"],
    activeTerminalId: "a",
  };
  const terminalB: Extract<RightPanelSurface, { kind: "terminal" }> = {
    ...terminalA,
    id: "terminal:b",
    resourceId: "b",
    terminalIds: ["b"],
    activeTerminalId: "b",
  };
  const terminalA2 = {
    ...terminalB,
    id: "terminal:a2" as const,
    resourceId: "a2",
    terminalIds: ["a2"],
    activeTerminalId: "a2",
  };
  useRightPanelStore.setState({
    byThreadKey: {
      [scopedThreadKey(a)]: {
        isOpen: true,
        activeSurfaceId: terminalA.id,
        surfaces: [terminalA, terminalA2],
      },
      [scopedThreadKey(b)]: { isOpen: true, activeSurfaceId: terminalB.id, surfaces: [terminalB] },
    },
  });
  const registered = new Map<string, ReadonlyArray<TerminalAutomationCandidate>>();
  const removed: string[] = [];
  const controllers = new Map<string, TerminalAutomationController>();
  const receivers = new Map<string, (event: typeof TerminalAutomationRpcEvent.Type) => void>();
  const bindings = new Map<string, TerminalAutomationBinding>();
  const replies = new Map<string, (value: TerminalAutomationClientReply) => void>();
  const ready: Array<() => void> = [];
  let nextId = 0;
  for (const ref of state.refs) {
    const key = scopedThreadKey(ref);
    let receive!: (event: typeof TerminalAutomationRpcEvent.Type) => void;
    const controller = new TerminalAutomationController({
      subscribe: (start, _end, event) => {
        receive = event;
        start();
        return () => {};
      },
      registerViews: async (views) => {
        registered.set(key, views);
      },
      getConnectionState: async () => ({
        version: 1,
        bindings: bindings.has(key) ? [{ status: "bound", binding: bindings.get(key)! }] : [],
      }),
      replyBridge: async (reply, isCurrent) => {
        expect(isCurrent()).toBe(true);
        replies.get(reply.bridgeRequestId)!(reply);
      },
      replySelection: async () => {},
      resume: async () => {
        throw new Error("No automatic resume");
      },
      reportEvent: async ({ target }) => {
        removed.push(target.viewId);
      },
    });
    controllers.set(key, controller);
    controller.start();
    receivers.set(key, receive);
    ready.push(() => receive({ type: "ready" }));
  }
  state.mount = ({ threadRef, surface }) => {
    const controller = controllers.get(scopedThreadKey(threadRef))!;
    const target = {
      terminalId: surface.kind === "terminal" ? surface.activeTerminalId : "invalid",
      terminalInstanceId: "original-pty",
      viewId: `view-${++nextId}`,
    };
    controller.setView({
      candidate: {
        candidateId: target.viewId,
        target,
        title: "Terminal",
        clientKind: "web",
        visible: false,
        readiness: "ready",
        capabilities: { read: true, input: true, show: true },
      },
      canOperate: () => true,
      perform: async () => ({ operation: "show", status: "visible" }),
      invalidate: () => {},
    });
    return () => controller.removeView(target);
  };
  const noop = () => {};
  const getShortcutContext = () => ({
    terminalFocus: false,
    terminalOpen: false,
    previewFocus: false,
    previewOpen: false,
    isWeb: true,
    isDesktop: false,
  });
  const terminal = {
    launchContext: null,
    keybindings: [],
    onAddTerminalContext: noop,
    onSplitTerminal: noop,
    onSplitTerminalVertical: noop,
    onNewTerminal: noop,
    onActiveTerminalChange: noop,
    onCloseTerminal: noop,
  } satisfies ComponentProps<typeof ChatRightPanelTerminalHost>["terminal"];
  const panelProps = {
    sheet: false,
    maximized: false,
    workspaceLayoutElement: null,
    widthStorageKey: "test",
    sheetAnimationDurationMs: 0,
    onCloseSheet: noop,
    keybindings: [],
    getShortcutContext,
    surfaces: [],
    environmentId: a.environmentId,
    activeSurfaceId: terminalA.id,
    pendingSurfaceIds: new Set<string>(),
    previewSessions: {},
    desktopByTabId: {},
    terminalLabelsById: new Map(),
    onActivate: noop,
    onCloseSurface: noop,
    onCloseOtherSurfaces: noop,
    onCloseSurfacesToRight: noop,
    onCloseAllSurfaces: noop,
    onCopyFilePath: noop,
    onAddBrowser: noop,
    onAddBrowserInProfile: noop,
    onAddTerminal: noop,
    onAddDiff: noop,
    onAddFiles: noop,
    onAddPullRequest: noop,
    onAddPullRequests: noop,
    onAddDevice: noop,
    browserAvailable: false,
    terminalAvailable: true,
    diffAvailable: false,
    filesAvailable: false,
    pullRequestAvailable: false,
    pullRequestsAvailable: false,
    deviceAvailable: false,
  };
  const contentProps = {
    activeSurfaceId: terminalA.id,
    threadRef: a,
    environmentId: a.environmentId,
    visible: true,
    composerDraftTarget: a,
    keybindings: [],
    configuredPreviewUrls: [],
    workspaceMutationId: null,
    getShortcutContext,
    onSendAnnotation: noop,
    onCloseSurface: noop,
    sideChatParentPanel: { openToolDiff: noop, runShellCommand: noop },
    pullRequest: {
      capabilityKnown: true,
      supported: false,
      projectId: null,
      pullRequests: [],
      linkedPullRequest: null,
      branchPullRequest: null,
      onBack: undefined,
    },
    files: {
      projectName: null,
      workspaceRoot: undefined,
      availableEditors: [],
      pendingSurfaceIds: new Set<string>(),
      onOpenFile: noop,
      onPendingChange: noop,
    },
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = (
    present: boolean,
    ref = a,
    surface: RightPanelSurface | null = terminalA,
    sheet = false,
    viewKey = "server",
  ) => {
    state.draftKey = viewKey === "server" ? null : viewKey;
    state.render = (threadRef) => (
      <ChatRightPanelTerminalHost
        present={present}
        enabled
        activeThreadRef={threadRef}
        terminal={terminal}
      >
        <ChatRightPanel {...panelProps} sheet={sheet}>
          <RightPanelSurfaceContent {...contentProps} threadRef={threadRef} surface={surface} />
        </ChatRightPanel>
      </ChatRightPanelTerminalHost>
    );
    state.renderRevision += 1;
    for (const listener of state.listeners) listener();
    return <ThreadRouteView target={{ kind: "server", threadRef: ref }} />;
  };
  const candidates = () =>
    [...registered.values()]
      .flat()
      .map((view) => view.target)
      .sort((left, right) => left.viewId.localeCompare(right.viewId));
  try {
    await act(async () => root.render(render(true)));
    await act(async () => {
      for (const receive of ready) receive();
    });
    expect(candidates().map((target) => target.terminalId)).toEqual(["a"]);
    await act(async () => root.render(render(true, a, terminalA2)));
    await act(async () => root.render(render(true, b, terminalB)));
    await act(async () => root.render(render(true)));
    const original = candidates();
    expect(original).toHaveLength(3);
    const binding = {
      bindingId: "original-binding",
      alias: "terminal",
      inputEpoch: 0,
      target: original.find((target) => target.terminalId === "a")!,
    };
    bindings.set(scopedThreadKey(a), binding);
    let nextRequest = 0;
    const requestOriginalBinding = async () => {
      const bridgeRequestId = `request-${++nextRequest}`;
      const result = new Promise<TerminalAutomationClientReply>((resolve) =>
        replies.set(bridgeRequestId, resolve),
      );
      receivers.get(scopedThreadKey(a))!({
        version: 1,
        bridgeRequestId,
        binding,
        operation: "show",
      });
      return (await result).result;
    };
    expect(await requestOriginalBinding()).toEqual({ operation: "show", status: "visible" });
    await act(async () => root.render(render(false)));
    expect(candidates()).toEqual(original);
    expect(removed).toEqual([]);
    expect(await requestOriginalBinding()).toEqual({ operation: "show", status: "visible" });
    await act(async () =>
      root.render(render(true, a, { kind: "pull-requests", id: "pull-requests" })),
    );
    expect(container.querySelector("[data-pull-requests]")).not.toBeNull();
    expect(candidates()).toEqual(original);
    expect(await requestOriginalBinding()).toEqual({ operation: "show", status: "visible" });
    await act(async () => root.render(render(false)));
    expect(container.querySelector("[data-pull-requests]")).toBeNull();
    await act(async () => root.render(render(true, b, terminalB, true)));
    expect(candidates()).toEqual(original);
    await act(async () => root.render(render(true)));
    expect(candidates()).toEqual(original);
    expect(nextId).toBe(3);
    await act(async () => root.render(render(true, b, terminalB, false, "draft-handoff")));
    await act(async () => root.render(render(true)));
    expect(candidates()).toEqual(original);
    expect(nextId).toBe(3);
    expect(await requestOriginalBinding()).toEqual({ operation: "show", status: "visible" });
    expect(controllers.get(scopedThreadKey(a))!.getSnapshot().bindings[0]?.binding).toBe(binding);
    await act(async () =>
      useRightPanelStore.setState({
        byThreadKey: {
          [scopedThreadKey(b)]: {
            isOpen: true,
            activeSurfaceId: terminalB.id,
            surfaces: [terminalB],
          },
        },
      }),
    );
    expect(candidates().map((target) => target.terminalId)).toEqual(["b"]);
    expect(removed).toEqual(
      original.filter((target) => target.terminalId !== "b").map((target) => target.viewId),
    );
    expect(await requestOriginalBinding()).toMatchObject({ error: { code: "target_invalid" } });
    state.deleted.add(b.threadId);
    await act(async () => root.render(render(false)));
    expect(candidates()).toEqual([]);
    expect(removed).toHaveLength(3);
    state.deleted.clear();
    state.refs = [b];
    await act(async () => root.render(render(true, b, terminalB)));
    expect(candidates()).toHaveLength(1);
    state.allowed = false;
    await act(async () => root.render(render(false)));
    expect(candidates()).toEqual([]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    for (const controller of controllers.values()) controller.dispose();
    useRightPanelStore.setState({ byThreadKey: {} });
    vi.unstubAllGlobals();
  }
});
