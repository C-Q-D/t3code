/** Resolves mutually exclusive page presentations without reading settings or runtime stores. */
import type { WebPageEntry } from "@t3tools/contracts";
import type { WebPageNav } from "./webPageRuntimeStore";

/** Desktop availability wins over selection; a paused page ignores stale navigation failures. */
export function resolveWebPagesPageState({
  desktop,
  entry,
  opened,
  nav,
}: {
  desktop: boolean;
  entry: WebPageEntry | null | undefined;
  opened: boolean;
  nav: WebPageNav | undefined;
}): "desktop-only" | "empty" | "paused" | "failed" | "ready" {
  if (!desktop) return "desktop-only";
  if (!entry) return "empty";
  if (!opened) return "paused";
  if (nav?.failure) return "failed";
  return "ready";
}
