/** Exercises real preview persistence and canvas constraints across local gestures and remounts. */
import { useMemo } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { usePreviewMiniPlayerStore } from "~/previewMiniPlayerStore";
import type { PreviewMiniPlayerObstacles } from "./previewMiniPlayerLayout";
import { ChatCanvasContext } from "../chat/ChatCanvasContext";
import { resolveChatCanvasLayout, type ChatCanvasPreview } from "../chat/chatCanvasLayout";

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

import { ThreadPreviewMiniPlayer } from "./ThreadPreviewMiniPlayer";
const threadRef = {
  environmentId: EnvironmentId.make("gesture-env"),
  threadId: ThreadId.make("gesture-thread"),
};
const threadKey = scopedThreadKey(threadRef);
const source = { width: 900, height: 600 };
const reportPreview = vi.fn();
const clearPreview = vi.fn();
let parentRenders = 0;
let renderer: ReactTestRenderer | undefined;
const initialBounds = { width: 1000, height: 700 };
/** Runs the real canvas resolver with supplied bounds and the real persisted preview; only native presentation is stubbed. */
function Harness({
  bounds = initialBounds,
  composerHeight = 0,
  detailsCard = null,
  findBar = null,
}: {
  bounds?: { width: number; height: number };
  composerHeight?: number;
  detailsCard?: PreviewMiniPlayerObstacles["detailsCard"];
  findBar?: PreviewMiniPlayerObstacles["detailsCard"];
}) {
  parentRenders++;
  const miniPlayer = usePreviewMiniPlayerStore((store) => store.byThreadKey[threadKey])!;
  const resolvePreviewFrame = useMemo(
    () => (preview: ChatCanvasPreview) =>
      resolveChatCanvasLayout({ container: bounds, composerHeight, detailsCard, findBar, preview })
        .frame,
    [bounds, composerHeight, detailsCard, findBar],
  );
  const preview = { ...miniPlayer, key: "browser:tab", source, width: miniPlayer.width ?? 360 };
  return (
    <ChatCanvasContext
      value={{
        container: bounds,
        lane: { padding: 48, minChatWidth: 640 },
        layout: resolveChatCanvasLayout({
          container: bounds,
          composerHeight,
          detailsCard,
          findBar,
          preview,
        }),
        previewKey: "browser:tab",
        resolvePreviewFrame,
        reportPreview,
        clearPreview,
        registerTimeline: () => {},
        reportDetailsCard: () => {},
        detailsCardTopInset: 0,
      }}
    >
      <ThreadPreviewMiniPlayer threadRef={threadRef} miniPlayer={miniPlayer} />
    </ChatCanvasContext>
  );
}
/** Reads the displayed outer rectangle, including its transform, independently of the store. */
function displayedFrame() {
  const style = renderer!.root
    .findByType("section")
    .findAll((node) => typeof node.type === "string" && !!node.props.style?.transform)[0]!
    .props.style;
  const coordinates = /translate3d\(([-.\d]+)px, ([-.\d]+)px/.exec(style.transform)!;
  return {
    x: Number(coordinates[1]),
    y: Number(coordinates[2]),
    width: style.width as number,
    height: style.height as number,
  };
}
/** Finds a real drag or resize handler and drives a captured pointer without a browser. */
async function movePointer(direction: string | null, dx: number, dy: number) {
  const handle = renderer!.root.findAll(
    (node) =>
      typeof node.type === "string" &&
      !!node.props.onPointerDown &&
      (direction === null
        ? !node.props["data-preview-mini-player-resize"]
        : node.props["data-preview-mini-player-resize"] === direction),
  )[0]!;
  const event = {
    button: 0,
    pointerId: 7,
    clientX: 110,
    clientY: 90,
    currentTarget: {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
    },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
  await act(async () => handle.props.onPointerDown(event));
  await act(async () =>
    handle.props.onPointerMove({ ...event, clientX: 110 + dx, clientY: 90 + dy }),
  );
  return { handle, event };
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  usePreviewMiniPlayerStore.setState({ byThreadKey: {} });
  usePreviewMiniPlayerStore.getState().open(threadRef, { kind: "browser", tabId: "tab" });
  usePreviewMiniPlayerStore.getState().resize(threadRef, "browser:tab", 360, { x: 100, y: 80 });
  parentRenders = 0;
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  { direction: null, dx: 50, dy: 30, width: 360, x: 150, y: 110 },
  { direction: "east", dx: 90, dy: 0, width: 450, x: 100, y: 80 },
])(
  "persists $direction gesture on unmount and restores it on remount",
  async ({ direction, dx, dy, width, x, y }) => {
    await act(async () => {
      renderer = create(<Harness />);
    });
    const rendersBefore = parentRenders;
    await movePointer(direction, dx, dy);
    expect(parentRenders).toBe(rendersBefore);
    expect(usePreviewMiniPlayerStore.getState().byThreadKey[threadKey]!.width).toBe(360);
    await act(async () => renderer!.unmount());
    await act(async () => {
      renderer = create(<Harness />);
    });
    expect(displayedFrame()).toMatchObject({ x, y, width });
    expect(usePreviewMiniPlayerStore.getState().byThreadKey[threadKey]).toMatchObject({
      width,
      position: { x, y },
    });
  },
);

it("blocks a local drag at the composer and keeps the same frame on release", async () => {
  await act(async () => {
    renderer = create(<Harness composerHeight={180} />);
  });
  const { handle, event } = await movePointer(null, 0, 600);
  const local = displayedFrame();
  expect(local.y + local.height).toBeLessThanOrEqual(508);
  await act(async () => handle.props.onPointerUp(event));
  expect(displayedFrame()).toEqual(local);
});

it("fits the active gesture inside a shrinking container without another pointer move", async () => {
  await act(async () => {
    renderer = create(<Harness />);
  });
  await movePointer(null, 500, 300);
  await act(async () => renderer!.update(<Harness bounds={{ width: 300, height: 220 }} />));
  const frame = displayedFrame();
  expect(frame.x + frame.width).toBeLessThanOrEqual(288);
  expect(frame.y + frame.height).toBeLessThanOrEqual(208);
});

it.each([
  { dx: 0, width: 360, height: 272 },
  { dx: 90, width: 450, height: 332 },
])("keeps 900 by 600 content at 3:2 inside a $width outer frame", async ({ dx, width, height }) => {
  await act(async () => {
    renderer = create(<Harness />);
  });
  if (dx) await movePointer("east", dx, 0);
  expect(displayedFrame()).toMatchObject({ width, height });
});

it.each([
  {
    name: "details card",
    detailsCard: { left: 600, right: 988, bottom: 200 },
    findBar: null,
    dx: 600,
    minimumY: 212,
  },
  {
    name: "find bar",
    detailsCard: null,
    findBar: { left: 0, right: 1000, bottom: 48 },
    dx: 0,
    minimumY: 60,
  },
])(
  "keeps the local drag clear of the $name before and after release",
  async ({ detailsCard, findBar, dx, minimumY }) => {
    await act(async () => {
      renderer = create(<Harness detailsCard={detailsCard} findBar={findBar} />);
    });
    const { handle, event } = await movePointer(null, dx, -100);
    const local = displayedFrame();
    expect(local.y).toBeGreaterThanOrEqual(minimumY);
    await act(async () => handle.props.onPointerUp(event));
    expect(displayedFrame()).toEqual(local);
  },
);
