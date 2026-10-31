/** Localized device UI and interactions; preserves user data, commands, and protocol values. */
import { t } from "~/i18n";
import type { DeviceHostSummary, DevicePlatform } from "@t3tools/contracts";
import {
  Camera,
  ChevronLeft,
  Circle,
  Keyboard,
  Maximize,
  MoreHorizontal,
  PictureInPicture2,
  Power,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
import { Moon, Sun } from "lucide";
import { useId, type ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { MorphIcon } from "~/components/MorphIcon";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuCheckboxItem,
} from "~/components/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import type { DeviceStreamHandle, DeviceViewControls } from "./DeviceStreamView";
import type { DeviceControls } from "./useDeviceControls";

/** Bottom controls and view selection share the existing stream session in either presentation.
 * @param props Component properties and callbacks defined by the parameter type.
 * @returns Rendered UI for the supplied props.
 */
export function DeviceControlsRail(props: {
  platform: DevicePlatform;
  hostKind: DeviceHostSummary["kind"] | undefined;
  handle: DeviceStreamHandle | null;
  view: DeviceViewControls;
  controls: DeviceControls;
  screenshotPending: boolean;
  onScreenshot: () => void;
  /** Closed drawer, category-only drawer, or drawer with at least one expanded category. */
  tools: "closed" | "open" | "expanded";
  onTools: () => void;
  onFloat: () => void;
  onClose: () => void;
  onPowerOff: () => void;
  devicePicker: ReactNode;
}) {
  const { view, handle, controls } = props;
  const popupSide = "top";
  const runsHostCommands = props.hostKind === "local" || props.hostKind === "ssh";
  const settings = controls.detail?.settings;
  const inputDisabled = !handle?.inputConnected;
  const nextAppearance = settings?.appearance === "dark" ? "light" : "dark";
  const viewGroupId = useId();
  return (
    <>
      <div className="device-workspace-toolbar" data-tools={props.tools}>
        <div className="device-workspace-picker">{props.devicePicker}</div>
        <fieldset className="device-view-selector" disabled={!view.streaming}>
          <legend className="sr-only">{t.tools.device.device}</legend>
          <Tooltip>
            <TooltipTrigger
              render={<label tabIndex={view.phoneUnavailableReason ? 0 : undefined} />}
            >
              <input
                type="radio"
                className="sr-only"
                name={viewGroupId}
                checked={view.phone}
                disabled={!!view.phoneUnavailableReason}
                onChange={view.showPhone}
              />
              <span>{t.tools.device.view3d}</span>
            </TooltipTrigger>
            <TooltipPopup>{view.phoneUnavailableReason ?? t.tools.device.show3d}</TooltipPopup>
          </Tooltip>
          <label>
            <input
              type="radio"
              className="sr-only"
              name={viewGroupId}
              checked={!view.phone}
              onChange={view.showFlat}
            />
            <span>{t.tools.device.flatView}</span>
          </label>
        </fieldset>
      </div>
      <aside aria-label={t.tools.device.controls} data-layout="bottom" className="device-controls">
        <div className="device-controls-bar">
          <RailButton
            tooltipSide={popupSide}
            label={t.tools.device.home}
            disabled={inputDisabled}
            onClick={() => handle?.pressButton("home")}
          >
            <Circle className="size-3.25" />
          </RailButton>
          {props.platform === "android" ? (
            <>
              <RailButton
                tooltipSide={popupSide}
                label={t.tools.device.back}
                disabled={inputDisabled}
                onClick={() => handle?.pressButton("back")}
              >
                <ChevronLeft />
              </RailButton>
              <RailButton
                tooltipSide={popupSide}
                label={t.tools.device.recents}
                disabled={inputDisabled}
                onClick={() => handle?.pressButton("recents")}
              >
                <Square className="size-3" />
              </RailButton>
              <Menu>
                <MenuTrigger
                  render={
                    <Button
                      size="icon-compact-key"
                      variant="ghost"
                      aria-label={t.tools.device.rotate}
                      disabled={controls.disabled || !runsHostCommands}
                    />
                  }
                >
                  <RotateCcw className="size-3.25" />
                </MenuTrigger>
                <MenuPopup side={popupSide}>
                  <MenuItem
                    onClick={() => void controls.act({ type: "setOrientation", value: "portrait" })}
                  >
                    {t.tools.device.portrait}
                  </MenuItem>
                  <MenuItem
                    onClick={() =>
                      void controls.act({ type: "setOrientation", value: "landscape_left" })
                    }
                  >
                    {t.tools.device.landscape}
                  </MenuItem>
                </MenuPopup>
              </Menu>
            </>
          ) : (
            <>
              <RailButton
                tooltipSide={popupSide}
                label={t.tools.device.back}
                description={t.tools.device.androidOnlyAction}
                disabled
                onClick={() => {}}
              >
                <ChevronLeft />
              </RailButton>
              <RailButton
                tooltipSide={popupSide}
                label={t.tools.device.recents}
                description={t.tools.device.androidOnlyAction}
                disabled
                onClick={() => {}}
              >
                <Square className="size-3" />
              </RailButton>
              <RailButton
                tooltipSide={popupSide}
                label={t.tools.device.rotate}
                disabled={inputDisabled || !!view.keyboard?.attached}
                onClick={() => handle?.rotate()}
              >
                <RotateCcw className="size-3.25" />
              </RailButton>
            </>
          )}
          <RailButton
            tooltipSide={popupSide}
            label={
              props.screenshotPending
                ? t.tools.device.capturingScreenshot
                : t.tools.device.screenshotAction
            }
            disabled={!view.streaming || props.screenshotPending}
            onClick={props.onScreenshot}
          >
            <Camera className="size-3.25" />
          </RailButton>
          <RailButton tooltipSide={popupSide} label={t.tools.device.float} onClick={props.onFloat}>
            <PictureInPicture2 className="size-3.25" />
          </RailButton>
          <RailButton
            tooltipSide={popupSide}
            label={t.tools.device.powerOff}
            destructive
            onClick={props.onPowerOff}
          >
            <Power className="size-3.25" />
          </RailButton>
          <Menu>
            <MenuTrigger
              render={
                <Button
                  size="icon-compact-key"
                  variant="ghost"
                  aria-label={t.tools.device.moreActions}
                />
              }
            >
              <MoreHorizontal />
            </MenuTrigger>
            <MenuPopup side={popupSide} align="end">
              <MenuCheckboxItem
                disabled={!runsHostCommands}
                checked={props.tools !== "closed"}
                onCheckedChange={props.onTools}
              >
                {t.tools.device.tools}
              </MenuCheckboxItem>
              <MenuItem
                disabled={controls.disabled || !runsHostCommands || !settings?.appearance}
                onClick={() => void controls.act({ type: "setAppearance", value: nextAppearance })}
              >
                <MorphIcon icon={settings?.appearance === "dark" ? Sun : Moon} />
                {t.tools.device.switchAppearance(nextAppearance)}
              </MenuItem>
              <MenuSeparator />
              <div className="px-2 py-1 text-xs text-muted-foreground">
                {t.tools.device.textSize}
              </div>
              <MenuRadioGroup
                value={settings?.textSize ?? ""}
                onValueChange={(value) => {
                  if (
                    value === "small" ||
                    value === "default" ||
                    value === "large" ||
                    value === "extra-large"
                  )
                    void controls.act({ type: "setTextSize", value });
                }}
              >
                {(
                  [
                    ["small", t.tools.device.small],
                    ["default", t.tools.device.default],
                    ["large", t.tools.device.large],
                    ["extra-large", t.tools.device.extraLarge],
                  ] as const
                ).map(([value, label]) => (
                  <MenuRadioItem
                    key={value}
                    value={value}
                    disabled={controls.disabled || !runsHostCommands || !settings?.textSize}
                  >
                    <span className="flex-1">{label}</span>
                    <MenuRadioItemIndicator />
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
              <MenuSeparator />
              {view.keyboard ? (
                <MenuItem onClick={view.keyboard.toggle}>
                  <Keyboard />
                  {view.keyboard.attached
                    ? t.tools.device.detachKeyboard
                    : t.tools.device.attachKeyboard}
                </MenuItem>
              ) : null}
              {view.phone ? (
                <MenuItem onClick={view.resetView}>
                  <Maximize />
                  {t.tools.device.restore3d}
                </MenuItem>
              ) : null}
              <MenuItem onClick={props.onClose}>
                <X />
                {t.tools.device.closePanel}
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
        {view.foldingControls}
      </aside>
    </>
  );
}

/** Accessible bottom-bar action; callbacks retain the device control and stream ownership. */
function RailButton(props: {
  tooltipSide: "top";
  label: string;
  description?: string;
  disabled?: boolean;
  destructive?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const button = props.destructive ? (
    <button
      type="button"
      className="device-power-key"
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  ) : (
    <Button
      size="icon-compact-key"
      variant="ghost"
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  );
  return (
    <Tooltip>
      {props.disabled && props.description ? (
        <TooltipTrigger
          render={<span tabIndex={0} className="inline-flex" aria-label={props.label} />}
        >
          {button}
        </TooltipTrigger>
      ) : (
        <TooltipTrigger render={button} />
      )}
      <TooltipPopup side={props.tooltipSide}>{props.description ?? props.label}</TooltipPopup>
    </Tooltip>
  );
}
