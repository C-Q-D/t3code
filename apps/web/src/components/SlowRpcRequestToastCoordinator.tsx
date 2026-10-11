/** Shows a consolidated warning for slow RPC acknowledgements and their start times. */
import { t } from "~/i18n";
import { useEffect, useRef } from "react";

import { type SlowRpcAckRequest, useSlowRpcAckRequests } from "../rpc/requestLatencyState";
import { toastManager } from "./ui/toast";

/** Describes the nonempty requests batch using its count and lowest elapsed warning threshold, in seconds. */
function describeSlowRequests(requests: ReadonlyArray<SlowRpcAckRequest>): string {
  const count = requests.length;
  // Thresholds vary per method, so report the smallest one the batch has passed.
  const thresholdSeconds = Math.round(
    Math.min(...requests.map((request) => request.thresholdMs)) / 1000,
  );

  return t.app.requests.slowDescription(count, thresholdSeconds);
}

/** Renders request tags and start times for the supplied slow requests without changing their order. */
function SlowRequestDetails({ requests }: { requests: ReadonlyArray<SlowRpcAckRequest> }) {
  return (
    <ul className="space-y-2.5 text-xs text-muted-foreground">
      {requests.map((request) => (
        <li
          className="min-w-0 border-border/50 border-b pb-2 last:border-b-0 last:pb-0"
          key={request.requestId}
        >
          <div className="wrap-break-word font-medium text-foreground">{request.tag}</div>
          <div className="mt-0.5 text-3xs opacity-75">
            {t.app.requests.started}
            {new Date(request.startedAt).toLocaleTimeString()}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Maintains one warning toast for outstanding slow RPC requests and closes it when none remain or on unmount. */
export function SlowRpcRequestToastCoordinator() {
  const slowRequests = useSlowRpcAckRequests();
  const toastIdRef = useRef<ReturnType<typeof toastManager.add> | null>(null);

  useEffect(() => {
    if (slowRequests.length === 0) {
      if (toastIdRef.current !== null) {
        toastManager.close(toastIdRef.current);
        toastIdRef.current = null;
      }
      return;
    }

    const nextToast = {
      data: {
        expandableContent: <SlowRequestDetails requests={slowRequests} />,
        expandableDescriptionTrigger: true,
        expandableLabels: { collapse: t.app.requests.hide, expand: t.app.requests.show },
      },
      description: describeSlowRequests(slowRequests),
      timeout: 0,
      title: t.app.requests.slowTitle,
      type: "warning" as const,
    };

    if (toastIdRef.current === null) {
      toastIdRef.current = toastManager.add(nextToast);
    } else {
      toastManager.update(toastIdRef.current, nextToast);
    }
  }, [slowRequests]);

  useEffect(
    () => () => {
      if (toastIdRef.current !== null) {
        toastManager.close(toastIdRef.current);
      }
    },
    [],
  );

  return null;
}
