/** Persists optional navigation hints; failures must never prevent opening a saved page. */
import type { WebPageEntry } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { getLocalStorageItem, setLocalStorageItem } from "../hooks/useLocalStorage";

/** The configured URL scopes navigation hints so editing an entry invalidates its old session. */
export type WebPageSession = { baseUrl: string; lastUrl: string | null; favicon: string | null };

const STORAGE_KEY = "t3code:web-pages:session:v1";
const Sessions = Schema.Record(
  Schema.String,
  Schema.Struct({
    baseUrl: Schema.String,
    lastUrl: Schema.NullOr(Schema.String),
    favicon: Schema.NullOr(Schema.String),
  }),
);

/** Returns null on storage failure, distinct from an absent record that can safely be created. */
function readSessions(): typeof Sessions.Type | null {
  try {
    return getLocalStorageItem(STORAGE_KEY, Sessions) ?? {};
  } catch {
    // Session hints are optional; a broken record must not block the saved entry.
    return null;
  }
}

/** Uses a remembered absolute HTTP(S) URL only while the configured launch URL still matches. */
export function resolveWebPageStartUrl(entry: WebPageEntry): string {
  const sessions = readSessions();
  const session = sessions && Object.hasOwn(sessions, entry.id) ? sessions[entry.id] : undefined;
  if (session?.baseUrl === entry.url && session.lastUrl) {
    try {
      const url = new URL(session.lastUrl);
      if ((url.protocol === "https:" || url.protocol === "http:") && url.hostname) {
        return session.lastUrl;
      }
    } catch {
      // A stale or malformed hint falls back to the validated configured URL.
    }
  }
  return entry.url;
}

/** Writes a changed hint while preserving other entries; corrupt or unavailable storage is ignored. */
function rememberSession(
  entry: WebPageEntry,
  patch: Partial<Pick<WebPageSession, "lastUrl" | "favicon">>,
): void {
  const sessions = readSessions();
  if (!sessions) return;
  const previous = Object.hasOwn(sessions, entry.id) ? sessions[entry.id] : undefined;
  const current =
    previous?.baseUrl === entry.url
      ? previous
      : { baseUrl: entry.url, lastUrl: null, favicon: null };
  const next = { ...current, ...patch };
  if (
    previous?.baseUrl === next.baseUrl &&
    previous.lastUrl === next.lastUrl &&
    previous.favicon === next.favicon
  )
    return;
  try {
    setLocalStorageItem(STORAGE_KEY, { ...sessions, [entry.id]: next }, Sessions);
  } catch {
    // Navigation remains usable when the storage quota or browser policy rejects hints.
  }
}

/** Saves a navigation hint without changing the configured entry URL. */
export function rememberWebPageUrl(entry: WebPageEntry, url: string): void {
  rememberSession(entry, { lastUrl: url });
}

/** Saves an icon independently of navigation; repeated identical events do not write again. */
export function rememberWebPageFavicon(entry: WebPageEntry, dataUrl: string): void {
  rememberSession(entry, { favicon: dataUrl });
}

/** Returns the stored icon for an entry id, or null when no usable session is available. */
export function readWebPageFavicon(id: string): string | null {
  const sessions = readSessions();
  return sessions && Object.hasOwn(sessions, id) ? (sessions[id]?.favicon ?? null) : null;
}

/** Removes only this entry's hints; missing entries and unavailable storage are harmless. */
export function forgetWebPageSession(id: string): void {
  const sessions = readSessions();
  if (!sessions || !Object.hasOwn(sessions, id)) return;
  const remaining = { ...sessions };
  delete remaining[id];
  try {
    setLocalStorageItem(STORAGE_KEY, remaining, Sessions);
  } catch {
    // Deleting a saved entry must still succeed when its optional hints cannot be removed.
  }
}
