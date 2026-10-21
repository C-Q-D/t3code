/** Presents durable thread state in the timeline overlay, retaining the caller's explicit recovery action. */
import { memo, type ReactNode } from "react";

import { Button } from "../ui/button";
import { Alert, AlertAction, AlertDescription } from "../ui/alert";

/**
 * Displays settled, snoozed, or newly woken state; the caller owns visibility and recovery.
 */
export const ThreadStatusLine = memo(function ThreadStatusLine(props: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly actionLabel: string;
  readonly actionDisabled?: boolean;
  readonly emphasized?: boolean;
  readonly onAction: () => void;
  // Set when the label reads the clock, so the line updates as time passes.
  readonly clockMinute?: string;
}) {
  return (
    <div data-chat-thread-status-line="true" className="pointer-events-auto">
      <Alert variant="sand" surface="glass" size="status-bar" role="status">
        {props.icon}
        <AlertDescription>
          <span className={props.emphasized ? "font-semibold" : undefined}>{props.label}</span>
        </AlertDescription>
        <AlertAction>
          <Button
            size="md"
            variant="secondary"
            disabled={props.actionDisabled}
            onClick={props.onAction}
          >
            {props.actionLabel}
          </Button>
        </AlertAction>
      </Alert>
    </div>
  );
});
