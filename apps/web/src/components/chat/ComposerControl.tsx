/** Shares trigger geometry while keeping composer and external toolbar appearances independent. */
import { mergeProps } from "@base-ui/react/merge-props";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { useRender } from "@base-ui/react/use-render";
import {
  createContext,
  useContext,
  type ComponentProps,
  type ComponentType,
  type SVGProps,
} from "react";
import { ChevronDownIcon } from "lucide-react";

import { Separator } from "../ui/separator";
import { cn } from "~/lib/utils";

/** Existing icon density for expanded and resting controls. */
export type ComposerControlSize = "sm" | "xs";

/** Composer triggers use E1 geometry; other toolbars retain their existing recipes. */
type ComposerControlVariant = "default" | "composer";

/** Scopes trigger appearance across hosted composer portals without changing shared picker popups. */
export const ComposerControlVariantContext = createContext<ComposerControlVariant>("default");

/**
 * Resolves trigger classes from location and icon density. E1 fixes composer height at 34px;
 * size continues to control the legacy recipe outside the composer. aria-pressed marks plan mode.
 * @param size Existing expanded/resting density, independent of the E1 button height.
 * @param variant Appearance inherited from the composer scope or explicitly overridden.
 * @param className Caller-owned layout constraints merged after the recipe.
 * @returns Trigger classes, with no changes to popup appearance or interaction handlers.
 */
function composerControlClassName(
  size: ComposerControlSize,
  variant: ComposerControlVariant,
  className?: string,
) {
  if (variant === "composer") {
    return cn(
      "relative inline-flex h-8.5 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full border-0 bg-composer-control pr-3 pl-2.5 font-medium text-fg-detail text-secondary-copy-large shadow-raise-xs-control outline-none focus-visible:inset-shadow-focus disabled:pointer-events-none data-disabled:pointer-events-none pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 [&_svg]:pointer-events-none [&_svg]:shrink-0",
      "not-disabled:not-data-disabled:hover:bg-accent not-disabled:not-data-disabled:hover:text-foreground not-disabled:not-data-disabled:hover:shadow-raise-xs-hover not-disabled:not-data-disabled:[:active,[data-pressed]]:bg-control-secondary-pressed not-disabled:not-data-disabled:[:active,[data-pressed]]:shadow-raise-xs-pressed",
      "[:disabled,[data-disabled]]:bg-control-secondary-disabled [:disabled,[data-disabled]]:text-fg-control-disabled [:disabled,[data-disabled]]:shadow-none aria-pressed:bg-accent aria-pressed:text-accent-foreground aria-pressed:inset-shadow-selected-control",
      className,
    );
  }
  return cn(
    "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-(--control-radius) border border-transparent text-base outline-none hover:bg-accent data-pressed:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64 data-disabled:pointer-events-none data-disabled:opacity-64 pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 [&:active:not([aria-haspopup])]:scale-[0.97] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:-mx-0.5 [&_svg[data-composer-control-icon]]:mx-0",
    "[&_:is([data-composer-control-label],[data-chat-provider-model-picker-label])]:[text-box:trim-both_cap_alphabetic] supports-[text-box:trim-both_cap_alphabetic]:[&_:is([data-composer-control-label],[data-chat-provider-model-picker-label])]:py-1.5",
    size === "xs"
      ? "h-7 gap-1 px-1.75 font-normal text-foreground/70 text-sm hover:text-foreground dark:text-muted-foreground sm:h-6 sm:text-xs [&_svg:not([class*='size-'])]:size-4 sm:[&_svg:not([class*='size-'])]:size-3.5 [&_svg]:mx-0 [&_svg[data-composer-control-chevron]]:ms-0 [&_svg[data-composer-control-chevron]]:-me-1"
      : "h-7 gap-1.5 px-2 font-medium text-foreground/80 [&_svg:not([class*='text-'])]:text-muted-foreground hover:text-foreground sm:text-sm [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4",
    "aria-pressed:bg-accent aria-pressed:text-accent-foreground aria-pressed:hover:bg-accent/80",
    className,
  );
}

/** Button trigger props; an explicit variant overrides the owning toolbar's appearance. */
type ComposerControlProps = useRender.ComponentProps<"button"> & {
  size?: ComposerControlSize;
  variant?: ComposerControlVariant;
};

/** Renders a composable button trigger, inheriting its visual scope without changing event behavior. */
export function ComposerControl({
  className,
  size = "sm",
  variant,
  render,
  ...props
}: ComposerControlProps) {
  const inheritedVariant = useContext(ComposerControlVariantContext);
  const defaultProps = {
    className: composerControlClassName(size, variant ?? inheritedVariant, className),
    type: render ? undefined : ("button" as const),
  };
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  });
}

export function ComposerControlIcon({
  icon: Icon,
  className,
  opticalSize = "default",
  size = "sm",
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  className?: string | undefined;
  opticalSize?: "default" | "large";
  size?: ComposerControlSize;
}) {
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        "shrink-0",
        size === "xs" ? "size-3" : opticalSize === "large" ? "size-4.5" : "size-4",
        className,
      )}
      data-composer-control-icon
    />
  );
}

export function ComposerControlChevron({
  className,
  size = "sm",
}: {
  className?: string;
  size?: ComposerControlSize;
} = {}) {
  return (
    <ChevronDownIcon
      aria-hidden="true"
      className={cn(
        "shrink-0",
        size === "xs" ? "size-3 text-current opacity-50" : "size-3.5 text-icon-muted",
        className,
      )}
      data-composer-control-chevron
      strokeWidth={2.25}
    />
  );
}

export function ComposerControlSeparator({
  className,
  size = "sm",
  ...props
}: Omit<ComponentProps<typeof Separator>, "orientation"> & {
  size?: ComposerControlSize;
}) {
  return (
    <Separator
      orientation="vertical"
      className={cn("mx-0.5 hidden sm:block", size === "xs" ? "h-3.5!" : "h-4", className)}
      {...props}
    />
  );
}

/** Applies the same scoped trigger recipe to Base UI Select; selection and popup stay unchanged. */
export function ComposerSelectControl({
  className,
  children,
  size = "sm",
  variant,
  ...props
}: Omit<SelectPrimitive.Trigger.Props, "className"> & {
  className?: string | undefined;
  size?: ComposerControlSize;
  variant?: ComposerControlVariant;
}) {
  const inheritedVariant = useContext(ComposerControlVariantContext);
  return (
    <SelectPrimitive.Trigger
      className={composerControlClassName(size, variant ?? inheritedVariant, className)}
      {...props}
    >
      {children}
    </SelectPrimitive.Trigger>
  );
}
