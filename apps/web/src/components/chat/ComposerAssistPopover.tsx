/** Combines explicit prompt improvement with the next reply's independent rewrite decision. */
import { useId, useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Layers3, Sparkle, WandSparkles, RefreshCw, Play } from "lucide-react";
import { t } from "~/i18n";
import { Button } from "../ui/button";
import { Popover, PopoverTrigger, PopoverPopup } from "../ui/popover";
import { Switch } from "../ui/switch";
import { ComposerControl } from "./ComposerControl";
import type { useComposerPromptOptimizer } from "./useComposerPromptOptimizer";

/** The caller owns selection and permission; opening this panel has no model side effects. */
export function ComposerAssistPopover({
  optimizer,
  shortcut,
  rewrite,
}: {
  optimizer: ReturnType<typeof useComposerPromptOptimizer>;
  shortcut?: string | null;
  rewrite?: {
    checked: boolean;
    disabledReason: string | null;
    onCheckedChange: (checked: boolean) => void;
  };
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const copy = t.composer.assist.tools;
  const optimize = t.composer.assist.optimize;
  const checked = rewrite?.checked ?? false;
  const warning = optimizer.visible && !optimizer.disabledReason && optimizer.cacheMaybeExpired;
  const optimizeReason = optimizer.visible ? optimizer.disabledReason : copy.optimizeUnavailable;
  const rewriteReason = rewrite?.disabledReason ?? (rewrite ? null : copy.codexOnly);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <ComposerControl
            variant="composer"
            size="sm"
            className="composer-assist-trigger w-8.5 p-0"
          />
        }
        aria-label={`${copy.title} · ${checked ? copy.rewriteOn : copy.rewriteOff}`}
        data-rewrite-enabled={checked ? "true" : "false"}
        data-panel-open={open ? "true" : "false"}
      >
        <span className="composer-assist-trigger-icon" aria-hidden="true">
          <Layers3 className="size-4.25" />
          <Sparkle className="composer-assist-sparkle" />
        </span>
        {checked ? <span className="composer-assist-enabled-dot" aria-hidden="true" /> : null}
        {warning ? (
          <span
            data-composer-cache-warning
            className="composer-assist-cache-dot"
            aria-hidden="true"
          />
        ) : null}
      </PopoverTrigger>
      <PopoverPopup
        side="top"
        sideOffset={12}
        variant="bare"
        padding="none"
        className="w-[min(368px,calc(100vw-24px))]"
        aria-label={copy.title}
        arrow={
          <PopoverPrimitive.Arrow className="composer-assist-arrow" aria-hidden="true">
            <svg width="24" height="12" viewBox="0 0 24 12">
              <path d="M0 0L12 11L24 0" />
            </svg>
          </PopoverPrimitive.Arrow>
        }
      >
        <div className="composer-assist-panel">
          <div className="composer-assist-row">
            <span className="composer-assist-icon composer-assist-icon-optimize" aria-hidden="true">
              <WandSparkles className="size-5" />
            </span>
            <div className="composer-assist-copy">
              <p className="composer-assist-title">{optimize.button}</p>
              <p className="composer-assist-description">{copy.optimizeDescription}</p>
            </div>
            <Button
              variant="accent"
              size="compact"
              aria-label={copy.optimizeNow}
              disabled={optimizeReason !== null || optimizer.inFlight}
              aria-describedby={`${id}-optimize-help`}
              aria-busy={optimizer.inFlight}
              onClick={() => void optimizer.trigger()}
            >
              <Play aria-hidden="true" />
              {optimizer.inFlight ? optimize.inFlight : copy.optimizeNow}
            </Button>
          </div>
          <div id={`${id}-optimize-help`} className="composer-assist-help">
            {optimizeReason ? <p>{optimizeReason}</p> : null}
            {!optimizeReason && shortcut ? (
              <span className="composer-assist-shortcut">{shortcut}</span>
            ) : null}
            {warning ? <span>{optimize.maybeFullPrice}</span> : null}
          </div>
          <div className="composer-assist-divider" />
          <div className="composer-assist-row">
            <span className="composer-assist-icon composer-assist-icon-rewrite" aria-hidden="true">
              <RefreshCw className="size-5" />
            </span>
            <div className="composer-assist-copy">
              <label htmlFor={`${id}-rewrite`} className="composer-assist-title">
                {copy.rewrite}
              </label>
              <p className="composer-assist-description">{copy.rewriteDescription}</p>
            </div>
            <Switch
              id={`${id}-rewrite`}
              variant="accent"
              checked={checked}
              disabled={rewriteReason !== null}
              aria-describedby={rewriteReason ? `${id}-rewrite-help` : undefined}
              onCheckedChange={(value) => rewrite?.onCheckedChange(value)}
            />
          </div>
          {rewriteReason ? (
            <p id={`${id}-rewrite-help`} className="composer-assist-help">
              {rewriteReason}
            </p>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
