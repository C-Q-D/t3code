/** Displays the discussion frame and speaking sequence; transcript and command controls are separate work. */
import type { Discussion, EnvironmentId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { EllipsisIcon, PauseIcon, PlayIcon } from "lucide-react";
import { isElectron } from "../../env";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { useProjects } from "../../state/entities";
import { formatDayAwareTimestamp } from "../../timestampFormat";
import { t } from "~/i18n";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { SidebarInset } from "../ui/sidebar";
import { PixelAvatar } from "./PixelAvatar";
import { DiscussionWave } from "./DiscussionWave";
import { discussionSeatMotion } from "./discussionMotion.logic";
import { DiscussionTranscript } from "./DiscussionTranscript";
import { discussionSeatColor } from "./discussionSeatColors";
import {
  discussionHeaderView,
  discussionSeatStrip,
  type DiscussionStripItem,
} from "./discussionPage.logic";

/**
 * Keeps failures inside the workspace with a recovery link.
 * @param props.title Error title, or null while directory/subscription data is pending.
 * @param props.description Optional explanation; query failures retain the query's message.
 * @returns Generic discussion header and an Empty message, without a loading animation.
 */
export function DiscussionPageMessage({
  title,
  description,
}: {
  title: string | null;
  description?: string | undefined;
}) {
  return (
    <SidebarInset>
      <WorkspacePageHeader electron={isElectron} className="border-b">
        <h1 className="min-w-0 truncate text-sm font-medium">{t.discussions.title}</h1>
      </WorkspacePageHeader>
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        {title ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{title}</EmptyTitle>
              {description ? <EmptyDescription>{description}</EmptyDescription> : null}
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" size="sm" render={<Link to="/discussions" />}>
                {t.discussions.page.back}
              </Button>
            </EmptyContent>
          </Empty>
        ) : null}
      </div>
    </SidebarInset>
  );
}

/**
 * Renders a segment-aware connection using the seats on either side of the label.
 * @param props.left Previous seat in the visible sequence.
 * @param props.right Following seat in the visible sequence.
 * @returns A flexible solid gradient only for completed-to-completed/current transitions.
 */
function SeatConnection({
  left,
  right,
}: {
  left: Extract<DiscussionStripItem, { kind: "seat" }>;
  right: Extract<DiscussionStripItem, { kind: "seat" }>;
}) {
  const solid = left.state === "done" && (right.state === "done" || right.state === "current");
  const leftColor = discussionSeatColor(left.index + 1).color;
  const rightColor = discussionSeatColor(right.index + 1).color;
  return (
    <span
      aria-hidden="true"
      className="mx-3.5 min-w-6 flex-1"
      style={
        solid
          ? {
              height: 2,
              borderRadius: 1,
              background: `linear-gradient(90deg, color-mix(in srgb, ${leftColor} 55%, transparent), color-mix(in srgb, ${rightColor} 55%, transparent))`,
            }
          : { borderTop: "1px dashed color-mix(in srgb, var(--foreground) 22%, transparent)" }
      }
    />
  );
}

/**
 * Displays each seat's turn state in one horizontally scrollable row.
 * @param props.discussion Current snapshot; pause suppresses the speaking appearance.
 * @returns Fixed-height seat strip with labels at their planned turn boundaries.
 */
function DiscussionSeatBar({ discussion }: { discussion: Discussion }) {
  const items = discussionSeatStrip(discussion);
  return (
    <div
      className="flex h-15 shrink-0 items-center overflow-x-auto border-b px-6"
      role="list"
      aria-label={t.discussions.page.seats}
    >
      {items.map((item, position) => {
        const previous = items
          .slice(0, position)
          .findLast((candidate) => candidate.kind === "seat");
        const following = items.slice(position).find((candidate) => candidate.kind === "seat");
        const connection =
          position > 0 &&
          items[position - 1]?.kind === "seat" &&
          previous?.kind === "seat" &&
          following?.kind === "seat" ? (
            <SeatConnection left={previous} right={following} />
          ) : null;
        if (item.kind === "segment")
          return (
            <Fragment key={`segment-${item.label}-${item.round ?? ""}`}>
              {connection}
              <span className="mr-4 shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                {item.label === "round"
                  ? t.discussions.round(item.round ?? discussion.cursor.round)
                  : t.discussions.page[item.label]}
              </span>
            </Fragment>
          );
        const seat = discussion.seats[item.index];
        if (!seat) return null;
        const segment = items
          .slice(0, position)
          .findLast((candidate) => candidate.kind === "segment");
        const motion = discussionSeatMotion(item, discussion.status);
        return (
          <Fragment key={`seat-${segment?.label}-${segment?.round ?? ""}-${seat.id}`}>
            {connection}
            <div
              role="listitem"
              className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm"
            >
              <PixelAvatar
                role={seat.avatar}
                seat={item.index + 1}
                size={28}
                state={motion.avatarState}
              />
              <span
                className={
                  item.state === "current"
                    ? "font-medium"
                    : item.state === "next"
                      ? "text-muted-foreground"
                      : undefined
                }
              >
                {seat.personaName}
              </span>
              {motion.wave ? <DiscussionWave seat={item.index + 1} /> : null}
              {item.tags.map((tag) =>
                tag === "next" ? (
                  <span
                    key={tag}
                    className="inline-flex h-5 items-center rounded-sm border border-input px-1.5 text-xs font-medium text-muted-foreground"
                  >
                    {t.discussions.page.next}
                  </span>
                ) : (
                  <Badge
                    key={tag}
                    variant={
                      tag === "speaking"
                        ? "info"
                        : tag === "interrupted"
                          ? "warning"
                          : tag === "failed"
                            ? "error"
                            : "secondary"
                    }
                  >
                    {t.discussions.page[tag]}
                  </Badge>
                ),
              )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * Displays the live snapshot's title, project and disabled action positions.
 * @param props.discussion Subscription snapshot scoped to this environment.
 * @param props.environmentId Destination used to disambiguate project IDs and timestamp settings.
 * @returns Workspace frame and persisted records; no discussion command is executed.
 */
export function DiscussionPage({
  discussion,
  environmentId,
}: {
  discussion: Discussion;
  environmentId: EnvironmentId;
}) {
  const projects = useProjects();
  const project = projects.find(
    (candidate) =>
      candidate.environmentId === environmentId && candidate.id === discussion.projectId,
  );
  const settings = useEnvironmentSettings(environmentId);
  const header = discussionHeaderView(
    discussion,
    t.discussions,
    discussion.endedAt ? formatDayAwareTimestamp(discussion.endedAt, settings.timestampFormat) : "",
  );
  return (
    <SidebarInset>
      <WorkspacePageHeader electron={isElectron} className="border-b">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h1 className="min-w-0 truncate text-sm font-medium">{discussion.title}</h1>
          <span className="max-w-32 shrink-0 truncate text-xs text-muted-foreground">
            {project?.title ?? t.discussions.deletedProject}
          </span>
          <Badge variant={header.variant}>{header.label}</Badge>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {header.actions.map((action) => (
            <Button
              key={action}
              disabled
              variant={action === "resume" ? "default" : "outline"}
              size={action === "more" ? "icon-sm" : "sm"}
              aria-label={t.discussions.page[action]}
              title={action === "more" ? t.discussions.page.more : undefined}
            >
              {action === "stop" ? (
                <PauseIcon />
              ) : action === "resume" ? (
                <PlayIcon />
              ) : action === "more" ? (
                <EllipsisIcon />
              ) : null}
              {action !== "more" ? t.discussions.page[action] : null}
            </Button>
          ))}
        </div>
      </WorkspacePageHeader>
      <DiscussionSeatBar discussion={discussion} />
      <DiscussionTranscript
        key={`${environmentId}:${discussion.id}`}
        discussion={discussion}
        environmentId={environmentId}
        cwd={project?.workspaceRoot}
      />
    </SidebarInset>
  );
}
