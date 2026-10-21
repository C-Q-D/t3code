/** Shared status badges; H5 densities and 22px detail statuses accept labels and optional icons. */
"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const badgeVariants = cva(
  "relative inline-flex h-5 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-tag px-2.25 font-sans text-meta-large font-semibold text-shadow-stone [&_svg:not([class*='size-'])]:size-2.75 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    compoundVariants: [
      // H5 version labels have one extra pixel of padding per side compared with PR labels.
      { size: "sm", variant: "secondary", className: "px-1.75" },
    ],
    variants: {
      size: {
        // Keep existing densities; lg had no callers before adopting the 22px status geometry.
        control: "",
        default: "",
        lg: "h-5.5 rounded-badge-large pl-1.75 pr-2.25 text-secondary-copy font-bold shadow-tag [&_svg:not([class*='size-'])]:size-3",
        sm: "h-4.5 gap-0.75 rounded-badge-compact px-1.5 font-mono text-meta font-normal",
        // SettingsPage8a O1–O4 lists: 20px result/source tags, 11px labels and 8px insets.
        settings: "h-5 px-2 text-meta text-shadow-none",
      },
      variant: {
        // Light surfaces keep F8 semantic icons dark instead of recoloring their strokes.
        default:
          "bg-primary text-primary-foreground font-bold text-shadow-none [--lucide-hue-override:currentColor]",
        action:
          "bg-primary text-primary-foreground font-bold text-shadow-none [--lucide-hue-override:currentColor]",
        destructive: "bg-error-surface text-error-foreground",
        danger: "bg-error-surface text-error-foreground",
        error:
          "bg-status-error text-status-error-foreground text-shadow-none [--lucide-hue-override:currentColor]",
        info: "bg-status-info text-info",
        outline: "bg-secondary text-secondary-label",
        neutral: "bg-secondary text-secondary-label",
        secondary: "bg-secondary text-status-neutral-foreground",
        success: "bg-status-success text-success-foreground",
        warning:
          "bg-warning-surface text-status-warning-foreground text-shadow-none [--lucide-hue-override:currentColor]",
        restricted:
          "bg-status-restricted text-status-restricted-foreground text-shadow-none [--lucide-hue-override:currentColor]",
        target: "bg-status-target text-status-target-foreground",
        accent: "bg-status-emphasis text-status-emphasis-foreground",
        // External labels use H5's neutral palette rather than consumer-defined colors.
        label: "bg-secondary text-secondary-label",
        // SettingsPage8a O2 paused tasks and O3 built-in templates share this neutral surface.
        "settings-neutral": "bg-settings-inheritance-surface text-secondary-label",
      },
    },
  },
);

/** Span/render props and semantic palette; sm is an 18px tag and lg is a 22px status badge. */
interface BadgeProps extends useRender.ComponentProps<"span"> {
  variant?: VariantProps<typeof badgeVariants>["variant"];
  size?: VariantProps<typeof badgeVariants>["size"];
}

/** Render a status label without adding interaction states; defaults to the white action palette. */
function Badge({ className, variant, size, render, ...props }: BadgeProps) {
  const defaultProps = {
    className: cn(badgeVariants({ className, size, variant })),
    "data-slot": "badge",
  };

  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(defaultProps, props),
    render,
  });
}

export { Badge, badgeVariants };
