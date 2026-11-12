// @vitest-environment jsdom
import { act, useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { ChatRightPanelTerminalProvider } from "./ChatRightPanelTerminalHost";
import { ChatTerminalDrawers } from "./ChatTerminalDrawers";
import { Route } from "../../routes/_chat";
import { useTerminalUiStateStore } from "../../terminalUiStateStore";

const state = vi.hoisted(() => ({
  target: null as null | {
    kind: "server";
    threadRef: { environmentId: EnvironmentId; threadId: ThreadId };
  },
  refs: [] as Array<{ environmentId: EnvironmentId; threadId: ThreadId }>,
  draftKey: null as string | null,
  mounts: 0,
  exits: 0,
  allowed: true,
  deleted: false,
  listeners: new Set<() => void>(),
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: unknown) => ({ options }),
  Outlet: () => <div>Home</div>,
  redirect: () => ({}),
  useNavigate: () => () => {},
  Navigate: () => null,
}));
vi.mock("../../hooks/useThreadRouteTarget", () => ({ useThreadRouteTarget: () => state.target }));
vi.mock("../promptLinks/ThreadLinkPrompt", () => ({ ThreadLinkPrompt: () => null }));
vi.mock("./threadFindStore", () => ({ retainThreadFindForRoute: () => {} }));
vi.mock("../../state/entities", () => ({
  useThreadRefs: () => state.refs,
  useEnvironmentThreadRefs: () => state.refs,
  useQuietThreadShell: () => ({ deletedAt: state.deleted ? "2026-11-12" : null }),
}));
vi.mock("../../state/shell", () => ({ useEnvironmentShellStatus: () => "live" }));
vi.mock("../../state/threads", () => ({ useEnvironmentThread: () => null }));
vi.mock("../../state/session", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useEnvironmentScope: () => {
      useSyncExternalStore(
        (listener) => {
          state.listeners.add(listener);
          return () => {
            state.listeners.delete(listener);
          };
        },
        () => `${state.allowed}:${state.deleted}`,
      );
      return state.allowed;
    },
  };
});
vi.mock("../../state/terminal", () => ({
  subscribeTerminalAutomation: () => () => {},
  terminalAutomationRevision: () => 0,
  getTerminalAutomation: () => undefined,
}));
vi.mock("../../panelAnimations", () => ({
  usePanelAnimationSettings: () => ({ active: false, durationMs: 0 }),
  usePanelPresence: (present: boolean) => ({ present }),
}));
vi.mock("../../composerDraftStore", () => ({
  useComposerDraftStore: (select: (value: unknown) => unknown) =>
    select({
      draftThreadsByThreadKey: {},
      getDraftSession: () => null,
      getPromotedDraftRedirect: () => null,
      getDraftThreadByRef: () => null,
      getDraftIdByRef: () => state.draftKey,
      hasDraftThreadsInEnvironment: () => false,
    }),
}));
vi.mock("../ui/sidebar", () => ({
  SidebarInset: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("../ChatView", () => ({
  default: ({ environmentId, threadId }: { environmentId: EnvironmentId; threadId: ThreadId }) => (
    <ChatTerminalDrawers
      activeThreadKey={scopedThreadKey({ environmentId, threadId })}
      activeTerminalOpen
      composerHeight={0}
      launchContext={null}
      keybindings={[]}
      splitShortcutLabel={undefined}
      splitVerticalShortcutLabel={undefined}
      newShortcutLabel={undefined}
      closeShortcutLabel={undefined}
      onAddTerminalContext={() => {}}
    />
  ),
}));
vi.mock("../PersistentThreadTerminals", () => ({
  PersistentThreadTerminalPanel: () => null,
  PersistentThreadTerminalDrawer: () => {
    const [identity] = useState(() => ++state.mounts);
    useLayoutEffect(
      () => () => {
        state.exits += 1;
      },
      [],
    );
    return <output data-drawer={identity}>terminal</output>;
  },
}));

it("keeps bottom drawer identity through the actual chat route home return and draft key handoff", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const ref = { environmentId: EnvironmentId.make("env"), threadId: ThreadId.make("thread") };
  state.refs = [ref];
  state.target = { kind: "server", threadRef: ref };
  state.draftKey = null;
  state.mounts = 0;
  state.exits = 0;
  state.allowed = true;
  state.deleted = false;
  useTerminalUiStateStore.getState().setTerminalOpen(ref, true);
  const ChatRoute = Route.options.component!;
  await ChatRoute.preload?.();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = () => {
    for (const listener of state.listeners) listener();
    return (
      <ChatRightPanelTerminalProvider>
        <ChatRoute />
      </ChatRightPanelTerminalProvider>
    );
  };
  try {
    await act(async () => root.render(render()));
    const original = container.querySelector("[data-drawer]");
    expect(original).not.toBeNull();
    state.target = null;
    await act(async () => root.render(render()));
    expect(state.exits).toBe(0);
    state.target = { kind: "server", threadRef: ref };
    await act(async () => root.render(render()));
    expect(container.querySelector("[data-drawer]")).toBe(original);
    state.draftKey = "draft-handoff";
    await act(async () => root.render(render()));
    state.draftKey = null;
    await act(async () => root.render(render()));
    expect(container.querySelector("[data-drawer]")).toBe(original);
    expect(state.mounts).toBe(1);
    state.allowed = false;
    await act(async () => root.render(render()));
    expect(state.exits).toBe(1);
    state.allowed = true;
    await act(async () => root.render(render()));
    state.deleted = true;
    await act(async () => root.render(render()));
    expect(state.exits).toBe(2);
    state.refs = [];
    state.target = null;
    await act(async () => root.render(render()));
    expect(state.exits).toBe(2);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    useTerminalUiStateStore.setState({ terminalUiStateByThreadKey: {} });
    vi.unstubAllGlobals();
  }
});
