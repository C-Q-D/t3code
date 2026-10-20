/** Owns window chrome geometry; routes supply content and the shell reserves caption controls. */
import { useCallback, useRef, type ReactNode } from "react";

import { t } from "~/i18n";
import { useEnvironmentIdentificationMode } from "~/hooks/useSettings";
import { observeResize } from "~/lib/observeResize";
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  SidebarStageBackdrop,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
import { TitlebarSlotOutlet, useTitlebarPanelLayout } from "./titlebarSlot";
import { resolveDiscussionTitlebarLayout } from "./discussionTitlebar.logic";

/**
 * Renders the persistent titlebar, independent of sidebar visibility.
 * Its 48px design baseline expands with the native window controls overlay.
 * sidebarControl supplies the existing toggle and its keyboard bindings.
 * onLeadingWidthChange receives the live left cluster's right edge in CSS pixels;
 * the shell uses it to keep sidebar-width environment artwork behind that cluster.
 * A discussion panel observes only layout-region transitions; CSS sizes tracks
 * continuously. Other routes retain the original flex layout and spacers.
 */
export function WindowTitlebar({
  sidebarControl,
  onLeadingWidthChange,
}: {
  sidebarControl: ReactNode;
  onLeadingWidthChange: (width: number) => void;
}) {
  const { active: panelActive, compact, setCompact } = useTitlebarPanelLayout();
  const lastCompact = useRef<boolean | undefined>(undefined);
  const observeHeader = useCallback(
    (element: HTMLElement) => {
      if (!panelActive) return;
      return observeResize(element, ([entry]) => {
        if (!entry) return;
        const next = resolveDiscussionTitlebarLayout(entry.contentRect.width).compact;
        // observeResize flushes synchronously; do not schedule React work within one layout region.
        if (next === lastCompact.current) return;
        lastCompact.current = next;
        setCompact(next);
      });
    },
    [panelActive, setCompact],
  );
  const stageLabel = useEnvironmentStageLabel();
  const identificationMode = useEnvironmentIdentificationMode();
  const backdropVariant = resolveSidebarStageBackdropVariant(
    stageLabel,
    identificationMode === "artwork",
  );
  const pillLabel =
    identificationMode === "pill" ? resolveEnvironmentIdentificationPillLabel(stageLabel) : null;
  // Observe the real control/brand/pill, not a hidden duplicate of the removed sidebar brand.
  // offsetLeft includes the titlebar gutter; the positioned header is the offset parent.
  const observeLeadingWidth = useCallback(
    (element: HTMLDivElement) =>
      observeResize(element, ([entry]) => {
        if (entry)
          onLeadingWidthChange(
            element.offsetLeft + (entry.borderBoxSize[0]?.inlineSize ?? element.offsetWidth),
          );
      }),
    [onLeadingWidthChange],
  );

  return (
    <header
      ref={observeHeader}
      className="window-titlebar drag-region relative flex h-(--workspace-topbar-height) w-full shrink-0 items-center text-foreground text-shadow-stone"
      data-window-titlebar=""
      data-discussion-layout={panelActive ? (compact ? "compact" : "full") : undefined}
    >
      {backdropVariant ? (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-(--sidebar-width) overflow-hidden"
          aria-hidden="true"
        >
          <SidebarStageBackdrop variant={backdropVariant} />
        </div>
      ) : null}
      <div
        ref={observeLeadingWidth}
        className="relative z-10 flex shrink-0 items-center"
        data-titlebar-leading=""
      >
        <div className="no-drag flex size-8 shrink-0 items-center" data-titlebar-sidebar-control="">
          {sidebarControl}
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-2" data-titlebar-brand="">
          <span className="drag-region shrink-0 font-window-brand text-window-brand font-semibold tracking-brand whitespace-nowrap text-foreground">
            {t.sidebar.chrome.titlebarBrandName}
          </span>
          {pillLabel ? (
            <div className="no-drag ml-1 flex h-7 items-center">
              <Badge data-environment-identification="pill" size="sm" variant="secondary">
                {pillLabel}
              </Badge>
            </div>
          ) : null}
        </div>
      </div>
      <div className="w-47.5 shrink-0 self-stretch" data-titlebar-spacer="" aria-hidden="true" />
      <TitlebarSlotOutlet name="breadcrumb" />
      <div className="min-w-10 flex-1 self-stretch" data-titlebar-gap="" aria-hidden="true" />
      <TitlebarSlotOutlet name="actions" />
      <div className="window-titlebar-system-controls shrink-0 self-stretch" aria-hidden="true" />
    </header>
  );
}
