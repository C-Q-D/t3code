/** Renders the reusable chat panel control well and the separate right panel maximize action. */
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { t } from "~/i18n";
import { Columns3Icon, PanelBottomIcon, PanelRightIcon } from "lucide-react";
import { Maximize2, Minimize2 } from "lucide";
import { MorphIcon } from "~/components/MorphIcon";
import { memo, type ReactElement, type ReactNode } from "react";

import { cn } from "~/lib/utils";

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
      aria-label={t.chat.panelLayout.toggleThreadDetailsPanel}
    >
      <PanelRightIcon className="size-4" strokeWidth={1.75} />
    </TogglePrimitive>
  );
  const threadPanelTooltip = (trigger: ReactElement) => (
    <Tooltip>
      <TooltipTrigger
        render={trigger}
        {...(threadPanelPresentation === "popover" ? {} : { onClick: onToggleThreadPanel })}
      />
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
      {showThreadPanelControl
        ? threadPanelPresentation === "popover"
          ? threadPanelTooltip(
              <PopoverTrigger handle={threadPanelPopoverHandle} render={threadPanelToggle} />,
            )
          : threadPanelTooltip(threadPanelToggle)
        : null}
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

/** The thread panel toggle on a header whose right side the inline right panel covers. */
export function ThreadPanelHeaderControl(props: PanelLayoutControlsProps) {
  return (
    <div
      className="absolute top-[var(--workspace-controls-top)] right-[calc(env(safe-area-inset-right)+0.75rem)] z-50 flex h-[var(--workspace-topbar-height)] items-center [-webkit-app-region:no-drag]"
      data-workspace-titlebar-controls
    >
      <PanelLayoutControls {...props} showTerminalControl={false} showRightPanelControl={false} />
    </div>
  );
}

/** The window's top-right panel controls, with the maximize toggle while the panel is open. */
export function WorkspaceTitlebarControls(props: {
  readonly showMaximizeControl: boolean;
  readonly rightPanelOpen: boolean;
  readonly animationsActive: boolean;
  readonly maximized: boolean;
  readonly onToggleMaximized: () => void;
  readonly children: ReactNode;
}) {
  return (
    <div
      className="pointer-events-none fixed top-[var(--workspace-controls-top)] right-[var(--workspace-controls-right)] z-50 mr-px flex h-[var(--workspace-topbar-height)] items-center gap-1 [-webkit-app-region:no-drag]"
      data-workspace-titlebar-controls
    >
      {props.showMaximizeControl ? (
        <span
          aria-hidden={!props.rightPanelOpen}
          className={cn(
            "flex shrink-0",
            props.animationsActive &&
              "motion-safe:transition-opacity motion-safe:duration-(--panel-animation-duration) motion-safe:ease-out",
            props.rightPanelOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none absolute right-full mr-1 opacity-0",
          )}
          inert={!props.rightPanelOpen}
        >
          <RightPanelMaximizeControl
            maximized={props.maximized}
            onToggle={props.onToggleMaximized}
          />
        </span>
      ) : null}
      <div className="pointer-events-auto flex h-full items-center">{props.children}</div>
    </div>
  );
}
