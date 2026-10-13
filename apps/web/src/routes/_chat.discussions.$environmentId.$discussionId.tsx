/** Validates discussion links before subscribing to one registered environment. */
import { DiscussionId, EnvironmentId } from "@t3tools/contracts";
import { createFileRoute } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import { DiscussionPage, DiscussionPageMessage } from "../components/discussions/DiscussionPage";
import { discussionRouteState } from "../components/discussions/discussionPage.logic";
import { useEnvironments } from "../state/environments";
import { useEnvironmentQuery } from "../state/query";
import { serverEnvironment } from "../state/server";
import { t } from "~/i18n";

const decodeEnvironmentId = Schema.decodeOption(EnvironmentId);
const decodeDiscussionId = Schema.decodeOption(DiscussionId);

/** Keeps invalid links and missing discussions in the workspace without creating an invalid subscription. */
function DiscussionRoute() {
  const { environmentId, discussionId } = Route.useParams();
  const environments = useEnvironments();
  const parsedEnvironmentId = decodeEnvironmentId(environmentId);
  const state = discussionRouteState(
    parsedEnvironmentId,
    decodeDiscussionId(discussionId),
    environments.isReady,
    Option.isSome(parsedEnvironmentId) &&
      environments.presentationById.has(parsedEnvironmentId.value),
  );
  // The runtime owns connection retries and subscription release; null never starts a subscription.
  const query = useEnvironmentQuery(
    state.kind === "subscribe"
      ? serverEnvironment.discussionLive({
          environmentId: state.environmentId,
          input: { discussionId: state.discussionId },
        })
      : null,
  );
  const copy = t.discussions.page;
  if (state.kind === "invalid")
    return <DiscussionPageMessage title={copy.notFound} description={copy.notFoundDescription} />;
  if (state.kind === "waiting") return <DiscussionPageMessage title={null} />;
  if (state.kind === "unknown-environment")
    return (
      <DiscussionPageMessage
        title={copy.unknownEnvironment}
        description={copy.unknownEnvironmentDescription}
      />
    );
  if (query.error) {
    const notFound =
      query.failure?._tag === "DiscussionError" && query.failure.reason === "not_found";
    return (
      <DiscussionPageMessage
        title={notFound ? copy.notFound : query.error}
        description={notFound ? copy.notFoundDescription : undefined}
      />
    );
  }
  if (query.data?.deleted)
    return <DiscussionPageMessage title={copy.deleted} description={copy.deletedDescription} />;
  return query.data && state.kind === "subscribe" ? (
    <DiscussionPage
      key={`${state.environmentId}:${state.discussionId}`}
      discussion={query.data.discussion}
      environmentId={state.environmentId}
    />
  ) : (
    <DiscussionPageMessage title={null} />
  );
}

export const Route = createFileRoute("/_chat/discussions/$environmentId/$discussionId")({
  component: DiscussionRoute,
});
