/** Graphite recessed surfaces; callers own layout, content, and interaction behavior. */
"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const wellVariants = cva("", {
  variants: {
    tone: {
      surface: "bg-well-surface",
      raised: "bg-well-raised",
      input: "bg-input",
      sidebar: "bg-sidebar-control-surface",
    },
    radius: {
      pill: "rounded-full",
      card: "rounded-card-surface",
      "card-large": "rounded-card-large",
      row: "rounded-card-row",
      compact: "rounded-compact-row",
      menu: "rounded-menu-row",
    },
    depth: {
      well: "shadow-well",
      input: "shadow-input-well",
      control: "shadow-well-control",
      track: "shadow-well-track",
    },
  },
  defaultVariants: {
    tone: "surface",
    radius: "card",
    depth: "well",
  },
});

/** Visual options follow the 8a token contract; native div props and refs pass through. */
interface WellProps extends useRender.ComponentProps<"div">, VariantProps<typeof wellVariants> {}

/**
 * Draw a recessed surface without adding padding, dimensions, or control semantics.
 * @param props Surface tone, radius, and depth default to surface/card/well. Use render
 * to replace the div; the caller supplies the element's semantics and interactive states.
 * @returns The default div or replacement element with merged props and a well data-slot.
 */
function Well({ className, tone, radius, depth, render, ...props }: WellProps) {
  const defaultProps = {
    className: cn(wellVariants({ tone, radius, depth }), className),
    "data-slot": "well",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export { Well, type WellProps };
