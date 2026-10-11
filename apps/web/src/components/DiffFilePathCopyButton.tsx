/** Renders a localized copy affordance while copying the original file path. */
import { t } from "~/i18n";
import { Check, Copy } from "lucide";
import { useRef } from "react";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { cn } from "../lib/utils";
import {
  ANCHORED_COPY_TOAST_TIMEOUT_MS,
  showAnchoredCopyErrorToast,
  showAnchoredCopySuccessToast,
} from "./ui/anchoredCopyToast";
import { Button } from "./ui/button";
import { MorphIcon } from "~/components/MorphIcon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

/**
 * Renders diff file path copy button from the supplied display data and callbacks.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface.
 */
export function DiffFilePathCopyButton({ filePath }: { filePath: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { copyToClipboard, isCopied } = useCopyToClipboard<void>({
    onCopy: () => showAnchoredCopySuccessToast(ref),
    onError: (error) => showAnchoredCopyErrorToast(ref, error),
    timeout: ANCHORED_COPY_TOAST_TIMEOUT_MS,
  });

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            ref={ref}
            size="icon-micro"
            variant="ghost-muted"
            aria-label={t.git.diff.copyFilePath}
            onClick={() => copyToClipboard(filePath, undefined)}
          />
        }
      >
        <MorphIcon
          className={cn("size-3", isCopied && "text-success")}
          icon={isCopied ? Check : Copy}
        />
      </TooltipTrigger>
      <TooltipPopup>
        <p>{isCopied ? t.git.diff.copied : t.git.diff.copyPath}</p>
      </TooltipPopup>
    </Tooltip>
  );
}
