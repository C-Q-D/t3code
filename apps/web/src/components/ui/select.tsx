/** Shares select trigger styling with button-based pickers; popups own their own surface. */
"use client";
/** Select primitives; trigger styling is independent of the H2 popup and option states. */
import { mergeProps } from "@base-ui/react/merge-props";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "~/lib/utils";

const Select = SelectPrimitive.Root;

const selectTriggerVariants = cva(
  "group/select-trigger relative inline-flex cursor-pointer select-none items-center justify-between gap-1.5 rounded-full border-0 text-left text-secondary-copy-large outline-none transition-[color,box-shadow,background-color] focus-visible:inset-shadow-focus disabled:pointer-events-none data-disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      variant: {
        default:
          "w-full min-w-36 bg-select-control text-fg-detail shadow-raise-xs-control not-disabled:not-data-disabled:hover:bg-accent not-disabled:not-data-disabled:hover:text-message-action-hover not-disabled:not-data-disabled:hover:shadow-raise-xs-hover focus-visible:shadow-raise-tab not-disabled:not-data-disabled:[&:is(:active,[data-pressed],[aria-expanded=true])]:translate-y-[1.5px] not-disabled:not-data-disabled:[&:is(:active,[data-pressed],[aria-expanded=true])]:bg-select-pressed not-disabled:not-data-disabled:[&:is(:active,[data-pressed],[aria-expanded=true])]:text-foreground not-disabled:not-data-disabled:[&:is(:active,[data-pressed],[aria-expanded=true])]:shadow-raise-xs-pressed aria-invalid:shadow-outline-danger [&:is(:disabled,[data-disabled])]:bg-select-disabled [&:is(:disabled,[data-disabled])]:text-fg-control-disabled [&:is(:disabled,[data-disabled])]:shadow-none",
        ghost:
          "bg-transparent text-secondary-label not-disabled:not-data-disabled:hover:bg-accent not-disabled:not-data-disabled:hover:text-foreground not-disabled:not-data-disabled:[&:is(:active,[data-pressed],[aria-expanded=true])]:bg-accent not-disabled:not-data-disabled:[&:is(:active,[data-pressed],[aria-expanded=true])]:text-foreground [&:is(:disabled,[data-disabled])]:text-fg-control-disabled",
        // SettingsPage8a M2: shortcut pickers place a keycap inside the shared recessed well.
        keycap:
          "justify-center bg-input text-foreground shadow-well-track [&:is(:disabled,[data-disabled])]:text-fg-control-disabled",
      },
      size: {
        compact: "h-7 gap-1 px-2 text-secondary-copy",
        default: "h-8.5 ps-3 pe-2.5",
        lg: "h-10 ps-3 pe-2.5",
        sm: "h-7.5 px-2.5",
        xs: "h-7 gap-1 px-2 text-secondary-copy",
        // SettingsPage8a M2/M3: shared 32px capsule with a 120px minimum width.
        settings: "h-8 w-auto min-w-30 ps-3 pe-2.5",
        // SettingsPage8a M2: 32px shortcut well, at least 90px wide.
        shortcut: "h-8 w-auto min-w-22.5 px-3",
        // 讨论页 H4: large dialog picker with 14px copy and 14/12px horizontal insets.
        dialog: "h-10 ps-3.5 pe-3 text-body",
      },
    },
  },
);

/** Keeps Base UI selection and focus behavior while applying the shared capsule variants. */
function SelectTrigger({
  className,
  size = "default",
  variant = "default",
  children,
  icon,
  ...props
}: SelectPrimitive.Trigger.Props &
  VariantProps<typeof selectTriggerVariants> & { icon?: React.ReactNode }) {
  return (
    <SelectPrimitive.Trigger
      className={cn(selectTriggerVariants({ size, variant }), className)}
      data-slot="select-trigger"
      {...props}
    >
      {children}
      <SelectPrimitive.Icon data-slot="select-icon">
        {icon ?? (
          <ChevronDownIcon className="size-3.5 group-aria-expanded/select-trigger:rotate-180" />
        )}
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

/**
 * The select-field look for a picker that is not a Select, such as a Menu or
 * Combobox trigger. Render it as that trigger: `<MenuTrigger render={<SelectButton />}>`.
 */
function SelectButton({
  className,
  size = "default",
  children,
  render,
  ...props
}: useRender.ComponentProps<"button"> & Pick<VariantProps<typeof selectTriggerVariants>, "size">) {
  const defaultProps = {
    className: cn(selectTriggerVariants({ size }), className),
    "data-slot": "select-trigger",
    type: render ? undefined : ("button" as const),
  };
  return useRender({
    defaultTagName: "button",
    props: {
      ...mergeProps<"button">(defaultProps, props),
      children: (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{children}</span>
          <ChevronDownIcon
            aria-hidden
            className="size-3.5 shrink-0 group-aria-expanded/select-trigger:rotate-180"
          />
        </>
      ),
    },
    render,
  });
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      className={cn("flex-1 truncate data-placeholder:text-placeholder", className)}
      data-slot="select-value"
      {...props}
    />
  );
}

/** Position the H2 list surface; dropdown-glass owns its material and elevation. */
function SelectPopup({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  alignOffset = 0,
  alignItemWithTrigger = true,
  matchTriggerWidth = true,
  anchor,
  ...props
}: SelectPrimitive.Popup.Props & {
  side?: SelectPrimitive.Positioner.Props["side"];
  sideOffset?: SelectPrimitive.Positioner.Props["sideOffset"];
  align?: SelectPrimitive.Positioner.Props["align"];
  alignOffset?: SelectPrimitive.Positioner.Props["alignOffset"];
  alignItemWithTrigger?: SelectPrimitive.Positioner.Props["alignItemWithTrigger"];
  matchTriggerWidth?: boolean;
  anchor?: SelectPrimitive.Positioner.Props["anchor"];
}) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        align={align}
        alignItemWithTrigger={alignItemWithTrigger}
        alignOffset={alignOffset}
        anchor={anchor}
        className="z-[130] select-none"
        data-slot="select-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <SelectPrimitive.Popup
          className="origin-(--transform-origin) rounded-overlay text-foreground outline-none physics:transition-[width,height,scale,opacity] physics:data-starting-style:scale-98 physics:data-starting-style:opacity-0 physics:data-ending-style:scale-98 physics:data-ending-style:opacity-0 physics:duration-(--popup-motion-duration) physics:ease-(--popup-motion-ease)"
          data-slot="select-popup"
          {...props}
        >
          <SelectPrimitive.ScrollUpArrow
            className="top-0 z-50 flex h-6 w-full cursor-default items-center justify-center"
            data-slot="select-scroll-up-arrow"
          >
            <ChevronUpIcon className="relative size-4.5 sm:size-4" />
          </SelectPrimitive.ScrollUpArrow>
          <div
            className={cn(
              "dropdown-glass relative h-full rounded-overlay",
              matchTriggerWidth && "min-w-(--anchor-width)",
            )}
          >
            <SelectPrimitive.List
              className={cn("max-h-(--available-height) overflow-y-auto p-1.5", className)}
              data-slot="select-list"
            >
              {children}
            </SelectPrimitive.List>
          </div>
          <SelectPrimitive.ScrollDownArrow
            className="bottom-0 z-50 flex h-6 w-full cursor-default items-center justify-center"
            data-slot="select-scroll-down-arrow"
          >
            <ChevronDownIcon className="relative size-4.5 sm:size-4" />
          </SelectPrimitive.ScrollDownArrow>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

/** Render an H2 option using native focus-visible because Select moves actual focus onto its items. */
function SelectItem({
  className,
  children,
  hideIndicator: _hideIndicator = false,
  ...props
}: SelectPrimitive.Item.Props & {
  hideIndicator?: boolean;
}) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "flex min-h-8.5 shrink-0 in-data-[side=none]:min-w-[calc(var(--anchor-width)+1.25rem)] cursor-pointer items-center gap-2.5 rounded-menu-row px-2.5 py-1 text-control text-foreground outline-none not-data-disabled:not-active:data-selected:bg-accent not-data-disabled:not-active:data-highlighted:bg-accent not-data-disabled:focus-visible:inset-shadow-focus not-data-disabled:active:bg-sidebar not-data-disabled:active:shadow-well-pressed data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:text-fg-icon-disabled [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      data-slot="select-item"
      {...props}
    >
      <SelectPrimitive.ItemText className="min-w-0 flex-1" data-slot="select-item-text">
        {children}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectGroup(props: SelectPrimitive.Group.Props) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectGroupLabel(props: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      className="px-2 py-1.5 font-medium text-muted-foreground text-xs"
      data-slot="select-group-label"
      {...props}
    />
  );
}

export {
  Select,
  SelectTrigger,
  SelectButton,
  SelectValue,
  SelectPopup,
  SelectPopup as SelectContent,
  SelectItem,
  SelectGroup,
  SelectGroupLabel,
};
