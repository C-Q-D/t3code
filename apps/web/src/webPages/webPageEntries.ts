/** Normalizes user-entered launch targets and filters saved entries without changing settings. */
import type { WebPageEntry } from "@t3tools/contracts";

/** Trims input and supplies HTTPS when no scheme is present; invalid or non-web URLs return null. */
export function normalizeWebPageUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  // A host followed by a numeric port is not a custom URL scheme.
  const hostWithPort = /^(?:localhost|[^/:?#\s]+\.[^/:?#\s]+|\[[^\]]+\]):\d+(?:[/?#]|$)/i.test(
    value,
  );
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) && !hostWithPort;
  try {
    const url = new URL(hasScheme ? value : `https://${value}`);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Uses the hostname of a validated URL as a fallback label, omitting the common www prefix. */
export function defaultWebPageName(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

/** Matches names and hostnames case-insensitively, preserving order and the array for an empty query. */
export function filterWebPages(
  entries: ReadonlyArray<WebPageEntry>,
  query: string,
): ReadonlyArray<WebPageEntry> {
  const search = query.trim().toLowerCase();
  if (!search) return entries;
  return entries.filter(
    (entry) =>
      entry.name.toLowerCase().includes(search) ||
      new URL(entry.url).hostname.toLowerCase().includes(search),
  );
}
