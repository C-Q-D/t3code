"use client";

/** Shared toggle groups; segmented groups own the recessed track, while items own their states. */
import type { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import type { VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "~/lib/utils";
import { Toggle as ToggleComponent, type toggleVariants } from "~/components/ui/toggle";

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants>>({
  size: "default",
  variant: "default",
});

/** Inherit the variant and size in each item; Base UI owns selection and keyboard navigation. */
function ToggleGroup({
  className,
  variant = "segmented",
  size: sizeProp,
  orientation = "horizontal",
  children,
  ...props
}: ToggleGroupPrimitive.Props & VariantProps<typeof toggleVariants>) {
  const size =
    sizeProp === undefined ? (variant === "segmented" ? "segmented" : "default") : sizeProp;
  const value = { size, variant };
  return (
    <ToggleGroupPrimitive
      className={cn(
        "flex w-fit *:focus-visible:z-10 dark:*:[[data-slot=toggle]:hover+[data-slot=separator]]:before:bg-input/64 dark:*:[[data-slot=toggle][data-pressed]+[data-slot=separator]]:before:bg-input",
        orientation === "horizontal"
          ? "*:pointer-coarse:after:min-w-auto"
          : "*:pointer-coarse:after:min-h-auto",
        variant === "segmented"
          ? cn(
              "gap-0 rounded-segmented-track bg-input p-0.75 shadow-well-track data-disabled:opacity-40 data-disabled:shadow-none",
              orientation === "horizontal" ? "h-8.5" : "flex-col",
            )
          : variant === "default"
            ? "gap-0.5"
            : orientation === "horizontal"
              ? "*:not-first:not-data-[slot=separator]:before:-start-[0.5px] *:not-last:not-data-[slot=separator]:before:-end-[0.5px] *:not-first:rounded-s-none *:not-last:rounded-e-none *:not-first:border-s-0 *:not-last:border-e-0 *:not-first:before:rounded-s-none *:not-last:before:rounded-e-none"
              : "*:not-first:not-data-[slot=separator]:before:-top-[0.5px] *:not-last:not-data-[slot=separator]:before:-bottom-[0.5px] flex-col *:not-first:rounded-t-none *:not-last:rounded-b-none *:not-first:border-t-0 *:not-last:border-b-0 *:not-first:before:rounded-t-none *:not-last:before:rounded-b-none *:data-[slot=toggle]:not-last:before:hidden dark:*:last:before:hidden dark:*:first:before:block",
        className,
        // SettingsPage8a M2/M3 adds a compact track without changing existing sizes.
        variant === "segmented" && size === "settings" && "h-8 rounded-card-row",
        // Panel8a K4: compact 28px track with 2px inset around the segments.
        variant === "segmented" && size === "panel" && "h-7 rounded-full p-0.5",
        // 其余屏-8 R1: duration units align with the shared 38px input.
        variant === "segmented" && size === "duration" && "h-9.5 rounded-full",
      )}
      data-size={size}
      data-slot="toggle-group"
      data-variant={variant}
      orientation={orientation}
      {...props}
    >
      <ToggleGroupContext value={value}>{children}</ToggleGroupContext>
    </ToggleGroupPrimitive>
  );
}

/** Allow an item to override the group's appearance without changing its selection behavior. */
function Toggle({
  className,
  children,
  variant,
  size,
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  const context = React.use(ToggleGroupContext);

  const resolvedVariant = variant ?? context.variant;
  const resolvedSize = size ?? context.size;

  return (
    <ToggleComponent
      className={className}
      data-size={resolvedSize}
      data-variant={resolvedVariant}
      size={resolvedSize}
      variant={resolvedVariant}
      {...props}
    >
      {children}
    </ToggleComponent>
  );
}

export { ToggleGroup, Toggle, Toggle as ToggleGroupItem };
