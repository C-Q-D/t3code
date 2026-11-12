import {
  AuthTerminalOperateScope,
  EnvironmentId,
  ThreadId,
  type AuthEnvironmentScope,
} from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { nextTerminalAttachSeedState } from "@t3tools/client-runtime/state/terminal";
import { AsyncResult } from "effect/reactivity";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type {
  GhosttyTerminalSurface,
  GhosttyTerminalSurfaceOptions,
} from "~/terminal/ghostty/surface";

const state = vi.hoisted(() => ({
  allowed: true,
  listeners: new Set<() => void>(),
  resize: vi.fn(),
  otherCommand: vi.fn(),
  createSurface:
    vi.fn<
      (
        mount: HTMLElement,
        options: GhosttyTerminalSurfaceOptions,
      ) => Promise<GhosttyTerminalSurface>
    >(),
}));

vi.mock("@effect/atom-react", () => ({ useAtomValue: () => null, useAtomMount: () => undefined }));
vi.mock("../hooks/useSettings", () => ({
  getClientSettings: () => DEFAULT_CLIENT_SETTINGS,
  useClientSettings: (select: (settings: typeof DEFAULT_CLIENT_SETTINGS) => unknown) =>
    select(DEFAULT_CLIENT_SETTINGS),
}));
vi.mock("../editorPreferences", () => ({ useOpenInPreferredEditor: () => state.otherCommand }));
vi.mock("../localApi", () => ({ readLocalApi: () => null }));
vi.mock("../hooks/useLocalStorage", () => ({
  useLocalStorage: (_key: string, value: unknown) => [value, () => {}],
}));
vi.mock("../lib/terminalFocus", () => ({
  consumePendingTerminalFocus: () => false,
  registerTerminalFocusTarget: () => () => {},
  focusTerminal: () => {},
  focusTerminalViewport: () => false,
}));
vi.mock("~/components/ui/popover", () => {
  const Passthrough = ({ children }: { children: ReactNode }) => children;
  return { Popover: Passthrough, PopoverPopup: Passthrough, PopoverTrigger: Passthrough };
});
vi.mock("../state/server", () => ({
  serverEnvironment: { configValueAtom: () => "config" },
}));
vi.mock("../state/preview", () => ({ previewEnvironment: { open: "open" } }));
vi.mock("../state/terminal", () => ({ terminalEnvironment: { resize: "resize", write: "write" } }));
vi.mock("../state/use-atom-command", () => ({
  useAtomCommand: (command: string) => (command === "resize" ? state.resize : state.otherCommand),
}));
vi.mock("../state/terminalSessions", () => ({
  useKnownTerminalSessions: () => [],
  attachedTerminalSessionAtom: () => "terminal-session",
}));
vi.mock("../rpc/atomRegistry", () => ({
  appAtomRegistry: { get: () => session, subscribe: () => () => undefined },
}));
vi.mock("~/terminal/ghostty/surface", () => ({
  GhosttyTerminalSurface: { create: state.createSurface },
}));
vi.mock("../state/session", async () => {
  const { useSyncExternalStore } = await import("react");
  const readEnvironmentScope = (id: EnvironmentId | null, scope: AuthEnvironmentScope) =>
    id !== null &&
    (scope !== AuthTerminalOperateScope || id !== threadRef.environmentId || state.allowed);
  return {
    readEnvironmentScope,
    useEnvironmentScope: (id: EnvironmentId | null, scope: AuthEnvironmentScope) =>
      useSyncExternalStore(
        (listener) => {
          state.listeners.add(listener);
          return () => state.listeners.delete(listener);
        },
        () => readEnvironmentScope(id, scope),
      ),
  };
});

import ThreadTerminalDrawer, { TerminalViewport } from "./ThreadTerminalDrawer";

const threadRef = {
  environmentId: EnvironmentId.make("secondary-terminal"),
  threadId: ThreadId.make("thread"),
};
const session = { ...nextTerminalAttachSeedState(), status: "running" as const, version: 1 };
let renderer: ReactTestRenderer | undefined;

beforeEach(() => {
  state.allowed = true;
  state.listeners.clear();
  state.resize.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  state.otherCommand.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  // A surface can report its initial grid while asynchronous WASM setup is
  // pending. Keep that unrelated setup pending while exercising its callback.
  state.createSurface.mockReset().mockReturnValue(new Promise(() => undefined));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("HTMLElement", function HTMLElement() {});
  vi.stubGlobal("document", {
    body: {},
    documentElement: { classList: { contains: () => false } },
    querySelector: () => null,
    createElement: () => ({ getContext: () => null }),
  });
  vi.stubGlobal("getComputedStyle", () => ({
    colorScheme: "light",
    backgroundColor: "",
    color: "",
    getPropertyValue: () => "",
  }));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

it("rechecks the target terminal grant when a retained surface callback reports a resize", async () => {
  await act(async () => {
    renderer = create(
      <TerminalViewport
        advancedTypography={false}
        threadRef={threadRef}
        threadId={threadRef.threadId}
        terminalId="terminal-1"
        cwd="/repo"
        onSessionExited={state.otherCommand}
        autoFocus={false}
        visible={true}
        keybindings={[]}
      />,
      { createNodeMock: () => ({ closest: () => null, contains: () => false }) },
    );
  });
  expect(state.createSurface).toHaveBeenCalledOnce();
  const onResize = state.createSurface.mock.calls[0]![1].onResize;
  if (!onResize) throw new Error("The terminal did not register its resize callback.");

  onResize(80, 24);
  expect(state.resize).toHaveBeenCalledExactlyOnceWith({
    environmentId: threadRef.environmentId,
    input: { threadId: threadRef.threadId, terminalId: "terminal-1", cols: 80, rows: 24 },
  });

  // The connection updates before React commits its external-store update.
  // Other environments retain access; only this terminal's target is revoked.
  state.allowed = false;
  onResize(120, 40);
  expect(state.resize).toHaveBeenCalledTimes(1);

  state.allowed = true;
  onResize(100, 30);
  expect(state.resize).toHaveBeenCalledTimes(2);
  expect(state.resize).toHaveBeenLastCalledWith({
    environmentId: threadRef.environmentId,
    input: { threadId: threadRef.threadId, terminalId: "terminal-1", cols: 100, rows: 30 },
  });
});

it("keeps opened terminal viewports mounted across tab switches and removes only a closed tab", async () => {
  const renderDrawer = (ids: string[], active: string) => (
    <ThreadTerminalDrawer
      threadRef={threadRef}
      threadId={threadRef.threadId}
      cwd="/repo"
      height={300}
      terminalIds={ids}
      activeTerminalId={active}
      terminalGroups={ids.map((id) => ({ id, terminalIds: [id] }))}
      activeTerminalGroupId={active}
      keybindings={[]}
      onSplitTerminal={state.otherCommand}
      onSplitTerminalVertical={state.otherCommand}
      onNewTerminal={state.otherCommand}
      onActiveTerminalChange={state.otherCommand}
      onCloseTerminal={state.otherCommand}
      onHeightChange={state.otherCommand}
      onAddTerminalContext={state.otherCommand}
    />
  );
  await act(async () => {
    renderer = create(renderDrawer(["a", "b"], "a"), {
      createNodeMock: () => ({ closest: () => null, contains: () => false }),
    });
  });
  const original = renderer!.root.findAllByType(TerminalViewport);
  expect(original.map((view) => view.props.terminalId)).toEqual(["a", "b"]);
  await act(async () => renderer!.update(renderDrawer(["a", "b"], "b")));
  expect(renderer!.root.findAllByType(TerminalViewport)).toEqual(original);
  expect(state.createSurface).toHaveBeenCalledTimes(2);
  await act(async () => renderer!.update(renderDrawer(["b"], "b")));
  expect(renderer!.root.findAllByType(TerminalViewport)).toEqual([original[1]]);
});
