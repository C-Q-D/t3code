/** Owns chat routing and find retention while app initialization owns global shortcuts. */
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { ThreadRouteView } from "../components/ThreadRouteView";
import { resolveThreadRouteTarget } from "../threadRoutes";
import { retainThreadFindForRoute } from "../components/chat/threadFindStore";
import { ThreadLinkPrompt } from "../components/promptLinks/ThreadLinkPrompt";
import { useThreadRouteTarget } from "../hooks/useThreadRouteTarget";

/** Keeps draft promotion in one chat view; full-page utilities own their own route content. */
function ChatRouteLayout() {
  const threadTarget = useThreadRouteTarget();
  return (
    <>
      {threadTarget?.kind === "server" ? (
        <ThreadLinkPrompt threadRef={threadTarget.threadRef} />
      ) : null}
      {threadTarget ? <ThreadRouteView target={threadTarget} /> : <Outlet />}
    </>
  );
}

export const Route = createFileRoute("/_chat")({
  beforeLoad: async ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: ChatRouteLayout,
  // Every match carries the whole location's params, so this layout sees the thread route's too.
  onEnter: ({ params }) => retainThreadFindForRouteMatch(params),
  onStay: ({ params }) => retainThreadFindForRouteMatch(params),
  onLeave: () => retainThreadFindForRoute({ modalPage: false, threadRef: null }),
});

/** Preserves find state only for the server thread currently owned by this route. */
function retainThreadFindForRouteMatch(
  params: Partial<Record<"environmentId" | "threadId", string>>,
) {
  const target = resolveThreadRouteTarget(params);
  retainThreadFindForRoute({
    modalPage: false,
    threadRef: target?.kind === "server" ? target.threadRef : null,
  });
}
