/** Shared numeric controls; Base UI owns parsing, stepping, and accessible spinbutton behavior. */
"use client";

import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field";
import { MinusIcon, PlusIcon } from "lucide-react";
import * as React from "react";
import { cn } from "~/lib/utils";

export function NumberField({
  id,
  className,
  size = "default",
  ...props
}: NumberFieldPrimitive.Root.Props & {
  size?: "sm" | "default" | "lg";
}): React.ReactElement {
  const generatedId = React.useId();
  const fieldId = id ?? generatedId;
  return (
    <NumberFieldPrimitive.Root
      className={cn("flex w-full flex-col items-start gap-2", className)}
      data-size={size}
      data-slot="number-field"
      id={fieldId}
      {...props}
    />
  );
}

/**
 * Renders the numeric field shell; invalid is supplied by the input's validation owner.
 * Base UI supplies disabled state from NumberField; focus-within covers its controls.
 */
export function NumberFieldGroup({
  className,
  variant,
  invalid = false,
  ...props
}: NumberFieldPrimitive.Group.Props & {
  variant?: "dialog";
  invalid?: boolean;
}): React.ReactElement {
  return (
    <NumberFieldPrimitive.Group
      className={cn(
        "relative flex w-full justify-between rounded-lg border border-input bg-background not-dark:bg-clip-padding text-base text-foreground shadow-xs/5 ring-ring/24 transition-shadow before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] not-data-disabled:not-focus-within:not-aria-invalid:before:shadow-[0_1px_--theme(--color-black/4%)] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-inset data-[invalid=true]:border-destructive/36 focus-within:data-[invalid=true]:border-destructive/64 focus-within:data-[invalid=true]:ring-destructive/48 data-disabled:pointer-events-none data-disabled:opacity-64 sm:text-sm dark:bg-input/32 dark:data-[invalid=true]:ring-destructive/24 dark:not-data-disabled:not-focus-within:not-aria-invalid:before:shadow-[0_-1px_--theme(--color-white/6%)] [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 [[data-disabled],:focus-within,[aria-invalid]]:shadow-none",
        // 规范-8a H1 input wells, applied to the numeric control in 其余屏-8 R1.
        variant === "dialog" &&
          "rounded-full border-0 bg-input shadow-well-track ring-0 before:shadow-none not-data-disabled:not-focus-within:not-aria-invalid:before:shadow-none focus-within:shadow-well-track focus-within:inset-shadow-focus focus-within:ring-0 dark:bg-input dark:not-data-disabled:not-focus-within:not-aria-invalid:before:shadow-none [[data-disabled],:focus-within,[aria-invalid]]:shadow-well-track",
        className,
      )}
      data-invalid={invalid ? "true" : "false"}
      data-slot="number-field-group"
      {...props}
    />
  );
}

export function NumberFieldDecrement({
  className,
  ...props
}: NumberFieldPrimitive.Decrement.Props): React.ReactElement {
  return (
    <NumberFieldPrimitive.Decrement
      className={cn(
        "relative flex shrink-0 cursor-pointer items-center justify-center rounded-s-[calc(var(--radius-lg)-1px)] in-data-[size=sm]:px-[calc(--spacing(2.5)-1px)] px-[calc(--spacing(3)-1px)] transition-colors pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 hover:bg-accent",
        className,
      )}
      data-slot="number-field-decrement"
      {...props}
    >
      <MinusIcon />
    </NumberFieldPrimitive.Decrement>
  );
}

export function NumberFieldIncrement({
  className,
  ...props
}: NumberFieldPrimitive.Increment.Props): React.ReactElement {
  return (
    <NumberFieldPrimitive.Increment
      className={cn(
        "relative flex shrink-0 cursor-pointer items-center justify-center rounded-e-[calc(var(--radius-lg)-1px)] in-data-[size=sm]:px-[calc(--spacing(2.5)-1px)] px-[calc(--spacing(3)-1px)] transition-colors pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 hover:bg-accent",
        className,
      )}
      data-slot="number-field-increment"
      {...props}
    >
      <PlusIcon />
    </NumberFieldPrimitive.Increment>
  );
}

/** Preserves numeric keyboard input while selecting the requested control geometry. */
export function NumberFieldInput({
  className,
  variant,
  ...props
}: NumberFieldPrimitive.Input.Props & { variant?: "dialog" }): React.ReactElement {
  return (
    <NumberFieldPrimitive.Input
      className={cn(
        "h-8.5 in-data-[size=lg]:h-9.5 in-data-[size=sm]:h-7.5 w-full min-w-0 grow bg-transparent in-data-[size=sm]:px-[calc(--spacing(2.5)-1px)] px-[calc(--spacing(3)-1px)] text-center tabular-nums in-data-[size=lg]:leading-9.5 in-data-[size=sm]:leading-7.5 leading-8.5 outline-none [transition:background-color_5000000s_ease-in-out_0s] sm:h-7.5 sm:in-data-[size=lg]:h-8.5 sm:in-data-[size=sm]:h-6.5 sm:in-data-[size=lg]:leading-8.5 sm:in-data-[size=sm]:leading-8.5 sm:leading-7.5",
        // 其余屏-8 R1 numeric input shares the 38px / 14px-inset dialog field geometry.
        variant === "dialog" &&
          "h-9.5 rounded-full px-3.5 text-left font-mono text-control leading-normal sm:h-9.5 sm:leading-normal",
        className,
      )}
      data-slot="number-field-input"
      {...props}
    />
  );
}

export { NumberFieldPrimitive };
