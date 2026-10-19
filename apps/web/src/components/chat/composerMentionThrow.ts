/** Native file-mention drag session; file selection remains owned by the tree. */
import { COMPOSER_MENTION_THROW_EVENT } from "../../lib/motion/composerThrow";
import { isPhysicsEnabled, onPhysicsChange } from "../../lib/motion/preference";
import { VelocityTracker } from "../../lib/motion/velocity";
import type { Point } from "../../lib/motion/project";
import {
  COMPOSER_MENTION_DRAG_TYPE,
  dataTransferHasComposerMention,
  composerMentionInsertionText,
} from "./composerMentionDrag";
import {
  findComposerThrowTarget,
  launchComposerThrow,
  type ThrowChannel,
} from "./ComposerThrowToken";

/** One native browser drag at a time; owner identifies the panel whose portal renders its flight. */
interface MentionSession {
  owner: symbol;
  channel: ThrowChannel;
  origin: Point;
  tracker: VelocityTracker;
  preview: HTMLElement | null;
  image: HTMLCanvasElement | null;
}
const owners = new Map<symbol, ThrowChannel>();
let session: MentionSession | null = null;
let listening = false;
let unsubscribe: (() => void) | null = null;

/** Remove native preview resources and velocity; completed drops own independent flight tokens. */
function clearSession() {
  session?.preview?.remove();
  session?.image?.remove();
  session = null;
}

/** Track the native drag's viewport point and event time; its data may be unreadable until drop. */
function beginSession(owner: symbol, channel: ThrowChannel, event: DragEvent): MentionSession {
  clearSession();
  const tracker = new VelocityTracker();
  tracker.addPointerEvent(event);
  session = {
    owner,
    channel,
    origin: { x: event.clientX, y: event.clientY },
    tracker,
    preview: null,
    image: null,
  };
  return session;
}

/** Claim only tagged tree mentions, permitting release outside the composer for path projection. */
function dragover(event: DragEvent) {
  if (
    !isPhysicsEnabled() ||
    !event.dataTransfer ||
    !dataTransferHasComposerMention(event.dataTransfer.types)
  )
    return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  const point = { x: event.clientX, y: event.clientY };
  if (!session) {
    const owner = owners.entries().next().value;
    if (owner) beginSession(owner[0], owner[1], event);
  }
  session?.tracker.addPointerEvent(event);
  if (session?.preview)
    session.preview.style.transform = `translate(${point.x + 12}px, ${point.y + 12}px)`;
}

/** Intercept a magnetic path hit before the editor; a miss keeps native propagation and never inserts. */
function drop(event: DragEvent) {
  if (
    !isPhysicsEnabled() ||
    !event.dataTransfer ||
    !dataTransferHasComposerMention(event.dataTransfer.types)
  )
    return;
  const text = event.dataTransfer.getData(COMPOSER_MENTION_DRAG_TYPE);
  if (!text) {
    clearSession();
    return;
  }
  const point = { x: event.clientX, y: event.clientY };
  session?.tracker.addPointerEvent(event);
  const velocity = session?.tracker.velocity(event.timeStamp) ?? { x: 0, y: 0 };
  const target = findComposerThrowTarget(point, velocity);
  const channel = session?.channel ?? owners.values().next().value;
  const origin = session?.origin ?? point;
  clearSession();
  if (target) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (!channel) return;
  launchComposerThrow({
    channel,
    point,
    velocity,
    origin,
    label: text,
    target,
    onLand: (form) =>
      form.dispatchEvent(
        new CustomEvent(COMPOSER_MENTION_THROW_EVENT, {
          detail: { text: composerMentionInsertionText(text) },
        }),
      ),
  });
}

/** Install/remove a single capture set even when several file panels are mounted. */
function listen(enabled: boolean) {
  if (listening === enabled) return;
  listening = enabled;
  if (enabled) {
    document.addEventListener("dragover", dragover, true);
    document.addEventListener("drop", drop, true);
    document.addEventListener("dragend", clearSession, true);
  } else {
    document.removeEventListener("dragover", dragover, true);
    document.removeEventListener("drop", drop, true);
    document.removeEventListener("dragend", clearSession, true);
    clearSession();
  }
}

/** Own one file panel's native throw integration. Disabled physics installs no document listeners.
 * Call start from a bubbling dragstart listener after the tree chooses its system image;
 * dispose on panel unmount. The channel must match that panel's ComposerThrowToken portal.
 */
export function installComposerMentionThrow(channel: ThrowChannel = "mention") {
  const owner = Symbol();
  if (isPhysicsEnabled()) {
    owners.set(owner, channel);
    listen(true);
    unsubscribe ??= onPhysicsChange((enabled) => listen(enabled && owners.size > 0));
  }
  return {
    start(event: DragEvent) {
      if (
        !owners.has(owner) ||
        !isPhysicsEnabled() ||
        event.defaultPrevented ||
        !event.dataTransfer
      )
        return;
      if (!dataTransferHasComposerMention(event.dataTransfer.types)) return;
      const text = event.dataTransfer.getData(COMPOSER_MENTION_DRAG_TYPE);
      if (!text) return;
      const current = beginSession(owner, channel, event);
      // The installed tree exposes native DataTransfer. Set our image after its
      // row handler so the library cannot overwrite the transparent image.
      const image = document.createElement("canvas");
      image.width = image.height = 1;
      image.setAttribute("aria-hidden", "true");
      image.style.position = "fixed";
      image.style.pointerEvents = "none";
      document.body.append(image);
      current.image = image;
      event.dataTransfer.setDragImage(image, 0, 0);
      const preview = document.createElement("div");
      preview.setAttribute("aria-hidden", "true");
      preview.setAttribute("data-composer-mention-preview", "true");
      preview.className =
        "pointer-events-none fixed left-0 top-0 z-100 w-62.5 truncate rounded-card-row bg-sidebar-row-drag px-3 py-2.5 text-foreground shadow-sidebar-context-drag";
      preview.textContent = text;
      preview.style.transform = `translate(${event.clientX + 12}px, ${event.clientY + 12}px)`;
      document.body.append(preview);
      current.preview = preview;
    },
    dispose() {
      owners.delete(owner);
      if (session?.owner === owner) clearSession();
      if (owners.size === 0) {
        listen(false);
        unsubscribe?.();
        unsubscribe = null;
      }
    },
  };
}
