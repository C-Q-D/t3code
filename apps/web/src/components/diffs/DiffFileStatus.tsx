/** Owns diff file status for web diff views; patch and comment context values remain unchanged. */
import { t } from "~/i18n";
import { InfoIcon, RotateCwIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/**
 * Renders a retry or truncation indicator; returns null when the file has neither an error nor truncation.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface; null under the conditions described above.
 */
export function DiffFileStatus({
  error,
  truncated,
  retry,
}: {
  error?: boolean | undefined;
  truncated?: boolean | undefined;
  retry: () => void;
}) {
  if (!error && !truncated) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-micro"
            variant="ghost-muted"
            aria-label={error ? t.git.diff.retryLoadingDiff : t.git.diff.partialDiffPreview}
            onClick={(event) => {
              event.stopPropagation();
              if (error) retry();
            }}
          />
        }
      >
        {error ? <RotateCwIcon className="size-3" /> : <InfoIcon className="size-3" />}
      </TooltipTrigger>
      <TooltipPopup>
        {error
          ? t.git.diff.retryLoadingDiff
          : t.git.diff.thisFileIsTooLargeToShowInFullCountsIncludeAllChanges}
      </TooltipPopup>
    </Tooltip>
  );
}
