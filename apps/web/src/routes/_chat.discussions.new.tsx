/** Reserves the full-page discussion creation route without starting any provider session. */
import { createFileRoute } from "@tanstack/react-router";
import { DiscussionSeatDraftPage } from "../components/discussions/DiscussionSeatDraftPage";

/** Hosts local seat editing while the full creation form remains a later task. */
function NewDiscussionRoute() {
  return <DiscussionSeatDraftPage />;
}

export const Route = createFileRoute("/_chat/discussions/new")({ component: NewDiscussionRoute });
