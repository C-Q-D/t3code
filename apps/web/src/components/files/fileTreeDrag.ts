/** File-panel gesture bridge: native mentions when physics is off, pointer-owned cards when it is on. */
import { COMPOSER_MENTION_THROW_EVENT } from "../../lib/motion/composerThrow";
import { isPhysicsEnabled, onPhysicsChange } from "../../lib/motion/preference";
import { beginComposerThrowDrag, type ThrowChannel } from "../chat/ComposerThrowToken";
import {
  COMPOSER_MENTION_DRAG_TYPE,
  composerMentionInsertionText,
} from "../chat/composerMentionDrag";
import type { FileTreeDragMentionController } from "./fileTreeDragMention";

/** Find the actual row across the tree's open shadow root; panel chrome has no row. */
function rowFromEvent(event: Event): HTMLElement | undefined {
  return event
    .composedPath()
    .find(
      (node): node is HTMLElement =>
        node instanceof HTMLElement && node.hasAttribute("data-item-path"),
    );
}

/** Install capture handlers on one panel and release handlers on document/window.
 * controller owns selection and native payloads; channel identifies the mounted token portal.
 * deselect releases each dragged path in the current tree model.
 * Returns an idempotent disposer. A cancelled native start retains the recorded pointer stream;
 * selection is cleared at release/cancellation, while the independent flight may finish later.
 */
export function installFileTreeDrag(
  panel: HTMLElement,
  controller: FileTreeDragMentionController,
  channel: ThrowChannel,
  deselect: (treePath: string) => void,
): () => void {
  let pressed: { event: PointerEvent; path: string | null } | null = null;
  let pointerDrag = false;
  let suppressClick = false;
  let cancelDrag: (() => void) | null = null;
  let disposed = false;

  const finishPointer = () => {
    if (pointerDrag) controller.handleDragEnd(deselect);
    pointerDrag = false;
    pressed = null;
    cancelDrag = null;
  };
  const pointerdown = (event: PointerEvent) => {
    if (event.button !== 0 || pointerDrag) return;
    suppressClick = false;
    const row = rowFromEvent(event);
    pressed = row ? { event, path: row.getAttribute("data-item-path") } : null;
  };
  const dragstart = (event: DragEvent) => {
    controller.handleDragStart(event);
    if (!controller.isDragInProgress() || !isPhysicsEnabled()) return;
    // Cancellation exits HTML's drag initiation before pointer-stream suppression.
    // Stop propagation too: the tree must not start its own drag state or install an image.
    event.preventDefault();
    event.stopPropagation();
    suppressClick = true;
    const row = rowFromEvent(event);
    const text = event.dataTransfer?.getData(COMPOSER_MENTION_DRAG_TYPE);
    if (!row || !pressed || pressed.path !== row.getAttribute("data-item-path") || !text) {
      controller.handleDragEnd(deselect);
      pressed = null;
      return;
    }
    pointerDrag = true;
    const rect = row.getBoundingClientRect();
    cancelDrag = beginComposerThrowDrag({
      channel,
      label: text,
      event: pressed.event,
      origin: { x: rect.left, y: rect.top },
      onLand: (form) =>
        form.dispatchEvent(
          new CustomEvent(COMPOSER_MENTION_THROW_EVENT, {
            detail: { text: composerMentionInsertionText(text) },
          }),
        ),
    });
  };
  const dragend = () => {
    if (!pointerDrag) controller.handleDragEnd(deselect);
  };
  const pointerend = (event: PointerEvent) => {
    if (pressed?.event.pointerId !== event.pointerId) return;
    // A native drag's pointercancel is normal; its selection still belongs to dragend.
    if (pointerDrag) finishPointer();
    else pressed = null;
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") finishPointer();
  };
  const click = (event: MouseEvent) => {
    if (!suppressClick || event.detail === 0) return;
    // A cancelled native drag can still synthesize a click on release. Keep it out of the
    // tree's row handler; the next pointerdown resets this guard if no click was produced.
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  };
  const unsubscribe = onPhysicsChange((enabled) => {
    if (!enabled) finishPointer();
  });
  panel.addEventListener("pointerdown", pointerdown, true);
  panel.addEventListener("dragstart", dragstart, true);
  panel.addEventListener("dragend", dragend);
  panel.addEventListener("click", click, true);
  document.addEventListener("pointerup", pointerend, true);
  document.addEventListener("pointercancel", pointerend, true);
  document.addEventListener("keydown", keydown, true);
  window.addEventListener("blur", finishPointer);
  return () => {
    if (disposed) return;
    disposed = true;
    cancelDrag?.();
    finishPointer();
    controller.handleDragEnd(deselect);
    unsubscribe();
    panel.removeEventListener("pointerdown", pointerdown, true);
    panel.removeEventListener("dragstart", dragstart, true);
    panel.removeEventListener("dragend", dragend);
    panel.removeEventListener("click", click, true);
    document.removeEventListener("pointerup", pointerend, true);
    document.removeEventListener("pointercancel", pointerend, true);
    document.removeEventListener("keydown", keydown, true);
    window.removeEventListener("blur", finishPointer);
  };
}
