/** @vitest-environment jsdom */
/** Verifies floating preview gestures commit shared layout only after interaction ends. */
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { resolveChatCanvasLayout, type ChatCanvasPreview } from "../chat/chatCanvasLayout";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";

const state = vi.hoisted(() => ({
  move: vi.fn(),
  resize: vi.fn(),
  close: vi.fn(),
  reportPreview: vi.fn(),
  clearPreview: vi.fn(),
  frame: { x: 100, y: 80, width: 360, height: 272 },
}));
/** Supplies the production canvas policy to the isolated pointer-handler test. */
const resolvePreviewFrame = (preview: ChatCanvasPreview) =>
  resolveChatCanvasLayout({ container: { width: 1000, height: 700 }, preview }).frame;
vi.mock("../chat/ChatCanvasContext", () => ({
  useChatCanvas: () => ({
    container: { width: 1000, height: 700 },
    previewKey: "browser:tab",
    resolvePreviewFrame,
    layout: { frame: state.frame },
    reportPreview: state.reportPreview,
    clearPreview: state.clearPreview,
  }),
}));
vi.mock("~/previewMiniPlayerStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/previewMiniPlayerStore")>()),
  usePreviewMiniPlayerStore: { getState: () => state },
}));
vi.mock("~/previewStateStore", () => ({
  useThreadPreviewState: () => ({
    sessions: {
      tab: {
        runtime: "desktop",
        navStatus: { _tag: "Success", url: "http://localhost:5173/settings", title: "Settings" },
        viewport: { _tag: "freeform", width: 900, height: 600 },
      },
    },
    desktopByTabId: { tab: { hasWebContents: true, zoomFactor: 1 } },
    serverEpoch: "epoch",
  }),
}));
vi.mock("~/browser/browserRecording", () => ({
  useActiveBrowserRecordingTabIds: () => new Set(),
  findActiveBrowserRecordingRuntimeTabId: () => null,
}));
vi.mock("~/browser/browserSurfaceStore", () => ({ useBrowserSurfaceStore: () => null }));
vi.mock("~/browser/previewRuntimeTabId", () => ({ previewRuntimeTabId: () => "runtime-tab" }));
vi.mock("~/browser/previewRuntime", () => ({ useRendersServerTabNatively: () => true }));
vi.mock("~/browser/BrowserSurfaceSlot", () => ({ BrowserSurfaceSlot: "surface-slot" }));
vi.mock("~/browser/ServerBrowserSurface", () => ({ ServerBrowserSurface: "server-surface" }));
vi.mock("~/browser/serverPictureInPicture", () => ({
  useServerPictureInPictureKey: () => null,
  serverPictureInPictureKey: () => "pip",
}));
vi.mock("./previewBridge", () => ({ previewBridge: null }));
vi.mock("./showPreviewPopup", () => ({ showPreviewPopup: vi.fn() }));
vi.mock("~/state/device", () => ({ useDeviceState: vi.fn() }));
vi.mock("../device/DeviceStreamView", () => ({ DeviceStreamView: "device-stream" }));
vi.mock("~/rightPanelStore", () => ({
  useRightPanelStore: { getState: () => ({ openBrowser: vi.fn() }) },
}));
vi.mock("~/components/ui/toast", () => ({ toastManager: { add: vi.fn() } }));
vi.mock("~/components/ui/button", () => ({ Button: "button" }));
vi.mock("~/components/ui/tooltip", () => ({
  Tooltip: "tooltip",
  TooltipTrigger: "tooltip-trigger",
  TooltipPopup: "tooltip-popup",
}));

import { BrowserSurfaceSlot } from "~/browser/BrowserSurfaceSlot";
import { ThreadPreviewMiniPlayer } from "./ThreadPreviewMiniPlayer";
let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  {
    name: "drag release",
    direction: null,
    dx: 50,
    dy: 30,
    x: 150,
    y: 110,
    width: 360,
    finish: "onPointerUp",
    eventType: "pointerup",
  },
  {
    name: "edge-clamped drag with capture loss",
    direction: null,
    dx: 2000,
    dy: 2000,
    x: 628,
    y: 416,
    width: 360,
    finish: "onLostPointerCapture",
    eventType: "lostpointercapture",
  },
  {
    name: "resize cancellation",
    direction: "east",
    dx: 90,
    dy: 0,
    x: 100,
    y: 80,
    width: 450,
    finish: "onPointerCancel",
    eventType: "pointercancel",
  },
])(
  "keeps $name local until the gesture ends",
  async ({ direction, dx, dy, x, y, width, finish, eventType }) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const threadRef = {
      environmentId: EnvironmentId.make("env"),
      threadId: ThreadId.make("thread"),
    };
    await act(async () => {
      renderer = create(
        <ThreadPreviewMiniPlayer
          threadRef={threadRef}
          miniPlayer={{
            source: { kind: "browser", tabId: "tab" },
            position: { x: 100, y: 80 },
            width: 360,
            lastInteraction: "drag",
          }}
        />,
      );
    });
    const target = {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
    };
    const event = {
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
      clientX: 110,
      clientY: 90,
      currentTarget: target,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    const handle = () =>
      renderer!.root.findAll(
        (node) =>
          typeof node.type === "string" &&
          !!node.props.onPointerDown &&
          (direction === null
            ? !node.props["data-preview-mini-player-resize"]
            : node.props["data-preview-mini-player-resize"] === direction),
      )[0]!;
    await act(async () => handle().props.onPointerDown(event));
    await act(async () =>
      handle().props.onPointerMove({ ...event, clientX: 110 + dx, clientY: 90 + dy }),
    );
    expect(state.move).not.toHaveBeenCalled();
    expect(state.resize).not.toHaveBeenCalled();
    expect(state.reportPreview).toHaveBeenCalledTimes(1);
    expect(
      renderer!.root
        .findByType("section")
        .findAll((node) => typeof node.type === "string" && !!node.props.style?.transform)[0]!.props
        .style.transform,
    ).toBe(`translate3d(${x}px, ${y}px, 0)`);
    expect(renderer!.root.findByType(BrowserSurfaceSlot).props.layoutVersion).toBe(`${x}:${y}`);
    await act(async () => handle().props[finish]({ ...event, type: eventType }));
    if (direction === null)
      // Baseline saves the container-clamped request; the edge gap is 12px.
      expect(state.move).toHaveBeenCalledExactlyOnceWith(threadRef, "browser:tab", {
        x,
        y,
      });
    else
      expect(state.resize).toHaveBeenCalledExactlyOnceWith(threadRef, "browser:tab", width, {
        x,
        y,
      });
  },
);
