/** Groups settings rows on the shared graphite card surface; rows own their content and controls. */
import type { ComponentProps } from "react";

import { cn } from "../../lib/utils";

/**
 * Renders a grouped stone card or a plain stack from props.
 * divided remains opt-in; the design's default uses spacing rather than separators.
 */
export function SettingsGroup({
  variant = "grouped",
  divided = false,
  className,
  ...props
}: ComponentProps<"div"> & {
  variant?: "grouped" | "plain";
  divided?: boolean;
}) {
  return (
    <div
      data-slot="settings-group"
      {...props}
      className={cn(
        "relative overflow-visible text-foreground",
        variant === "grouped"
          ? "stone-settings-group rounded-card-surface bg-surface-raised p-1 shadow-settings-group-elevation"
          : "space-y-1",
        variant === "grouped" && divided && "divide-y divide-border",
        className,
      )}
    />
  );
}
