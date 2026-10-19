/** Owns the composer's throw feedback and DOM event lifetime, outside editor content. */
import {
  COMPOSER_IMPACT_EVENT,
  COMPOSER_MENTION_THROW_EVENT,
  COMPOSER_MASS_RATIO,
  type ComposerImpactDetail,
} from "../../lib/motion/composerThrow";
import { clearOffset, nudge } from "../../lib/motion/elementOffset";
import { run } from "../../lib/motion/loop";
import { isPhysicsEnabled, onPhysicsChange } from "../../lib/motion/preference";
import { Spring } from "../../lib/motion/spring";
import { TOKENS } from "../../lib/motion/tokens";

/** Convert viewport impact velocity to bounded surface impulses; dimensions are CSS pixels. */
export function composerImpactParameters(
  detail: ComposerImpactDetail,
  width: number,
  height: number,
) {
  const speed = Math.hypot(detail.vx, detail.vy);
  if (speed < 40 || width <= 0 || height <= 0) {
    return { vx: 0, vy: 0, scaleVx: 0, scaleVy: 0, depthPx: 0 };
  }
  const depthPx = Math.min(10, Math.max(3.5, speed / 160));
  const vertical = Math.abs(detail.vy) / speed;
  const compression = depthPx * ((2 * Math.PI) / TOKENS.jolt.response) * 1.4;
  return {
    vx: Math.max(-240, Math.min(240, detail.vx * COMPOSER_MASS_RATIO)),
    vy: Math.max(-240, Math.min(240, detail.vy * COMPOSER_MASS_RATIO)),
    scaleVx: (compression * (1.5 * vertical - 1)) / width,
    scaleVy: vertical === 0 ? 0 : (-compression * vertical) / height,
    depthPx,
  };
}

/** Return a neighboring label's px/s impulse at a viewport x coordinate. */
export function composerNeighborImpulse(detail: ComposerImpactDetail, centerX: number) {
  const dx = centerX - detail.atX;
  const falloff = Math.max(0, 1 - Math.abs(dx) / 260);
  const speed = Math.hypot(detail.vx, detail.vy);
  return {
    vx: Math.sign(dx || 1) * 320 * falloff * Math.min(1, Math.max(0.3, speed / 1500)),
    vy: detail.vy * 0.04 * falloff,
  };
}

/** Attach K4 listeners to a form; insertion retains the existing editor path and rejection UX. */
export function attachComposerImpact(
  form: HTMLFormElement,
  insert: (text: string) => boolean,
  reject: () => void,
) {
  const surface = form.querySelector<HTMLElement>("[data-chat-composer-main-surface]");
  if (!isPhysicsEnabled() || !surface) return { dispose() {} };
  const originalSurfaceTransform = surface.style.transform;
  const originalFormTransform = form.style.transform;
  const x = new Spring({ token: TOKENS.jolt });
  const y = new Spring({ token: TOKENS.jolt });
  const scaleX = new Spring({ value: 1, token: TOKENS.jolt, precision: 0.0001 });
  const scaleY = new Spring({ value: 1, token: TOKENS.jolt, precision: 0.0001 });
  const pull = new Spring();
  const neighbors = new Set<HTMLElement>();
  let cancel: (() => void) | undefined;
  let disposed = false;
  const start = () => {
    if (cancel || disposed || !isPhysicsEnabled()) return;
    cancel = run((dt) => {
      // Step every channel even when another is moving; short circuiting freezes springs.
      const moving = [x, y, scaleX, scaleY, pull].map((spring) => spring.step(dt)).some(Boolean);
      surface.style.transform = moving
        ? `${originalSurfaceTransform} translate(${x.value}px, ${y.value}px) scale(${scaleX.value}, ${scaleY.value})`
        : originalSurfaceTransform;
      form.style.transform =
        pull.value === 0
          ? originalFormTransform
          : `${originalFormTransform} translateY(${pull.value}px)`;
      if (!moving) cancel = undefined;
      return moving;
    });
  };
  const onImpact = (event: Event) => {
    if (!isPhysicsEnabled() || !(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (
      !detail ||
      typeof detail !== "object" ||
      !("vx" in detail) ||
      !("vy" in detail) ||
      !("atX" in detail) ||
      typeof detail.vx !== "number" ||
      typeof detail.vy !== "number" ||
      typeof detail.atX !== "number" ||
      !Number.isFinite(detail.vx) ||
      !Number.isFinite(detail.vy) ||
      !Number.isFinite(detail.atX)
    )
      return;
    const impact = { vx: detail.vx, vy: detail.vy, atX: detail.atX };
    const rect = surface.getBoundingClientRect();
    const parameters = composerImpactParameters(impact, rect.width, rect.height);
    if (parameters.depthPx === 0) return;
    x.velocity += parameters.vx;
    y.velocity += parameters.vy;
    scaleX.velocity += parameters.scaleVx;
    scaleY.velocity += parameters.scaleVy;
    const shell = form.closest('[data-slot="composer-shell"]') ?? form;
    for (const neighbor of shell.querySelectorAll<HTMLElement>(
      '[data-slot="composer-context-strip"] [data-composer-label-motion], [data-composer-shoulder-tab]',
    )) {
      const bounds = neighbor.getBoundingClientRect();
      const impulse = composerNeighborImpulse(impact, bounds.left + bounds.width / 2);
      if (impulse.vx === 0 && impulse.vy === 0) continue;
      neighbors.add(neighbor);
      nudge(neighbor, impulse.vx, impulse.vy);
    }
    start();
  };
  const onMention = (event: Event) => {
    if (!isPhysicsEnabled() || !(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (
      !detail ||
      typeof detail !== "object" ||
      !("text" in detail) ||
      typeof detail.text !== "string" ||
      !detail.text
    )
      return;
    if (!insert(detail.text)) reject();
  };
  const updatePull = () => {
    // K4 exposes target membership, not a shared ghost position. Lean upward by 6 px.
    pull.target = form.hasAttribute("data-thread-context-over") ? -6 : 0;
    if (!pull.isSettled) start();
  };
  const observer = new MutationObserver(updatePull);
  observer.observe(form, { attributes: true, attributeFilter: ["data-thread-context-over"] });
  form.addEventListener(COMPOSER_IMPACT_EVENT, onImpact);
  form.addEventListener(COMPOSER_MENTION_THROW_EVENT, onMention);
  let unsubscribe: (() => void) | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    form.removeEventListener(COMPOSER_IMPACT_EVENT, onImpact);
    form.removeEventListener(COMPOSER_MENTION_THROW_EVENT, onMention);
    cancel?.();
    cancel = undefined;
    unsubscribe?.();
    for (const neighbor of neighbors) clearOffset(neighbor);
    neighbors.clear();
    surface.style.transform = originalSurfaceTransform;
    form.style.transform = originalFormTransform;
  };
  unsubscribe = onPhysicsChange((enabled) => {
    if (!enabled) dispose();
  });
  updatePull();
  return { dispose };
}
