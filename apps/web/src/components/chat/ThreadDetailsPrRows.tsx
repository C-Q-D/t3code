/** Displays linked pull requests with expandable additional rows. */
import { t } from "~/i18n";
import { AuthOrchestrationOperateScope } from "@t3tools/contracts";
import { ThreadDetailsControl } from "./ThreadDetailsControl";
import type { EnvironmentId, ScopedThreadRef, ThreadPullRequestLink } from "@t3tools/contracts";
import {
  pullRequestListLines,
  resolveThreadPullRequestChains,
  threadPullRequestKeyOf,
  visibleThreadPullRequests,
} from "@t3tools/shared/threadPullRequests";
import { Minus, Plus } from "lucide";
import { useState, type ComponentProps, type MouseEvent as ReactMouseEvent } from "react";

import { findProjectOnChangeRequestHost, parseChangeRequestUrl } from "~/lib/openPullRequestLink";

import { useProjects, useServerConfigs, useThreadShell } from "~/state/entities";
import { threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";
import { readEnvironmentScope, useEnvironmentScope } from "~/state/session";

import { MorphIcon } from "~/components/MorphIcon";
import { linkedPullRequestSnapshotStatus, prStatusIndicator } from "../ThreadStatusIndicators";

import { ThreadDetailsPrRow } from "./ThreadDetailsPrRow";
import { canStartThreadPullRequestWatch } from "./ThreadDetailsPrRows.logic";

/**
 * Resolves a linked PR's project and snapshot without changing its watch state or navigation.
 * @param props - Destination environment, persisted link, open callback and optional watch/actions.
 * @returns One details row, using the snapshot until host details arrive.
 */
function ThreadDetailsPrLinkRow({
  environmentId,
  link,
  onOpen,
  onActed,
  onStopWatching,
  onStartWatching,
  isWatching,
}: {
  environmentId: EnvironmentId;
  link: ThreadPullRequestLink;
  onOpen: (event: ReactMouseEvent<HTMLElement>) => void;
  onActed?: (() => void) | undefined;
  onStopWatching?: (() => void) | undefined;
  onStartWatching?: (() => void) | undefined;
  isWatching?: boolean | undefined;
}) {
  const projects = useProjects();
  const parsed = parseChangeRequestUrl(link.url);
  const project =
    parsed === null
      ? null
      : (findProjectOnChangeRequestHost(
          projects.filter((candidate) => candidate.environmentId === environmentId),
          parsed,
        ) ?? null);
  const linked = linkedPullRequestSnapshotStatus(link);
  const pr = linked?.pr ?? null;
  return (
    <ThreadDetailsPrRow
      environmentId={environmentId}
      pr={pr}
      number={link.number}
      reference={link}
      status={prStatusIndicator(pr, linked?.sourceControlProvider)}
      project={project}
      label={`#${link.number}${link.snapshot === null ? "" : `: ${link.snapshot.title}`}`}
      openAriaLabel={link.url}
      onOpen={onOpen}
      onStopWatching={onStopWatching}
      onStartWatching={onStartWatching}
      isWatching={isWatching}
      {...(onActed ? { onActed } : {})}
    />
  );
}

/**
 * Renders the current pull request and an expandable list of linked pull requests.
 * @param props - Required threadRef, links (possibly empty), and onOpenLink callback; currentLink
 * may be null. Remaining props configure ThreadDetailsPrRow, including its nullable status/project
 * and optional host-action callbacks.
 * @returns The pull-request rows and any additional-links disclosure; never null.
 */
export function ThreadDetailsPrRows({
  threadRef,
  links,
  currentLink,
  onOpenLink,
  ...row
}: ComponentProps<typeof ThreadDetailsPrRow> & {
  threadRef: ScopedThreadRef;
  links: ReadonlyArray<ThreadPullRequestLink>;
  currentLink: ThreadPullRequestLink | null;
  onOpenLink: (event: ReactMouseEvent<HTMLElement>, url: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const thread = useThreadShell(threadRef);
  const watch = useAtomCommand(threadEnvironment.watchPullRequest, { reportFailure: true });
  const permitted = useEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope);
  const supported =
    useServerConfigs().get(threadRef.environmentId)?.environment.capabilities
      .threadPullRequestWatch === true;
  // Lifecycle restrictions apply only to starting; an existing watch must remain stoppable.
  const setWatching = (link: ThreadPullRequestLink | null, watching: boolean) =>
    !link ||
    !supported ||
    !permitted ||
    (watching &&
      (!canStartThreadPullRequestWatch(thread) ||
        link.snapshot?.state === "closed" ||
        link.snapshot?.state === "merged"))
      ? undefined
      : () => {
          if (!readEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope)) return;
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
  const watchProps = (link: ThreadPullRequestLink | null) => ({
    isWatching: link?.watch !== undefined,
    onStartWatching: link?.watch === undefined ? setWatching(link, true) : undefined,
    onStopWatching: link?.watch === undefined ? undefined : setWatching(link, false),
  });
  const currentRow = <ThreadDetailsPrRow {...row} {...watchProps(currentLink)} />;
  const rest =
    currentLink === null
      ? []
      : pullRequestListLines(resolveThreadPullRequestChains(visibleThreadPullRequests(links)))
          .map((line) => line.link)
          .filter((link) => threadPullRequestKeyOf(link) !== threadPullRequestKeyOf(currentLink));
  if (rest.length === 0) return currentRow;

  return (
    <>
      {currentRow}
      {expanded ? (
        <div data-thread-details-pr-list className="flex flex-col">
          {rest.map((link) => (
            <ThreadDetailsPrLinkRow
              key={threadPullRequestKeyOf(link)}
              environmentId={row.environmentId}
              link={link}
              onOpen={(event) => onOpenLink(event, link.url)}
              onActed={row.onActed}
              {...watchProps(link)}
            />
          ))}
        </div>
      ) : null}
      <ThreadDetailsControl
        variant="ghost"
        size="sm"
        onClick={() => setExpanded(!expanded)}
        part="row"
        tone="muted"
        className="w-full active:scale-100"
      >
        <MorphIcon aria-hidden className="size-4 shrink-0" icon={expanded ? Minus : Plus} />
        {expanded ? t.chat.details.showLess : t.chat.details.showMore(rest.length)}
      </ThreadDetailsControl>
    </>
  );
}
