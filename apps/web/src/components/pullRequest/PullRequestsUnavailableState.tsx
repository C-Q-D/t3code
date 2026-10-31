/** Owns pull requests unavailable state on the web pull-request surface; host data and agent context remain unchanged. */
import { t } from "~/i18n";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import { CircleAlertIcon, ExternalLinkIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { PullRequestGlyph } from "./pullRequestIcons";
import { PullRequestListStatus } from "./PullRequestListStatus";

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
  host,
  variant = "default",
}: {
  title?: string;
  error: string;
  onRetry?: () => void;
  refreshing?: boolean;
  host?: { readonly url: string; readonly openLabel: string };
  /** Only the list opts into L6; detail and linked-panel callers keep their current surface. */
  variant?: "default" | "list";
}) {
  if (variant === "list") {
    return (
      <PullRequestListStatus Icon={CircleAlertIcon} title={title} description={error}>
        {onRetry ? (
          <Button
            size="md"
            variant="outline"
            onClick={onRetry}
            disabled={refreshing}
            aria-busy={refreshing}
          >
            <RefreshIcon size="sm" refreshing={refreshing} />
            {t.git.pullRequest.retry}
          </Button>
        ) : null}
        {host ? (
          <Button
            size="md"
            variant="outline"
            render={<a href={host.url} target="_blank" rel="noopener noreferrer" />}
          >
            <ExternalLinkIcon aria-hidden className="size-3.5" />
            {host.openLabel}
          </Button>
        ) : null}
      </PullRequestListStatus>
    );
  }
  return (
    <Empty className="scrollbar-gutter-both min-h-0 justify-center-safe overflow-y-auto [&>*]:shrink-0">
      <EmptyMedia variant="icon">
        <PullRequestGlyph.pullRequest />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{error}</EmptyDescription>
      </EmptyHeader>
      {onRetry || host ? (
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
          {host ? (
            <Button
              size="sm"
              variant="outline"
              render={<a href={host.url} target="_blank" rel="noopener noreferrer" />}
            >
              <ExternalLinkIcon aria-hidden className="size-3.5" />
              {host.openLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Empty>
  );
}
