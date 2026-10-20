/** Graphite raised surfaces; layout, stone textures, and interaction belong to callers. */
"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const slabVariants = cva("", {
  variants: {
    tone: {
      sidebar: "bg-sidebar",
      card: "bg-card",
      raised: "bg-surface-raised",
      secondary: "bg-secondary",
      overlay: "surface-glass",
    },
    elevation: {
      slab: "shadow-slab",
      "slab-spec": "shadow-slab-spec",
      "slab-frame": "shadow-slab-frame",
      "raise-l": "shadow-raise-l",
      "raise-l-spec": "shadow-raise-l-spec",
      "raise-detail": "shadow-raise-detail",
      "raise-m": "shadow-raise-m",
      "raise-xs": "shadow-raise-xs",
      "raise-xs-control": "shadow-raise-xs-control",
    },
    radius: {
      slab: "rounded-slab",
      card: "rounded-card-surface",
      "card-large": "rounded-card-large",
      row: "rounded-card-row",
      compact: "rounded-compact-row",
      menu: "rounded-menu-row",
      pill: "rounded-full",
      overlay: "rounded-overlay",
      "overlay-large": "rounded-overlay-large",
      dialog: "rounded-dialog",
      composer: "rounded-composer",
    },
    selected: {
      true: "inset-shadow-selected",
      false: "",
    },
    glow: {
      true: "edge-glow",
      false: "",
    },
  },
  defaultVariants: {
    tone: "card",
    elevation: "slab",
    radius: "slab",
    selected: false,
    glow: false,
  },
});

/**
 * Visual options follow the 8a token contract; native div props and refs pass through.
 * Overlay tone delegates its background and elevation to surface-glass, ignoring elevation.
 * Selected adds only a visual circle; callers supply any applicable ARIA selection state.
 * Glow adds the theme's white edge light on top of the elevation shadow; themes without
 * an edge light leave it invisible, and it has no effect without an elevation.
 */
interface SlabProps extends useRender.ComponentProps<"div">, VariantProps<typeof slabVariants> {}

/**
 * Draw a raised surface with an optional independent inset selection circle.
 * @param props Tone, elevation, radius, and selection default to card/slab/slab/false.
 * Use render to replace the div; callers own layout, semantics, and interactive states.
 * @returns The default div or replacement element with merged props and a slab data-slot.
 */
function Slab({ className, tone, elevation, radius, selected, glow, render, ...props }: SlabProps) {
  const defaultProps = {
    // The shared glass utility owns overlay opacity and shadows; a second shadow
    // here would override that treatment instead of composing another layer.
    className: cn(
      slabVariants({
        tone,
        elevation: tone === "overlay" ? null : elevation,
        radius,
        selected,
        glow,
      }),
      className,
    ),
    "data-slot": "slab",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export { Slab, type SlabProps };
