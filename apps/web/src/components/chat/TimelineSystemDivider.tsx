/** Centers lifecycle labels in D1's recessed tag, retaining optional host actions. */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

/**
 * Render a lifecycle marker between engraved rules.
 * @param props Label and optional detail/icon; onAction preserves a host action and its tooltip.
 * expanded is only supplied for an existing disclosure. Missing detail renders no separator.
 * @returns A fixed-height tag whose long content truncates inside the available timeline width.
 */
export function TimelineSystemDivider(props: {
  readonly label: string;
  readonly detail?: ReactNode | null;
  readonly tone?: "neutral" | "danger" | "interrupted";
  readonly icon?: LucideIcon;
  readonly showDetailSeparator?: boolean;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly expanded?: boolean;
}) {
  const Icon = props.icon;
  const content = (
    <>
      {Icon ? <Icon aria-hidden className="size-3.25 shrink-0" /> : null}
      <span className="truncate">{props.label}</span>
      {props.detail ? (
        <span
          className={cn(
            "inline-flex min-w-0 items-center",
            typeof props.detail === "string" && "max-w-80 truncate",
          )}
        >
          {props.showDetailSeparator === false ? null : "·\u00a0"}
          {props.detail}
        </span>
      ) : null}
    </>
  );

  return (
    <div
      role={props.onAction ? undefined : "separator"}
      aria-label={props.onAction ? undefined : props.label}
      className={cn(
        "flex min-w-0 items-center gap-3.5 py-1 text-secondary-copy-medium text-secondary-label",
        props.tone === "danger" && "text-error",
        props.tone === "interrupted" && "text-timeline-interrupted",
      )}
    >
      <span aria-hidden className="h-px min-w-0 flex-1 bg-timeline-rule shadow-timeline-rule" />
      {props.onAction ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={props.actionLabel}
                aria-expanded={props.expanded}
                onClick={props.onAction}
                className="flex h-7 min-w-0 max-w-full cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-timeline-agent-well px-3.5 shadow-timeline-file hover:text-foreground focus-visible:outline-none focus-visible:inset-shadow-focus"
              />
            }
          >
            {content}
          </TooltipTrigger>
          <TooltipPopup side="top">{props.actionLabel}</TooltipPopup>
        </Tooltip>
      ) : (
        <span className="flex h-7 min-w-0 max-w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-timeline-agent-well px-3.5 shadow-timeline-file">
          {content}
        </span>
      )}
      <span aria-hidden className="h-px min-w-0 flex-1 bg-timeline-rule shadow-timeline-rule" />
    </div>
  );
}
