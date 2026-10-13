/** Shows discussions across connected environments; project scope and transcript controls belong elsewhere. */
import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { MessagesSquareIcon, PlusIcon } from "lucide-react";
import { isElectron } from "../../env";
import { t } from "~/i18n";
import { useProjects } from "../../state/entities";
import { environmentSummaries } from "../../state/presentation";
import { formatEnvironmentQueryError } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { SidebarInset } from "../ui/sidebar";
import { PixelAvatar } from "./PixelAvatar";
import {
  discussionListRow,
  groupDiscussions,
  type ScopedDiscussionListItem,
} from "./discussionList.logic";

// Dynamic atom dependencies release subscriptions for disconnected environments.
// The runtime owns connection retries; full list snapshots replace previous values.
const discussionListsAtom = Atom.make((get) => {
  const items: ScopedDiscussionListItem[] = [];
  const errors: { environmentId: EnvironmentId; message: string }[] = [];
  let pending = false;
  for (const environmentId of get(environmentSummaries.connectedEnvironmentIdsAtom)) {
    const result = get(serverEnvironment.discussionsLive({ environmentId, input: {} }));
    const value = Option.getOrNull(AsyncResult.value(result));
    if (value) items.push(...value.discussions.map((item) => ({ ...item, environmentId })));
    if (result._tag === "Failure")
      errors.push({ environmentId, message: formatEnvironmentQueryError(result.cause) });
    else if (value === null) pending = true;
  }
  return { items, errors, pending };
});

/** Renders full list snapshots with route links; initial loading and failures do not masquerade as an empty list. */
export function DiscussionListPage() {
  const list = useAtomValue(discussionListsAtom);
  const projects = useProjects();
  const groups = groupDiscussions(list.items, t.discussions);
  return (
    <SidebarInset>
      <WorkspacePageHeader electron={isElectron} className="border-b">
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{t.discussions.title}</h1>
        <div className="shrink-0">
          <Button size="sm" render={<Link to="/discussions/new" />}>
            <PlusIcon />
            {t.discussions.newTitle}
          </Button>
        </div>
      </WorkspacePageHeader>
      <div className="scrollbar-gutter-both flex min-h-0 flex-1 flex-col overflow-y-auto px-8 py-7">
        <div className="mx-auto w-full max-w-190 space-y-7">
          {list.errors.map((error) => (
            <p
              key={error.environmentId}
              role="alert"
              className="text-sm text-destructive-foreground"
            >
              {t.discussions.loadFailed}: {error.message}
            </p>
          ))}
          {list.pending ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t.discussions.loading}
            </p>
          ) : null}
          {groups.map((group) => (
            <section key={group.kind} aria-label={group.label} className="space-y-2">
              <h2 className="px-1 text-sm font-normal text-muted-foreground">{group.label}</h2>
              <ul className="divide-y rounded-lg border bg-card">
                {group.items.map((item) => {
                  const row = discussionListRow(item, t.discussions);
                  const project = projects.find(
                    (project) =>
                      project.environmentId === item.environmentId && project.id === item.projectId,
                  );
                  return (
                    <li
                      key={`${item.environmentId}:${item.id}`}
                      className="first:rounded-t-lg last:rounded-b-lg"
                    >
                      <Link
                        to="/discussions/$environmentId/$discussionId"
                        params={{ environmentId: item.environmentId, discussionId: item.id }}
                        className="flex min-h-16 items-center gap-3.5 rounded-[inherit] px-4 py-3 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                        <span
                          className="flex shrink-0 items-center -space-x-1.5"
                          aria-label={item.seats.map((seat) => seat.personaName).join("、")}
                        >
                          {item.seats.map((seat, index) => (
                            <span key={seat.id} className="rounded-lg ring-2 ring-card">
                              <PixelAvatar role={seat.avatar} seat={index + 1} size={24} />
                            </span>
                          ))}
                        </span>
                        <span className="max-w-28 truncate text-xs text-muted-foreground">
                          {project?.title ?? t.discussions.deletedProject}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {row.roundLabel}
                        </span>
                        <Badge variant={row.badgeVariant}>{row.statusLabel}</Badge>
                        <time
                          dateTime={item.updatedAt}
                          className="w-20 shrink-0 text-right text-xs text-muted-foreground"
                        >
                          {formatRelativeTimeLabel(item.updatedAt)}
                        </time>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
        {groups.length === 0 && !list.pending && list.errors.length === 0 ? (
          <div className="flex flex-1 items-center justify-center pb-12">
            <Empty size="compact">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessagesSquareIcon />
                </EmptyMedia>
                <EmptyTitle>{t.discussions.empty}</EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" render={<Link to="/discussions/new" />}>
                  <PlusIcon />
                  {t.discussions.newTitle}
                </Button>
              </EmptyContent>
            </Empty>
          </div>
        ) : null}
      </div>
    </SidebarInset>
  );
}
