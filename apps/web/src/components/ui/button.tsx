/** Shared button recipes; feature callers choose variants and sizes instead of restyling controls. */
"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "~/lib/utils";

// H1 uses explicit disabled colors, not opacity; enabled-only interaction states keep them intact.
// The white key alone overrides F8's icon hues so its icons retain the dark foreground.
const buttonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full border-0 font-semibold text-secondary-copy-large outline-none focus-visible:inset-shadow-focus disabled:pointer-events-none aria-disabled:cursor-not-allowed pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        compact:
          "h-7 gap-1 px-[calc(--spacing(2)-1px)] text-secondary-copy [&_svg:not([class*='size-'])]:size-3.5",
        default: "h-8.5 px-4",
        icon: "size-8.5 p-0 [&_svg:not([class*='size-'])]:size-3.75",
        "icon-lg": "size-10 sm:size-9",
        "icon-micro": "size-5 p-0 [&_svg:not([class*='size-'])]:size-3",
        "icon-tiny": "size-4 p-0 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 sm:size-7",
        "icon-xl":
          "size-11 sm:size-10 [&_svg:not([class*='size-'])]:size-5 sm:[&_svg:not([class*='size-'])]:size-4.5",
        "icon-xs":
          "size-7 sm:size-6 not-in-data-[slot=input-group]:[&_svg:not([class*='size-'])]:size-4 sm:not-in-data-[slot=input-group]:[&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 px-[calc(--spacing(3.5)-1px)] sm:h-9",
        multiline:
          "min-h-9 px-[calc(--spacing(3)-1px)] py-[calc(--spacing(1.5)-1px)] whitespace-normal sm:min-h-8",
        micro:
          "h-5 gap-1 px-[calc(--spacing(1.5)-1px)] text-meta [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-[calc(--spacing(2.5)-1px)] sm:h-7",
        "sm-multiline":
          "min-h-8 gap-1.5 px-[calc(--spacing(2.5)-1px)] py-[calc(--spacing(1)-1px)] whitespace-normal sm:min-h-7",
        xl: "h-11 px-[calc(--spacing(4)-1px)] text-card-title sm:h-10 sm:text-body [&_svg:not([class*='size-'])]:size-5 sm:[&_svg:not([class*='size-'])]:size-4.5",
        xs: "h-7 gap-1 px-[calc(--spacing(2)-1px)] text-body sm:h-6 sm:text-secondary-copy [&_svg:not([class*='size-'])]:size-4 sm:[&_svg:not([class*='size-'])]:size-3.5",
        // 讨论页-8a v3 F1/F2: titlebar actions use 32px capsules with 12px inline padding.
        toolbar: "h-8 px-3",
        // 讨论页-8a v3 F1/F2: More and Send use 32×32px circular icon buttons.
        "icon-toolbar": "size-8 p-0 [&_svg:not([class*='size-'])]:size-4",
        // PRDetail8a header Ask/Explain controls: shared 30px text-button size across 8a boards.
        md: "h-7.5 gap-1.25 px-2.5 text-secondary-copy-medium [&_svg:not([class*='size-'])]:size-3.5",
        // 对话页-8a D1：用户消息悬停操作，30×30px、10px 圆角。
        "icon-md": "size-7.5 rounded-tag p-0 [&_svg:not([class*='size-'])]:size-3.75",
        // 对话页-8a D1：建议计划头部的 32×32px 图标操作，11px 圆角。
        "icon-toolbar-key":
          "size-8 rounded-toolbar-icon p-0 [&_svg:not([class*='size-'])]:size-3.75",
        // 其余屏-2 L3 / Panel8a: compact toolbar keys are 28px with 9px corners.
        "icon-compact-key":
          "size-7 rounded-device-control p-0 [&_svg:not([class*='size-'])]:size-3.5",
        // SettingsPage8a M2 day stepper: 26px circular controls inside a 32px well.
        "icon-stepper": "size-6.5 p-0 [&_svg:not([class*='size-'])]:size-3.25",
        // 讨论页 H4/H5 and 讨论设置-8a L3 cancel, SettingsPage8a O2 editor and Onboarding8a Q3
        // cloud/authorization actions: 36px capsule with 16px inline padding.
        "dialog-action": "h-9 px-4 text-control",
        // 讨论页 H4/H5, 讨论设置-8a L3 and SettingsPage8a O2 save: 36px capsule with 18px inline padding.
        "dialog-action-wide": "h-9 px-4.5 text-control",
        // 讨论页 H6: 28px notice action.
        notice: "h-7 gap-1.25 px-2.5 text-secondary-copy-medium font-semibold",
        // 讨论页 H7: 32px recovery action with 14px inline padding.
        recovery: "h-8 px-3.5",
        // Onboarding8a Q1/Q2 footer: 38px capsule, also shared by wizard navigation actions.
        onboarding: "h-9.5 px-4.5 text-control",
        // Onboarding8a Q1/Q2 computer and cloud entry rows use a 44px rounded rectangle.
        "onboarding-row": "h-11 gap-2.5 rounded-card-row px-3.5 text-control",
        // SettingsPage8a O1–O4 and P2: shared list actions are 28px capsules with 11px padding.
        "settings-list": "h-7 px-2.75 text-secondary-copy",
        // 讨论页-8a v3 H3: the shared compact capsule with 12px inline padding.
        "compact-padded": "h-7 gap-1.25 px-3 text-secondary-copy-medium font-semibold",
        // 讨论页-8a v3 H1/H2: a 26px compact key, complementing the circular stepper.
        "icon-stepper-key":
          "size-6.5 rounded-compact-stepper-key p-0 [&_svg:not([class*='size-'])]:size-3.75",
        // SettingsPage8a M2: 22px inline text actions sit beside setting labels across categories.
        "inline-label": "h-5.5 gap-1 px-2 text-meta-large [&_svg:not([class*='size-'])]:size-2.75",
        // PRDetail8a copy menu: icon-plus-chevron triggers use a 30px capsule with natural width.
        "icon-menu":
          "h-7.5 gap-0.5 rounded-full pl-2 pr-1.5 [&_svg:not([class*='size-'])]:size-3.5",
      },
      variant: {
        default:
          "[--lucide-hue-override:currentColor] bg-primary text-primary-foreground font-bold text-shadow-none shadow-primary-button not-disabled:not-aria-disabled:hover:bg-message-action-hover not-disabled:not-aria-disabled:[:active,[data-pressed]]:bg-control-primary-pressed not-disabled:not-aria-disabled:[:active,[data-pressed]]:translate-y-0.5 not-disabled:not-aria-disabled:[:active,[data-pressed]]:shadow-primary-pressed [:disabled,[aria-disabled=true]]:bg-accent [:disabled,[aria-disabled=true]]:text-fg-control-disabled [:disabled,[aria-disabled=true]]:shadow-none focus-visible:shadow-primary-edge-control",
        destructive:
          "bg-control-danger text-message-action-hover font-bold text-shadow-(--text-shadow-control-danger) shadow-danger not-disabled:not-aria-disabled:hover:bg-control-danger-hover not-disabled:not-aria-disabled:[:active,[data-pressed]]:bg-control-danger-pressed not-disabled:not-aria-disabled:[:active,[data-pressed]]:translate-y-0.5 not-disabled:not-aria-disabled:[:active,[data-pressed]]:shadow-danger-pressed [:disabled,[aria-disabled=true]]:bg-error-surface [:disabled,[aria-disabled=true]]:text-control-danger-disabled [:disabled,[aria-disabled=true]]:text-shadow-none [:disabled,[aria-disabled=true]]:shadow-none focus-visible:shadow-danger-edge focus-visible:text-shadow-none",
        "destructive-outline":
          "bg-transparent text-error-foreground shadow-outline-danger not-disabled:not-aria-disabled:hover:bg-error-surface not-disabled:not-aria-disabled:hover:text-control-danger-label-hover not-disabled:not-aria-disabled:hover:shadow-outline-danger-hover not-disabled:not-aria-disabled:[:active,[data-pressed]]:bg-control-danger-outline-pressed not-disabled:not-aria-disabled:[:active,[data-pressed]]:text-error-foreground not-disabled:not-aria-disabled:[:active,[data-pressed]]:shadow-outline-danger-pressed [:disabled,[aria-disabled=true]]:text-control-danger-disabled [:disabled,[aria-disabled=true]]:shadow-outline-danger-disabled",
        ghost:
          "bg-transparent text-fg-detail font-normal not-disabled:not-aria-disabled:hover:bg-secondary not-disabled:not-aria-disabled:hover:text-foreground not-disabled:not-aria-disabled:[:active,[data-pressed]]:bg-control-ghost-pressed not-disabled:not-aria-disabled:[:active,[data-pressed]]:text-foreground not-disabled:not-aria-disabled:[:active,[data-pressed]]:shadow-well-pressed [:disabled,[aria-disabled=true]]:text-fg-control-disabled",
        "ghost-muted":
          "bg-transparent text-secondary-label font-normal not-disabled:not-aria-disabled:hover:bg-secondary not-disabled:not-aria-disabled:hover:text-foreground not-disabled:not-aria-disabled:[:active,[data-pressed]]:bg-control-ghost-pressed not-disabled:not-aria-disabled:[:active,[data-pressed]]:text-foreground not-disabled:not-aria-disabled:[:active,[data-pressed]]:shadow-well-pressed [:disabled,[aria-disabled=true]]:text-fg-icon-disabled",
        "ghost-destructive":
          "bg-transparent text-secondary-label not-disabled:not-aria-disabled:hover:bg-error-surface not-disabled:not-aria-disabled:hover:text-error-foreground not-disabled:not-aria-disabled:[:active,[data-pressed]]:bg-control-danger-outline-pressed not-disabled:not-aria-disabled:[:active,[data-pressed]]:text-error-foreground not-disabled:not-aria-disabled:[:active,[data-pressed]]:shadow-well-pressed [:disabled,[aria-disabled=true]]:text-control-danger-disabled",
        // The public surface owns the fill; this button variant supplies elevation and state shadows.
        glass:
          "surface-glass text-foreground shadow-raise-xs-control not-disabled:not-aria-disabled:hover:text-message-action-hover not-disabled:not-aria-disabled:hover:shadow-raise-xs-hover not-disabled:not-aria-disabled:[:active,[data-pressed]]:text-foreground not-disabled:not-aria-disabled:[:active,[data-pressed]]:shadow-raise-xs-pressed [:disabled,[aria-disabled=true]]:text-fg-control-disabled [:disabled,[aria-disabled=true]]:shadow-none focus-visible:shadow-raise-tab",
        link: "bg-transparent text-foreground rounded-(--radius-control-link) underline decoration-fg-control-disabled underline-offset-4 not-disabled:not-aria-disabled:hover:text-message-action-hover not-disabled:not-aria-disabled:hover:decoration-foreground not-disabled:not-aria-disabled:[:active,[data-pressed]]:text-secondary-label not-disabled:not-aria-disabled:[:active,[data-pressed]]:decoration-secondary-label [:disabled,[aria-disabled=true]]:text-fg-control-disabled [:disabled,[aria-disabled=true]]:no-underline",
        "media-close":
          "bg-stone-scrim text-message-action-hover shadow-raise-xs-control not-disabled:not-aria-disabled:[:hover,[data-pressed]]:bg-background [:disabled,[aria-disabled=true]]:text-fg-control-disabled",
        "media-navigation":
          "absolute top-1/2 z-20 -translate-y-1/2 bg-transparent text-fg-detail not-disabled:not-aria-disabled:[:hover,[data-pressed]]:bg-secondary not-disabled:not-aria-disabled:[:hover,[data-pressed]]:text-message-action-hover [:disabled,[aria-disabled=true]]:text-fg-control-disabled",
        outline:
          "bg-transparent text-foreground shadow-outline-control not-disabled:not-aria-disabled:hover:bg-popover not-disabled:not-aria-disabled:hover:text-message-action-hover not-disabled:not-aria-disabled:hover:shadow-outline-control-hover not-disabled:not-aria-disabled:[:active,[data-pressed]]:bg-well-surface not-disabled:not-aria-disabled:[:active,[data-pressed]]:text-foreground not-disabled:not-aria-disabled:[:active,[data-pressed]]:shadow-outline-control-pressed [:disabled,[aria-disabled=true]]:text-fg-control-disabled [:disabled,[aria-disabled=true]]:shadow-outline-control-disabled",
        overlay:
          "bg-stone-scrim text-fg-detail not-disabled:not-aria-disabled:[:hover,[data-pressed]]:bg-background [:disabled,[aria-disabled=true]]:text-fg-control-disabled",
        secondary:
          "bg-secondary text-foreground shadow-raise-xs-control not-disabled:not-aria-disabled:hover:bg-accent not-disabled:not-aria-disabled:hover:text-message-action-hover not-disabled:not-aria-disabled:hover:shadow-raise-xs-hover not-disabled:not-aria-disabled:[:active,[data-pressed]]:bg-control-secondary-pressed not-disabled:not-aria-disabled:[:active,[data-pressed]]:text-foreground not-disabled:not-aria-disabled:[:active,[data-pressed]]:translate-y-[1.5px] not-disabled:not-aria-disabled:[:active,[data-pressed]]:shadow-raise-xs-pressed [:disabled,[aria-disabled=true]]:bg-control-secondary-disabled [:disabled,[aria-disabled=true]]:text-fg-control-disabled [:disabled,[aria-disabled=true]]:shadow-none focus-visible:shadow-raise-tab",
        "warning-outline":
          "border-[1.5px] border-warning/32 bg-warning-surface text-warning-foreground shadow-raise-xs-control not-disabled:not-aria-disabled:[:active,[data-pressed]]:shadow-none not-disabled:not-aria-disabled:[:hover,[data-pressed]]:border-warning/40 not-disabled:not-aria-disabled:[:hover,[data-pressed]]:bg-warning/16 [:disabled,[aria-disabled=true]]:text-fg-control-disabled [:disabled,[aria-disabled=true]]:shadow-none",
        // 讨论页 H4/H5: raised cancellation key and light danger confirmation key.
        "dialog-secondary":
          "bg-select-control text-foreground shadow-raise-xs not-disabled:not-aria-disabled:hover:bg-accent not-disabled:not-aria-disabled:active:translate-y-0.5 not-disabled:not-aria-disabled:active:shadow-raise-xs-pressed [:disabled,[aria-disabled=true]]:bg-control-secondary-disabled [:disabled,[aria-disabled=true]]:text-fg-disabled [:disabled,[aria-disabled=true]]:shadow-none",
        "danger-key":
          "bg-error text-discussion-danger-ink font-bold text-shadow-none shadow-discussion-danger-key not-disabled:not-aria-disabled:hover:bg-control-danger-label-hover not-disabled:not-aria-disabled:active:translate-y-0.5 not-disabled:not-aria-disabled:active:shadow-danger-pressed [:disabled,[aria-disabled=true]]:bg-error-surface [:disabled,[aria-disabled=true]]:text-control-danger-disabled [:disabled,[aria-disabled=true]]:shadow-none",
        // 讨论页 H6: stronger ghost text for a notice's recovery action.
        "ghost-strong":
          "bg-transparent text-foreground font-semibold not-disabled:not-aria-disabled:hover:bg-select-control [:disabled,[aria-disabled=true]]:text-fg-control-disabled",
      },
    },
    compoundVariants: [
      {
        variant: ["destructive", "destructive-outline", "ghost"],
        size: "default",
        className: "px-3.5",
      },
      { variant: "outline", size: "default", className: "pl-3 pr-3.5" },
      { variant: "link", size: "default", className: "h-auto px-0" },
      {
        variant: "ghost",
        size: ["icon", "icon-lg", "icon-micro", "icon-tiny", "icon-sm", "icon-xl", "icon-xs"],
        className: "text-secondary-label [:disabled,[aria-disabled=true]]:text-fg-icon-disabled",
      },
    ],
  },
);

/** Semantic button appearances shared by controls and existing feature callers. */
type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
/** Existing density and icon sizes; default and icon match the 34px H1 controls. */
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

/** Native or rendered button props, with appearance owned by the shared recipe. */
interface ButtonProps extends useRender.ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** Render an action; native buttons default to type=button, while render owns element semantics. */
function Button({ className, variant, size, render, ...props }: ButtonProps) {
  const typeValue: React.ButtonHTMLAttributes<HTMLButtonElement>["type"] = render
    ? undefined
    : "button";

  const defaultProps = {
    className: cn(buttonVariants({ className, size, variant })),
    "data-slot": "button",
    type: typeValue,
  };

  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  });
}

export { Button, buttonVariants, type ButtonSize, type ButtonVariant };

const inlineButtonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center gap-0.5 font-medium underline-offset-2 [text-align:var(--inline-button-text-align,center)] [white-space:var(--inline-button-white-space,nowrap)] hover:underline focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-64",
  {
    defaultVariants: { tone: "default" },
    variants: {
      tone: {
        default: "text-foreground",
        muted: "text-muted-foreground hover:text-foreground",
        destructive: "text-destructive/80 hover:text-destructive",
        picker:
          "gap-1.5 text-foreground underline decoration-foreground/30 decoration-dotted decoration-from-font underline-offset-4 hover:decoration-foreground hover:decoration-solid data-popup-open:decoration-foreground data-popup-open:decoration-solid",
      },
    },
  },
);

export function InlineButton({
  className,
  tone,
  render,
  ...props
}: useRender.ComponentProps<"button"> & VariantProps<typeof inlineButtonVariants>) {
  const defaultProps = {
    className: cn(inlineButtonVariants({ tone }), className),
    "data-slot": "inline-button",
    type: render ? undefined : ("button" as const),
  };
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  });
}
