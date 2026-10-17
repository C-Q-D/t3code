/** Shows connected-environment discussions as K2 tables and archive rows; navigation and subscriptions retain their existing ownership. */
import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { MessagesSquareIcon, PlusIcon } from "lucide-react";
import { t } from "~/i18n";
import { useProjects } from "../../state/entities";
import { environmentSummaries } from "../../state/presentation";
import { formatEnvironmentQueryError } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { useTitlebarSlot } from "../frame/titlebarSlot";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { PixelSeat } from "./PixelSeat";
import {
  discussionListRow,
  discussionListSeats,
  groupDiscussions,
  type ScopedDiscussionListItem,
} from "./discussionList.logic";

// Disconnected environments leave the atom's dependencies; the subscription factory
// releases their underlying subscriptions after its idle TTL.
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

/** Renders K2–K4 snapshots and titlebar portals; partial failures remain visible alongside available discussions. */
export function DiscussionListPage() {
  const list = useAtomValue(discussionListsAtom);
  const projects = useProjects();
  const projectsByEnvironmentAndId = new Map(
    projects.map((project) => [JSON.stringify([project.environmentId, project.id]), project]),
  );
  const groups = groupDiscussions(list.items, t.discussions);
  const titlebar = useTitlebarSlot({
    breadcrumb: (
      <h1 className="truncate font-serif text-chat-title font-bold">{t.discussions.title}</h1>
    ),
    actions: (
      <Button size="toolbar" render={<Link to="/discussions/new" />}>
        <PlusIcon className="size-3.75" />
        {t.discussions.newTitle}
      </Button>
    ),
  });
  return (
    <SidebarInset className="h-full min-h-0">
      {titlebar}
      <div className="discussion-list scrollbar-gutter-both flex min-h-0 flex-1 flex-col overflow-y-auto px-8 pt-5 pb-8">
        <div className="mx-auto flex w-full max-w-240 flex-col gap-3.5">
          {list.errors.map((error) => (
            <p key={error.environmentId} role="alert" className="text-body text-error">
              {t.discussions.loadFailed}: {error.message}
            </p>
          ))}
          {list.pending ? (
            <p role="status" className="text-body text-secondary-label">
              {t.discussions.loading}
            </p>
          ) : null}
          {groups.map((group) => (
            <section key={group.kind} aria-label={group.label} className="flex flex-col gap-3.5">
              <h2
                className={`px-1 text-secondary-copy-large font-semibold text-code-foreground ${group.kind === "ended" ? "pt-3.5" : ""}`}
              >
                {group.label}
              </h2>
              <ul
                className={
                  group.kind === "ongoing"
                    ? "discussion-list-grid grid grid-cols-3 gap-4"
                    : "discussion-list-archive flex flex-col gap-0.5 rounded-card-large bg-well-raised p-1.5 shadow-discussion-list-archive"
                }
              >
                {group.items.map((item) => {
                  const row = discussionListRow(item, t.discussions);
                  const project = projectsByEnvironmentAndId.get(
                    JSON.stringify([item.environmentId, item.projectId]),
                  );
                  const ended = group.kind === "ended";
                  const status = (
                    <span
                      className={`inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-tag px-2.25 text-secondary-copy font-semibold text-shadow-none ${row.badgeVariant === "info" ? "bg-status-info text-info" : row.badgeVariant === "warning" ? "bg-warning-surface text-status-warning-foreground" : "bg-secondary text-code-foreground"}`}
                    >
                      {row.statusLabel}
                    </span>
                  );
                  const time = (
                    <time
                      dateTime={item.updatedAt}
                      className="w-16 shrink-0 text-right text-secondary-copy text-secondary-label"
                    >
                      {formatRelativeTimeLabel(item.updatedAt)}
                    </time>
                  );
                  const meta = (
                    <span
                      className={`min-w-0 flex-1 truncate text-secondary-copy text-secondary-label ${!project ? "italic" : ""}`}
                    >
                      {project?.title ?? t.discussions.deletedProject} · {row.roundLabel}
                    </span>
                  );
                  return (
                    <li key={`${item.environmentId}:${item.id}`} className="min-w-0">
                      <Link
                        to="/discussions/$environmentId/$discussionId"
                        params={{ environmentId: item.environmentId, discussionId: item.id }}
                        className={
                          ended
                            ? "flex min-h-14 items-center gap-3.5 rounded-discussion-list-row px-3.5 py-1.5 outline-none hover:bg-secondary hover:shadow-discussion-list-hover focus-visible:inset-shadow-focus"
                            : "flex flex-col gap-2.5 rounded-slab bg-surface-raised p-2 shadow-raise-l outline-none hover:bg-secondary focus-visible:inset-shadow-focus"
                        }
                      >
                        {/* Name participants once; decorative seats must not add individual image names to the link. */}
                        <span className="sr-only">
                          {item.seats.map((seat) => seat.personaName).join("、")}
                        </span>
                        {ended ? (
                          <span
                            aria-hidden="true"
                            className="flex min-w-15.5 shrink-0 items-center -space-x-1.5"
                          >
                            {item.seats.map((seat, index) => (
                              <span
                                key={seat.id}
                                className="relative rounded-discussion-list-seat ring-2 ring-well-raised"
                                style={{ zIndex: item.seats.length - index }}
                              >
                                <PixelSeat
                                  role={seat.avatar}
                                  seatIndex={index}
                                  state="idle"
                                  size={24}
                                  label={seat.personaName}
                                />
                              </span>
                            ))}
                          </span>
                        ) : (
                          <div
                            aria-hidden="true"
                            className="relative h-37.5 overflow-hidden rounded-card-row bg-well-surface shadow-discussion-list-well"
                          >
                            <div className="absolute top-11 left-1/2 flex size-24 -translate-x-1/2 flex-col items-center justify-center rounded-full bg-discussion-list-table shadow-discussion-list-table">
                              <span className="font-serif text-discussion-table-title font-bold">
                                {item.cursor.round}
                              </span>
                              <span className="text-discussion-list-unit text-secondary-label">
                                {t.discussions.listRoundUnit}
                              </span>
                            </div>
                            {discussionListSeats(item).map(({ seat, index, x, y, state, size }) => (
                              <span
                                key={seat.id}
                                className="absolute flex -translate-x-1/2 -translate-y-1/2"
                                style={{ left: `calc(50% + ${x}px)`, top: y }}
                              >
                                <PixelSeat
                                  role={seat.avatar}
                                  seatIndex={index}
                                  state={state}
                                  size={size}
                                  label={seat.personaName}
                                />
                              </span>
                            ))}
                          </div>
                        )}
                        <div
                          className={
                            ended
                              ? "flex min-w-0 flex-1 flex-col"
                              : "flex min-w-0 flex-col gap-1.5 px-2 pb-1.5"
                          }
                        >
                          <span className="truncate text-body font-semibold">{item.title}</span>
                          {ended ? (
                            meta
                          ) : (
                            <div className="flex min-w-0 items-center gap-2">
                              {status}
                              {meta}
                              {time}
                            </div>
                          )}
                        </div>
                        {ended ? (
                          <>
                            {status}
                            {time}
                          </>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
        {groups.length === 0 && !list.pending && list.errors.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3.5 pb-10">
            <div aria-hidden="true" className="relative h-35 w-55">
              <span className="discussion-list-empty-seat absolute top-11.5 left-6 size-7 rounded-discussion-list-seat" />
              <span className="discussion-list-empty-seat absolute top-0 left-24 size-7 rounded-discussion-list-seat" />
              <span className="discussion-list-empty-seat absolute top-11.5 right-6 size-7 rounded-discussion-list-seat" />
              <div className="absolute top-9.5 left-1/2 flex size-30 -translate-x-1/2 items-center justify-center rounded-full bg-discussion-list-empty-table text-secondary-label shadow-discussion-list-empty-table">
                <MessagesSquareIcon className="size-7.5" strokeWidth={1.5} />
              </div>
            </div>
            <h2 className="mt-2.5 font-serif text-discussion-list-empty-title font-bold">
              {t.discussions.empty}
            </h2>
            <Link
              to="/discussions/new"
              className="discussion-list-empty-action inline-flex h-9 items-center gap-1.5 rounded-full bg-primary pr-4 pl-3 text-control font-bold text-primary-foreground shadow-primary-button outline-none hover:bg-message-action-hover focus-visible:inset-shadow-focus"
            >
              <PlusIcon className="size-3.75" />
              {t.discussions.newTitle}
            </Link>
          </div>
        ) : null}
      </div>
    </SidebarInset>
  );
}
