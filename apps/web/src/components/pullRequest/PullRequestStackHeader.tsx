/** Owns pull request stack header on the web pull-request surface; host data and agent context remain unchanged. */
import { t } from "~/i18n";
import { MenuGroupLabel } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/**
 * Renders pull request stack header from the supplied display data and callbacks.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface.
 */
export function PullRequestStackHeader({
  number,
  notice,
  stale = false,
}: {
  number: number;
  notice?: string | null | undefined;
  stale?: boolean;
}) {
  return (
    <MenuGroupLabel>
      <div className="flex items-center justify-between gap-2">
        <span>{t.git.pullRequest.stackNumber(number)}</span>
        {notice ? (
          <Tooltip>
            <TooltipTrigger render={<span role="status" className="text-xs font-normal" />}>
              {stale ? t.git.pullRequest.mayBeStale : t.git.pullRequest.refreshing}
            </TooltipTrigger>
            <TooltipPopup>{notice}</TooltipPopup>
          </Tooltip>
        ) : null}
      </div>
    </MenuGroupLabel>
  );
}
