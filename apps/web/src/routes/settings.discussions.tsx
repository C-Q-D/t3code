/** Routes the discussion template settings page; environment selection is owned by settings scope. */
import { createFileRoute } from "@tanstack/react-router";
import { DiscussionSettings } from "../components/settings/DiscussionSettings";

export const Route = createFileRoute("/settings/discussions")({ component: DiscussionSettings });
