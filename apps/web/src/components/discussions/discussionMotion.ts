/** Pauses discussion CSS motion using one document listener, without React state or render work. */
import "./discussionMotion.css";
if (typeof document !== "undefined") {
  const host = document;
  const updateVisibility = () =>
    host.documentElement.toggleAttribute("data-discussion-motion-paused", host.hidden);
  updateVisibility();
  host.addEventListener("visibilitychange", updateVisibility);
  // Dispose before HMR installs the replacement so the listener count stays one.
  import.meta.hot?.dispose(() => {
    host.removeEventListener("visibilitychange", updateVisibility);
    host.documentElement.removeAttribute("data-discussion-motion-paused");
  });
}
