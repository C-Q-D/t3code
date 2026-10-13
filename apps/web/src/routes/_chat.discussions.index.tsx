/** Mounts the all-project discussion list under the persistent chat sidebar. */
import { createFileRoute } from "@tanstack/react-router";
import { DiscussionListPage } from "../components/discussions/DiscussionListPage";

export const Route = createFileRoute("/_chat/discussions/")({ component: DiscussionListPage });
