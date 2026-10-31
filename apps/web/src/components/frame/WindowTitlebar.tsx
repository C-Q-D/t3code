/** Owns window chrome geometry; routes supply content and the shell reserves caption controls. */
import { useRef, type ReactNode } from "react";
import { useAtomValue } from "@effect/atom-react";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { isElectron } from "../../env";
import { shortcutLabelForCommand } from "../../keybindings";
import {
  navigateHistory,
  useCanNavigateHistory,
  type HistoryDirection,
} from "../../navigationHistory";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

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
  const observeHeader = (element: HTMLElement) => {
    if (!panelActive) return;
    return observeResize(element, ([entry]) => {
      if (!entry) return;
      const next = resolveDiscussionTitlebarLayout(entry.contentRect.width).compact;
      // observeResize flushes synchronously; do not schedule React work within one layout region.
      if (next === lastCompact.current) return;
      lastCompact.current = next;
      setCompact(next);
    });
  };
  const stageLabel = useEnvironmentStageLabel();
  const identificationMode = useEnvironmentIdentificationMode();
  const backdropVariant = resolveSidebarStageBackdropVariant(stageLabel, identificationMode);
  const pillLabel =
    identificationMode === "pill" ? resolveEnvironmentIdentificationPillLabel(stageLabel) : null;
  // Observe the real control/brand/pill, not a hidden duplicate of the removed sidebar brand.
  // offsetLeft includes the titlebar gutter; the positioned header is the offset parent.
  const observeLeadingWidth = (element: HTMLDivElement) =>
    observeResize(element, ([entry]) => {
      if (entry)
        onLeadingWidthChange(
          element.offsetLeft + (entry.borderBoxSize[0]?.inlineSize ?? element.offsetWidth),
        );
    });

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
        {isElectron ? (
          <div className="no-drag flex shrink-0 items-center">
            <HistoryNavigationButton direction="back" onBackdrop={backdropVariant !== null} />
            <HistoryNavigationButton direction="forward" onBackdrop={backdropVariant !== null} />
          </div>
        ) : null}
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

/** Uses Chromium history availability only inside the desktop titlebar; clicks remain outside window dragging. */
function HistoryNavigationButton({
  direction,
  onBackdrop,
}: {
  direction: HistoryDirection;
  onBackdrop: boolean;
}) {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const enabled = useCanNavigateHistory(direction);
  const label = direction === "back" ? "Go back" : "Go forward";
  const shortcutLabel = shortcutLabelForCommand(
    keybindings,
    direction === "back" ? "navigation.back" : "navigation.forward",
  );
  const Icon = direction === "back" ? ArrowLeftIcon : ArrowRightIcon;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className={cn(
              "[-webkit-app-region:no-drag]",
              onBackdrop && "relative top-auto translate-y-0",
            )}
            disabled={!enabled}
            onClick={() => navigateHistory(direction)}
            size="icon-sm"
            variant={onBackdrop ? "media-navigation" : "ghost"}
          />
        }
      >
        <Icon className="size-3.5" />
      </TooltipTrigger>
      <TooltipPopup side="bottom">
        {label}
        {shortcutLabel ? ` (${shortcutLabel})` : ""}
      </TooltipPopup>
    </Tooltip>
  );
}
