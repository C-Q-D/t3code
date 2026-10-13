/** Reserves the full-page discussion creation route without starting any provider session. */
import { createFileRoute } from "@tanstack/react-router";
import { DiscussionPlaceholderPage } from "../components/discussions/DiscussionPlaceholderPage";
import { t } from "~/i18n";

/** Displays the creation route's localized title and availability message. */
function NewDiscussionRoute() {
  return (
    <DiscussionPlaceholderPage
      title={t.discussions.newTitle}
      message={t.discussions.newPlaceholder}
    />
  );
}

export const Route = createFileRoute("/_chat/discussions/new")({ component: NewDiscussionRoute });
