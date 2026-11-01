import { t } from "~/i18n";
/** Hosts panel sizing and resize handles; standalone chat panels own a separate slab below the titlebar. */
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";

import {
  type PreviewPanelInlineSize,
  usePreviewPanelInlineSize,
} from "~/hooks/usePreviewPanelInlineSize";
import { RESIZABLE_WIDTH_PROPERTY } from "~/hooks/useResizableWidth";
import { workspaceAreaProps } from "../../lib/workspaceFocus";
import { cn } from "~/lib/utils";
import { Slab } from "~/components/ui/slab";

import { RightPanelResizeHandle } from "./RightPanelResizeHandle";

/** Chooses whether sizing belongs to this shell, a sheet/sidebar host, or an embedded surface. */
export type PreviewPanelMode = "inline" | "sheet" | "sidebar" | "embedded";

interface PreviewPanelShellProps {
  workspaceArea?: boolean;
  workspaceFocusKey?: string;
  workspaceLabel?: string;
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
  const inlineSize = usePreviewPanelInlineSize({
    enabled: props.mode === "inline" && !props.maximized,
    widthStorageKey: props.widthStorageKey,
    defaultWidth: props.defaultWidth,
    standalone: props.standalone,
    onCollapse: props.onCollapse,
  });
  return <PreviewPanelShellFrame {...props} inlineSize={inlineSize} />;
}

/** Keeps the resize handle outside clipping; the standalone slab owns its stone surface and content clip. */
function PreviewPanelShellFrame(
  props: PreviewPanelShellProps & { inlineSize: PreviewPanelInlineSize },
) {
  const panelArea = workspaceAreaProps(
    "panel",
    4,
    props.workspaceLabel ?? t.chat.navigationCopy.workspacePanel,
  );
  const isInline = props.mode === "inline";
  const collapsible = isInline && props.open !== undefined;
  const open = props.open ?? true;
  const maximized = props.maximized ?? false;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const returnedFocus = useRef(false);
  const { width, handlers, observeRow } = props.inlineSize;
  // Width animates only for an open or close. Any other width change disables
  // the transition in the same commit that changes the width, so the browser
  // never starts one; the next open or close re-enables it in its own commit,
  // so nothing waits for a paint.
  const [widthTransition, setWidthTransition] = useState(() => ({
    open,
    width,
    maximized,
    enabled: true,
  }));
  if (
    widthTransition.open !== open ||
    widthTransition.width !== width ||
    widthTransition.maximized !== maximized
  ) {
    setWidthTransition({
      open,
      width,
      maximized,
      enabled: widthTransition.open !== open,
    });
  }
  const suppressWidthTransition = collapsible && !widthTransition.enabled;
  const attachHost = (host: HTMLDivElement) => {
    hostRef.current = host;
    const stopObservingRow = observeRow(host);
    return () => {
      hostRef.current = null;
      stopObservingRow();
    };
  };
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !collapsible) return;
    return () => {
      if (!host.contains(host.ownerDocument.activeElement) && !returnedFocus.current) return;
      // Unmount moves the toggle; restore focus at its committed location if removal sent focus to body.
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
    <div
      className={cn(
        "h-full min-h-0 w-full",
        collapsible && "overflow-clip",
        collapsible && !maximized && "flex justify-end",
      )}
    >
      <div
        className={cn(
          "flex h-full min-h-0 min-w-0 flex-col",
          collapsible && !maximized && "shrink-0",
        )}
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
      ref={attachHost}
      {...(props.workspaceArea ? panelArea : {})}
      data-workspace-focus-key={props.workspaceFocusKey}
      data-workspace-unavailable={collapsible && !open ? "true" : undefined}
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
