/** Displays the live discussion frame, speaking sequence and guarded user commands. */
import { useAtomValue } from "@effect/atom-react";
import type { Discussion, EnvironmentId, DiscussionEndInput } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Fragment, useCallback, useRef, useState } from "react";
import { EllipsisIcon, PauseIcon, PlayIcon, Trash2Icon } from "lucide-react";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../ui/menu";
import { DiscussionEndDialog } from "./DiscussionEndDialog";
import { DiscussionDeleteDialog } from "./DiscussionDeleteDialog";
import { discussionEndInput } from "./discussionEnd.logic";
import { isElectron } from "../../env";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { useProjects } from "../../state/entities";
import { formatDayAwareTimestamp } from "../../timestampFormat";
import { t } from "~/i18n";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { SidebarInset } from "../ui/sidebar";
import { toastManager } from "../ui/toast";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import { RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY } from "~/rightPanelLayout";
import { RightPanelSheet } from "../RightPanelSheet";
import { DiscussionDiffPanel } from "./DiscussionDiffPanel";
import { discussionDiffKey, type DiscussionDiffSelection } from "./discussionDiff.logic";
import { DiscussionComposer } from "./DiscussionComposer";
import { PixelAvatar } from "./PixelAvatar";
import { DiscussionWave } from "./DiscussionWave";
import { discussionSeatMotion } from "./discussionMotion.logic";
import { DiscussionTranscript } from "./DiscussionTranscript";
import { discussionSeatColor } from "./discussionSeatColors";
import {
  discussionHeaderView,
  discussionHeaderActionEnabled,
  discussionDeleteShouldNavigate,
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
 * Displays the live snapshot's title, project and lifecycle actions.
 * @param props.discussion Subscription snapshot scoped to this environment.
 * @param props.environmentId Destination used to disambiguate project IDs and timestamp settings.
 * @returns Workspace frame with independent header and interjection submission locks.
 */
export function DiscussionPage({
  discussion,
  environmentId,
}: {
  discussion: Discussion;
  environmentId: EnvironmentId;
}) {
  const [selectedDiff, setSelectedDiff] = useState<DiscussionDiffSelection | null>(null);
  const openDiff = useCallback(
    (selection: DiscussionDiffSelection) => setSelectedDiff(selection),
    [],
  );
  const useSheet = useMediaQuery(RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY);
  const [headerPending, setHeaderPending] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const navigate = useNavigate();
  const router = useRouter();
  const end = useAtomCommand(serverEnvironment.endDiscussion);
  const remove = useAtomCommand(serverEnvironment.deleteDiscussion);
  const canEnd = useAtomValue(serverEnvironment.endDiscussion.permissionAtom(environmentId));
  const canDelete = useAtomValue(serverEnvironment.deleteDiscussion.permissionAtom(environmentId));
  const submissionPending = useRef(false);
  const stop = useAtomCommand(serverEnvironment.stopDiscussion);
  const resume = useAtomCommand(serverEnvironment.continueDiscussion);
  const canStop = useAtomValue(serverEnvironment.stopDiscussion.permissionAtom(environmentId));
  const canResume = useAtomValue(
    serverEnvironment.continueDiscussion.permissionAtom(environmentId),
  );
  const permitted = (action: "stop" | "resume" | "end" | "more") =>
    action === "stop"
      ? canStop
      : action === "resume"
        ? canResume
        : action === "end"
          ? canEnd
          : canDelete;
  const act = async (action: "stop" | "resume" | "end" | "more") => {
    if (!discussionHeaderActionEnabled(action, submissionPending.current, permitted(action)))
      return;
    if (action === "end") {
      setEndOpen(true);
      return;
    }
    if (action === "more") return;
    // The header has its own synchronous lock; interjections can still queue before/after it.
    submissionPending.current = true;
    setHeaderPending(true);
    const result = await (action === "stop" ? stop : resume)({
      environmentId,
      input: { discussionId: discussion.id },
    });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result))
      toastManager.add({
        type: "error",
        title: action === "stop" ? t.discussions.page.stopFailed : t.discussions.page.resumeFailed,
        description: String(squashAtomCommandFailure(result)),
      });
    submissionPending.current = false;
    setHeaderPending(false);
  };
  const submitEnd = async (input: DiscussionEndInput) => {
    const checked = discussionEndInput(
      discussion,
      input.summarizerSeatId,
      input.summaryPromptId ?? null,
      submissionPending.current,
      canEnd,
    );
    if (!checked) return;
    // Share the synchronous lifecycle lock with stop/resume/delete; no automatic retries.
    submissionPending.current = true;
    setHeaderPending(true);
    setEnding(true);
    const result = await end({ environmentId, input: checked });
    if (result._tag === "Success") setEndOpen(false);
    else if (!isAtomCommandInterrupted(result))
      toastManager.add({
        type: "error",
        title: t.discussions.page.endFailed,
        description: String(squashAtomCommandFailure(result)),
      });
    submissionPending.current = false;
    setHeaderPending(false);
    setEnding(false);
  };
  const submitDelete = async () => {
    if (discussion.status !== "ended" || submissionPending.current || !canDelete) return;
    submissionPending.current = true;
    setHeaderPending(true);
    const result = await remove({ environmentId, input: { discussionId: discussion.id } });
    if (result._tag === "Success") {
      if (discussionDeleteShouldNavigate(router, environmentId, discussion.id))
        await navigate({ to: "/discussions", replace: true });
      return;
    }
    submissionPending.current = false;
    setHeaderPending(false);
    if (!isAtomCommandInterrupted(result))
      toastManager.add({
        type: "error",
        title: t.discussions.page.deleteFailed,
        description: String(squashAtomCommandFailure(result)),
      });
  };
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
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <WorkspacePageHeader electron={isElectron} className="border-b">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <h1 className="min-w-0 truncate text-sm font-medium">{discussion.title}</h1>
              <span className="max-w-32 shrink-0 truncate text-xs text-muted-foreground">
                {project?.title ?? t.discussions.deletedProject}
              </span>
              <Badge variant={header.variant}>{header.label}</Badge>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {header.actions.map((action) =>
                action === "more" ? (
                  <Menu key={action}>
                    <MenuTrigger
                      render={
                        <Button
                          variant="outline"
                          size="icon-sm"
                          disabled={
                            !discussionHeaderActionEnabled(action, headerPending, canDelete)
                          }
                          aria-label={t.discussions.page.more}
                        />
                      }
                    >
                      <EllipsisIcon />
                    </MenuTrigger>
                    <MenuPopup align="end">
                      <MenuItem
                        variant="destructive"
                        disabled={headerPending || !canDelete}
                        onClick={() => setDeleteOpen(true)}
                      >
                        <Trash2Icon />
                        {t.discussions.page.deleteDiscussion}
                      </MenuItem>
                    </MenuPopup>
                  </Menu>
                ) : (
                  <Button
                    key={action}
                    disabled={
                      !discussionHeaderActionEnabled(action, headerPending, permitted(action))
                    }
                    onClick={() => void act(action)}
                    variant={action === "resume" ? "default" : "outline"}
                    size="sm"
                    aria-label={t.discussions.page[action]}
                  >
                    {action === "stop" ? <PauseIcon /> : action === "resume" ? <PlayIcon /> : null}
                    {t.discussions.page[action]}
                  </Button>
                ),
              )}
            </div>
          </WorkspacePageHeader>
          <DiscussionSeatBar discussion={discussion} />
          <DiscussionTranscript
            key={`${environmentId}:${discussion.id}`}
            discussion={discussion}
            environmentId={environmentId}
            cwd={project?.workspaceRoot}
            selectedDiff={selectedDiff}
            onOpenDiff={openDiff}
          />
          <DiscussionComposer
            key={`composer:${environmentId}:${discussion.id}`}
            discussion={discussion}
            environmentId={environmentId}
          />
        </div>
        {selectedDiff ? (
          useSheet ? (
            <RightPanelSheet open animationDurationMs={0} onClose={() => setSelectedDiff(null)}>
              <DiscussionDiffPanel
                key={discussionDiffKey(environmentId, discussion.id, selectedDiff.entryId)}
                discussion={discussion}
                environmentId={environmentId}
                selection={selectedDiff}
                mode="sheet"
                onClose={() => setSelectedDiff(null)}
              />
            </RightPanelSheet>
          ) : (
            <DiscussionDiffPanel
              key={discussionDiffKey(environmentId, discussion.id, selectedDiff.entryId)}
              discussion={discussion}
              environmentId={environmentId}
              selection={selectedDiff}
              mode="inline"
              onClose={() => setSelectedDiff(null)}
            />
          )
        ) : null}
      </div>
      {endOpen ? (
        <DiscussionEndDialog
          discussion={discussion}
          environmentId={environmentId}
          pending={headerPending}
          ending={ending}
          permitted={canEnd}
          onClose={() => {
            if (!submissionPending.current) setEndOpen(false);
          }}
          onSubmit={submitEnd}
        />
      ) : null}
      {deleteOpen ? (
        <DiscussionDeleteDialog
          pending={headerPending}
          onClose={() => {
            if (!submissionPending.current) setDeleteOpen(false);
          }}
          onSubmit={submitDelete}
        />
      ) : null}
    </SidebarInset>
  );
}
