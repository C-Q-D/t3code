"use client";

/** Toggle appearances shared by standalone buttons and ToggleGroup items. */
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const toggleVariants = cva(
  "[&_svg]:-mx-0.5 relative inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium text-base text-foreground outline-none transition-shadow before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 hover:bg-accent focus-visible:inset-shadow-focus disabled:pointer-events-none disabled:opacity-64 aria-disabled:opacity-64 data-pressed:bg-input/64 data-pressed:text-accent-foreground sm:text-sm [&_svg:not([class*='opacity-'])]:opacity-80 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        compact:
          "h-7 min-w-7 rounded-md px-[calc(--spacing(1)-1px)] text-xs before:rounded-[calc(var(--radius-md)-1px)] [&_svg:not([class*='size-'])]:size-3.5",
        default: "h-9 min-w-9 px-[calc(--spacing(2)-1px)] sm:h-8 sm:min-w-8",
        lg: "h-10 min-w-10 px-[calc(--spacing(2.5)-1px)] sm:h-9 sm:min-w-9",
        segmented:
          "h-7 min-w-0 rounded-segmented-item px-2.5 text-secondary-copy-medium before:rounded-segmented-item sm:text-secondary-copy-medium",
        sm: "h-8 min-w-8 px-[calc(--spacing(1.5)-1px)] sm:h-7 sm:min-w-7",
        xs: "h-7 min-w-7 px-[calc(--spacing(1)-1px)] sm:h-6 sm:min-w-6 rounded-md",
        // SettingsPage8a M2/M3: 26px segments inside the 32px settings track.
        settings:
          "h-6.5 min-w-0 rounded-segmented-item px-2.75 text-secondary-copy-medium before:rounded-segmented-item sm:text-secondary-copy-medium",
        // Panel8a K4 and device controls: 24px items in a 28px recessed track.
        panel:
          "h-6 min-w-0 rounded-compact-row px-2 text-secondary-copy before:rounded-compact-row sm:text-secondary-copy",
        // Panel8a K4: the same 28px / r9 geometry as shared compact icon keys.
        "panel-icon": "size-7 min-w-7 rounded-device-control p-0 before:rounded-device-control",
        // SettingsPage8a O2: 28px segments with 12px insets in the shared 34px dialog track.
        dialog:
          "h-7 min-w-0 rounded-segmented-item px-3 text-secondary-copy-medium before:rounded-segmented-item sm:text-secondary-copy-medium",
        // 其余屏-8 R1: 32px duration-unit segments inside a 38px recessed track.
        duration:
          "h-8 min-w-0 rounded-card-row px-3 text-secondary-copy-medium before:rounded-card-row sm:text-secondary-copy-medium",
      },
      variant: {
        default: "border-transparent",
        pill: "border-transparent rounded-full px-3 font-normal text-muted-foreground data-pressed:text-foreground",
        ghost:
          "border-transparent text-foreground shadow-none [:disabled,:active,[data-pressed]]:shadow-none before:shadow-none data-pressed:bg-accent data-pressed:text-accent-foreground disabled:opacity-100 disabled:text-muted-foreground disabled:[&_svg]:opacity-100",
        outline:
          "border-input bg-background not-dark:bg-clip-padding shadow-xs/5 not-disabled:not-active:not-data-pressed:before:shadow-[0_1px_--theme(--color-black/4%)] dark:bg-input/32 dark:data-pressed:bg-input dark:hover:bg-input/64 dark:not-disabled:not-active:not-data-pressed:before:shadow-[0_-1px_--theme(--color-white/6%)] dark:not-disabled:not-data-pressed:before:shadow-[0_-1px_--theme(--color-white/2%)] [:disabled,:active,[data-pressed]]:shadow-none",
        segmented:
          "border-0 bg-transparent font-normal text-secondary-label text-shadow-stone shadow-none transition-none before:shadow-none not-data-disabled:not-data-pressed:hover:bg-segmented-hover not-data-disabled:hover:text-foreground not-data-disabled:not-data-pressed:active:bg-popover not-data-disabled:not-data-pressed:active:text-foreground not-data-disabled:not-data-pressed:active:shadow-segmented-pressed data-pressed:bg-segmented-selected data-pressed:font-bold data-pressed:text-foreground not-data-disabled:data-pressed:shadow-raise-tab data-pressed:hover:bg-segmented-selected disabled:opacity-40 aria-disabled:opacity-40 data-disabled:pointer-events-none data-disabled:shadow-none in-[[data-slot=toggle-group][data-disabled]]:disabled:opacity-100 in-[[data-slot=toggle-group][data-disabled]]:aria-disabled:opacity-100",
      },
    },
  },
);

/** Forward Base UI's pressed/disabled state and apply the requested appearance. */
function Toggle({
  className,
  variant,
  size,
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      className={cn(toggleVariants({ className, size, variant }))}
      data-slot="toggle"
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
