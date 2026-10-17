/** Maps existing list empty/search states onto the L6 cards without changing recovery conditions. */
import { FolderXIcon, ListFilterIcon, PlusIcon, SearchIcon } from "lucide-react";

import { t } from "~/i18n";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import { openCommandPalette } from "../../commandPaletteBus";
import { Button } from "../ui/button";
import { PullRequestListGhost } from "./PullRequestGhosts";
import { PullRequestListStatus } from "./PullRequestListStatus";
import { PullRequestGlyph } from "./pullRequestIcons";

/**
 * Keep no-project, searching, query-empty and filter-empty precedence and their existing actions.
 * @param props Current list state and callbacks; no-project and searching do not offer refresh.
 * @returns The matching L6 status card or the list loading placeholder.
 */
export function PullRequestListEmptyState({
  query,
  filtered,
  searching,
  hasProjects,
  canLoadMore,
  loadingMore,
  refreshing,
  onClearQuery,
  onLoadMore,
  onRefresh,
}: {
  query: string;
  filtered: boolean;
  searching: boolean;
  hasProjects: boolean;
  canLoadMore: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  onClearQuery: () => void;
  onLoadMore: () => void;
  onRefresh: () => void;
}) {
  if (!hasProjects) {
    return (
      <PullRequestListStatus Icon={FolderXIcon} title={t.git.pullRequest.noProjectsInThisWorkspace}>
        <Button size="md" onClick={() => openCommandPalette({ open: "add-project" })}>
          <PlusIcon aria-hidden className="size-3.5" />
          {t.git.pullRequest.addProject}
        </Button>
      </PullRequestListStatus>
    );
  }
  if (searching) {
    return (
      <PullRequestListGhost
        rows={5}
        caption={t.git.pullRequest.searchingHosts(
          query.length > 48 ? `${query.slice(0, 48)}…` : query,
        )}
      />
    );
  }
  if (query.length > 0) {
    return (
      <PullRequestListStatus
        Icon={SearchIcon}
        title={t.git.pullRequest.nothingMatches(
          query.length > 48 ? `${query.slice(0, 48)}…` : query,
        )}
      >
        <Button size="md" variant="outline" onClick={onClearQuery}>
          <SearchIcon aria-hidden className="size-3.5" />
          {t.git.pullRequest.clearSearch}
        </Button>
        <Button size="md" variant="outline" disabled={refreshing} onClick={onRefresh}>
          <RefreshIcon size="sm" refreshing={refreshing} />
          {refreshing ? t.git.pullRequest.checking : t.git.pullRequest.checkAgain}
        </Button>
      </PullRequestListStatus>
    );
  }
  return (
    <PullRequestListStatus
      Icon={filtered ? ListFilterIcon : PullRequestGlyph.pullRequest}
      title={
        filtered ? t.git.pullRequest.nothingUnderTheseFilters : t.git.pullRequest.noPullRequests
      }
    >
      {canLoadMore ? (
        <Button size="md" variant="outline" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? t.git.pullRequest.loading : t.git.pullRequest.loadMorePullRequests}
        </Button>
      ) : null}
      <Button size="md" variant="outline" disabled={refreshing} onClick={onRefresh}>
        <RefreshIcon size="sm" refreshing={refreshing} />
        {refreshing ? t.git.pullRequest.checking : t.git.pullRequest.checkAgain}
      </Button>
    </PullRequestListStatus>
  );
}
