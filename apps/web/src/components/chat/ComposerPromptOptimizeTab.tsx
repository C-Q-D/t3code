/** Renders explicit improvement controls and feedback using the existing composer surfaces. */
import type { useComposerPromptOptimizer } from "./useComposerPromptOptimizer";
import { Check, WandSparkles } from "lucide-react";
import { t } from "~/i18n";
import { ComposerBanner } from "./ComposerBanner";
import { ComposerControl } from "./ComposerControl";
import { Button } from "../ui/button";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";

/** Presentation-only state; all entry points call the same optimizer trigger. */
type Optimizer = ReturnType<typeof useComposerPromptOptimizer>;

/** Stays outside the auto-hidden banner dock so the first pending update is announced. */
export function ComposerPromptOptimizeStatus({ optimizer }: { optimizer: Optimizer }) {
  return (
    <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {optimizer.label}
    </span>
  );
}

/** Shows transient visual feedback inside the banner dock without owning its lifecycle. */
export function ComposerPromptOptimizeTab({ optimizer }: { optimizer: Optimizer }) {
  if (!optimizer.label) return null;
  return (
    <ComposerBanner.Root density="comfortable" width="content" shoulderTab>
      <ComposerBanner.Row>
        <ComposerBanner.Icon>{optimizer.done ? <Check /> : <WandSparkles />}</ComposerBanner.Icon>
        <ComposerBanner.Content>{optimizer.label}</ComposerBanner.Content>
        {optimizer.done ? (
          <ComposerBanner.Actions>
            <Button variant="ghost" size="xs" onClick={optimizer.undo}>
              {t.composer.assist.optimize.undo}
            </Button>
          </ComposerBanner.Actions>
        ) : null}
      </ComposerBanner.Row>
    </ComposerBanner.Root>
  );
}

/** Provides the explicit improvement action beside the attachment button. */
export function ComposerPromptOptimizeButton({
  optimizer,
  shortcut,
}: {
  optimizer: Optimizer;
  shortcut?: string | null;
}) {
  if (!optimizer.visible) return null;
  const copy = t.composer.assist.optimize;
  const warning = !optimizer.disabledReason && optimizer.cacheMaybeExpired;
  const hint = optimizer.disabledReason ?? copy.button;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="group"
            aria-label={copy.button}
            className="relative inline-flex"
            tabIndex={optimizer.disabledReason ? 0 : undefined}
          />
        }
      >
        <ComposerControl
          variant="composer"
          size="sm"
          className="w-8.5 p-0"
          aria-label={copy.button}
          disabled={optimizer.disabledReason !== null}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void optimizer.trigger()}
        >
          <WandSparkles className="size-4.25" />
        </ComposerControl>
        {warning ? (
          <span
            aria-hidden="true"
            data-composer-cache-warning
            className="pointer-events-none absolute right-0 top-0 size-1.5 rounded-full bg-warning"
          />
        ) : null}
      </TooltipTrigger>
      <TooltipPopup>
        {hint}
        {!optimizer.disabledReason && shortcut ? (
          <span className="text-muted-foreground">{` ${shortcut}`}</span>
        ) : null}
        {warning ? <span className="text-warning">{` · ${copy.maybeFullPrice}`}</span> : null}
      </TooltipPopup>
    </Tooltip>
  );
}
