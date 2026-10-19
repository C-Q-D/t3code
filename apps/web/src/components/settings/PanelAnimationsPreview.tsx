/** Interactive M3 panel preview; only a user click changes its transform. */
import { t } from "~/i18n";
import { type CSSProperties, useState } from "react";

import { cn } from "~/lib/utils";
import { usePhysicsMotion } from "~/hooks/usePhysicsMotion";

/**
 * Previews the physics curve or legacy duration in milliseconds after a user click.
 * The legacy curve uses Tailwind's ease-out token, not the different CSS ease-out keyword.
 */
export function PanelAnimationsPreview({ durationMs }: { durationMs: number }) {
  const [panelsOpen, setPanelsOpen] = useState(true);
  const { enabled: physics } = usePhysicsMotion();
  return (
    <button
      type="button"
      className="relative block h-16 w-full cursor-pointer overflow-hidden rounded-compact-row bg-input shadow-well-track outline-none focus-visible:inset-shadow-focus"
      aria-label={t.settings.panelAnimationsPreview.replayPanelAnimationPreview}
      aria-pressed={panelsOpen}
      onClick={() => setPanelsOpen((open) => !open)}
      style={
        {
          "--preview-duration": physics ? "var(--motion-settle-duration)" : `${durationMs}ms`,
          "--preview-easing": physics ? "var(--ease-settle)" : "var(--ease-out)",
        } as CSSProperties
      }
    >
      <span aria-hidden className="absolute top-2 left-3 font-mono text-meta text-placeholder">
        {t.settings.appearance.preview}
      </span>
      <span aria-hidden className="settings-motion-travel absolute top-1/2 h-0.5 w-10" />
      <span
        aria-hidden
        className={cn(
          "settings-motion-panel absolute top-2 right-2.5 bottom-2 rounded-settings-motion-panel bg-secondary shadow-settings-motion-panel transition-transform duration-(--preview-duration) ease-(--preview-easing)",
          !physics && "motion-reduce:transition-none",
          panelsOpen ? "translate-x-0" : "translate-x-full",
        )}
      />
    </button>
  );
}
