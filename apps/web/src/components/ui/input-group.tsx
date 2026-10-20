/** Composes input adornments; the group owns the shared focus indicator. */
"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "~/lib/utils";
import { createPresenceRegistry } from "~/lib/presenceRegistry";
import { Input, type InputProps } from "~/components/ui/input";

const inputGroupRegistry = createPresenceRegistry<
  "disabled" | "invalid" | "inline-start" | "inline-end"
>();

const inputGroupVariants = cva(
  "relative inline-flex w-full min-w-0 items-center rounded-[var(--control-radius)] border text-base text-foreground ring-ring/24 transition-shadow focus-within:data-[invalid=true]:border-destructive/64 focus-within:data-[invalid=true]:ring-destructive/16 focus-within:border-ring data-[invalid=true]:border-destructive/36 data-[disabled=true]:opacity-64 data-[disabled=true]:shadow-none focus-within:shadow-none data-[invalid=true]:shadow-none focus-within:ring-[3px] focus-within:ring-inset sm:text-sm dark:data-[invalid=true]:ring-destructive/24 data-[addon-inline-start=true]:**:[[data-size=sm]_input]:ps-1.5 data-[addon-inline-end=true]:**:[[data-size=sm]_input]:pe-1.5 data-[addon-inline-start=true]:**:[input]:ps-2 data-[addon-inline-end=true]:**:[input]:pe-2 *:data-[slot=input-control]:contents *:data-[slot=input-control]:before:hidden",
  {
    defaultVariants: {
      variant: "default",
      size: "default",
    },
    variants: {
      size: {
        default: null,
        lg: "h-9",
      },
      variant: {
        default:
          "border-input bg-background not-dark:bg-clip-padding shadow-xs/5 before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--control-radius)-1px)] data-[disabled=false]:not-focus-within:data-[invalid=false]:before:shadow-[0_1px_--theme(--color-black/4%)] dark:bg-input/32 dark:data-[disabled=false]:not-focus-within:data-[invalid=false]:before:shadow-[0_-1px_--theme(--color-white/6%)]",
        // Glass surfaces can remove borders, so focus must use an independent inset shadow.
        popover: "dropdown-glass rounded-2xl focus-within:inset-shadow-focus focus-within:ring-0",
        ghost:
          "border-transparent bg-transparent shadow-none hover:bg-muted/40 focus-within:bg-background",
      },
    },
  },
);

/**
 * Owns local control and addon registrations; callers keep input state in props.
 * Focus within any slot lights the group ring, including a button added to an addon.
 */
function InputGroup({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupVariants>) {
  const { counts, onChange } = inputGroupRegistry.usePresence();
  return (
    <inputGroupRegistry.Provider onChange={onChange}>
      <div
        className={cn(inputGroupVariants({ variant, size }), className)}
        data-disabled={(counts.disabled ?? 0) > 0 ? "true" : "false"}
        data-invalid={(counts.invalid ?? 0) > 0 ? "true" : "false"}
        data-addon-inline-start={(counts["inline-start"] ?? 0) > 0 ? "true" : "false"}
        data-addon-inline-end={(counts["inline-end"] ?? 0) > 0 ? "true" : "false"}
        data-slot="input-group"
        role="group"
        {...props}
      />
    </inputGroupRegistry.Provider>
  );
}

const inputGroupAddonVariants = cva(
  "[&_svg]:-mx-0.5 flex h-auto cursor-text select-none items-center justify-center gap-2 leading-none [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 **:[svg:not([class*='opacity-'])]:opacity-80",
  {
    defaultVariants: {
      align: "inline-start",
    },
    variants: {
      align: {
        "inline-end":
          "order-last pe-[calc(--spacing(3)-1px)] [[data-size=sm]+&]:pe-[calc(--spacing(2.5)-1px)]",
        "inline-start":
          "order-first ps-[calc(--spacing(3)-1px)] [[data-size=sm]+&]:ps-[calc(--spacing(2.5)-1px)]",
      },
    },
  },
);

/** Registers the mounted inline slot and focuses its sibling input on non-interactive clicks. */
function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
  inputGroupRegistry.useRegister("inline-start", align === "inline-start");
  inputGroupRegistry.useRegister("inline-end", align === "inline-end");
  return (
    <div
      className={cn(inputGroupAddonVariants({ align }), className)}
      data-align={align}
      data-slot="input-group-addon"
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        const isInteractive = target.closest(
          "button, a, input, select, textarea, [role='button'], [role='combobox'], [role='listbox'], [data-slot='select-trigger']",
        );
        if (isInteractive) return;
        e.preventDefault();
        const parent = e.currentTarget.parentElement;
        const input = parent?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          "input, textarea",
        );
        if (input && !parent?.querySelector("input:focus, textarea:focus")) {
          input.focus();
        }
      }}
      {...props}
    />
  );
}

/**
 * Reports control attributes before paint; cleanup removes the registrations.
 * Invalid styling preserves the existing attribute-presence condition, including aria-invalid=false.
 */
function InputGroupInput({ className, ...props }: InputProps) {
  inputGroupRegistry.useRegister("disabled", !!props.disabled);
  inputGroupRegistry.useRegister(
    "invalid",
    props["aria-invalid"] !== undefined && props["aria-invalid"] !== null,
  );
  return <Input className={className} unstyled {...props} />;
}

export { InputGroup, InputGroupAddon, InputGroupInput };
