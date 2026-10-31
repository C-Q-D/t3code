/** Tracks code navigation independently of settings, utilities and saved web pages. */
import { useNavigate, type AnyRouter } from "@tanstack/react-router";

/** Identifies Settings and Usage routes whose close action returns to the previous page. */
export function isAppModalPage(pathname: string) {
  return pathname === "/settings" || pathname.startsWith("/settings/") || pathname === "/usage";
}

/** Identifies full-page utilities that must preserve the last code destination for the project rail. */
export function isSidebarUtilityPage(pathname: string) {
  return (
    isAppModalPage(pathname) || pathname.startsWith("/projects/") || pathname === "/pull-requests"
  );
}

/** Web routes keep the last code location available to the project rail. */
export function isWebPagesPage(pathname: string) {
  return pathname === "/web" || pathname.startsWith("/web/");
}

// Pages the root route always renders without the app shell, so they are never
// a page to return to. Other paths seen before auth or on a prompt-link landing
// are still recorded; they are real app URLs, so returning to one is harmless.
const SHELL_LESS_PATHS = new Set(["/pair", "/connect", "/connect-agent"]);

let mainAppHref: string | null = null;
let appModalReturnHref: string | null = null;

/** Remembers where Settings, Usage, and the utility pages lead back to. */
export function startMainAppLocationTracking(router: AnyRouter): () => void {
  const record = () => {
    const { pathname, href } = router.state.location;
    if (isAppModalPage(pathname) || SHELL_LESS_PATHS.has(pathname)) return;
    appModalReturnHref = href;
    if (!isSidebarUtilityPage(pathname) && !isWebPagesPage(pathname)) mainAppHref = href;
  };
  record();
  return router.subscribe("onResolved", record);
}

export function useNavigateToMainApp() {
  const navigate = useNavigate();
  return () => navigate({ href: mainAppHref ?? "/" });
}

/** Leaves Settings or Usage for the page that opened it. */
export function useCloseAppModal() {
  const navigate = useNavigate();
  return () => navigate({ href: appModalReturnHref ?? mainAppHref ?? "/" });
}
