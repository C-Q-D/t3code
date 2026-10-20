"use client";

/** Autocomplete primitives with H2 list surfaces; Base UI owns selection and virtual highlights. */

import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete";
import { ChevronsUpDownIcon, XIcon } from "lucide-react";

import { createPresenceRegistry } from "~/lib/presenceRegistry";
import { cn } from "~/lib/utils";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";

const clearPresence = createPresenceRegistry<"clear">();

/** Registers only the button Base UI actually mounts, including its exit transition. */
function MountedClearButton(props: React.ComponentProps<"button">) {
  clearPresence.useRegister("clear");
  return <button {...props} />;
}

const Autocomplete = AutocompletePrimitive.Root;

/**
 * Composes the input and addons from Base UI's resolved props, including inherited disabled state.
 * Native input props and refs stay on Input; the surrounding div only owns layout and opacity.
 */
function AutocompleteInput({
  className,
  showTrigger = false,
  showClear = false,
  startAddon,
  size,
  ...props
}: Omit<AutocompletePrimitive.Input.Props, "size"> & {
  showTrigger?: boolean;
  showClear?: boolean;
  startAddon?: React.ReactNode;
  size?: "sm" | "default" | "lg" | number;
  ref?: React.Ref<HTMLInputElement>;
}) {
  const { counts, onChange } = clearPresence.usePresence();
  const clearMounted = (counts.clear ?? 0) > 0;
  const sizeValue = (size ?? "default") as "sm" | "default" | "lg" | number;

  return (
    <clearPresence.Provider onChange={onChange}>
      <AutocompletePrimitive.Input
        className={cn(
          startAddon &&
            "data-[size=sm]:*:data-[slot=autocomplete-input]:ps-[calc(--spacing(7.5)-1px)] *:data-[slot=autocomplete-input]:ps-[calc(--spacing(8.5)-1px)] sm:data-[size=sm]:*:data-[slot=autocomplete-input]:ps-[calc(--spacing(7)-1px)] sm:*:data-[slot=autocomplete-input]:ps-[calc(--spacing(8)-1px)]",
          (showTrigger || clearMounted) &&
            (sizeValue === "sm"
              ? "*:data-[slot=autocomplete-input]:pe-6.5"
              : "*:data-[slot=autocomplete-input]:pe-7"),
          className,
        )}
        data-slot="autocomplete-input"
        render={(inputProps, state) => (
          <div
            className="relative w-full text-foreground data-[disabled=true]:opacity-64"
            data-disabled={state.disabled ? "true" : "false"}
          >
            {startAddon && (
              <div
                aria-hidden="true"
                className={cn(
                  "[&_svg]:-mx-0.5 pointer-events-none absolute inset-y-0 start-px z-10 flex items-center ps-[calc(--spacing(3)-1px)] opacity-80 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4",
                  sizeValue === "sm" && "ps-[calc(--spacing(2.5)-1px)]",
                )}
                data-slot="autocomplete-start-addon"
              >
                {startAddon}
              </div>
            )}
            <Input {...inputProps} nativeInput size={sizeValue} />
            {showTrigger && (
              <AutocompleteTrigger
                className={cn(
                  "-translate-y-1/2 absolute top-1/2 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent opacity-80 outline-none transition-colors pointer-coarse:after:absolute pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 hover:opacity-100 sm:size-7 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
                  clearMounted && "hidden",
                  sizeValue === "sm" ? "end-0" : "end-0.5",
                )}
              >
                <AutocompletePrimitive.Icon data-slot="autocomplete-icon">
                  <ChevronsUpDownIcon />
                </AutocompletePrimitive.Icon>
              </AutocompleteTrigger>
            )}
            {showClear && (
              <AutocompleteClear
                render={<MountedClearButton />}
                className={cn(
                  "-translate-y-1/2 absolute top-1/2 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent opacity-80 outline-none transition-colors pointer-coarse:after:absolute pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 hover:opacity-100 sm:size-7 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
                  sizeValue === "sm" ? "end-0" : "end-0.5",
                )}
              >
                <XIcon />
              </AutocompleteClear>
            )}
          </div>
        )}
        {...props}
      />
    </clearPresence.Provider>
  );
}

/**
 * Portal a list surface at the supplied anchor; glass owns material and elevation.
 * Merging glass into Popup keeps the settled appearance, but physics-on entry (120ms)
 * now applies opacity once instead of multiplying two layers, and scales the material
 * with the content from scale-98. This accepted motion difference keeps one glass surface.
 * Position defaults to bottom/start with a 4px side offset. Forward remaining props to Base UI's popup.
 */
function AutocompletePopup({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  alignOffset,
  align = "start",
  anchor,
  ...props
}: AutocompletePrimitive.Popup.Props & {
  align?: AutocompletePrimitive.Positioner.Props["align"];
  sideOffset?: AutocompletePrimitive.Positioner.Props["sideOffset"];
  alignOffset?: AutocompletePrimitive.Positioner.Props["alignOffset"];
  side?: AutocompletePrimitive.Positioner.Props["side"];
  anchor?: AutocompletePrimitive.Positioner.Props["anchor"];
}) {
  return (
    <AutocompletePrimitive.Portal>
      <AutocompletePrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="z-[130] select-none"
        data-slot="autocomplete-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <AutocompletePrimitive.Popup
          className={cn(
            "dropdown-glass relative min-w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) transition-[scale,opacity] flex max-h-[min(var(--available-height),23rem)] flex-1 flex-col physics:origin-(--transform-origin) physics:transition-[width,height,scale,opacity] physics:data-starting-style:scale-98 physics:data-starting-style:opacity-0 physics:data-ending-style:scale-98 physics:data-ending-style:opacity-0 physics:duration-(--popup-motion-duration) physics:ease-(--popup-motion-ease) rounded-overlay text-foreground",
            className,
          )}
          data-slot="autocomplete-popup"
          {...props}
        >
          {children}
        </AutocompletePrimitive.Popup>
      </AutocompletePrimitive.Positioner>
    </AutocompletePrimitive.Portal>
  );
}

/**
 * Render an H2 option. `highlighted` overrides only its active background for palette-owned navigation;
 * undefined uses Base UI's highlight, while false suppresses it. Selection and events remain with Base UI.
 */
function AutocompleteItem({
  className,
  children,
  highlighted,
  ...props
}: AutocompletePrimitive.Item.Props & { highlighted?: boolean | undefined }) {
  return (
    <AutocompletePrimitive.Item
      className={cn(
        "flex min-h-8.5 shrink-0 cursor-default select-none items-center gap-2.5 rounded-menu-row px-2.5 py-1 text-control text-foreground outline-none not-data-disabled:active:bg-sidebar not-data-disabled:active:shadow-well-pressed data-disabled:pointer-events-none data-disabled:text-fg-icon-disabled [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        highlighted === undefined &&
          "not-data-disabled:not-active:data-selected:bg-accent not-data-disabled:not-active:hover:bg-accent not-data-disabled:not-active:data-highlighted:bg-accent",
        highlighted && "not-data-disabled:not-active:bg-accent",
        className,
      )}
      data-slot="autocomplete-item"
      {...props}
    >
      {children}
    </AutocompletePrimitive.Item>
  );
}

function AutocompleteGroup({ className, ...props }: AutocompletePrimitive.Group.Props) {
  return (
    <AutocompletePrimitive.Group
      className={cn("[[role=group]+&]:mt-1.5", className)}
      data-slot="autocomplete-group"
      {...props}
    />
  );
}

const GROUP_LABEL_CLASS_NAME = "px-2 py-1.5 font-medium text-muted-foreground text-xs";

function AutocompleteGroupLabel({ className, ...props }: AutocompletePrimitive.GroupLabel.Props) {
  return (
    <AutocompletePrimitive.GroupLabel
      className={cn(GROUP_LABEL_CLASS_NAME, className)}
      data-slot="autocomplete-group-label"
      {...props}
    />
  );
}

// A group label for virtualized lists, where rows cannot be wrapped in a group.
function AutocompleteListHeading({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(GROUP_LABEL_CLASS_NAME, className)}
      data-slot="autocomplete-group-label"
      role="presentation"
      {...props}
    />
  );
}

/**
 * Render a padded Base UI list without a ScrollArea; the child virtualizer must own scrolling.
 * Forward list props and merge className so callers can constrain the virtualized viewport.
 */
function AutocompleteListVirtualized({ className, ...props }: AutocompletePrimitive.List.Props) {
  return (
    <AutocompletePrimitive.List
      className={cn("size-full min-w-0 not-empty:p-1.5", className)}
      data-slot="autocomplete-list"
      {...props}
    />
  );
}

function AutocompleteEmpty({ className, ...props }: AutocompletePrimitive.Empty.Props) {
  return (
    <AutocompletePrimitive.Empty
      className={cn(
        "not-empty:p-2 text-center text-base text-muted-foreground sm:text-sm",
        className,
      )}
      data-slot="autocomplete-empty"
      {...props}
    />
  );
}

/**
 * Wrap a padded Base UI list in ScrollArea with a reserved scrollbar gutter and edge fades.
 * Forward list props and className to the inner list; use the virtualized variant for external scrolling.
 */
function AutocompleteList({ className, ...props }: AutocompletePrimitive.List.Props) {
  return (
    <ScrollArea scrollbarGutter scrollFade>
      <AutocompletePrimitive.List
        className={cn("not-empty:scroll-py-1.5 not-empty:p-1.5", className)}
        data-slot="autocomplete-list"
        {...props}
      />
    </ScrollArea>
  );
}

function AutocompleteClear({ className, ...props }: AutocompletePrimitive.Clear.Props) {
  return (
    <AutocompletePrimitive.Clear
      className={cn(
        "-translate-y-1/2 absolute end-0.5 top-1/2 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent opacity-80 outline-none transition-[color,background-color,box-shadow,opacity] pointer-coarse:after:absolute pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 hover:opacity-100 sm:size-7 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      data-slot="autocomplete-clear"
      {...props}
    >
      <XIcon />
    </AutocompletePrimitive.Clear>
  );
}

function AutocompleteCollection({ ...props }: AutocompletePrimitive.Collection.Props) {
  return <AutocompletePrimitive.Collection data-slot="autocomplete-collection" {...props} />;
}

function AutocompleteTrigger({
  className,
  children,
  ...props
}: AutocompletePrimitive.Trigger.Props) {
  return (
    <AutocompletePrimitive.Trigger
      className={className}
      data-slot="autocomplete-trigger"
      {...props}
    >
      {children}
    </AutocompletePrimitive.Trigger>
  );
}

export {
  Autocomplete,
  AutocompleteInput,
  AutocompleteTrigger,
  AutocompletePopup,
  AutocompleteItem,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteEmpty,
  AutocompleteList,
  AutocompleteListHeading,
  AutocompleteListVirtualized,
  AutocompleteClear,
  AutocompleteCollection,
};
