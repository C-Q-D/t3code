/** Compose adjacent controls; split groups keep rounded outer ends and a narrow strategy trigger. */
"use client";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "~/lib/utils";
import { Separator } from "./separator";

const groupVariants = cva(
  "flex w-fit *:focus-visible:z-1 has-[>[data-slot=group]]:gap-2 *:has-focus-visible:z-1 dark:*:[[data-slot=button]:hover~[data-slot=separator]:not([data-slot]:hover~[data-slot=separator]~[data-slot=separator]),[data-slot][data-pressed]~[data-slot=separator]:not([data-slot][data-pressed]~[data-slot=separator]~[data-slot=separator])]:before:bg-input/64 dark:*:[[data-slot=separator]:has(~[data-slot=button]:hover):not(:has(~[data-slot=separator]~[data-slot]:hover)),[data-slot=separator]:has(~[data-slot][data-pressed]):not(:has(~[data-slot=separator]~[data-slot][data-pressed]))]:before:bg-input/64",
  {
    defaultVariants: {
      orientation: "horizontal",
    },
    variants: {
      variant: {
        // PRDetail8a's split geometry is shared by any action with a separate strategy menu.
        // Slot selectors also match MenuTrigger rendered through Button, without extra wrappers.
        split:
          "gap-0.5 [&>[data-slot]:not(:last-child)]:rounded-e-split-join [&>[data-slot]:not(:first-child)]:rounded-s-split-join [&>[data-slot]:first-child]:px-3.5 [&>[data-slot]:first-child:has(svg)]:px-3 [&>[data-slot]:last-child]:w-7.5 [&>[data-slot]:last-child]:px-0",
      },
      orientation: {
        horizontal:
          "*:[[data-slot]~[data-slot]:not([data-slot=separator])]:before:-start-[0.5px] *:data-slot:not-data-[slot=separator]:has-[~[data-slot]]:before:-end-[0.5px] *:pointer-coarse:after:min-w-auto *:data-slot:has-[~[data-slot]]:rounded-e-none *:data-slot:has-[~[data-slot]]:border-e-0 *:data-slot:has-[~[data-slot]]:before:rounded-e-none *:[[data-slot]~[data-slot]]:rounded-s-none *:[[data-slot]~[data-slot]]:border-s-0 *:[[data-slot]~[data-slot]]:before:rounded-s-none",
        vertical:
          "*:[[data-slot]~[data-slot]:not([data-slot=separator])]:before:-top-[0.5px] *:data-slot:not-data-[slot=separator]:has-[~[data-slot]]:before:-bottom-[0.5px] flex-col *:pointer-coarse:after:min-h-auto *:data-slot:has-[~[data-slot]]:rounded-b-none *:data-slot:has-[~[data-slot]]:border-b-0 *:data-slot:not-data-[slot=separator]:has-[~[data-slot]]:before:hidden *:data-slot:has-[~[data-slot]]:before:rounded-b-none dark:*:last:before:hidden dark:*:first:before:block *:[[data-slot]~[data-slot]]:rounded-t-none *:[[data-slot]~[data-slot]]:border-t-0 *:[[data-slot]~[data-slot]]:before:rounded-t-none",
      },
    },
  },
);

/**
 * Compose adjacent controls without owning their events or availability.
 * @param props Child controls, layout orientation, optional split geometry, and native group attributes.
 * @returns A labeled group; split is horizontal and retains each child's variant, focus, and disabled state.
 */
function Group({
  className,
  orientation,
  variant,
  children,
  ...props
}: {
  className?: string;
  orientation?: VariantProps<typeof groupVariants>["orientation"];
  variant?: VariantProps<typeof groupVariants>["variant"];
  children: React.ReactNode;
} & React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        groupVariants({ orientation: variant === "split" ? null : orientation, variant }),
        className,
      )}
      data-orientation={variant === "split" ? "horizontal" : orientation}
      data-variant={variant}
      data-slot="group"
      role="group"
      {...props}
    >
      {children}
    </div>
  );
}

/** Render the existing separator for joined groups; split groups use their own gap instead. */
function GroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: {
  className?: string;
} & React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      className={cn(
        "[[data-slot=input-control]:focus-within+&,[data-slot=input-group]:focus-within+&,[data-slot=select-trigger]:focus-visible+*+&,[data-slot=number-field]:focus-within+input+&]:-translate-x-px pointer-events-none relative z-2 bg-input before:absolute before:inset-0 has-[+[data-slot=input-control]:focus-within,+[data-slot=input-group]:focus-within,+[data-slot=select-trigger]:focus-visible+*,+[data-slot=number-field]:focus-within]:translate-x-px has-[+[data-slot=input-control]:focus-within,+[data-slot=input-group]:focus-within,+[data-slot=select-trigger]:focus-visible+*,+[data-slot=number-field]:focus-within]:bg-ring dark:before:bg-input/32 [[data-slot=input-control]:focus-within+&,[data-slot=input-group]:focus-within+&,[data-slot=select-trigger]:focus-visible+*+&,[data-slot=number-field]:focus-within+&,[data-slot=number-field]:focus-within+input+&]:bg-ring",
        className,
      )}
      orientation={orientation}
      {...props}
    />
  );
}

export {
  Group,
  Group as ButtonGroup,
  GroupSeparator,
  GroupSeparator as ButtonGroupSeparator,
  groupVariants,
};
