/** Shares the active seat's existing thread stream and renders one non-dismissable discussion notice. */
import { useAtomValue } from "@effect/atom-react";
import type { Discussion, EnvironmentId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { Atom } from "effect/reactivity";
import { CircleAlertIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import { useMemo } from "react";
import { useEnvironmentSettings } from "~/hooks/useSettings";
import { activeLocale, t } from "~/i18n";
import { applyProviderInstanceSettings, deriveProviderInstanceEntries } from "~/providerInstances";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "~/state/server";
import { environmentThreadDetails } from "~/state/threads";
import { Alert, AlertAction, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { discussionAlertView } from "./discussionAlert.logic";
import { discussionProviderLabel } from "./discussionModelLabel";

const NO_PENDING_REQUESTS = Atom.make(null);

/**
 * Observes requests only while a seat is active, then selects the single current notice.
 * @param props.discussion Current snapshot supplies status, material counts and seat identity.
 * @param props.environmentId Existing environment whose shared thread detail atoms are read.
 * @returns A themed alert with an optional seat-thread link; no dismissal or approval controls.
 */
export function DiscussionAlert({
  discussion,
  environmentId,
}: {
  discussion: Discussion;
  environmentId: EnvironmentId;
}) {
  const seat = discussion.seats[discussion.cursor.seatIndex];
  const active = discussion.status === "speaking" || discussion.status === "closing";
  // This selector and the live row use the same environment/thread family and underlying stream.
  const requests = useAtomValue(
    active && seat
      ? environmentThreadDetails.pendingRequestsAtom({ environmentId, threadId: seat.threadId })
      : NO_PENDING_REQUESTS,
  );
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(environmentId)) ?? EMPTY_SERVER_PROVIDERS;
  const settings = useEnvironmentSettings(environmentId);
  const providerNames = useMemo(() => {
    const instances = applyProviderInstanceSettings(
      deriveProviderInstanceEntries(providers),
      settings,
    );
    return new Map(
      discussion.seats.map((candidate) => [
        candidate.modelSelection.instanceId,
        discussionProviderLabel(
          candidate.modelSelection,
          instances.find((instance) => instance.instanceId === candidate.modelSelection.instanceId),
        ),
      ]),
    );
  }, [discussion.seats, providers, settings]);
  const view = discussionAlertView(
    discussion,
    requests,
    t.discussions,
    activeLocale,
    providerNames,
  );
  if (!view) return null;
  const Icon =
    view.variant === "warning"
      ? TriangleAlertIcon
      : view.variant === "error"
        ? CircleAlertIcon
        : InfoIcon;
  return (
    <Alert variant={view.variant}>
      <Icon aria-hidden="true" />
      <AlertDescription>{view.text}</AlertDescription>
      {view.threadId ? (
        <AlertAction>
          <Button
            variant="outline"
            size="sm"
            render={
              <Link
                to="/$environmentId/$threadId"
                params={{ environmentId, threadId: view.threadId }}
              />
            }
          >
            {t.discussions.alerts.openThread}
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}
