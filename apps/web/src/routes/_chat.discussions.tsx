/** Keeps discussion routes under the authenticated chat layout and its persistent sidebar. */
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_chat/discussions")({ component: Outlet });
