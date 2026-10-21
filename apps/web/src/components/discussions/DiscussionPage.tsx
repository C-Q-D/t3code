/** Composes the discussion record and responsive tables, publishing guarded actions to the app titlebar. */
import { useAtomValue } from "@effect/atom-react";
import type {
  Discussion,
  DiscussionEntry,
  EnvironmentId,
  DiscussionEndInput,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { DiscussionTitlebarActions } from "./DiscussionTitlebarActions";
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
import { SidebarInset } from "../ui/sidebar";
import { toastManager } from "../ui/toast";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import { DISCUSSION_PANEL_OVERLAY_MEDIA_QUERY } from "~/rightPanelLayout";
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
  discussionTableView,
} from "./discussionPage.logic";

/**
 * Keeps failures inside the workspace with a recovery link.
 * @param props.title Error title, or null while directory/subscription data is pending.
 * @param props.description Optional explanation; query failures retain the query's message.
 * @returns Titlebar portal and H7 empty-table error state; loading remains blank and static.
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
          <section className="flex min-w-0 flex-col items-center gap-3.5 pb-15 text-center">
            <div aria-hidden="true" className="relative mb-2.5 h-37.5 w-60">
              <div className="discussion-error-table absolute top-7.5 left-1/2 size-37.5 -translate-x-1/2 rounded-full bg-discussion-error-table shadow-discussion-error-table" />
              <span className="discussion-error-chair absolute top-14 left-7 size-7.5 rounded-device-control" />
              <span className="discussion-error-chair absolute top-0 left-26.25 size-7.5 rounded-device-control" />
              <span className="discussion-error-chair absolute top-14 right-7 size-7.5 rounded-device-control" />
            </div>
            <h2 className="font-serif text-discussion-error-heading font-bold">{title}</h2>
            {description ? <p className="text-body text-secondary-label">{description}</p> : null}
            <div className="mt-1.5">
              <Button
                variant="dialog-secondary"
                size="recovery"
                render={<Link to="/discussions" />}
              >
                {t.discussions.page.back}
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </SidebarInset>
  );
}

/**
 * Displays the live snapshot's title, project and lifecycle actions.
 * @param props.discussion Subscription snapshot scoped to this environment.
 * @param props.entries The same route snapshot supplies unread interjection notes without another subscription.
 * @param props.environmentId Destination used to disambiguate project IDs and timestamp settings.
 * @returns Responsive workspace and titlebar portals with independent lifecycle and interjection locks.
 */
export function DiscussionPage({
  discussion,
  entries,
  environmentId,
}: {
  discussion: Discussion;
  entries: readonly DiscussionEntry[];
  environmentId: EnvironmentId;
}) {
  const [selectedDiff, setSelectedDiff] = useState<DiscussionDiffSelection | null>(null);
  const openDiff = (selection: DiscussionDiffSelection) => setSelectedDiff(selection);
  const useSheet = useMediaQuery(DISCUSSION_PANEL_OVERLAY_MEDIA_QUERY);
  const diffPanel = useTitlebarSlot({
    panel:
      selectedDiff && !useSheet ? (
        <DiscussionDiffPanel
          key={discussionDiffKey(environmentId, discussion.id, selectedDiff.entryId)}
          discussion={discussion}
          environmentId={environmentId}
          selection={selectedDiff}
          mode="inline"
          onClose={() => setSelectedDiff(null)}
        />
      ) : null,
  });
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
  const endedTime = discussion.endedAt
    ? formatDayAwareTimestamp(discussion.endedAt, settings.timestampFormat)
    : "";
  const header = discussionHeaderView(discussion, t.discussions, endedTime);
  const table = discussionTableView(discussion, entries, t.discussions, endedTime);
  const titlebar = useTitlebarSlot({
    breadcrumb: (
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <h1 className="min-w-0 truncate font-serif text-chat-title font-bold">
          {discussion.title}
        </h1>
        <span
          data-discussion-project=""
          className="max-w-32 shrink-0 truncate text-secondary-copy text-secondary-label"
        >
          {project?.title ?? t.discussions.deletedProject}
        </span>
        <Badge variant={header.variant}>{header.label}</Badge>
      </div>
    ),
    actions: (
      <DiscussionTitlebarActions
        actions={header.actions}
        enabled={(action) =>
          discussionHeaderActionEnabled(
            action,
            headerPending,
            action === "more" ? canDelete : permitted(action),
          )
        }
        onAction={(action) => (action === "more" ? setDeleteOpen(true) : void act(action))}
      />
    ),
  });
  return (
    <SidebarInset
      className="h-full min-h-0"
      data-discussion-diff-open={selectedDiff ? "true" : undefined}
    >
      {titlebar}
      {diffPanel}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="discussion-page-long-table mx-3 mt-4 mb-3 min-w-0">
            <DiscussionLongTable
              seats={table.seats}
              label={t.discussions.page.seats}
              centerLabel={table.centerLabel}
              order={table.order}
              closeLoop={table.closeLoop}
              quiet={table.quiet}
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
                  seats={table.seats}
                  label={t.discussions.page.seats}
                  centerLabel={table.centerLabel}
                  subtitle={table.subtitle}
                  userLabel={t.discussions.page.you}
                  order={table.order}
                  closeLoop={table.closeLoop}
                  quiet={table.quiet}
                />
              </div>
              {table.footer ? (
                <p className="px-2.5 pt-3.5 pb-1 text-center text-secondary-copy text-secondary-label">
                  {table.footer}
                </p>
              ) : null}
              <DiscussionComposer
                key={`composer:${environmentId}:${discussion.id}`}
                discussion={discussion}
                environmentId={environmentId}
              />
            </aside>
          </div>
        </div>
        {selectedDiff && useSheet ? (
          <RightPanelSheet
            discussion
            open
            animationDurationMs={0}
            onClose={() => setSelectedDiff(null)}
          >
            <DiscussionDiffPanel
              key={discussionDiffKey(environmentId, discussion.id, selectedDiff.entryId)}
              discussion={discussion}
              environmentId={environmentId}
              selection={selectedDiff}
              mode="sheet"
              onClose={() => setSelectedDiff(null)}
            />
          </RightPanelSheet>
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
