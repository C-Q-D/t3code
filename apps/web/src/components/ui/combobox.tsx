"use client";

/** Combobox composition with H2 list surfaces; Base UI owns selection and virtual highlights. */

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { ChevronsUpDownIcon, SearchIcon, XIcon } from "lucide-react";
import * as React from "react";

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

const ComboboxContext = React.createContext<{
  chipsRef: React.RefObject<Element | null> | null;
  multiple: boolean;
}>({
  chipsRef: null,
  multiple: false,
});

/** Share the multi-select chip anchor across portals and forward root props and events to Base UI. */
function Combobox<Value, Multiple extends boolean | undefined = false>(
  props: ComboboxPrimitive.Root.Props<Value, Multiple>,
) {
  const chipsRef = React.useRef<Element | null>(null);
  const value = React.useMemo(() => ({ chipsRef, multiple: !!props.multiple }), [props.multiple]);
  return (
    <ComboboxContext value={value}>
      <ComboboxPrimitive.Root {...props} />
    </ComboboxContext>
  );
}

/**
 * Composes the input and addons from Base UI's resolved props, including inherited disabled state.
 * Native input props and refs stay on Input; the surrounding div only owns layout and opacity.
 */
function ComboboxInput({
  className,
  showTrigger = true,
  showClear = false,
  startAddon,
  size,
  unstyled = false,
  ...props
}: Omit<ComboboxPrimitive.Input.Props, "size"> & {
  showTrigger?: boolean;
  showClear?: boolean;
  startAddon?: React.ReactNode;
  size?: "sm" | "default" | "lg" | number;
  unstyled?: boolean;
  ref?: React.Ref<HTMLInputElement>;
}) {
  const { counts, onChange } = clearPresence.usePresence();
  const clearMounted = (counts.clear ?? 0) > 0;
  const sizeValue = (size ?? "default") as "sm" | "default" | "lg" | number;

  return (
    <clearPresence.Provider onChange={onChange}>
      <ComboboxPrimitive.Input
        className={cn(
          startAddon &&
            "data-[size=sm]:*:data-[slot=combobox-input]:ps-[calc(--spacing(7.5)-1px)] *:data-[slot=combobox-input]:ps-[calc(--spacing(8.5)-1px)] sm:data-[size=sm]:*:data-[slot=combobox-input]:ps-[calc(--spacing(7)-1px)] sm:*:data-[slot=combobox-input]:ps-[calc(--spacing(8)-1px)]",
          (showTrigger || clearMounted) &&
            (sizeValue === "sm"
              ? "*:data-[slot=combobox-input]:pe-6.5"
              : "*:data-[slot=combobox-input]:pe-7"),
          className,
        )}
        data-slot="combobox-input"
        render={(inputProps, state) => (
          <div
            className={cn(
              "relative text-foreground data-[disabled=true]:opacity-64",
              unstyled ? "w-fit" : "w-full",
            )}
            data-disabled={state.disabled ? "true" : "false"}
          >
            {startAddon && (
              <div
                aria-hidden="true"
                className={cn(
                  "[&_svg]:-mx-0.5 pointer-events-none absolute inset-y-0 start-px z-10 flex items-center ps-[calc(--spacing(3)-1px)] opacity-80 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4",
                  sizeValue === "sm" && "ps-[calc(--spacing(2.5)-1px)]",
                )}
                data-slot="combobox-start-addon"
              >
                {startAddon}
              </div>
            )}
            <Input
              {...inputProps}
              className={cn(
                unstyled && "rounded-none bg-transparent text-sm",
                inputProps.className,
              )}
              nativeInput
              size={sizeValue}
              unstyled={unstyled}
            />
            {showTrigger && (
              <ComboboxTrigger
                className={cn(
                  "-translate-y-1/2 absolute top-1/2 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent opacity-80 outline-none transition-opacity pointer-coarse:after:absolute pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 hover:opacity-100 sm:size-7 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
                  clearMounted && "hidden",
                  sizeValue === "sm" ? "end-0" : "end-0.5",
                )}
              >
                <ComboboxPrimitive.Icon data-slot="combobox-icon">
                  <ChevronsUpDownIcon />
                </ComboboxPrimitive.Icon>
              </ComboboxTrigger>
            )}
            {showClear && (
              <ComboboxClear
                render={<MountedClearButton />}
                className={cn(
                  "-translate-y-1/2 absolute top-1/2 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent opacity-80 outline-none transition-opacity pointer-coarse:after:absolute pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 hover:opacity-100 sm:size-7 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
                  sizeValue === "sm" ? "end-0" : "end-0.5",
                )}
              >
                <XIcon />
              </ComboboxClear>
            )}
          </div>
        )}
        {...props}
      />
    </clearPresence.Provider>
  );
}

function ComboboxSearchInput(props: React.ComponentProps<typeof ComboboxInput>) {
  return (
    <div className="min-w-0 shrink-0 px-3 pt-2.5">
      <div className="relative -translate-y-px border-b border-border/70 pb-1.5 transition-colors focus-within:border-ring">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1.5 left-0 size-4 shrink-0 text-muted-foreground/55"
        />
        <ComboboxInput
          {...props}
          className="[&_input]:h-6.5 [&_input]:ps-5 [&_input]:font-sans [&_input]:leading-6.5"
          showTrigger={false}
          size="sm"
          unstyled
        />
      </div>
    </div>
  );
}

function ComboboxTrigger({ className, children, ...props }: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger className={className} data-slot="combobox-trigger" {...props}>
      {children}
    </ComboboxPrimitive.Trigger>
  );
}

/**
 * Portal a glass list surface at an explicit anchor or the multi-select chip anchor.
 * Merging glass into Popup keeps the settled appearance, but physics-on entry (120ms)
 * now applies opacity once instead of multiplying two layers, and scales the material
 * with the content from scale-98. This accepted motion difference keeps one glass surface.
 * Default to bottom/start with a 4px side offset; forward remaining props to Base UI's popup.
 */
function ComboboxPopup({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  alignOffset,
  align = "start",
  anchor: anchorProp,
  ...props
}: ComboboxPrimitive.Popup.Props & {
  align?: ComboboxPrimitive.Positioner.Props["align"];
  sideOffset?: ComboboxPrimitive.Positioner.Props["sideOffset"];
  alignOffset?: ComboboxPrimitive.Positioner.Props["alignOffset"];
  side?: ComboboxPrimitive.Positioner.Props["side"];
  anchor?: ComboboxPrimitive.Positioner.Props["anchor"];
}) {
  const { chipsRef, multiple } = React.use(ComboboxContext);
  const anchor = anchorProp ?? (multiple ? chipsRef : undefined);

  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="z-[130] select-none"
        data-slot="combobox-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <ComboboxPrimitive.Popup
          className={cn(
            "dropdown-glass relative min-w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) transition-[scale,opacity] flex max-h-[min(var(--available-height),23rem)] flex-1 flex-col physics:origin-(--transform-origin) physics:transition-[width,height,scale,opacity] physics:data-starting-style:scale-98 physics:data-starting-style:opacity-0 physics:data-ending-style:scale-98 physics:data-ending-style:opacity-0 physics:duration-(--popup-motion-duration) physics:ease-(--popup-motion-ease) overflow-hidden rounded-overlay text-foreground",
            className,
          )}
          data-slot="combobox-popup"
          {...props}
        >
          {children}
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

/** Render an H2 option with a shared highlight background; forward selection props and events unchanged. */
function ComboboxItem({
  className,
  children,
  hideIndicator: _hideIndicator = false,
  ...props
}: ComboboxPrimitive.Item.Props & {
  hideIndicator?: boolean;
}) {
  return (
    <ComboboxPrimitive.Item
      className={cn(
        "flex min-h-8.5 shrink-0 in-data-[side=none]:min-w-[calc(var(--anchor-width)+1.25rem)] cursor-pointer items-center rounded-menu-row px-2.5 py-1 text-control text-foreground outline-none not-data-disabled:not-active:data-selected:bg-accent not-data-disabled:not-active:hover:bg-accent not-data-disabled:not-active:data-highlighted:bg-accent not-data-disabled:active:bg-sidebar not-data-disabled:active:shadow-well-pressed data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:text-fg-icon-disabled [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      data-slot="combobox-item"
      {...props}
    >
      {/* Children lay out as one row: a label that truncates, then any trailing meta. */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5" data-slot="combobox-item-content">
        {children}
      </div>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      className={cn(
        "not-empty:p-2 text-center text-base text-muted-foreground sm:text-sm",
        className,
      )}
      data-slot="combobox-empty"
      {...props}
    />
  );
}

/**
 * Wrap a padded Base UI list in ScrollArea with a reserved scrollbar gutter and edge fades.
 * Forward list props and className to the inner list; virtualizers should use ComboboxListVirtualized.
 */
function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ScrollArea scrollbarGutter scrollFade>
      <ComboboxPrimitive.List
        className={cn("not-empty:scroll-py-1.5 not-empty:p-1.5", className)}
        data-slot="combobox-list"
        {...props}
      />
    </ScrollArea>
  );
}

/**
 * A variant of `ComboboxList` without `ScrollArea`, for use when
 * an external virtualizer (e.g. LegendList) owns the scroll container.
 */
function ComboboxListVirtualized({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      className={cn("size-full min-w-0 not-empty:p-1.5", className)}
      data-slot="combobox-list"
      {...props}
    />
  );
}

function ComboboxClear({ className, ...props }: ComboboxPrimitive.Clear.Props) {
  return <ComboboxPrimitive.Clear className={className} data-slot="combobox-clear" {...props} />;
}

function ComboboxStatus({ className, ...props }: ComboboxPrimitive.Status.Props) {
  return (
    <ComboboxPrimitive.Status
      className={cn(
        "px-3 py-2 font-medium text-muted-foreground text-xs empty:m-0 empty:p-0",
        className,
      )}
      data-slot="combobox-status"
      {...props}
    />
  );
}

const useComboboxFilter = ComboboxPrimitive.useFilter;

export {
  Combobox,
  ComboboxInput,
  ComboboxSearchInput,
  ComboboxTrigger,
  ComboboxPopup,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxList,
  ComboboxListVirtualized,
  ComboboxClear,
  ComboboxStatus,
  useComboboxFilter,
};
