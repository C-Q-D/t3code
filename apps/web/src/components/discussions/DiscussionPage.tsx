/** Composes the discussion record and responsive tables, publishing guarded actions to the app titlebar. */
import { useAtomValue } from "@effect/atom-react";
import type { Discussion, EnvironmentId, DiscussionEndInput } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { EllipsisIcon, PauseIcon, PlayIcon, Trash2Icon } from "lucide-react";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../ui/menu";
import { DiscussionEndDialog } from "./DiscussionEndDialog";
import { DiscussionDeleteDialog } from "./DiscussionDeleteDialog";
import { discussionEndInput } from "./discussionEnd.logic";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { useProjects } from "../../state/entities";
import { formatDayAwareTimestamp } from "../../timestampFormat";
import { t } from "~/i18n";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { useTitlebarSlot } from "../frame/titlebarSlot";
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
import { DiscussionRoundTable } from "./DiscussionRoundTable";
import { DiscussionLongTable } from "./DiscussionLongTable";
import { DiscussionTranscript } from "./DiscussionTranscript";
import {
  discussionHeaderView,
  discussionHeaderActionEnabled,
  discussionDeleteShouldNavigate,
  discussionTableSeats,
} from "./discussionPage.logic";

/**
 * Keeps failures inside the workspace with a recovery link.
 * @param props.title Error title, or null while directory/subscription data is pending.
 * @param props.description Optional explanation; query failures retain the query's message.
 * @returns Titlebar portal and an Empty message, without a loading animation.
 */
export function DiscussionPageMessage({
  title,
  description,
}: {
  title: string | null;
  description?: string | undefined;
}) {
  const titlebar = useTitlebarSlot({
    breadcrumb: (
      <h1 className="min-w-0 truncate font-serif text-chat-title font-bold">
        {t.discussions.title}
      </h1>
    ),
  });
  return (
    <SidebarInset className="h-full min-h-0">
      {titlebar}
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
 * Displays the live snapshot's title, project and lifecycle actions.
 * @param props.discussion Subscription snapshot scoped to this environment.
 * @param props.environmentId Destination used to disambiguate project IDs and timestamp settings.
 * @returns Responsive workspace and titlebar portals with independent lifecycle and interjection locks.
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
  const seats = discussionTableSeats(discussion, t.discussions.page);
  const titlebar = useTitlebarSlot({
    breadcrumb: (
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <h1 className="min-w-0 truncate font-serif text-chat-title font-bold">
          {discussion.title}
        </h1>
        <span className="max-w-32 shrink-0 truncate text-secondary-copy text-secondary-label">
          {project?.title ?? t.discussions.deletedProject}
        </span>
        <Badge variant={header.variant}>{header.label}</Badge>
      </div>
    ),
    actions: (
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {header.actions.map((action) =>
          action === "more" ? (
            <Menu key={action}>
              <MenuTrigger
                render={
                  <Button
                    variant="secondary"
                    size="icon-toolbar"
                    disabled={!discussionHeaderActionEnabled(action, headerPending, canDelete)}
                    aria-label={t.discussions.page.more}
                  />
                }
              >
                <EllipsisIcon />
              </MenuTrigger>
              <MenuPopup align="end" className="w-45">
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
              disabled={!discussionHeaderActionEnabled(action, headerPending, permitted(action))}
              onClick={() => void act(action)}
              variant={action === "resume" ? "default" : "secondary"}
              size="toolbar"
              aria-label={t.discussions.page[action]}
            >
              {action === "stop" ? <PauseIcon /> : action === "resume" ? <PlayIcon /> : null}
              {t.discussions.page[action]}
            </Button>
          ),
        )}
      </div>
    ),
  });
  return (
    <SidebarInset className="h-full min-h-0">
      {titlebar}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="discussion-page-long-table mx-3 mt-4 mb-3 min-w-0">
            <DiscussionLongTable
              seats={seats}
              label={t.discussions.page.seats}
              centerLabel={t.discussions.round(discussion.cursor.round)}
            />
          </div>
          <div className="discussion-page-content flex min-h-0 min-w-0 flex-1">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <DiscussionTranscript
                key={`${environmentId}:${discussion.id}`}
                discussion={discussion}
                environmentId={environmentId}
                cwd={project?.workspaceRoot}
                selectedDiff={selectedDiff}
                onOpenDiff={openDiff}
              />
            </div>
            <aside className="discussion-page-table-rail" aria-label={t.discussions.page.seats}>
              <div className="discussion-page-round-table min-h-0 flex-1 items-center justify-center">
                <DiscussionRoundTable
                  seats={seats}
                  label={t.discussions.page.seats}
                  centerLabel={t.discussions.round(discussion.cursor.round)}
                  subtitle={t.discussions.page.clockwise}
                  userLabel={t.discussions.page.you}
                />
              </div>
              <DiscussionComposer
                key={`composer:${environmentId}:${discussion.id}`}
                discussion={discussion}
                environmentId={environmentId}
              />
            </aside>
          </div>
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
