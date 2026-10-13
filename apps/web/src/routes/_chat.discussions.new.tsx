/** Hosts discussion creation under the chat layout, retaining its sidebar. */
import { createFileRoute } from "@tanstack/react-router";
import { DiscussionSeatDraftPage } from "../components/discussions/DiscussionSeatDraftPage";

/** Displays the complete creation form; provider execution requires its explicit start command. */
function NewDiscussionRoute() {
  return <DiscussionSeatDraftPage />;
}

export const Route = createFileRoute("/_chat/discussions/new")({ component: NewDiscussionRoute });
