/** Reserves one discussion's page and reads only its title through the environment subscription. */
import { DiscussionId, EnvironmentId } from "@t3tools/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { DiscussionPlaceholderPage } from "../components/discussions/DiscussionPlaceholderPage";
import { useEnvironmentQuery } from "../state/query";
import { serverEnvironment } from "../state/server";
import { t } from "~/i18n";

/** Shows the subscribed title or the scope error without mounting future transcript controls. */
function DiscussionRoute() {
  const { environmentId, discussionId } = Route.useParams();
  const query = useEnvironmentQuery(
    serverEnvironment.discussionLive({
      environmentId: EnvironmentId.make(environmentId),
      input: { discussionId: DiscussionId.make(discussionId) },
    }),
  );
  return (
    <DiscussionPlaceholderPage
      title={query.data?.discussion.title ?? t.discussions.title}
      message={query.error ?? t.discussions.pagePlaceholder}
    />
  );
}

export const Route = createFileRoute("/_chat/discussions/$environmentId/$discussionId")({
  component: DiscussionRoute,
});
