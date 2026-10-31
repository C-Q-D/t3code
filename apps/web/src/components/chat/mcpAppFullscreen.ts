/** Owns fullscreen MCP dismissal independently of the app resource and provider session. */

/** Attaches dismissal for the fullscreen box; returns cleanup before the box leaves the top layer. */
export function attachMcpAppFullscreenDismissal(box: HTMLElement, dismiss: () => void) {
  // Native light dismissal cannot exempt the caption controls in their separate body portal.
  box.setAttribute("popover", "manual");
  const isOutside = (target: EventTarget | null) =>
    target instanceof Node &&
    !box.contains(target) &&
    !(target instanceof Element && target.closest(".windows-window-controls"));
  const onBlur = (event: FocusEvent) => {
    if (isOutside(event.relatedTarget)) dismiss();
  };
  const onPointerDown = (event: PointerEvent) => {
    if (isOutside(event.target)) dismiss();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !event.defaultPrevented && !event.isComposing) {
      event.preventDefault();
      dismiss();
    }
  };
  // CloseWatcher receives Escape even while the opaque app iframe owns keyboard focus.
  const watcher = typeof CloseWatcher === "undefined" ? null : new CloseWatcher();
  watcher?.addEventListener("close", dismiss);
  if (!watcher) document.addEventListener("keydown", onKeyDown);
  document.addEventListener("pointerdown", onPointerDown, true);
  box.addEventListener("focusout", onBlur);
  return () => {
    watcher?.destroy();
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("pointerdown", onPointerDown, true);
    box.removeEventListener("focusout", onBlur);
  };
}
