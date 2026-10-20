/** Shared alert surfaces and densities; callers supply message content and actions. */
import { cva, type VariantProps } from "class-variance-authority";
import { Children, isValidElement } from "react";
import type * as React from "react";

import { cn } from "~/lib/utils";

const alertVariants = cva("relative rounded-xl border px-3.5 py-3 text-card-foreground text-sm", {
  defaultVariants: {
    surface: "default",
    variant: "default",
  },
  variants: {
    // "glass" floats the alert over content; alert-glass tints from data-variant.
    surface: {
      default: "",
      glass: "alert-glass",
    },
    variant: {
      default: "bg-transparent dark:bg-input/32 [&_svg]:text-muted-foreground",
      sidebar:
        "rounded-lg border-sidebar-border bg-sidebar-control-surface px-2 py-1.5 text-[11px] leading-4 [&_[data-slot=alert-description]]:block [&_[data-slot=alert-description]]:text-sidebar-muted-foreground",
      error:
        "border-error/32 bg-error-surface text-error-foreground [&_[data-slot=alert-description]]:text-error-foreground/80 [&_svg]:text-error",
      info: "border-info/32 bg-info/4 [&_svg]:text-info",
      success: "border-success/32 bg-success/4 [&_svg]:text-success",
      warning:
        "border-warning/32 bg-warning-surface text-warning-foreground [&_[data-slot=alert-description]]:text-warning-foreground/80 [&_svg]:text-warning",
      // W7 solid sand notice, shared by Markdown callouts and status banners.
      sand: "rounded-notice border-0 bg-warning-surface px-3.5 py-2.5 text-body leading-callout text-warning-foreground shadow-notice-sand text-shadow-none [--lucide-hue-override:currentColor] [&>div]:items-start [&>div]:gap-2.5 [&_[data-slot=alert-icon]]:mt-0.75 [&_[data-slot=alert-icon]]:size-4 [&_[data-slot=alert-content]]:block [&_[data-slot=alert-title]]:inline [&_[data-slot=alert-title]]:font-bold [&_[data-slot=alert-title]]:text-status-warning-foreground [&_[data-slot=alert-description]]:inline [&_[data-slot=alert-description]]:text-inherit [&>div>div>svg]:text-warning",
    },
    size: {
      // 补充屏-1 T2 / W7: 44px status bars use 16px corners and 15px leading icons.
      "status-bar":
        "min-h-11 rounded-overlay py-1.5 pr-1.5 pl-3.5 text-secondary-copy-large leading-5 [&>div]:min-h-8 [&>div]:items-center [&>div]:gap-2.5 [&>div]:pt-0 [&_[data-slot=alert-icon]]:mt-0 [&_[data-slot=alert-icon]]:size-3.75 [&>div>div>svg]:size-3.75 [&_[data-slot=alert-actions]]:h-auto [&_[data-slot=alert-actions]]:self-center",
    },
  },
});

function alertChildSlot(child: React.ReactElement): string | undefined {
  const propsSlot = (child.props as Record<string, string | undefined>)["data-slot"];
  if (propsSlot) {
    return propsSlot;
  }

  const type = child.type as { displayName?: string; name?: string };
  switch (type.displayName ?? type.name) {
    case "AlertAction":
      return "alert-action";
    case "AlertTitle":
      return "alert-title";
    case "AlertDescription":
      return "alert-description";
    default:
      return undefined;
  }
}

/** Renders slotted content at the selected density; omitted size preserves existing layouts. */
function Alert({
  className,
  variant,
  surface,
  size,
  controlAlignment = "center",
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof alertVariants> & {
    controlAlignment?: "center" | "first-line";
  }) {
  const icon: React.ReactNode[] = [];
  const content: React.ReactNode[] = [];
  const action: React.ReactNode[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      content.push(child);
      return;
    }
    const slot = alertChildSlot(child);
    if (slot === "alert-action") {
      action.push(child);
    } else if (slot === "alert-title" || slot === "alert-description") {
      content.push(child);
    } else {
      icon.push(child);
    }
  });

  return (
    <div
      className={cn(alertVariants({ surface, variant, size }), className)}
      data-slot="alert"
      data-variant={variant ?? "default"}
      role="alert"
      {...props}
    >
      <div
        className={cn(
          "flex gap-2",
          controlAlignment === "first-line" ? "items-start" : "items-center",
          controlAlignment === "first-line" &&
            action.length > 0 &&
            "min-h-7 pt-1 sm:min-h-6 sm:pt-0.5",
        )}
      >
        {icon.length > 0 && (
          <div
            data-slot="alert-icon"
            className={cn(
              "flex shrink-0 items-center justify-center",
              controlAlignment === "first-line"
                ? "h-lh w-4 [&>svg]:size-4"
                : "size-4 [&>svg]:size-full",
            )}
          >
            {icon}
          </div>
        )}
        {content.length > 0 && (
          <div data-slot="alert-content" className="flex min-w-0 flex-1 flex-col gap-0.5">
            {content}
          </div>
        )}
        {action.length > 0 && (
          <div
            data-slot="alert-actions"
            className={cn(
              "flex shrink-0 items-center",
              controlAlignment === "first-line" ? "h-lh self-start" : "self-center",
            )}
          >
            {action}
          </div>
        )}
      </div>
    </div>
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("font-medium", className)} data-slot="alert-title" {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-2.5 text-muted-foreground", className)}
      data-slot="alert-description"
      {...props}
    />
  );
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex gap-1", className)} data-slot="alert-action" {...props} />;
}

AlertTitle.displayName = "AlertTitle";
AlertDescription.displayName = "AlertDescription";
AlertAction.displayName = "AlertAction";

export { Alert, AlertTitle, AlertDescription, AlertAction };
