/** Renders explicit improvement controls and feedback using the existing composer surfaces. */
import type { useComposerPromptOptimizer } from "./useComposerPromptOptimizer";
import { Check, WandSparkles } from "lucide-react";
import { t } from "~/i18n";
import { ComposerBanner } from "./ComposerBanner";
import { Button } from "../ui/button";

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
