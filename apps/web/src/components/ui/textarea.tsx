/** Shared multiline inputs, including compact review editors; submission belongs to callers. */
"use client";

import { Field as FieldPrimitive } from "@base-ui/react/field";
import { mergeProps } from "@base-ui/react/merge-props";
import type * as React from "react";

import { useFieldRootContext } from "@base-ui/react/internals/field-root-context";

import { cn } from "~/lib/utils";
import { getInputControlState } from "~/components/ui/input";

/** Native textarea props plus reusable editor geometry. */
type TextareaProps = React.ComponentProps<"textarea"> & {
  size?: "sm" | "default" | "lg" | "review" | number;
  unstyled?: boolean;
};

/**
 * Renders the input well without owning draft state or keyboard submission.
 * The textarea is the only focusable descendant and shows focus-visible for both
 * pointer and keyboard focus, so focus-within preserves its focus styling.
 * Danger colors require aria-invalid=true; removing the outer shadow only requires
 * the attribute to exist, including false, grammar, and spelling values.
 */
function Textarea({ className, size = "default", unstyled = false, ...props }: TextareaProps) {
  const { disabled: fieldDisabled, validation } = useFieldRootContext();
  // Field.Control supplies this default; the native merge lets explicit false/null override it.
  const { disabled, invalid, invalidPresent } = getInputControlState(
    { disabled: fieldDisabled || false, ...validation.getInputValidationProps() },
    props,
  );

  return (
    <span
      className={
        cn(
          !unstyled &&
            "relative inline-flex w-full rounded-lg border border-input bg-background not-dark:bg-clip-padding text-base text-foreground shadow-xs/5 ring-ring/24 transition-shadow before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] focus-within:data-[invalid=true]:border-destructive/64 focus-within:data-[invalid=true]:ring-destructive/16 data-[invalid=true]:border-destructive/36 focus-within:border-ring data-[disabled=true]:opacity-64 in-[fieldset:disabled]:opacity-64 data-[disabled=true]:shadow-none in-[fieldset:disabled]:shadow-none focus-within:shadow-none data-[invalid-present=true]:shadow-none focus-within:ring-[3px] focus-within:ring-inset data-[disabled=false]:not-in-[fieldset:disabled]:not-focus-within:data-[invalid=false]:before:shadow-[0_1px_--theme(--color-black/4%)] sm:text-sm dark:bg-input/32 dark:data-[invalid=true]:ring-destructive/24 dark:data-[disabled=false]:not-in-[fieldset:disabled]:not-focus-within:data-[invalid=false]:before:shadow-[0_-1px_--theme(--color-white/6%)]",
          size === "review" &&
            "rounded-tag border-0 bg-input text-control sm:text-control shadow-well-track before:shadow-none focus-within:shadow-well-track focus-within:inset-shadow-focus focus-within:ring-0 dark:bg-input",
          className,
        ) || undefined
      }
      data-disabled={disabled ? "true" : "false"}
      data-invalid={invalid ? "true" : "false"}
      data-invalid-present={invalidPresent ? "true" : "false"}
      data-size={size}
      data-slot="textarea-control"
    >
      <FieldPrimitive.Control
        render={(defaultProps) => (
          <textarea
            className={cn(
              // Auto-grows with content up to one cap, then scrolls.
              "field-sizing-content min-h-17.5 max-h-64 w-full rounded-[inherit] px-[calc(--spacing(3)-1px)] py-[calc(--spacing(1.5)-1px)] outline-none wrap-anywhere max-sm:min-h-20.5",
              size === "sm" &&
                "min-h-16.5 px-[calc(--spacing(2.5)-1px)] py-[calc(--spacing(1)-1px)] max-sm:min-h-19.5",
              size === "lg" && "min-h-18.5 py-[calc(--spacing(2)-1px)] max-sm:min-h-21.5",
              // K4 inline review editors share this 52px minimum across Diff, PR and files.
              size === "review" && "min-h-13 px-3 py-2 max-sm:min-h-13",
            )}
            data-slot="textarea"
            {...mergeProps(defaultProps, props)}
          />
        )}
      />
    </span>
  );
}

export { Textarea, type TextareaProps };
