/** Hosts panel sizing and resize handles; standalone chat panels own a separate slab below the titlebar. */
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  type PreviewPanelInlineSize,
  usePreviewPanelInlineSize,
} from "~/hooks/usePreviewPanelInlineSize";
import { RESIZABLE_WIDTH_PROPERTY } from "~/hooks/useResizableWidth";
import { cn } from "~/lib/utils";
import { Slab } from "~/components/ui/slab";

import { RightPanelResizeHandle } from "./RightPanelResizeHandle";

/** Chooses whether sizing belongs to this shell, a sheet/sidebar host, or an embedded surface. */
export type PreviewPanelMode = "inline" | "sheet" | "sidebar" | "embedded";

interface PreviewPanelShellProps {
  mode: PreviewPanelMode;
  /** Use a sibling slab in chat; false preserves embedded and PR-page layouts. */
  standalone?: boolean;
  /** Let the surrounding slab supply the browser gutters' stone background; defaults to false. */
  transparent?: boolean;
  maximized?: boolean;
  inlineSize?: PreviewPanelInlineSize;
  open?: boolean;
  onCollapse?: (() => void) | undefined;
  /**
   * Callers embedding this shell for a different surface (e.g. the pull
   * requests page) should pass their own key so resizing one panel doesn't
   * clobber the other's remembered width.
   */
  widthStorageKey?: string;
  defaultWidth?: number;
  children: ReactNode;
}

/** Selects externally owned sizing or a local resizable width; children supply panel content. */
export function PreviewPanelShell(props: PreviewPanelShellProps) {
  if (props.inlineSize) {
    return <PreviewPanelShellFrame {...props} inlineSize={props.inlineSize} />;
  }

  return <ResizablePreviewPanelShell {...props} />;
}

/** Resolves local width only when the host has not supplied its shared resize state. */
function ResizablePreviewPanelShell(props: PreviewPanelShellProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const inlineSize = usePreviewPanelInlineSize(hostRef, {
    enabled: props.mode === "inline" && !props.maximized,
    widthStorageKey: props.widthStorageKey,
    defaultWidth: props.defaultWidth,
    standalone: props.standalone,
    onCollapse: props.onCollapse,
  });
  return <PreviewPanelShellFrame {...props} inlineSize={inlineSize} hostRef={hostRef} />;
}

/** Keeps the resize handle outside clipping; the standalone slab owns its stone surface and content clip. */
function PreviewPanelShellFrame(
  props: PreviewPanelShellProps & {
    inlineSize: PreviewPanelInlineSize;
    hostRef?: RefObject<HTMLDivElement | null>;
  },
) {
  const isInline = props.mode === "inline";
  const collapsible = isInline && props.open !== undefined;
  const open = props.open ?? true;
  const maximized = props.maximized ?? false;
  const localHostRef = useRef<HTMLDivElement | null>(null);
  const hostRef = props.hostRef ?? localHostRef;
  const returnedFocus = useRef(false);
  const { width, handlers } = props.inlineSize;
  // Derive suppression before the layout commits so the browser never creates
  // a width transition for resize or maximize changes.
  const [layoutTransition, setLayoutTransition] = useState(() => ({
    open,
    width,
    maximized,
    suppressed: false,
  }));
  if (
    layoutTransition.open !== open ||
    layoutTransition.width !== width ||
    layoutTransition.maximized !== maximized
  ) {
    setLayoutTransition({
      open,
      width,
      maximized,
      suppressed:
        collapsible &&
        layoutTransition.open === open &&
        (layoutTransition.width !== width || layoutTransition.maximized !== maximized),
    });
  }
  const suppressWidthTransition = layoutTransition.suppressed;
  useLayoutEffect(() => {
    if (!suppressWidthTransition) return;
    let restoreFrame = 0;
    const paintFrame = window.requestAnimationFrame(() => {
      restoreFrame = window.requestAnimationFrame(() => {
        setLayoutTransition((current) => ({ ...current, suppressed: false }));
      });
    });
    return () => {
      window.cancelAnimationFrame(paintFrame);
      window.cancelAnimationFrame(restoreFrame);
    };
  }, [suppressWidthTransition]);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !collapsible) return;
    return () => {
      if (!host.contains(host.ownerDocument.activeElement) && !returnedFocus.current) return;
      // The toggle moves when the shell unmounts, after an animation or immediately.
      // Restore focus at its committed location if removal cleared focus to body.
      queueMicrotask(() => {
        if (host.ownerDocument.activeElement === host.ownerDocument.body) {
          host.ownerDocument.querySelector<HTMLButtonElement>("[data-right-panel-toggle]")?.focus();
        }
      });
    };
  }, [collapsible, hostRef]);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const collapsed = collapsible && !open;
    if (!collapsed) returnedFocus.current = false;
    // Move focus before making its current owner inert, while the toggle is reachable.
    if (collapsed && host.contains(host.ownerDocument.activeElement)) {
      const toggle = host.ownerDocument.querySelector<HTMLButtonElement>(
        "[data-right-panel-toggle]",
      );
      toggle?.focus();
      returnedFocus.current = toggle !== null && host.ownerDocument.activeElement === toggle;
    }
    host.toggleAttribute("inert", collapsed);
  }, [collapsible, open, hostRef]);
  const content = (
    <div className={cn("h-full min-h-0 w-full", collapsible && "overflow-clip")}>
      <div
        className="flex h-full min-h-0 min-w-0 flex-col"
        style={
          collapsible && !maximized
            ? {
                width: props.standalone
                  ? `var(${RESIZABLE_WIDTH_PROPERTY})`
                  : `calc(var(${RESIZABLE_WIDTH_PROPERTY}) - 1px)`,
              }
            : undefined
        }
      >
        {props.children}
      </div>
    </div>
  );
  return (
    <div
      ref={hostRef}
      className={cn(
        "relative flex h-full min-h-0 min-w-0 max-w-full flex-col self-stretch",
        !props.standalone && !props.transparent && "bg-background",
        isInline ? (maximized ? "flex-1" : "shrink-0") : "w-full",
        isInline && !maximized && !props.standalone && "border-l border-border",
        isInline && props.standalone && open && !maximized && "ms-(--frame-slab-gap)",
        // The standalone slab animates too, so the chat slab gives way frame by frame
        // instead of being squeezed the instant the panel mounts at full width.
        collapsible &&
          "[[data-panel-animations=true]_&]:transition-[width,margin-inline-start] [[data-panel-animations=true]_&]:duration-(--panel-animation-duration) [[data-panel-animations=true]_&]:ease-(--panel-animation-easing)",
        collapsible &&
          open &&
          "[[data-panel-animations=true]_&]:starting:w-0! [[data-panel-animations=true]_&]:starting:ms-0!",
        collapsible && !open && "pointer-events-none",
        collapsible && !open && props.standalone && "invisible",
      )}
      style={
        isInline
          ? ({
              [RESIZABLE_WIDTH_PROPERTY]: `${width}px`,
              width: maximized
                ? "100%"
                : collapsible && !open
                  ? "0px"
                  : `var(${RESIZABLE_WIDTH_PROPERTY})`,
              transitionDuration: suppressWidthTransition ? "0ms" : undefined,
            } as CSSProperties)
          : undefined
      }
      data-preview-panel-mode={props.mode}
      data-preview-panel-maximized={maximized ? "true" : "false"}
    >
      {isInline && !maximized ? <RightPanelResizeHandle handlers={handlers} /> : null}
      {props.standalone ? (
        <Slab
          tone="card"
          radius="slab"
          elevation="slab-frame"
          glow
          className="h-full min-h-0 overflow-hidden"
          render={<div className="stone-panel" />}
        >
          {content}
        </Slab>
      ) : (
        content
      )}
    </div>
  );
}
