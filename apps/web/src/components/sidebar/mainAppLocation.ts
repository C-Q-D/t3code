/** Remembers code navigation independently of utility pages and saved web pages. */
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export function isSidebarUtilityPage(pathname: string) {
  return (
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname.startsWith("/projects/") ||
    pathname === "/usage" ||
    pathname === "/pull-requests"
  );
}

let mainAppHref: string | null = null;

/** Matches the web group without giving it the utility pages' back-arrow behavior. */
export function isWebPagesPage(pathname: string) {
  return pathname === "/web" || pathname.startsWith("/web/");
}

/**
 * Utility and web routes must not replace the code location users expect to return to.
 * A first visit directly to web pages leaves it unset, so returning falls back to `/`.
 */
export function MainAppLocationTracker() {
  const href = useLocation({
    select: (location) =>
      isSidebarUtilityPage(location.pathname) || isWebPagesPage(location.pathname)
        ? null
        : location.href,
  });
  useEffect(() => {
    if (href !== null) mainAppHref = href;
  }, [href]);
  return null;
}

export function useNavigateToMainApp() {
  const navigate = useNavigate();
  return () => navigate({ href: mainAppHref ?? "/" });
}
