import { LegendList } from "@legendapp/list/react";
/** Owns thread pull requests panel on the web pull-request surface; host data and agent context remain unchanged. */
import { t } from "~/i18n";
import type { ProjectId, ScopedThreadRef, ThreadPullRequestLink } from "@t3tools/contracts";
import {
  sourceControlClients,
  UNKNOWN_SOURCE_CONTROL_CLIENT,
} from "@t3tools/client-runtime/source-control-clients";
import {
  type PullRequestListLine,
  pullRequestListLines,
  resolveThreadPullRequestChains,
  visibleThreadPullRequests,
} from "@t3tools/client-runtime/thread-pull-requests";
import { ArrowUpRightIcon, EyeIcon, EyeOffIcon, LinkIcon, MoreHorizontalIcon } from "lucide-react";
import { memo, useState, type ReactNode } from "react";

import {
  COMPOSER_PULL_REQUEST_DRAG_TYPE,
  encodePullRequestDragPayload,
} from "~/components/chat/composerMentionDrag";
import { writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import { findProjectForChangeRequest } from "@t3tools/client-runtime/change-request-links";
import { useOpenPrLink } from "~/lib/openPullRequestLink";
import { cn } from "~/lib/utils";
import { useShortcutModifierState } from "~/shortcutModifierState";
import { useProjects, useServerConfigs, useThreadShell } from "~/state/entities";
import { PullRequestChangeBreakdownStat } from "./PullRequestChangeBreakdownStat";
import { PullRequestsUnavailableState } from "./PullRequestsUnavailableState";
import { threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";
import { RelativeTime } from "~/components/RelativeTime";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { MiddleTruncate } from "../ui/middle-truncate";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { openLinkPullRequestDialog } from "./LinkPullRequestDialog";
import {
  PullRequestRowAuthor,
  PullRequestRowBranches,
  PullRequestRowGlyph,
} from "./PullRequestListRow";
import {
  PullRequestDiffStat,
  PullRequestReviewDecisionGlyph,
  pullRequestChecksStatePresentation,
} from "./pullRequestPresentation";
import { PullRequestGlyph } from "./pullRequestIcons";
import { pullRequestQuickActions } from "./pullRequestList.logic";
import { PullRequestSpeedActions, PullRequestSpeedModeContext } from "./PullRequestSpeedActions";

const SOURCE_LABELS: Record<ThreadPullRequestLink["source"], string> = {
  manual: t.git.pullRequest.linkedByYou,
  created: t.git.pullRequest.createdFromThisThread,
  agent: t.git.pullRequest.linkedByTheAgent,
  stack: t.git.pullRequest.foundInTheStack,
  "stack-dismissed": t.git.pullRequest.dismissed,
};

/**
 * Keep the linked panel's source visible below the title, alongside existing host metadata.
 * @param props Number/title, source, and optional host signals; missing host fields stay absent.
 * @returns Two compact lines; metadata yields space before the source or title is obscured.
 */
function LinkedPullRequestLines({
  number,
  title,
  source,
  signals,
  status,
  meta,
  updatedAt,
}: {
  number: ReactNode;
  title: ReactNode;
  source: string;
  signals?: ReactNode;
  status?: ReactNode;
  meta?: ReactNode;
  updatedAt?: string | null | undefined;
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex min-w-0 items-center gap-1.25 font-semibold">
        {number}
        <span className="min-w-0 truncate">{title}</span>
        {signals ? <span className="flex shrink-0 items-center gap-1">{signals}</span> : null}
        {status ? <span className="ml-auto flex shrink-0 items-center gap-1">{status}</span> : null}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-secondary-copy leading-pr-linked-copy text-muted-foreground">
        <span className="shrink-0">{source}</span>
        <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">{meta}</span>
        {updatedAt ? (
          <span className="ml-auto shrink-0 tabular-nums">
            <RelativeTime timestamp={updatedAt} />
          </span>
        ) : null}
      </span>
    </span>
  );
}

/**
 * Render a check signal supplied by the host; callers omit this component for absent state.
 * @param props Host check state and its existing semantic presentation.
 * @returns The accessible signal with a localized tooltip.
 */
function ChecksGlyph({
  state,
}: {
  state: NonNullable<ThreadPullRequestLink["snapshot"]>["checksState"] & string;
}) {
  const presentation = pullRequestChecksStatePresentation(state);
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex shrink-0" />}>
        <presentation.Icon
          role="img"
          aria-label={presentation.label}
          className={cn("size-3.5", presentation.toneClassName)}
        />
      </TooltipTrigger>
      <TooltipPopup>{presentation.label}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * Render one linked PR with its existing navigation, watch gates, context menu and quick actions.
 * @param props Stack position, PR/thread identity and existing host command callbacks; a null
 * watch callback means the environment does not support watching.
 * @returns A source-labelled row; the host remains authoritative for its watch and lifecycle state.
 */
function LinkRowImpl({
  line,
  threadRef,
  projectId,
  speedMode,
  onUnlink,
  onSetWatching,
}: {
  line: PullRequestListLine;
  threadRef: ScopedThreadRef;
  projectId: ProjectId | null;
  speedMode: boolean;
  onUnlink: (link: ThreadPullRequestLink) => void;
  onSetWatching: ((link: ThreadPullRequestLink, watching: boolean) => void) | null;
}) {
  const openPrLink = useOpenPrLink(threadRef);
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const menuAnchor = menuPosition
    ? { getBoundingClientRect: () => new DOMRect(menuPosition.x, menuPosition.y, 0, 0) }
    : undefined;
  const { link, depth, stack } = line;
  const snapshot = link.snapshot;
  const open = snapshot === null || snapshot.state === "open";
  const watching = link.watch !== undefined;
  const linkHost =
    sourceControlClients.findByChangeRequestUrl(link.url) ?? UNKNOWN_SOURCE_CONTROL_CLIENT;
  const linkHostActions = linkHost.changeRequestActions;
  const actionEntry =
    projectId !== null && snapshot !== null && snapshot.state !== "merged"
      ? {
          environmentId: threadRef.environmentId,
          projectId,
          host: link.host,
          repository: link.repository,
          number: link.number,
          state: snapshot.state,
          isDraft: snapshot.isDraft,
          ...(link.stack === null ? {} : { stack: link.stack }),
        }
      : null;
  const hasQuickActions =
    actionEntry !== null && pullRequestQuickActions(actionEntry, linkHostActions).length > 0;
  return (
    <div
      className={cn(
        "group/pr-row relative flex w-full items-center gap-2.5 rounded-pr-linked-row py-2.5 pr-2.5 text-left text-secondary-copy-large leading-pr-linked-copy hover:bg-secondary",
        watching && "bg-pr-linked-watching shadow-pr-linked-watching",
      )}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setMenuPosition({ x: event.clientX, y: event.clientY });
        setMenuOpen(true);
      }}
      // Each layer steps in under the one it targets. The step is capped: beyond a few layers
      // the indent only says "still in the stack", which the connector line already does, and
      // a sixteen-layer stack would otherwise stair-step off the right edge.
      style={{ paddingLeft: `${0.75 + Math.min(depth, 3) * 1.25}rem` }}
    >
      {depth > 0 ? <span aria-hidden className="-ml-2 h-6 w-px shrink-0 bg-border/70" /> : null}
      {snapshot === null ? (
        <PullRequestGlyph.pullRequest
          aria-label={t.git.pullRequest.waitingForHostState}
          className="size-4 shrink-0 text-muted-foreground"
        />
      ) : (
        <PullRequestRowGlyph
          state={snapshot.state}
          isDraft={snapshot.isDraft}
          mergeability={snapshot.mergeability}
          baseBranch={snapshot.baseBranch}
        />
      )}
      <a
        href={link.url}
        onClick={(event) => openPrLink(event, link.url, threadRef)}
        // Outside drops use the URL; the composer uses this context-chip payload.
        onDragStart={
          snapshot === null
            ? undefined
            : (event) =>
                event.dataTransfer.setData(
                  COMPOSER_PULL_REQUEST_DRAG_TYPE,
                  encodePullRequestDragPayload({
                    number: link.number,
                    title: snapshot.title,
                    url: link.url,
                    headBranch: snapshot.headBranch,
                    baseBranch: snapshot.baseBranch,
                    state: snapshot.state,
                    isDraft: snapshot.isDraft,
                  }),
                )
        }
        className="flex min-w-0 flex-1"
      >
        <LinkedPullRequestLines
          source={SOURCE_LABELS[link.source]}
          number={
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    className={cn(
                      "shrink-0 font-mono font-medium tabular-nums",
                      snapshot === null
                        ? "text-muted-foreground"
                        : snapshot.state === "merged"
                          ? "text-status-emphasis-foreground"
                          : snapshot.state === "closed"
                            ? "text-error-foreground"
                            : snapshot.isDraft
                              ? "text-muted-foreground"
                              : "text-success-foreground",
                    )}
                  />
                }
              >
                #{link.number}
              </TooltipTrigger>
              <TooltipPopup>
                {SOURCE_LABELS[link.source]} · <RelativeTime timestamp={link.linkedAt} />
              </TooltipPopup>
            </Tooltip>
          }
          title={snapshot?.title ?? link.repository}
          signals={
            open ? (
              <>
                {watching ? (
                  <Tooltip>
                    <TooltipTrigger render={<span className="inline-flex shrink-0" />}>
                      <EyeIcon
                        role="img"
                        aria-label={t.git.pullRequest.watching}
                        className="size-3.5"
                      />
                    </TooltipTrigger>
                    <TooltipPopup>
                      {
                        t.git.pullRequest
                          .watchingTheAgentWakesWhenChecksFinishSomeoneCommentsOrTheBranchConflicts
                      }
                    </TooltipPopup>
                  </Tooltip>
                ) : null}
                {snapshot?.checksState ? <ChecksGlyph state={snapshot.checksState} /> : null}
                {snapshot?.reviewDecision ? (
                  <PullRequestReviewDecisionGlyph decision={snapshot.reviewDecision} />
                ) : null}
              </>
            ) : null
          }
          // Undrawn host metadata remains available beside the source, with no invented neutral state.
          status={
            projectId === null ? (
              <PullRequestDiffStat
                additions={snapshot?.additions ?? 0}
                deletions={snapshot?.deletions ?? 0}
                className="font-mono"
              />
            ) : (
              <PullRequestChangeBreakdownStat
                environmentId={threadRef.environmentId}
                reference={{
                  projectId,
                  host: link.host,
                  repository: link.repository,
                  number: link.number,
                }}
                additions={snapshot?.additions ?? 0}
                deletions={snapshot?.deletions ?? 0}
                className="font-mono"
              />
            )
          }
          meta={
            <>
              {stack ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-foreground/70" />
                    }
                  >
                    <PullRequestGlyph.stack aria-hidden className="size-3" />
                    {stack.size}
                  </TooltipTrigger>
                  <TooltipPopup>
                    {stack.kind === "native"
                      ? t.git.pullRequest.hostStack(
                          sourceControlClients.hostLabelForChangeRequestUrl(link.url),
                          stack.size,
                        )
                      : t.git.pullRequest.chainedRequests(stack.size)}
                  </TooltipPopup>
                </Tooltip>
              ) : null}
              {snapshot?.author ? (
                <PullRequestRowAuthor
                  actor={snapshot.author}
                  className="shrink-0"
                  labelClassName="max-w-28"
                />
              ) : null}
              {snapshot !== null ? (
                <>
                  <Tooltip>
                    <TooltipTrigger render={<span className="flex min-w-0 max-w-32 font-mono" />}>
                      <MiddleTruncate value={link.repository} showTitle={false} />
                    </TooltipTrigger>
                    <TooltipPopup>{link.repository}</TooltipPopup>
                  </Tooltip>
                  <PullRequestRowBranches head={snapshot.headBranch} base={snapshot.baseBranch} />
                </>
              ) : (
                <span className="truncate font-mono">
                  {link.host}/{link.repository}
                </span>
              )}
            </>
          }
          updatedAt={snapshot?.updatedAt}
        />
      </a>
      {onSetWatching !== null && open ? (
        <span
          className={cn("relative inline-flex shrink-0 rounded-full", watching && "bg-secondary")}
        >
          <Button variant="outline" size="compact" onClick={() => onSetWatching(link, !watching)}>
            {watching ? <EyeOffIcon className="size-3.25" /> : <EyeIcon className="size-3.25" />}
            {watching ? t.git.pullRequest.stopWatching : t.git.pullRequest.watchForChanges}
          </Button>
          {/* The feature's watched state adds the contract's selection ring without changing Button. */}
          {watching ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full inset-shadow-selected-control"
            />
          ) : null}
        </span>
      ) : null}
      {actionEntry !== null ? (
        <PullRequestSpeedActions
          entry={actionEntry}
          hostActions={linkHostActions}
          onPendingChange={setActionPending}
        />
      ) : null}
      {/* Keep the existing menu reachable by hover or keyboard without covering the watch action. */}
      <span
        className={cn(
          "absolute top-0 left-0 flex items-center",
          // Hidden means untouchable too: on a touch screen there is no hover, and an invisible
          // layer over the right of the row would otherwise swallow the tap meant for the link.
          "pointer-events-none opacity-0 group-hover/pr-row:pointer-events-auto group-hover/pr-row:opacity-100",
          "group-focus-within/pr-row:pointer-events-auto group-focus-within/pr-row:opacity-100",
          menuOpen && "pointer-events-auto opacity-100",
          actionPending && "hidden",
          speedMode && hasQuickActions && "hidden",
        )}
      >
        <Menu
          open={menuOpen}
          onOpenChange={(open) => {
            setMenuOpen(open);
            if (!open) setMenuPosition(null);
          }}
        >
          <MenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-micro"
                aria-label={t.git.pullRequest.requestActions(link.number)}
                className="relative"
              >
                <MoreHorizontalIcon className="size-3.5" />
              </Button>
            }
          />
          <MenuPopup
            anchor={menuAnchor}
            align={menuPosition ? "start" : "end"}
            side="bottom"
            sideOffset={menuPosition ? 0 : 4}
          >
            <MenuItem onClick={() => void writeTextToClipboard(link.url, "link")}>
              <LinkIcon className="size-3.5" />
              {t.git.pullRequest.copyLink}
            </MenuItem>
            <MenuItem onClick={(event) => openPrLink(event, link.url, threadRef)}>
              <ArrowUpRightIcon className="size-3.5" />
              {t.git.pullRequest.open}
            </MenuItem>
            {onSetWatching !== null && open ? (
              <MenuItem onClick={() => onSetWatching(link, !watching)}>
                {watching ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                {watching ? t.git.pullRequest.stopWatching : t.git.pullRequest.watchForChanges}
              </MenuItem>
            ) : null}
            <MenuItem onClick={() => onUnlink(link)}>
              <PullRequestGlyph.unlink className="size-3.5" />
              {link.source === "stack"
                ? t.git.pullRequest.dismissFromThread
                : t.git.pullRequest.unlinkFromThread}
            </MenuItem>
          </MenuPopup>
        </Menu>
      </span>
    </div>
  );
}

const LinkRow = memo(LinkRowImpl);

function latestSyncedAt(links: ReadonlyArray<ThreadPullRequestLink>): string | null {
  let latest: string | null = null;
  for (const link of links) {
    const at = link.snapshot?.syncedAt;
    if (at !== undefined && (latest === null || at > latest)) latest = at;
  }
  return latest;
}

/**
 * Renders thread pull requests panel from the supplied display data and callbacks.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface.
 */
export function ThreadPullRequestsPanel({ threadRef }: { threadRef: ScopedThreadRef }) {
  const configs = useServerConfigs();
  if (configs.get(threadRef.environmentId) === undefined) {
    return (
      <PullRequestsUnavailableState
        title={t.git.pullRequest.linkedPullRequestsUnavailable}
        error={t.git.pullRequest.thisEnvironmentDoesNotSupportMultipleLinkedPullRequests}
      />
    );
  }
  return <EnabledThreadPullRequestsPanel threadRef={threadRef} />;
}

/**
 * Renders thread pull requests panel from the supplied display data and callbacks.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface.
 */
function EnabledThreadPullRequestsPanel({ threadRef }: { threadRef: ScopedThreadRef }) {
  const thread = useThreadShell(threadRef);
  const projects = useProjects();
  const environmentProjects = projects
    .filter((project) => project.environmentId === threadRef.environmentId)
    .toSorted((left, right) =>
      left.id === thread?.projectId ? -1 : right.id === thread?.projectId ? 1 : 0,
    );
  // Derive lines before later hooks to preserve compiler caching and avoid LegendList renders.
  const links = visibleThreadPullRequests(thread?.pullRequests ?? []);
  const lines = pullRequestListLines(resolveThreadPullRequestChains(links));
  const openCount = links.filter(
    (link) => link.snapshot === null || link.snapshot.state === "open",
  ).length;
  const lastSynced = latestSyncedAt(links);
  const linkCount = links.length;
  const modifiers = useShortcutModifierState(true);
  const speedMode =
    modifiers.shiftKey && !modifiers.metaKey && !modifiers.ctrlKey && !modifiers.altKey;
  const openLinkDialog = () => openLinkPullRequestDialog(threadRef);
  const unlink = useAtomCommand(threadEnvironment.unlinkPullRequest, { reportFailure: true });
  const watch = useAtomCommand(threadEnvironment.watchPullRequest, { reportFailure: true });
  const capabilities = useServerConfigs().get(threadRef.environmentId)?.environment.capabilities;
  const supportsWatch = capabilities?.threadPullRequestWatch === true;
  const handleUnlink = (link: ThreadPullRequestLink) => {
    void unlink({
      environmentId: threadRef.environmentId,
      input: {
        threadId: threadRef.threadId,
        host: link.host,
        repository: link.repository,
        number: link.number,
      },
    });
  };
  const handleSetWatching = (link: ThreadPullRequestLink, watching: boolean) => {
    void watch({
      environmentId: threadRef.environmentId,
      input: {
        threadId: threadRef.threadId,
        host: link.host,
        repository: link.repository,
        number: link.number,
        watching,
      },
    });
  };
  const header = (
    <header className="flex h-9 shrink-0 items-center gap-2 px-1">
      <h2 className="min-w-0 flex-1 truncate font-serif text-pr-linked-heading font-bold">
        {t.chat.rightPanel.linkedPullRequests}
      </h2>
      <Button size="md" variant="secondary" onClick={openLinkDialog}>
        <PullRequestGlyph.link className="size-3.25" />
        {t.git.pullRequest.linkPullRequest}
      </Button>
    </header>
  );

  if (linkCount === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-1.5 px-3 pb-3">
        {header}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2.5 text-center text-secondary-label">
          <span className="flex size-10 items-center justify-center rounded-compact-row shadow-well-project">
            <PullRequestGlyph.pullRequest aria-hidden className="size-4.5" />
          </span>
          <p className="text-secondary-copy-large">{t.git.pullRequest.noLinkedPullRequests}</p>
          <p className="max-w-60 text-secondary-copy text-muted-foreground">
            {
              t.git.pullRequest
                .pullRequestsTheAgentOpensFromThisThreadLandHereLinkOneYourselfFromAURLOrANumber
            }
          </p>
        </div>
      </div>
    );
  }

  return (
    <PullRequestSpeedModeContext value={speedMode}>
      <div className="flex h-full min-h-0 flex-col gap-1.5 px-3 pb-3">
        {header}
        {/* Keep mounted rows bounded for threads with hundreds of linked pull requests. */}
        <LegendList<PullRequestListLine>
          data={lines}
          keyExtractor={(line) => `${line.link.host}/${line.link.repository}#${line.link.number}`}
          extraData={{
            speedMode,
            environmentProjects,
            capabilities,
            supportsWatch,
            thread,
            threadRef,
          }}
          renderItem={({ item: line }) => (
            <div className="pb-1.5">
              <LinkRow
                line={line}
                threadRef={threadRef}
                projectId={
                  capabilities !== undefined
                    ? (findProjectForChangeRequest(environmentProjects, line.link)?.id ??
                      thread?.projectId ??
                      null)
                    : null
                }
                speedMode={speedMode}
                onUnlink={handleUnlink}
                onSetWatching={supportsWatch ? handleSetWatching : null}
              />
            </div>
          )}
          estimatedItemSize={64}
          drawDistance={440}
          className="min-h-0 flex-1 overscroll-contain"
        />
        <footer className="px-1 text-meta text-muted-foreground">
          <span>
            {t.git.pullRequest.linkedRequestCounts(openCount, links.length)}
            {lastSynced ? (
              <>
                {t.git.pullRequest.syncedAt("")}
                <RelativeTime timestamp={lastSynced} />
              </>
            ) : null}
          </span>
        </footer>
      </div>
    </PullRequestSpeedModeContext>
  );
}
