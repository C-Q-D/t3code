/** Reserves the all-project discussion list route until its list view is available. */
import { createFileRoute } from "@tanstack/react-router";
import { DiscussionPlaceholderPage } from "../components/discussions/DiscussionPlaceholderPage";
import { t } from "~/i18n";

/** Displays the list route's localized title and availability message. */
function DiscussionListRoute() {
  return (
    <DiscussionPlaceholderPage
      title={t.discussions.title}
      message={t.discussions.listPlaceholder}
    />
  );
}

export const Route = createFileRoute("/_chat/discussions/")({ component: DiscussionListRoute });
