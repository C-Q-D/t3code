/** Exercises real preview persistence and canvas constraints across local gestures and remounts. */
import { useMemo } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { usePreviewMiniPlayerStore } from "~/previewMiniPlayerStore";
import { setPhysicsEnabled } from "~/lib/motion/preference";
import { installTestRaf } from "~/lib/motion/testRaf";
import { useBrowserSurfaceStore } from "~/browser/browserSurfaceStore";
import type { PreviewMiniPlayerObstacles } from "./previewMiniPlayerLayout";
import { ChatCanvasContext } from "../chat/ChatCanvasContext";
import { resolveChatCanvasLayout, type ChatCanvasPreview } from "../chat/chatCanvasLayout";

vi.mock("~/previewStateStore", () => ({
  useThreadPreviewState: () => ({
    sessions: {
      tab: {
        runtime: "desktop",
        navStatus: { _tag: "Success", url: "http://localhost:5173/settings", title: "Settings" },
        viewport: { _tag: "freeform", ...source },
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
vi.mock("~/browser/previewRuntimeTabId", () => ({ previewRuntimeTabId: () => "runtime-tab" }));
vi.mock("~/browser/previewRuntime", () => ({ useRendersServerTabNatively: () => true }));
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
let source = { width: 900, height: 600 };
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
  const preview = { ...miniPlayer, key: "browser:tab", source, width: miniPlayer.width };
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
async function movePointer(direction: string | null, dx: number, dy: number, advance = () => {}) {
  const handle = renderer!.root.findAll(
    (node) =>
      typeof node.type === "string" &&
      !!node.props.onPointerDown &&
      (direction === null
        ? !node.props["data-preview-mini-player-resize"]
        : node.props["data-preview-mini-player-resize"] === direction),
  )[0]!;
  const event = {
    type: "pointerup",
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
  advance();
  await act(async () =>
    handle.props.onPointerMove({ ...event, clientX: 110 + dx, clientY: 90 + dy }),
  );
  return { handle, event };
}
beforeEach(() => {
  setPhysicsEnabled(false);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  usePreviewMiniPlayerStore.setState({ byThreadKey: {} });
  usePreviewMiniPlayerStore.getState().open(threadRef, { kind: "browser", tabId: "tab" });
  usePreviewMiniPlayerStore.getState().resize(threadRef, "browser:tab", 360, { x: 100, y: 80 });
  source = { width: 900, height: 600 };
  parentRenders = 0;
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  setPhysicsEnabled(false);
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it.each([true, false])("physics %s delays a fast release only while enabled", async (enabled) => {
  setPhysicsEnabled(enabled);
  const clock = installTestRaf();
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  await act(async () => {
    renderer = create(<Harness />);
  });
  const { handle, event } = await movePointer(null, 400, 0, () => {
    now = 40;
  });
  await act(async () => handle.props.onPointerUp(event));
  expect(usePreviewMiniPlayerStore.getState().byThreadKey[threadKey]!.position).toEqual(
    enabled ? { x: 100, y: 80 } : { x: 500, y: 80 },
  );
  await act(async () => {
    for (now = 56; now < 2056; now += 16) clock.advance(now);
  });
  const final = displayedFrame();
  expect(final.x).toBeGreaterThanOrEqual(500);
  expect(final.x + final.width).toBeLessThanOrEqual(1000);
  expect(final.y + final.height).toBeLessThanOrEqual(700);
  expect(clock.pending.size).toBe(0);
  expect(usePreviewMiniPlayerStore.getState().byThreadKey[threadKey]!.position?.x).toBe(final.x);
});

it("takes over a gliding preview from its current position", async () => {
  setPhysicsEnabled(true);
  const clock = installTestRaf();
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  await act(async () => {
    renderer = create(<Harness />);
  });
  const { handle, event } = await movePointer(null, 50, 0, () => {
    now = 40;
  });
  await act(async () => handle.props.onPointerUp(event));
  await act(async () => clock.advance(56));
  const flying = displayedFrame();
  expect(flying.x).toBeGreaterThan(150);
  await act(async () => handle.props.onPointerDown(event));
  expect(clock.pending.size).toBe(0);
  await act(async () => handle.props.onPointerMove({ ...event, clientX: 130 }));
  expect(displayedFrame().x).toBeCloseTo(flying.x + 20);
  now = 200;
  await act(async () => handle.props.onPointerUp(event));
  expect(usePreviewMiniPlayerStore.getState().byThreadKey[threadKey]!.position?.x).toBeCloseTo(
    flying.x + 20,
  );
});

it("keeps native surface bounds aligned while the shell rebounds at the wall", async () => {
  setPhysicsEnabled(true);
  const clock = installTestRaf();
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", { querySelectorAll: () => [] });
  await act(async () => {
    renderer = create(<Harness />, {
      createNodeMock: (element) =>
        typeof element.props === "object" &&
        element.props !== null &&
        "data-browser-surface-slot" in element.props
          ? {
              // The browser's measured rect follows the transformed shell; the real slot owns remeasurement.
              getBoundingClientRect: () => displayedFrame(),
              closest: () => null,
            }
          : null,
    });
  });
  const { handle, event } = await movePointer(null, 400, 0, () => {
    now = 40;
  });
  await act(async () => handle.props.onPointerUp(event));
  await act(async () => clock.advance(56));
  await act(async () => clock.advance(106));
  const shell = displayedFrame();
  expect(shell.x + shell.width).toBeGreaterThan(1000);
  expect(useBrowserSurfaceStore.getState().byTabId["runtime-tab"]!.rect?.x).toBe(
    Math.round(shell.x),
  );
});

it.each([5, 25])(
  "preserves elastic preview position when grabbed after %s frames",
  async (frames) => {
    setPhysicsEnabled(true);
    const clock = installTestRaf();
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    await act(async () => {
      renderer = create(<Harness />);
    });
    const { handle, event } = await movePointer(null, 400, 0, () => {
      now = 40;
    });
    await act(async () => handle.props.onPointerUp(event));
    await act(async () => {
      for (let i = 0; i < frames; i++) clock.advance((now += 16));
    });
    const before = displayedFrame().x;
    expect(before).toBeGreaterThan(628);
    await act(async () => handle.props.onPointerDown(event));
    expect(Math.abs(displayedFrame().x - before)).toBeLessThanOrEqual(1);
    expect(clock.pending.size).toBe(0);
    await act(async () => handle.props.onPointerMove({ ...event, clientX: 100 }));
    expect(displayedFrame().x).toBeLessThan(before);
    expect(displayedFrame().x).toBeGreaterThan(before - 10);
    await act(async () => handle.props.onPointerMove(event));
    expect(Math.abs(displayedFrame().x - before)).toBeLessThanOrEqual(1);
    now += 100;
    await act(async () => handle.props.onPointerUp(event));
    expect(Math.abs(displayedFrame().x - before)).toBeLessThanOrEqual(1);
    await act(async () => {
      for (let i = 0; i < 120; i++) clock.advance((now += 16));
    });
    expect(displayedFrame().x).toBe(628);
    expect(clock.pending.size).toBe(0);
  },
);

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

it.each([
  { name: "inside", x: 200, y: 100 },
  { name: "past right edge", x: 1000, y: 100 },
  { name: "past left edge", x: -300, y: 100 },
  { name: "past top edge", x: 200, y: -300 },
  { name: "past bottom edge", x: 200, y: 800 },
  { name: "over composer", x: 200, y: 350 },
])(
  "keeps a portrait drag $name clear of the composer and unchanged on release",
  async ({ x, y }) => {
    source = { width: 390, height: 844 };
    await act(async () => {
      renderer = create(<Harness bounds={{ width: 800, height: 500 }} composerHeight={180} />);
    });
    const start = displayedFrame();
    const rendersBefore = parentRenders;
    const storedBefore = usePreviewMiniPlayerStore.getState().byThreadKey[threadKey];
    const { handle, event } = await movePointer(null, x - start.x, y - start.y);
    const local = displayedFrame();
    expect(parentRenders).toBe(rendersBefore);
    expect(usePreviewMiniPlayerStore.getState().byThreadKey[threadKey]).toBe(storedBefore);
    await act(async () => handle.props.onPointerUp(event));
    expect(displayedFrame()).toEqual(local);
    // The composer spans x=48..752 and starts at y=320 in this canvas.
    expect(local.x + local.width <= 48 || local.x >= 752 || local.y + local.height <= 320).toBe(
      true,
    );
  },
);

/** Exercises persistence through real handlers; resize requests use the east edge and drag requests use canvas coordinates. */
async function expectReleasePreservesFrame({
  bounds,
  composerHeight,
  detailsCard,
  findBar,
  viewport,
  width,
  mode,
  position,
}: {
  bounds: { width: number; height: number };
  composerHeight: number;
  detailsCard: PreviewMiniPlayerObstacles["detailsCard"];
  findBar: PreviewMiniPlayerObstacles["detailsCard"];
  viewport: { width: number; height: number };
  width: number | null;
  mode: "drag" | "resize";
  position: { x: number; y: number };
}) {
  source = viewport;
  const current = usePreviewMiniPlayerStore.getState().byThreadKey[threadKey]!;
  usePreviewMiniPlayerStore.setState({ byThreadKey: { [threadKey]: { ...current, width } } });
  await act(async () => {
    renderer = create(
      <Harness
        bounds={bounds}
        composerHeight={composerHeight}
        detailsCard={detailsCard}
        findBar={findBar}
      />,
    );
  });
  const start = displayedFrame();
  const stored = usePreviewMiniPlayerStore.getState().byThreadKey[threadKey];
  const renders = parentRenders;
  const { handle, event } = await movePointer(
    mode === "drag" ? null : "east",
    position.x - start.x,
    position.y - start.y,
  );
  const local = displayedFrame();
  expect(parentRenders).toBe(renders);
  expect(usePreviewMiniPlayerStore.getState().byThreadKey[threadKey]).toBe(stored);
  await act(async () => handle.props.onPointerUp(event));
  expect(displayedFrame()).toEqual(local);
  return local;
}

const gestureGrid: Parameters<typeof expectReleasePreservesFrame>[0][] = [];
for (const bounds of [
  { width: 800, height: 500 },
  { width: 1200, height: 900 },
]) {
  for (const composerHeight of [0, 180, 300]) {
    for (const card of [false, true]) {
      for (const find of [false, true]) {
        for (const viewport of [
          { width: 900, height: 600 },
          { width: 390, height: 844 },
        ]) {
          for (const width of [360, null]) {
            for (const mode of ["drag", "resize"] as const) {
              for (const position of [
                { x: 100, y: 100 },
                { x: 1000, y: 100 },
                { x: -300, y: 100 },
                { x: 100, y: -300 },
                { x: 100, y: 1200 },
                { x: 100, y: 400 },
                { x: 450, y: 100 },
                { x: 700, y: 20 },
              ]) {
                gestureGrid.push({
                  bounds,
                  composerHeight,
                  viewport,
                  width,
                  mode,
                  position,
                  detailsCard: card ? { left: 400, right: bounds.width - 12, bottom: 200 } : null,
                  findBar: find ? { left: 0, right: bounds.width, bottom: 48 } : null,
                });
              }
            }
          }
        }
      }
    }
  }
}
it.each(gestureGrid.map((row, index) => ({ ...row, index })))(
  "preserves the displayed frame through real store release in grid $index ($mode)",
  async (row) => {
    await expectReleasePreservesFrame(row);
  },
);

it.each([
  {
    name: "portrait past right edge",
    viewport: { width: 390, height: 844 },
    width: 360,
    composerHeight: 180,
    detailsCard: null,
    position: { x: 1000, y: 100 },
  },
  ...[360, null].map((width) => ({
    name: `card and tall composer with width ${width}`,
    viewport: { width: 900, height: 600 },
    width,
    composerHeight: 300,
    detailsCard: { left: 400, right: 788, bottom: 200 },
    position: { x: 100, y: 400 },
  })),
])("preserves the review reproduction: $name", async (row) => {
  const frame = await expectReleasePreservesFrame({
    ...row,
    bounds: { width: 800, height: 500 },
    findBar: null,
    mode: "drag",
  });
  expect(frame.x).toBeGreaterThanOrEqual(0);
  expect(frame.y).toBeGreaterThanOrEqual(0);
  expect(frame.x + frame.width).toBeLessThanOrEqual(800);
  expect(frame.y + frame.height).toBeLessThanOrEqual(500);
  // With the card the composer ends at x=368; without it, it ends at x=752.
  const composerRight = row.detailsCard ? 368 : 752;
  expect(
    frame.x >= composerRight ||
      frame.x + frame.width <= 48 ||
      frame.y + frame.height <= 500 - row.composerHeight,
  ).toBe(true);
  if (row.detailsCard) expect(frame.x + frame.width <= 400 || frame.y >= 200).toBe(true);
});
it("preserves the shared layout fallback when V4 chrome has no free space", async () => {
  const frame = await expectReleasePreservesFrame({
    bounds: { width: 800, height: 64 },
    composerHeight: 0,
    detailsCard: null,
    findBar: { left: 0, right: 800, bottom: 48 },
    viewport: { width: 900, height: 600 },
    width: 360,
    mode: "drag",
    position: { x: 100, y: 100 },
  });
  // Existing shared output is intentionally retained, including zero content width.
  expect(frame).toEqual({ x: 700, y: 12, width: 12, height: 40 });
});

it("keeps the baseline position after dragging past the right edge and growing the canvas", async () => {
  await act(async () => {
    renderer = create(<Harness bounds={{ width: 800, height: 500 }} />);
  });
  const start = displayedFrame();
  const { handle, event } = await movePointer(null, 1000 - start.x, 100 - start.y);
  const local = displayedFrame();
  await act(async () => handle.props.onPointerUp(event));
  expect(displayedFrame()).toEqual(local);
  await act(async () => renderer!.update(<Harness bounds={{ width: 1000, height: 700 }} />));
  // Baseline clamps the request to 800 - 360 - 12 = 428 before saving it.
  // The V4 height is 272, so y=100 fits both containers without adjustment.
  expect(displayedFrame()).toMatchObject({ x: 428, y: 100, width: 360 });
  expect(usePreviewMiniPlayerStore.getState().byThreadKey[threadKey]!.position).toEqual({
    x: 428,
    y: 100,
  });
});
