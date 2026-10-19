/** Shared menu appearance; Base UI owns focus, selection, portals, and dismissal. */
"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "~/lib/utils";

const Menu = MenuPrimitive.Root;
const MenuCreateHandle = MenuPrimitive.createHandle;

// H2 shares one row treatment across commands, choices, and submenu triggers.
// Highlight fill follows Base UI even when pointer focus stays focus-visible.
// Destructive icons keep currentColor; the inset focus ring layers over the fill.
const menuRowClassName =
  "min-h-8.5 in-data-[slot=menu-sub-content]:not-data-[density=touch]:min-h-8 shrink-0 cursor-pointer select-none items-center gap-2.5 rounded-menu-row px-2.5 py-1 text-control in-data-[slot=menu-sub-content]:text-secondary-copy-large text-foreground outline-none [--menu-icon-color:var(--color-secondary-label)] not-data-disabled:data-highlighted:not-active:bg-accent not-data-disabled:not-data-[variant=destructive]:data-highlighted:not-active:[--menu-icon-color:var(--color-foreground)] not-data-disabled:data-popup-open:not-active:bg-accent focus-visible:inset-shadow-focus not-data-disabled:active:bg-sidebar not-data-disabled:active:shadow-well-pressed not-data-disabled:not-data-[variant=destructive]:active:[--menu-icon-color:var(--color-secondary-label)] data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:text-fg-icon-disabled data-disabled:[--menu-icon-color:currentColor] data-disabled:[&_*]:text-current [&_svg:not([class*='size-'])]:size-3.5 [&_svg:not([class*='text-'])]:text-(--menu-icon-color) [&_svg]:pointer-events-none [&_svg]:shrink-0";

function MenuTrigger({ className, children, ...props }: MenuPrimitive.Trigger.Props) {
  return (
    <MenuPrimitive.Trigger className={className} data-slot="menu-trigger" {...props}>
      {children}
    </MenuPrimitive.Trigger>
  );
}

/** Render a viewport-bounded menu; dropdown-glass alone owns the surface elevation. */
function MenuPopup({
  children,
  className,
  sideOffset = 4,
  align = "center",
  alignOffset,
  side = "bottom",
  anchor,
  keepMounted = false,
  ...props
}: MenuPrimitive.Popup.Props & {
  align?: MenuPrimitive.Positioner.Props["align"];
  sideOffset?: MenuPrimitive.Positioner.Props["sideOffset"];
  alignOffset?: MenuPrimitive.Positioner.Props["alignOffset"];
  side?: MenuPrimitive.Positioner.Props["side"];
  anchor?: MenuPrimitive.Positioner.Props["anchor"];
  keepMounted?: boolean;
}) {
  return (
    <MenuPrimitive.Portal keepMounted={keepMounted}>
      <MenuPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="z-[130]"
        data-slot="menu-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          className={cn(
            "dropdown-glass relative flex origin-(--transform-origin) rounded-overlay outline-none focus:outline-none text-shadow-stone physics:transition-[width,height,scale,opacity] physics:data-starting-style:scale-98 physics:data-starting-style:opacity-0 physics:data-ending-style:scale-98 physics:data-ending-style:opacity-0 physics:duration-(--popup-motion-duration) physics:ease-(--popup-motion-ease)",
            // Portaled menus can overlap an Electron window drag region (e.g.
            // the Review panel header). Drag hit-testing ignores z-index, so
            // the topmost row would stay unhoverable without this opt-out.
            "[-webkit-app-region:no-drag]",
            // Menus size to their content from one minimum, never past the viewport.
            "min-w-[min(10rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]",
            className,
          )}
          data-slot="menu-popup"
          {...props}
        >
          <div className="flex max-h-(--available-height) w-full flex-col gap-px overflow-y-auto p-1.5">
            {children}
          </div>
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

/** Keep grouped rows on H2's 1px rhythm without shrinking rows in long menus. */
function MenuGroup({ className, ...props }: MenuPrimitive.Group.Props) {
  return (
    <MenuPrimitive.Group
      className={cn("flex shrink-0 flex-col gap-px", className)}
      data-slot="menu-group"
      {...props}
    />
  );
}

/** Render a command; existing ghost and destructive variants retain their public names. */
function MenuItem({
  className,
  inset,
  density = "default",
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean;
  density?: "default" | "touch" | "compact";
  variant?: "default" | "destructive" | "ghost";
}) {
  return (
    <MenuPrimitive.Item
      className={cn(
        menuRowClassName,
        "flex data-inset:ps-8 data-[variant=destructive]:not-data-disabled:text-error data-[variant=destructive]:not-data-disabled:[--menu-icon-color:currentColor]",
        density === "touch" && "min-h-10",
        // H2 submenus and PRPage8a L5 share 32px rows with 13px copy.
        density === "compact" && "min-h-8 text-secondary-copy-large",
        className,
      )}
      data-density={density}
      data-inset={inset}
      data-slot="menu-item"
      data-variant={variant}
      {...props}
    />
  );
}

// Trim font leading so visible letters center with the icons in touch rows.
// Symmetric padding keeps accents and descenders inside truncated labels.
function MenuItemLabel({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="menu-item-label"
      className={cn(
        "min-w-0 truncate in-data-[density=touch]:[text-box:trim-both_cap_alphabetic] supports-[text-box:trim-both_cap_alphabetic]:in-data-[density=touch]:py-[0.5em]",
        className,
      )}
      {...props}
    />
  );
}

/** Apply menu row states while preserving checkbox and switch indicator behavior. */
function MenuCheckboxItem({
  className,
  children,
  checked,
  variant = "default",
  density = "default",
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
  variant?: "default" | "switch";
  density?: "default" | "compact";
}) {
  return (
    <MenuPrimitive.CheckboxItem
      checked={checked}
      className={cn(
        menuRowClassName,
        "grid in-data-[side=none]:min-w-[calc(var(--anchor-width)+1.25rem)]",
        variant === "switch"
          ? "grid-cols-[1fr_auto] gap-4 pe-1.5"
          : "grid-cols-[0.875rem_minmax(0,1fr)]",
        density === "compact" && "min-h-8 text-secondary-copy-large",
        className,
      )}
      data-slot="menu-checkbox-item"
      {...props}
    >
      {variant === "switch" ? (
        <>
          <span className="col-start-1">{children}</span>
          <MenuPrimitive.CheckboxItemIndicator
            className="inset-shadow-[0_1px_--theme(--color-black/4%)] inline-flex h-[calc(var(--thumb-size)+2px)] w-[calc(var(--thumb-size)*2-2px)] shrink-0 items-center rounded-full p-px outline-none transition-[background-color,box-shadow] duration-200 [--thumb-size:--spacing(4)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background data-checked:bg-primary data-unchecked:bg-input data-disabled:opacity-64 sm:[--thumb-size:--spacing(3)]"
            keepMounted
          >
            <span className="pointer-events-none block aspect-square h-full in-[[data-slot=menu-checkbox-item][data-checked]]:origin-[var(--thumb-size)_50%] origin-left in-[[data-slot=menu-checkbox-item][data-checked]]:translate-x-[calc(var(--thumb-size)-4px)] in-[[data-slot=menu-checkbox-item]:active]:not-data-disabled:scale-x-110 in-[[data-slot=menu-checkbox-item]:active]:rounded-[var(--thumb-size)/calc(var(--thumb-size)*1.10)] rounded-(--thumb-size) bg-background shadow-sm/5 [transition:translate_.15s,border-radius_.15s,scale_.1s_.1s,transform-origin_.15s]" />
          </MenuPrimitive.CheckboxItemIndicator>
        </>
      ) : (
        <>
          <MenuPrimitive.CheckboxItemIndicator className="col-start-1">
            <svg
              fill="none"
              height="24"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M5.252 12.7 10.2 18.63 18.748 5.37" />
            </svg>
          </MenuPrimitive.CheckboxItemIndicator>
          <span className="col-start-2">{children}</span>
        </>
      )}
    </MenuPrimitive.CheckboxItem>
  );
}

function MenuRadioGroup(props: MenuPrimitive.RadioGroup.Props) {
  return <MenuPrimitive.RadioGroup data-slot="menu-radio-group" {...props} />;
}

/** Apply menu row states while retaining the existing checked-choice fill. */
function MenuRadioItem({
  className,
  children,
  hideIndicator: _hideIndicator = false,
  density = "default",
  ...props
}: MenuPrimitive.RadioItem.Props & {
  hideIndicator?: boolean;
  density?: "default" | "compact";
}) {
  return (
    <MenuPrimitive.RadioItem
      className={cn(
        menuRowClassName,
        "flex in-data-[side=none]:min-w-[calc(var(--anchor-width)+1.25rem)] not-data-disabled:data-checked:not-active:bg-accent",
        density === "compact" && "min-h-8 text-secondary-copy-large",
        className,
      )}
      data-slot="menu-radio-item"
      {...props}
    >
      <span className="min-w-0 flex-1">{children}</span>
    </MenuPrimitive.RadioItem>
  );
}

function MenuRadioItemIndicator({
  className,
  children,
  ...props
}: MenuPrimitive.RadioItemIndicator.Props) {
  return (
    <MenuPrimitive.RadioItemIndicator
      aria-hidden
      className={cn("flex shrink-0", className)}
      data-slot="menu-radio-item-indicator"
      {...props}
    >
      {children ?? <CheckIcon className="size-3.5" />}
    </MenuPrimitive.RadioItemIndicator>
  );
}

/** Align noninteractive group headings with the menu's text inset. */
function MenuGroupLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.GroupLabel
      className={cn(
        "px-2.5 py-1.5 font-medium text-muted-foreground text-secondary-copy data-inset:ps-8",
        className,
      )}
      data-inset={inset}
      data-slot="menu-label"
      {...props}
    />
  );
}

/** Draw H2's engraved cut rather than a flat border-colored divider. */
function MenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      className={cn(
        "mx-2 my-1 h-px shrink-0 bg-menu-engraving shadow-(--shadow-menu-engraving)",
        className,
      )}
      data-slot="menu-separator"
      {...props}
    />
  );
}

/** Keep shortcut hints secondary and let disabled rows dim every label together. */
function MenuShortcut({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "ms-auto font-mono text-placeholder text-meta in-data-highlighted:text-secondary-label in-data-disabled:text-current",
        className,
      )}
      data-slot="menu-shortcut"
      {...props}
    />
  );
}

function MenuSub(props: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="menu-sub" {...props} />;
}

/** Match command row states and keep the submenu chevron at the trailing edge. */
function MenuSubTrigger({
  className,
  inset,
  density = "default",
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean;
  density?: "default" | "touch";
}) {
  return (
    <MenuPrimitive.SubmenuTrigger
      className={cn(
        menuRowClassName,
        "flex data-inset:ps-8",
        density === "touch" && "min-h-10",
        className,
      )}
      data-density={density}
      data-inset={inset}
      data-slot="menu-sub-trigger"
      {...props}
    >
      {children}
      <ChevronRightIcon className="ms-auto text-secondary-label in-data-disabled:text-current" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

function MenuSubPopup({
  className,
  sideOffset = 0,
  alignOffset,
  align = "start",
  ...props
}: MenuPrimitive.Popup.Props & {
  align?: MenuPrimitive.Positioner.Props["align"];
  sideOffset?: MenuPrimitive.Positioner.Props["sideOffset"];
  alignOffset?: MenuPrimitive.Positioner.Props["alignOffset"];
}) {
  const defaultAlignOffset = align !== "center" ? -5 : undefined;

  return (
    <MenuPopup
      align={align}
      alignOffset={alignOffset ?? defaultAlignOffset}
      className={className}
      data-slot="menu-sub-content"
      side="inline-end"
      sideOffset={sideOffset}
      {...props}
    />
  );
}

export {
  Menu,
  MenuCreateHandle,
  Menu as DropdownMenu,
  MenuTrigger,
  MenuTrigger as DropdownMenuTrigger,
  MenuPopup,
  MenuPopup as DropdownMenuContent,
  MenuGroup,
  MenuGroup as DropdownMenuGroup,
  MenuItem,
  MenuItemLabel,
  MenuItem as DropdownMenuItem,
  MenuCheckboxItem,
  MenuCheckboxItem as DropdownMenuCheckboxItem,
  MenuRadioGroup,
  MenuRadioGroup as DropdownMenuRadioGroup,
  MenuRadioItem,
  MenuRadioItem as DropdownMenuRadioItem,
  MenuRadioItemIndicator,
  MenuGroupLabel,
  MenuGroupLabel as DropdownMenuLabel,
  MenuSeparator,
  MenuSeparator as DropdownMenuSeparator,
  MenuShortcut,
  MenuShortcut as DropdownMenuShortcut,
  MenuSub,
  MenuSub as DropdownMenuSub,
  MenuSubTrigger,
  MenuSubTrigger as DropdownMenuSubTrigger,
  MenuSubPopup,
  MenuSubPopup as DropdownMenuSubContent,
};
