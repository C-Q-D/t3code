"use client";

/** Command list composition; H2 row states are shared with autocomplete, including controlled navigation. */

import { Dialog as CommandDialogPrimitive } from "@base-ui/react/dialog";
import { SearchIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "~/lib/utils";
import {
  Autocomplete,
  AutocompleteCollection,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompleteListHeading,
  AutocompleteListVirtualized,
} from "~/components/ui/autocomplete";
import { DIALOG_BACKDROP_CLASS, DIALOG_POPUP_CLASS } from "~/components/ui/dialog-styles";
import { Button } from "~/components/ui/button";

const CommandDialog = CommandDialogPrimitive.Root;

const CommandDialogPortal = CommandDialogPrimitive.Portal;

function CommandDialogTrigger(props: CommandDialogPrimitive.Trigger.Props) {
  return <CommandDialogPrimitive.Trigger data-slot="command-dialog-trigger" {...props} />;
}

function CommandDialogBackdrop({ className, ...props }: CommandDialogPrimitive.Backdrop.Props) {
  return (
    <CommandDialogPrimitive.Backdrop
      className={cn(DIALOG_BACKDROP_CLASS, className)}
      data-slot="command-dialog-backdrop"
      {...props}
    />
  );
}

function CommandDialogViewport({ className, ...props }: CommandDialogPrimitive.Viewport.Props) {
  return (
    <CommandDialogPrimitive.Viewport
      className={cn(
        "pointer-events-none fixed inset-0 z-50 flex flex-col items-center px-4 py-[max(--spacing(4),4vh)] sm:py-[10vh]",
        className,
      )}
      data-slot="command-dialog-viewport"
      {...props}
    />
  );
}

/**
 * Keep dialog positioning and dismissal while using H2 corners and the shared glass material.
 * paletteMode scopes viewport geometry across the portal; omitted mode keeps default geometry.
 */
function CommandDialogPopup({
  className,
  children,
  onBackdropPointerDown,
  paletteMode,
  ...props
}: CommandDialogPrimitive.Popup.Props & {
  onBackdropPointerDown?: React.PointerEventHandler<HTMLDivElement>;
  paletteMode?: "command" | "files" | "content";
}) {
  return (
    <CommandDialogPortal>
      <CommandDialogBackdrop onPointerDown={onBackdropPointerDown} />
      <CommandDialogViewport data-palette-mode={paletteMode}>
        <CommandDialogPrimitive.Popup
          className={cn(
            DIALOG_POPUP_CLASS,
            "pointer-events-auto max-h-105 max-w-xl rounded-overlay text-foreground",
            className,
          )}
          data-slot="command-dialog-popup"
          {...props}
        >
          {children}
        </CommandDialogPrimitive.Popup>
      </CommandDialogViewport>
    </CommandDialogPortal>
  );
}

function Command({
  autoHighlight = "always",
  keepHighlight = true,
  ...props
}: React.ComponentProps<typeof Autocomplete>) {
  return (
    <Autocomplete
      autoHighlight={autoHighlight}
      inline
      keepHighlight={keepHighlight}
      open
      {...props}
    />
  );
}

/**
 * Renders the shared palette search input and forwards input props, including placeholder and ref.
 * CommandDialogPopup owns paletteMode and viewport geometry; this input does not select a mode.
 * CommandPaletteContent uses it outside graphite command mode, whose search well owns its input.
 * The input is the focusable child, so focus-within suppresses its outer ring while editing.
 */
function CommandInput({
  className,
  placeholder,
  ...props
}: React.ComponentProps<typeof AutocompleteInput>) {
  return (
    <div className="px-[var(--command-shell-inset)] py-1.5 [&_[data-slot=autocomplete-start-addon]]:ps-[calc(var(--command-shell-inset)+0.0625rem)]">
      <AutocompleteInput
        autoFocus
        className={cn(
          "border-transparent! bg-transparent! shadow-none before:hidden focus-within:ring-0 placeholder:text-placeholder *:data-[slot=autocomplete-input]:ps-9! sm:*:data-[slot=autocomplete-input]:ps-[calc(var(--command-shell-inset)+1.5rem)]!",
          className,
        )}
        placeholder={placeholder}
        size="lg"
        startAddon={<SearchIcon className="translate-x-0.5 text-icon-muted" />}
        {...props}
      />
    </div>
  );
}

/**
 * Render the standard autocomplete scroll list with H2 padding and the command-list slot.
 * Forward list props and className; use CommandListVirtualized when a child owns scrolling.
 */
function CommandList({ className, ...props }: React.ComponentProps<typeof AutocompleteList>) {
  return (
    <AutocompleteList
      className={cn("not-empty:scroll-py-1.5 not-empty:p-1.5", className)}
      data-slot="command-list"
      {...props}
    />
  );
}

function CommandListVirtualized({
  className,
  ...props
}: React.ComponentProps<typeof AutocompleteListVirtualized>) {
  return (
    <AutocompleteListVirtualized
      className={cn("flex max-h-[inherit] min-h-0 flex-col", className)}
      data-slot="command-list"
      {...props}
    />
  );
}

function CommandListHeading({
  className,
  ...props
}: React.ComponentProps<typeof AutocompleteListHeading>) {
  return (
    <AutocompleteListHeading className={className} data-slot="command-group-label" {...props} />
  );
}

/**
 * Clip command results to H2 corners; footer=true leaves bottom rounding to the following footer.
 * With no footer prop, round all corners.
 * Forward div props and className. This container does not own navigation or scrolling.
 */
function CommandPanel({
  className,
  footer = false,
  ...props
}: React.ComponentProps<"div"> & { footer?: boolean }) {
  return (
    <div
      className={cn(
        "relative min-h-0 overflow-hidden rounded-t-overlay **:data-[slot=scroll-area-scrollbar]:mt-2 [touch-action:pan-y]",
        !footer && "rounded-b-overlay",
        className,
      )}
      {...props}
    />
  );
}

function CommandGroup({ className, ...props }: React.ComponentProps<typeof AutocompleteGroup>) {
  return <AutocompleteGroup className={className} data-slot="command-group" {...props} />;
}

function CommandGroupLabel({
  className,
  ...props
}: React.ComponentProps<typeof AutocompleteGroupLabel>) {
  return (
    <AutocompleteGroupLabel className={className} data-slot="command-group-label" {...props} />
  );
}

function CommandCollection({ ...props }: React.ComponentProps<typeof AutocompleteCollection>) {
  return <AutocompleteCollection data-slot="command-collection" {...props} />;
}

/** `active` overrides only the highlighted background for palette-owned navigation; forward other item props. */
function CommandItem({
  className,
  active,
  ...props
}: React.ComponentProps<typeof AutocompleteItem> & { active?: boolean }) {
  return (
    <AutocompleteItem
      className={cn("cursor-pointer", className)}
      highlighted={active}
      data-active={active || undefined}
      data-slot="command-item"
      {...props}
    />
  );
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "ms-auto font-medium font-sans text-secondary-label text-xs tracking-widest",
        className,
      )}
      data-slot="command-shortcut"
      {...props}
    />
  );
}

/**
 * Render the footer slot with H2 bottom corners and compact shortcut hints.
 * Forward div props and className; footer actions and their handlers are supplied by callers.
 */
function CommandFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-between gap-2 rounded-b-overlay bg-foreground/[0.025] px-[var(--command-content-inset)] py-2.5 font-medium text-sm text-muted-foreground [&_[data-slot=kbd-group]]:font-sans [&_[data-slot=kbd]]:bg-foreground/[0.08] [&_[data-slot=kbd]]:text-foreground [&_[data-slot=kbd]]:ring-0",
        className,
      )}
      data-slot="command-footer"
      {...props}
    />
  );
}

function CommandFooterAction({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size" | "variant">) {
  return (
    <Button
      {...props}
      variant="ghost-muted"
      size="xs"
      className={cn("h-auto px-2 text-xs hover:bg-transparent", className)}
    />
  );
}

export {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandDialogTrigger,
  CommandFooter,
  CommandFooterAction,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandListHeading,
  CommandListVirtualized,
  CommandPanel,
  CommandShortcut,
};
