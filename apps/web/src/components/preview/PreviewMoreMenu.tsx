/** Localized preview UI and interactions; preserves user data, commands, and protocol values. */
"use client";

import { t } from "~/i18n";

import type { DesktopPreviewColorScheme } from "@t3tools/contracts";
import {
  ArrowRightLeft,
  Bug,
  Cookie,
  Ellipsis,
  Eraser,
  ExternalLink,
  Minus,
  Plus as PlusIcon,
  RefreshCcw,
  RotateCcw,
  Settings2,
  Smartphone,
  SunMoon,
  ZoomIn,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuGroup,
  MenuGroupLabel,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "~/components/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

const COLOR_SCHEME_OPTIONS: ReadonlyArray<{
  value: DesktopPreviewColorScheme;
  label: string;
}> = [
  { value: "system", label: t.tools.preview.system },
  { value: "light", label: t.tools.preview.light },
  { value: "dark", label: t.tools.preview.dark },
];

export interface PreviewMoreMenuActions {
  readonly hardReload: () => void;
  readonly setColorScheme: (colorScheme: DesktopPreviewColorScheme) => void;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly resetZoom: () => void;
  readonly clearCookies: () => void;
  readonly clearCache: () => void;
  readonly openDevTools?: () => void;
  readonly toggleNativePictureInPicture?: () => void;
}

/** Active-tab menu state; absent actions keep their existing hidden-item behavior. */
interface Props {
  enabled: boolean;
  actions: PreviewMoreMenuActions;
  zoomFactor: number;
  colorScheme: DesktopPreviewColorScheme;
  deviceToolbarVisible: boolean;
  onToggleDeviceToolbar: () => void;
  nativePictureInPicture: boolean;
  profileName: string | undefined;
  move?: { readonly label: string; readonly onMove: () => void };
}

/**
 * Renders the preview menu's icon button with a localized accessible name and tooltip.
 * Takes no props; its enclosing Menu provides the open state and trigger interaction.
 * @returns The composed menu and tooltip trigger, ready for use inside PreviewMoreMenu.
 */
const MenuTriggerButton = () => (
  <Tooltip>
    <TooltipTrigger
      render={
        <MenuTrigger
          render={
            <button
              type="button"
              aria-label={t.tools.preview.menu}
              className="flex size-7.5 shrink-0 cursor-pointer items-center justify-center rounded-tag bg-transparent p-0 text-foreground outline-none hover:bg-secondary focus-visible:inset-shadow-focus data-popup-open:bg-secondary"
            />
          }
        />
      }
    >
      <Ellipsis className="size-3.75" />
    </TooltipTrigger>
    <TooltipPopup>{t.tools.preview.more}</TooltipPopup>
  </Tooltip>
);

/** Three-dot menu in the chrome row; the same items for every kind of tab.
 * @param props View data, control flags, and callbacks defined by the component props type; optional fields retain their declared defaults.
 * @returns Rendered UI for the supplied props.
 */
export function PreviewMoreMenu({
  enabled,
  actions,
  zoomFactor,
  colorScheme,
  deviceToolbarVisible,
  onToggleDeviceToolbar,
  nativePictureInPicture,
  profileName,
  move,
}: Props) {
  const zoomLabel = `${Math.round(zoomFactor * 100)}%`;
  const disabled = !enabled;
  return (
    <Menu>
      <MenuTriggerButton />
      <MenuPopup align="end" sideOffset={10} className="w-47.5">
        <MenuItem onClick={actions.hardReload} disabled={disabled}>
          <RefreshCcw strokeWidth={1.75} />
          {t.tools.preview.hardReload}
        </MenuItem>
        {actions.openDevTools ? (
          <MenuItem onClick={actions.openDevTools} disabled={disabled}>
            <Bug strokeWidth={1.75} />
            {t.tools.preview.devTools}
          </MenuItem>
        ) : null}
        {actions.toggleNativePictureInPicture ? (
          <MenuItem onClick={actions.toggleNativePictureInPicture} disabled={disabled}>
            <ExternalLink strokeWidth={1.75} />
            {nativePictureInPicture
              ? t.tools.preview.closeSeparateWindow
              : t.tools.preview.openSeparateWindow}
          </MenuItem>
        ) : null}
        {move ? (
          <MenuItem onClick={move.onMove}>
            <ArrowRightLeft strokeWidth={1.75} />
            {move.label}
          </MenuItem>
        ) : null}
        <MenuItem onClick={onToggleDeviceToolbar} disabled={disabled}>
          <Smartphone strokeWidth={1.75} />
          {deviceToolbarVisible ? t.tools.preview.hideToolbar : t.tools.preview.showToolbar}
        </MenuItem>
        <MenuSeparator />
        <MenuSub>
          <MenuSubTrigger disabled={disabled}>
            <SunMoon strokeWidth={1.75} />
            {t.tools.preview.appearance}
          </MenuSubTrigger>
          <MenuSubPopup>
            <MenuRadioGroup
              value={colorScheme}
              onValueChange={(value) => actions.setColorScheme(value as DesktopPreviewColorScheme)}
            >
              {COLOR_SCHEME_OPTIONS.map((option) => (
                <MenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSubPopup>
        </MenuSub>
        {/*
          Zoom row: label + inline control cluster. `closeOnClick=false`
          keeps the menu open while the user clicks the +/− buttons. The
          existing controls wrap to retain K2's 190px popup without losing actions.
        */}
        <MenuItem
          closeOnClick={false}
          onClick={(event: React.MouseEvent) => event.preventDefault()}
          className="flex-wrap justify-between"
          disabled={disabled}
        >
          <span className="flex items-center gap-2.5">
            <ZoomIn className="size-3.5" strokeWidth={1.75} />
            {t.tools.preview.zoom}
          </span>
          <span className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-xs"
              type="button"
              onClick={actions.zoomOut}
              aria-label={t.tools.preview.zoomOut}
              disabled={disabled}
            >
              <Minus />
            </Button>
            <span className="min-w-12 text-center text-xs tabular-nums text-muted-foreground">
              {zoomLabel}
            </span>
            <Button
              variant="outline"
              size="icon-xs"
              type="button"
              onClick={actions.zoomIn}
              aria-label={t.tools.preview.zoomIn}
              disabled={disabled}
            >
              <PlusIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              type="button"
              onClick={actions.resetZoom}
              aria-label={t.tools.preview.resetZoom}
              disabled={disabled}
            >
              <RotateCcw />
            </Button>
          </span>
        </MenuItem>
        <MenuSeparator />
        {/*
         * Grouped so the heading has a `MenuGroup` ancestor — `MenuGroupLabel`
          reads its context and throws without one.
         */}
        <MenuGroup>
          {profileName ? (
            <MenuGroupLabel className="max-w-64">
              <span className="block truncate">{t.tools.preview.profileLabel(profileName)}</span>
            </MenuGroupLabel>
          ) : null}
          <MenuItem onClick={actions.clearCookies}>
            <Cookie strokeWidth={1.75} />
            {t.tools.preview.clearCookies}
          </MenuItem>
          <MenuItem onClick={actions.clearCache}>
            <Eraser strokeWidth={1.75} />
            {t.tools.preview.clearCache}
          </MenuItem>
          {/* The board shows configuration, but this menu has no configuration action yet. */}
          <MenuItem disabled>
            <Settings2 strokeWidth={1.75} />
            {t.tools.preview.configuration}
          </MenuItem>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
