import { t } from "~/i18n";
import { parseNewThreadLink } from "@t3tools/shared/promptLinks";
import { createFileRoute, useLocation } from "@tanstack/react-router";
import { NewThreadLinkView } from "../components/promptLinks/NewThreadLinkView";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../components/ui/empty";
import { SidebarInset } from "../components/ui/sidebar";

/**
 * Handles /new within the workspace, returning a link view or a visible parse error.
 * Reads the raw query because router search parsing turns `prompt=123` into a number.
 * Mount through the router under AppSidebarLayout; page height comes from the
 * parent workspace rather than the viewport.
 */
function NewThreadLinkRoute() {
  const search = useLocation({ select: (location) => location.searchStr });
  const parsed = parseNewThreadLink(search);
  if (!parsed.ok) {
    return (
      <SidebarInset className="h-full min-h-0 overflow-hidden overscroll-y-none">
        <Empty className="flex-1">
          <EmptyHeader className="max-w-md">
            <EmptyTitle>{t.app.desktopWebLinkCouldNotOpen}</EmptyTitle>
            <EmptyDescription>{parsed.error}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </SidebarInset>
    );
  }
  return <NewThreadLinkView key={search} link={parsed.value} />;
}

export const Route = createFileRoute("/_chat/new")({
  component: NewThreadLinkRoute,
});
