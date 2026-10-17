/** Owns the T1 floating scroll action's appearance; ChatView owns visibility and scroll behavior. */
import { ArrowDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "~/lib/utils";

/** Native button contract so the caller keeps its focus, pointer, and scroll callbacks unchanged. */
type TimelineScrollToBottomButtonProps = ComponentProps<"button">;

/** Renders the feature's 32px stone key and forwards native button props without handling scrolling. */
export function TimelineScrollToBottomButton({
  children,
  className,
  ...props
}: TimelineScrollToBottomButtonProps) {
  return (
    <button type="button" {...props} className={cn("timeline-scroll-button", className)}>
      <ArrowDownIcon aria-hidden="true" className="size-3.5" />
      {children}
    </button>
  );
}
