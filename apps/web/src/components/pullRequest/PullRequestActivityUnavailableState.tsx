/** Owns pull request activity unavailable state on the web pull-request surface; host data and agent context remain unchanged. */
import { t } from "~/i18n";
import { RefreshIcon } from "~/components/ui/refresh-icon";

import { cn } from "~/lib/utils";

import { Button } from "../ui/button";

/**
 * Renders pull request activity unavailable state from the supplied display data and callbacks.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface.
 */
export function PullRequestActivityUnavailableState({
  error,
  onRetry,
  compact = false,
}: {
  error: string;
  onRetry: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-center",
        compact ? "py-3" : "min-h-48 px-4 py-10",
      )}
    >
      <p className="text-sm font-medium text-foreground">
        {t.git.pullRequest.couldNotLoadPullRequestActivity}
      </p>
      <p className="max-w-md text-xs text-muted-foreground">{error}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RefreshIcon aria-hidden size="sm" />
        {t.git.pullRequest.retry}
      </Button>
    </div>
  );
}
