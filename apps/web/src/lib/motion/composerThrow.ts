/** Shared throw geometry and event contracts; senders and receivers own dispatch and effects. */
import type { ThrowTarget } from "./project";

export const COMPOSER_FIELD_PX = 140;
export const COMPOSER_MASS_RATIO = 0.07;
export const COMPOSER_IMPACT_EVENT = "t3:composer-impact";
export const COMPOSER_MENTION_THROW_EVENT = "t3:composer-mention-throw";

/** CustomEvent detail: incoming px/s velocity and viewport CSS pixel impact x. */
export interface ComposerImpactDetail {
  vx: number;
  vy: number;
  atX: number;
}
/** CustomEvent detail: mention text inserted only after the token reaches its destination. */
export interface ComposerMentionThrowDetail {
  text: string;
}

/** Measure the form in viewport CSS pixels for use with clientX/clientY throw coordinates. */
export function composerFieldTarget(form: HTMLElement): ThrowTarget {
  return { rect: form.getBoundingClientRect(), fieldPx: COMPOSER_FIELD_PX };
}
