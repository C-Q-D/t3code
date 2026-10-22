/** Authenticates saved web pages and registers their title in the shared window frame. */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTitlebarSlot } from "../components/frame/titlebarSlot";
import { t } from "../i18n";

export const Route = createFileRoute("/web")({
  beforeLoad: async ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: WebPagesRoute,
});

/** Keeps the web group breadcrumb in the frame while its content occupies the workspace. */
function WebPagesRoute() {
  const titlebar = useTitlebarSlot({
    breadcrumb: <h1 className="font-serif text-plan-title font-bold">{t.webPages.title}</h1>,
  });
  return (
    <>
      {titlebar}
      <div className="flex h-full min-h-0 flex-col">{t.webPages.title}</div>
    </>
  );
}
