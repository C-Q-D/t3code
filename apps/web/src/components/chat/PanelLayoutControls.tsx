/** Renders the reusable chat panel control well and the separate right panel maximize action. */
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { t } from "~/i18n";
import { Columns3Icon, PanelBottomIcon, PanelRightIcon } from "lucide-react";
import { Maximize2, Minimize2 } from "lucide";
import { MorphIcon } from "~/components/MorphIcon";
import { memo } from "react";

import type { ThreadPanelPresentation } from "../../rightPanelLayout";
import { PopoverCreateHandle, PopoverTrigger } from "../ui/popover";
import { Toggle } from "../ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

// StyleM-8a's 30×28 controls belong to this well; shared UI toggle sizes serve other surfaces.
const panelToggleClassName =
  "inline-flex h-7 w-7.5 shrink-0 cursor-pointer items-center justify-center rounded-chat-control border-0 bg-transparent p-0 outline-none focus-visible:inset-shadow-focus data-pressed:bg-surface-raised data-pressed:shadow-raise-xs-control disabled:pointer-events-none";

/** Visibility, availability and shortcut labels stay controlled by the hosting panel layout. */
export interface PanelLayoutControlsProps {
  showThreadPanelControl?: boolean;
  showTerminalControl?: boolean;
  showRightPanelControl?: boolean;
  terminalAvailable: boolean;
  terminalOpen: boolean;
  terminalShortcutLabel: string | null;
  threadPanelOpen: boolean;
  threadPanelPresentation: ThreadPanelPresentation;
  threadPanelPopoverHandle?: ReturnType<typeof PopoverCreateHandle>;
  threadPanelShortcutLabel: string | null;
  rightPanelAvailable: boolean;
  rightPanelOpen: boolean;
  rightPanelShortcutLabel: string | null;
  rightPanelUnavailableLabel?: string;
  onToggleTerminal: () => void;
  onToggleThreadPanel: () => void;
  onToggleRightPanel: () => void;
}

/** Keeps the same well in titlebars or panel tabs; omitted visibility flags show all three actions. */
export const PanelLayoutControls = memo(function PanelLayoutControls({
  showThreadPanelControl = true,
  showTerminalControl = true,
  showRightPanelControl = true,
  terminalAvailable,
  terminalOpen,
  terminalShortcutLabel,
  threadPanelOpen,
  threadPanelPresentation,
  threadPanelPopoverHandle,
  threadPanelShortcutLabel,
  rightPanelAvailable,
  rightPanelOpen,
  rightPanelShortcutLabel,
  rightPanelUnavailableLabel = t.chat.panelLayout.rightPanelIsUnavailable,
  onToggleTerminal,
  onToggleThreadPanel,
  onToggleRightPanel,
}: PanelLayoutControlsProps) {
  const threadPanelToggle = (
    <TogglePrimitive
      className={panelToggleClassName}
      pressed={threadPanelOpen}
      onPressedChange={threadPanelPresentation === "popover" ? undefined : onToggleThreadPanel}
      aria-label={t.chat.panelLayout.toggleThreadDetailsPanel}
    >
      <PanelRightIcon className="size-4" strokeWidth={1.75} />
    </TogglePrimitive>
  );
  const threadPanelControl = (
    <Tooltip>
      <TooltipTrigger render={<span className="flex shrink-0" />}>
        {threadPanelPresentation === "popover" ? (
          <PopoverTrigger handle={threadPanelPopoverHandle} render={threadPanelToggle} />
        ) : (
          threadPanelToggle
        )}
      </TooltipTrigger>
      <TooltipPopup side="bottom">
        {t.chat.panelLayout.threadShortcut(threadPanelShortcutLabel ?? null)}
      </TooltipPopup>
    </Tooltip>
  );

  return (
    <div
      className="chat-panel-layout-controls flex shrink-0 items-center gap-1 rounded-chat-controls-well bg-chat-controls-well p-0.75 shadow-well-control"
      data-panel-layout-controls
    >
      {showThreadPanelControl ? threadPanelControl : null}
      {showTerminalControl ? (
        <Tooltip>
          <TooltipTrigger render={<span className="flex shrink-0" />}>
            <TogglePrimitive
              className={panelToggleClassName}
              pressed={terminalOpen}
              onPressedChange={onToggleTerminal}
              aria-label={t.chat.panelLayout.toggleTerminalDrawer}
              disabled={!terminalAvailable}
            >
              <PanelBottomIcon className="size-4" strokeWidth={1.75} />
            </TogglePrimitive>
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            {terminalAvailable
              ? t.chat.panelLayout.terminalShortcut(terminalShortcutLabel ?? null)
              : t.chat.panelLayout.terminalDrawerIsUnavailable}
          </TooltipPopup>
        </Tooltip>
      ) : null}
      {showRightPanelControl ? (
        <Tooltip>
          <TooltipTrigger render={<span className="flex shrink-0" />}>
            <TogglePrimitive
              className={panelToggleClassName}
              pressed={rightPanelOpen}
              onPressedChange={onToggleRightPanel}
              aria-label={t.chat.panelLayout.toggleRightPanel}
              data-right-panel-toggle
              disabled={!rightPanelAvailable}
            >
              <Columns3Icon className="size-4" strokeWidth={1.75} />
            </TogglePrimitive>
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            {rightPanelAvailable
              ? t.chat.panelLayout.rightShortcut(rightPanelShortcutLabel ?? null)
              : rightPanelUnavailableLabel}
          </TooltipPopup>
        </Tooltip>
      ) : null}
    </div>
  );
});

export const RightPanelMaximizeControl = memo(function RightPanelMaximizeControl({
  maximized,
  onToggle,
}: {
  maximized: boolean;
  onToggle: () => void;
}) {
  const label = maximized ? t.chat.panelLayout.restorePanelSize : t.chat.panelLayout.maximizePanel;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            className="shrink-0 [-webkit-app-region:no-drag]"
            pressed={maximized}
            onPressedChange={onToggle}
            aria-label={label}
            variant="ghost"
            size="sm"
          >
            <MorphIcon className="size-4" icon={maximized ? Minimize2 : Maximize2} />
          </Toggle>
        }
      />
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
});
