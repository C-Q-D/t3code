/** Projects desktop navigation without coupling personal pages to server preview sessions. */
import type { DesktopPreviewTabState } from "@t3tools/contracts";
import type { WebPageNav } from "./webPageRuntimeStore";

/** Idle has no address to publish; all other states preserve desktop navigation details. */
export function projectWebPageNav(state: DesktopPreviewTabState): WebPageNav | null {
  const nav = state.navStatus;
  if (nav.kind === "Idle") return null;
  return {
    url: nav.url,
    title: nav.title,
    loading: nav.kind === "Loading",
    failure: nav.kind === "LoadFailed" ? { code: nav.code, description: nav.description } : null,
    canGoBack: state.canGoBack,
    canGoForward: state.canGoForward,
  };
}

/** Accepts an icon only when its captured page shares the current navigation origin. */
export function projectWebPageFavicon(state: DesktopPreviewTabState): string | null {
  if (state.navStatus.kind === "Idle" || !state.favicon) return null;
  try {
    const origin = new URL(state.navStatus.url).origin;
    return origin !== "null" && origin === new URL(state.favicon.pageUrl).origin
      ? state.favicon.dataUrl
      : null;
  } catch {
    // Malformed addresses cannot establish ownership of a captured icon.
    return null;
  }
}

/** Only changed HTTP(S) loading or successful addresses are eligible session hints. */
export function shouldRememberWebPageUrl(
  state: DesktopPreviewTabState,
  lastUrl: string | null,
): boolean {
  const nav = state.navStatus;
  if (nav.kind !== "Loading" && nav.kind !== "Success") return false;
  if (nav.url === lastUrl) return false;
  try {
    const url = new URL(nav.url);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
