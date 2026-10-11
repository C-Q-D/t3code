/** Owns pull requests unavailable state on the web pull-request surface; host data and agent context remain unchanged. */
import { t } from "~/i18n";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import { ExternalLinkIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { PullRequestGlyph } from "./pullRequestIcons";

/**
 * Renders pull requests unavailable state from the supplied display data and callbacks.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface.
 */
export function PullRequestsUnavailableState({
  title = t.git.pullRequest.couldNotLoadPullRequests,
  error,
  onRetry,
  refreshing = false,
  gitHubUrl,
}: {
  title?: string;
  error: string;
  onRetry?: () => void;
  refreshing?: boolean;
  gitHubUrl?: string;
}) {
  return (
    <Empty className="min-h-0 justify-center-safe overflow-y-auto [&>*]:shrink-0">
      <EmptyMedia variant="icon">
        <PullRequestGlyph.pullRequest />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {/* The caller names the fix — update the environment, install gh, sign in — so this
            shows its message rather than trying to infer one from the failure text. */}
        <EmptyDescription>{error}</EmptyDescription>
      </EmptyHeader>
      {onRetry || gitHubUrl ? (
        <div className="flex flex-wrap justify-center gap-2">
          {onRetry ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onRetry}
              disabled={refreshing}
              aria-busy={refreshing}
            >
              <RefreshIcon size="sm" refreshing={refreshing} />
              {t.git.pullRequest.retry}
            </Button>
          ) : null}
          {gitHubUrl ? (
            <Button
              size="sm"
              variant="outline"
              render={<a href={gitHubUrl} target="_blank" rel="noopener noreferrer" />}
            >
              <ExternalLinkIcon aria-hidden className="size-3.5" />
              {t.git.pullRequest.openOnGitHub}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Empty>
  );
}
