/** Localized preview UI and interactions; preserves user data, commands, and protocol values. */
"use client";

import { t } from "~/i18n";

import { FILL_PREVIEW_VIEWPORT, type ScopedThreadRef } from "@t3tools/contracts";
import { GlobeIcon, PanelRightIcon, PictureInPicture2, XIcon } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { ChatCanvasPreview } from "../chat/chatCanvasLayout";
import { useChatCanvas } from "../chat/ChatCanvasContext";
import { BrowserSurfaceSlot } from "~/browser/BrowserSurfaceSlot";
import {
  findActiveBrowserRecordingRuntimeTabId,
  useActiveBrowserRecordingTabIds,
} from "~/browser/browserRecording";
import { useBrowserSurfaceStore } from "~/browser/browserSurfaceStore";
import type { BrowserViewportResizeDirection } from "~/browser/browserViewportLayout";
import { previewRuntimeTabId } from "~/browser/previewRuntimeTabId";
import { useRendersServerTabNatively } from "~/browser/previewRuntime";
import { type ServerBrowserHandle, ServerBrowserSurface } from "~/browser/ServerBrowserSurface";
import {
  closeServerPictureInPicture,
  openServerPictureInPicture,
  serverPictureInPictureKey,
  supportsServerPictureInPicture,
  useServerPictureInPictureKey,
} from "~/browser/serverPictureInPicture";
import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { isPhysicsEnabled } from "~/lib/motion/preference";
import { project, rubber } from "~/lib/motion/project";
import { useMotionJob } from "~/lib/motion/react";
import { Spring } from "~/lib/motion/spring";
import { DECEL } from "~/lib/motion/tokens";
import { VelocityTracker } from "~/lib/motion/velocity";
import { useThreadPreviewState } from "~/previewStateStore";
import {
  type PreviewMiniPlayerSize,
  type PreviewMiniPlayerSource,
  type PreviewMiniPlayerState,
  previewMiniPlayerSourceKey,
  usePreviewMiniPlayerStore,
} from "~/previewMiniPlayerStore";
import { useRightPanelStore } from "~/rightPanelStore";
import { useDeviceState } from "~/state/device";

import { DeviceStreamView } from "../device/DeviceStreamView";
import type { DeviceScreenSize } from "@t3tools/client-runtime/device/stream";
import type { PreviewStreamViewport } from "@t3tools/client-runtime/preview/server-browser-stream";
import { previewBridge } from "./previewBridge";
import { showPreviewPopup } from "./showPreviewPopup";
import {
  clampPreviewMiniPlayerPosition,
  NO_PREVIEW_MINI_PLAYER_OBSTACLES,
  PREVIEW_MINI_PLAYER_CORNER_RADIUS,
  PREVIEW_MINI_PLAYER_WEBVIEW_Z_INDEX,
  type PreviewMiniPlayerFrame,
  resizePreviewMiniPlayer,
  resolveDeviceMiniPlayerCornerRadius,
  resolveDeviceMiniPlayerSourceSize,
  resolvePreviewMiniPlayerSourceSize,
} from "./previewMiniPlayerLayout";

/** Captures one pointer gesture and its latest local frame until shared layout is committed. */
interface PointerGesture {
  readonly tracker: VelocityTracker;
  gliding: boolean;
  readonly pointerId: number;
  readonly pointerX: number;
  readonly pointerY: number;
  readonly frame: PreviewMiniPlayerFrame;
  readonly direction: BrowserViewportResizeDirection | null;
  moved: boolean;
  latest: PreviewMiniPlayerFrame;
  /** The exact request used for local layout; resolved frames must never become new intent. */
  request: { x: number; y: number; width: number | null };
  readonly threadRef: ScopedThreadRef;
  readonly sourceKey: string;
  readonly source: PreviewMiniPlayerSize;
  readonly preferredWidth: number | null;
  readonly resolveFrame: (preview: ChatCanvasPreview) => PreviewMiniPlayerFrame | null;
  readonly target: HTMLElement;
}

// A touch that travels less than this is a tap on the handle, not a drag.
const HANDLE_TAP_SLOP_PX = 6;

/** Identifies the owning thread and persisted floating preview state. */
interface Props {
  readonly threadRef: ScopedThreadRef;
  readonly miniPlayer: PreviewMiniPlayerState;
}

// Invisible grab zones straddling each edge; the cursor is the only affordance.
const RESIZE_HANDLES: ReadonlyArray<{
  readonly direction: BrowserViewportResizeDirection;
  readonly className: string;
}> = [
  { direction: "north", className: "inset-x-0 -top-1 h-2 cursor-ns-resize" },
  { direction: "south", className: "inset-x-0 -bottom-1 h-2 cursor-ns-resize" },
  { direction: "west", className: "inset-y-0 -left-1 w-2 cursor-ew-resize" },
  { direction: "east", className: "inset-y-0 -right-1 w-2 cursor-ew-resize" },
  { direction: "northwest", className: "-left-2 -top-2 size-4 cursor-nwse-resize" },
  { direction: "northeast", className: "-right-2 -top-2 size-4 cursor-nesw-resize" },
  { direction: "southwest", className: "-bottom-2 -left-2 size-4 cursor-nesw-resize" },
  { direction: "southeast", className: "-bottom-2 -right-2 size-4 cursor-nwse-resize" },
];

/** Floats the thread's browser tab or device stream over chat. */
export function ThreadPreviewMiniPlayer({ threadRef, miniPlayer }: Props) {
  const { source } = miniPlayer;
  return source.kind === "browser" ? (
    <BrowserMiniPlayer
      key={source.tabId}
      threadRef={threadRef}
      tabId={source.tabId}
      miniPlayer={miniPlayer}
    />
  ) : (
    <DeviceMiniPlayer
      key={previewMiniPlayerSourceKey(source)}
      threadRef={threadRef}
      source={source}
      miniPlayer={miniPlayer}
    />
  );
}

/**
 * Renders the floating browser surface and its separate-window controls.
 * @param props View data, control flags, and callbacks defined by the component props type; optional fields retain their declared defaults.
 * @returns Floating preview UI, or null when the selected tab snapshot is missing.
 */
function BrowserMiniPlayer({ threadRef, tabId, miniPlayer }: Props & { readonly tabId: string }) {
  const previewState = useThreadPreviewState(threadRef);
  const snapshot = previewState.sessions[tabId] ?? null;
  const runtimeTabId = previewRuntimeTabId(threadRef, previewState.serverEpoch, tabId);
  const recordingTabIds = useActiveBrowserRecordingTabIds();
  const recording =
    recordingTabIds.has(runtimeTabId) ||
    findActiveBrowserRecordingRuntimeTabId(threadRef, tabId) !== null;
  const desktopOverlay = previewState.desktopByTabId[tabId] ?? null;
  const fittedSourceContent = useBrowserSurfaceStore(
    (state) => state.byTabId[runtimeTabId]?.fittedSourceContent ?? null,
  );
  const nativeServerTab = useRendersServerTabNatively(threadRef.environmentId, snapshot);
  const serverTab = snapshot?.runtime === "server" && !nativeServerTab;
  const [streamViewport, setStreamViewport] = useState<PreviewStreamViewport | null>(null);
  const serverSurfaceRef = useRef<ServerBrowserHandle | null>(null);
  const serverPictureInPicture =
    useServerPictureInPictureKey() === serverPictureInPictureKey(threadRef.threadId, tabId);
  const sourceSize =
    serverTab && streamViewport
      ? streamViewport
      : resolvePreviewMiniPlayerSourceSize(
          snapshot?.viewport ?? FILL_PREVIEW_VIEWPORT,
          fittedSourceContent,
          desktopOverlay?.zoomFactor ?? 1,
        );

  const openInPanel = () => {
    usePreviewMiniPlayerStore.getState().close(threadRef);
    useRightPanelStore.getState().openBrowser(threadRef, tabId);
  };

  const toggleNativePictureInPicture = async () => {
    try {
      if (serverTab) {
        if (serverPictureInPicture) closeServerPictureInPicture();
        else
          await openServerPictureInPicture({
            ...threadRef,
            tabId,
            seed: serverSurfaceRef.current?.canvas() ?? null,
          });
      } else if (previewBridge) {
        const operation = desktopOverlay?.pictureInPicture
          ? previewBridge.pictureInPicture.close
          : previewBridge.pictureInPicture.open;
        await operation(runtimeTabId);
      }
    } catch (error) {
      toastManager.add({
        type: "error",
        title: serverTab ? t.tools.preview.popoutFailed : t.tools.preview.updatePopoutFailed,
        description: error instanceof Error ? error.message : t.tools.preview.error,
      });
    }
  };

  if (!snapshot) return null;
  const poppedOut = serverTab ? serverPictureInPicture : Boolean(desktopOverlay?.pictureInPicture);
  const canPopOut = serverTab ? supportsServerPictureInPicture() : true;

  return (
    <MiniPlayerShell
      threadRef={threadRef}
      miniPlayer={miniPlayer}
      sourceSize={sourceSize}
      label={t.tools.preview.floatingBrowser}
      title={"url" in snapshot.navStatus ? snapshot.navStatus.url : t.tools.preview.floatingBrowser}
      recording={recording}
      onOpenInPanel={openInPanel}
      pillActions={
        canPopOut ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={poppedOut ? "secondary" : "ghost"}
                  size="icon-xs"
                  aria-label={
                    poppedOut ? t.tools.preview.closePopout : t.tools.preview.popIntoWindow
                  }
                  disabled={!serverTab && !desktopOverlay?.hasWebContents}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={toggleNativePictureInPicture}
                />
              }
            >
              <PictureInPicture2 />
            </TooltipTrigger>
            <TooltipPopup side="top">
              {poppedOut ? t.tools.preview.closeWindow : t.tools.preview.popIntoSeparate}
            </TooltipPopup>
          </Tooltip>
        ) : null
      }
    >
      {(frame) =>
        serverTab ? (
          <div
            className="pointer-events-auto absolute inset-0 overflow-hidden rounded-compact-row"
            style={{ zIndex: PREVIEW_MINI_PLAYER_WEBVIEW_Z_INDEX }}
          >
            <ServerBrowserSurface
              ref={serverSurfaceRef}
              environmentId={threadRef.environmentId}
              threadId={threadRef.threadId}
              tabId={tabId}
              visible
              followSize={false}
              controlPosition="bottom"
              onViewport={setStreamViewport}
              onPopup={(popupTabId) => showPreviewPopup(threadRef, popupTabId, "floating")}
              className="size-full"
            />
          </div>
        ) : (
          <>
            <BrowserSurfaceSlot
              tabId={runtimeTabId}
              visible={Boolean(desktopOverlay?.hasWebContents)}
              cornerRadius={PREVIEW_MINI_PLAYER_CORNER_RADIUS}
              zIndex={PREVIEW_MINI_PLAYER_WEBVIEW_Z_INDEX}
              fitSourceContent
              layoutVersion={`${frame.x}:${frame.y}`}
              className="absolute inset-0"
            />
            {!desktopOverlay?.hasWebContents ? (
              <div className="pointer-events-none absolute inset-0 ov4-preview-controls flex items-center justify-center rounded-compact-row bg-muted text-xs text-muted-foreground">
                {t.tools.preview.reconnecting}
              </div>
            ) : null}
          </>
        )
      }
    </MiniPlayerShell>
  );
}

/**
 * Renders the floating device surface using the selected host and device state.
 * @param props View data, control flags, and callbacks defined by the component props type; optional fields retain their declared defaults.
 * @returns Rendered UI for the supplied props.
 */
function DeviceMiniPlayer({
  threadRef,
  source,
  miniPlayer,
}: Props & { readonly source: Extract<PreviewMiniPlayerSource, { kind: "device" }> }) {
  const { state: deviceState } = useDeviceState(threadRef.environmentId);
  const [screen, setScreen] = useState<DeviceScreenSize | null>(null);
  const sourceSize = resolveDeviceMiniPlayerSourceSize(source.platform, screen);
  const device = deviceState.devices.find(
    (entry) => entry.hostId === source.hostId && entry.id === source.deviceId,
  );
  const hostLabel =
    deviceState.hosts.find((host) => host.id === source.hostId)?.label ??
    t.tools.preview.deviceHost;
  const cornerRadius = useCallback(
    (player: PreviewMiniPlayerSize) => resolveDeviceMiniPlayerCornerRadius(source.platform, player),
    [source.platform],
  );

  const openInPanel = () => {
    usePreviewMiniPlayerStore.getState().close(threadRef);
    useRightPanelStore.getState().openDevice(threadRef, {
      hostId: source.hostId,
      deviceId: source.deviceId,
      platform: source.platform,
      name: source.name,
    });
  };

  return (
    <MiniPlayerShell
      threadRef={threadRef}
      miniPlayer={miniPlayer}
      sourceSize={sourceSize}
      label={t.tools.preview.floatingDevice}
      onOpenInPanel={openInPanel}
      cornerRadius={cornerRadius}
    >
      {() => (
        // The stream is DOM, so it takes the band the browser's native webview would.
        <div
          className="pointer-events-auto absolute inset-0 overflow-hidden rounded-compact-row"
          style={{ zIndex: PREVIEW_MINI_PLAYER_WEBVIEW_Z_INDEX }}
        >
          <DeviceStreamView
            environmentId={threadRef.environmentId}
            platform={source.platform}
            deviceId={source.deviceId}
            hostId={source.hostId}
            deviceName={device?.name ?? source.name}
            deviceDescription={`${hostLabel} · ${device?.version ?? source.platform}`}
            visible
            onScreen={setScreen}
          />
        </div>
      )}
    </MiniPlayerShell>
  );
}

/**
 * V4 frame and drag/resize gestures shared by floating sources. Gesture frames
 * stay local until release; the store receives the same request used to render
 * them, never the fitted result. Native content remeasures through layoutVersion.
 * @param props View data, control flags, and callbacks defined by the component props type; optional fields retain their declared defaults.
 * @returns Rendered UI for the supplied props.
 */
function MiniPlayerShell({
  threadRef,
  miniPlayer,
  sourceSize,
  label,
  title = label,
  onOpenInPanel,
  pillActions,
  recording = false,
  cornerRadius,
  children,
}: {
  readonly threadRef: ScopedThreadRef;
  readonly miniPlayer: PreviewMiniPlayerState;
  readonly sourceSize: PreviewMiniPlayerSize;
  readonly label: string;
  readonly title?: string;
  readonly onOpenInPanel: () => void;
  readonly pillActions?: ReactNode;
  readonly recording?: boolean;
  readonly cornerRadius?: (frame: PreviewMiniPlayerSize) => number;
  readonly children: (frame: PreviewMiniPlayerFrame) => ReactNode;
}) {
  const canvas = useChatCanvas();
  const gestureRef = useRef<PointerGesture | null>(null);
  const { start, stop } = useMotionJob();
  const [overshoot, setOvershoot] = useState({ x: 0, y: 0 });
  // Only this shell rerenders while moving. Native slots need layoutVersion to
  // remeasure their transformed bounds; the chat canvas is updated on release.
  const [gestureFrame, setGestureFrame] = useState<PreviewMiniPlayerFrame | null>(null);
  const container = canvas?.container ?? null;
  const resolvePreviewFrame = canvas?.resolvePreviewFrame;
  const sourceKey = previewMiniPlayerSourceKey(miniPlayer.source);
  const frame = gestureFrame ?? (canvas?.previewKey === sourceKey ? canvas.layout.frame : null);
  const { width: sourceWidth, height: sourceHeight } = sourceSize;
  const reportPreview = canvas?.reportPreview;
  const clearPreview = canvas?.clearPreview;
  useLayoutEffect(() => {
    reportPreview?.({
      key: sourceKey,
      width: miniPlayer.width,
      position: miniPlayer.position,
      lastInteraction: miniPlayer.lastInteraction,
      source: { width: sourceWidth, height: sourceHeight },
    });
  }, [
    reportPreview,
    sourceKey,
    miniPlayer.width,
    miniPlayer.position,
    miniPlayer.lastInteraction,
    sourceWidth,
    sourceHeight,
  ]);
  // Both release and teardown consume the ref before writing, so capture loss
  // cannot submit twice and cleanup retains the gesture's original owner.
  const commitGesture = useCallback(() => {
    stop();
    const gesture = gestureRef.current;
    if (!gesture) return;
    gestureRef.current = null;
    if (gesture.moved) {
      const store = usePreviewMiniPlayerStore.getState();
      const { x, y, width } = gesture.request;
      if (gesture.direction === null) store.move(gesture.threadRef, gesture.sourceKey, { x, y });
      else if (width !== null) store.resize(gesture.threadRef, gesture.sourceKey, width, { x, y });
    }
    if (gesture.target.hasPointerCapture(gesture.pointerId))
      gesture.target.releasePointerCapture(gesture.pointerId);
  }, [stop]);
  useLayoutEffect(
    () => () => {
      commitGesture();
      clearPreview?.(sourceKey);
    },
    [clearPreview, sourceKey, commitGesture],
  );
  // Constraint changes end the gesture before paint. A stale pointer origin
  // must not drag a newly fitted frame back outside the resized canvas.
  useLayoutEffect(() => {
    const gesture = gestureRef.current;
    if (!gesture || !resolvePreviewFrame) return;
    if (
      gesture.resolveFrame === resolvePreviewFrame &&
      gesture.source.width === sourceWidth &&
      gesture.source.height === sourceHeight
    )
      return;
    commitGesture();
    setOvershoot({ x: 0, y: 0 });
    setGestureFrame(null);
  }, [resolvePreviewFrame, sourceWidth, sourceHeight, commitGesture]);

  const beginGesture = (
    event: ReactPointerEvent<HTMLElement>,
    direction: BrowserViewportResizeDirection | null,
  ) => {
    if (event.button !== 0 || !frame || !resolvePreviewFrame) return;
    stop();
    const interrupted = gestureRef.current?.gliding ?? false;
    const current = gestureRef.current?.latest ?? frame;
    const tracker = new VelocityTracker();
    tracker.add(event.clientX, event.clientY);
    setOvershoot({ x: 0, y: 0 });
    gestureRef.current = {
      tracker,
      gliding: false,
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      frame: current,
      direction,
      moved: interrupted,
      latest: current,
      request: { x: current.x, y: current.y, width: miniPlayer.width },
      threadRef,
      sourceKey,
      source: sourceSize,
      preferredWidth: miniPlayer.width,
      resolveFrame: resolvePreviewFrame,
      target: event.currentTarget,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !container) return;
    if (gesture.gliding) return;
    gesture.tracker.add(event.clientX, event.clientY);
    const delta = { x: event.clientX - gesture.pointerX, y: event.clientY - gesture.pointerY };
    if (!gesture.moved && Math.hypot(delta.x, delta.y) < HANDLE_TAP_SLOP_PX) return;
    gesture.moved = true;
    const requested =
      gesture.direction === null
        ? {
            ...gesture.frame,
            width: gesture.preferredWidth,
            // Match the baseline request: contain the drag before canvas avoidance.
            // Save this same request so enlarging the canvas cannot reveal pointer overshoot.
            ...clampPreviewMiniPlayerPosition(
              { x: gesture.frame.x + delta.x, y: gesture.frame.y + delta.y },
              container,
              gesture.frame,
              NO_PREVIEW_MINI_PLAYER_OBSTACLES,
            ),
          }
        : resizePreviewMiniPlayer({
            start: gesture.frame,
            direction: gesture.direction,
            delta,
            source: sourceSize,
            container,
          });
    gesture.request = { x: requested.x, y: requested.y, width: requested.width };
    gesture.latest =
      gesture.resolveFrame({
        key: gesture.sourceKey,
        width: requested.width,
        position: requested,
        source: sourceSize,
        lastInteraction: gesture.direction === null ? "drag" : "resize",
      }) ?? gesture.latest;
    setGestureFrame(gesture.latest);
  };
  const endGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (gesture?.pointerId !== event.pointerId) return;
    if (gesture.gliding) return;
    const velocity = gesture.tracker.velocity();
    if (event.type === "pointerup") {
      if (
        isPhysicsEnabled() &&
        gesture.moved &&
        gesture.direction === null &&
        container &&
        Math.hypot(velocity.x, velocity.y) > 50
      ) {
        gesture.gliding = true;
        if (gesture.target.hasPointerCapture(gesture.pointerId))
          gesture.target.releasePointerCapture(gesture.pointerId);
        const origin = gesture.request;
        let elapsed = 0;
        let rebound: { x: Spring; y: Spring } | null = null;
        // Keep elastic overflow visual-only: persisted intent must remain inside the canvas.
        start((dt) => {
          if (!isPhysicsEnabled()) {
            commitGesture();
            setOvershoot({ x: 0, y: 0 });
            setGestureFrame(null);
            return false;
          }
          if (rebound) {
            const movingX = rebound.x.step(dt);
            const movingY = rebound.y.step(dt);
            setOvershoot({ x: rebound.x.value, y: rebound.y.value });
            if (movingX || movingY) return true;
            commitGesture();
            setGestureFrame(null);
            return false;
          }
          elapsed = Math.min(0.3, elapsed + dt);
          const fraction = (1 - DECEL.fast ** (elapsed * 1000)) / (1 - DECEL.fast ** 300);
          const requested = {
            x: origin.x + project(velocity.x, DECEL.fast) * fraction,
            y: origin.y + project(velocity.y, DECEL.fast) * fraction,
          };
          const position = clampPreviewMiniPlayerPosition(
            requested,
            container,
            gesture.latest,
            NO_PREVIEW_MINI_PLAYER_OBSTACLES,
          );
          gesture.request = { ...position, width: origin.width };
          gesture.latest =
            gesture.resolveFrame({
              key: gesture.sourceKey,
              width: origin.width,
              position,
              source: gesture.source,
              lastInteraction: "drag",
            }) ?? gesture.latest;
          const offset = {
            x: rubber(requested.x - position.x, container.width),
            y: rubber(requested.y - position.y, container.height),
          };
          setGestureFrame(gesture.latest);
          setOvershoot(offset);
          if (elapsed >= 0.3)
            rebound = {
              x: new Spring({ value: offset.x, target: 0 }),
              y: new Spring({ value: offset.y, target: 0 }),
            };
          return true;
        });
        return;
      }
    }
    commitGesture();
    setGestureFrame(null);
  };

  return (
    <div className="pointer-events-none absolute inset-0">
      {frame ? (
        <section
          aria-label={label}
          data-preview-mini-player={sourceKey}
          className="pointer-events-none absolute inset-0 select-none"
        >
          {/* Native guests live at global layer 48. Separate transformed siblings
              keep the surface at 47 and controls at 49, outside its stacking context. */}
          <div
            className="ov4-preview-frame dropdown-glass absolute left-0 top-0 rounded-overlay-large"
            style={{
              transform: `translate3d(${frame.x + overshoot.x}px, ${frame.y + overshoot.y}px, 0)`,
              width: frame.width,
              height: frame.height,
              borderRadius: cornerRadius?.(frame),
            }}
          >
            <div className="absolute inset-x-1.5 bottom-1.5 top-8.5 rounded-compact-row bg-code shadow-well-control">
              {/* Native slots must remeasure even when only the elastic offset changes. */}
              {children({ ...frame, x: frame.x + overshoot.x, y: frame.y + overshoot.y })}
            </div>
          </div>
          <div
            className="ov4-preview-controls pointer-events-none absolute left-0 top-0"
            style={{
              transform: `translate3d(${frame.x + overshoot.x}px, ${frame.y + overshoot.y}px, 0)`,
              width: frame.width,
              height: frame.height,
            }}
          >
            <div
              className="ov4-preview-controls pointer-events-auto relative flex h-8.5 touch-none cursor-grab items-center gap-2 pl-3 pr-1.5 font-mono text-meta-large text-secondary-label active:cursor-grabbing"
              onPointerDown={(event) => beginGesture(event, null)}
              onPointerMove={handlePointerMove}
              onPointerUp={endGesture}
              onPointerCancel={endGesture}
              onLostPointerCapture={endGesture}
            >
              <GlobeIcon aria-hidden className="size-3 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{title}</span>
              {recording ? (
                <span
                  role="status"
                  aria-label={t.tools.preview.recordingPreview}
                  className="size-2 shrink-0 rounded-full bg-destructive"
                />
              ) : null}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t.tools.preview.openRightPanel}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={onOpenInPanel}
                    />
                  }
                >
                  <PanelRightIcon />
                </TooltipTrigger>
                <TooltipPopup side="top">{t.tools.preview.openInRightPanel}</TooltipPopup>
              </Tooltip>
              {pillActions}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t.tools.preview.closeFloating}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => usePreviewMiniPlayerStore.getState().close(threadRef)}
                    />
                  }
                >
                  <XIcon />
                </TooltipTrigger>
                <TooltipPopup side="top">{t.tools.preview.closeFloating}</TooltipPopup>
              </Tooltip>
            </div>
            <span
              aria-hidden
              className="ov4-preview-controls pointer-events-none absolute bottom-2.5 right-2.5 size-3 rounded-br-ov4-swatch border-b-2 border-r-2 border-fg-control-disabled"
            />
            {RESIZE_HANDLES.map(({ direction, className }) => (
              <div
                key={direction}
                role="presentation"
                data-preview-mini-player-resize={direction}
                className={cn(
                  "ov4-preview-controls pointer-events-auto absolute touch-none",
                  className,
                )}
                onPointerDown={(event) => beginGesture(event, direction)}
                onPointerMove={handlePointerMove}
                onPointerUp={endGesture}
                onPointerCancel={endGesture}
                onLostPointerCapture={endGesture}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
