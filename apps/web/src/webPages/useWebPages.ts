/** Edits saved page settings; opening pages remains the caller's choice. */
import { WebPageEntry } from "@t3tools/contracts";
import { safeErrorLogAttributes } from "@t3tools/client-runtime/errors";
import * as Schema from "effect/Schema";
import { randomUUID } from "~/lib/utils";
import {
  getClientSettings,
  persistClientSettingsUpdate,
  useClientSettings,
  useClientSettingsHydrated,
} from "../hooks/useSettings";
import { defaultWebPageName, normalizeWebPageUrl } from "./webPageEntries";
import { forgetWebPageSession } from "./webPageSession";
import { useWebPageRuntimeStore } from "./webPageRuntimeStore";

const isWebPageEntry = Schema.is(WebPageEntry);

/** Reports asynchronous disk failures without exposing entry URLs or leaving rejected promises unhandled. */
function reportPersistFailure(error: unknown): void {
  console.error("[CLIENT_SETTINGS] persist failed", {
    operation: "persist",
    ...safeErrorLogAttributes(error),
  });
}

/** Returns saved entries and synchronous acceptance results; asynchronous persistence failures are logged. */
export function useWebPages() {
  const entries = useClientSettings((settings) => settings.webPages);
  const hydrated = useClientSettingsHydrated();

  /**
   * Appends an entry, using a bounded hostname when the name is blank. Returns null while settings
   * are not hydrated, for an invalid HTTP(S) URL, or when entry validation fails (name over 48 or
   * URL over 2048 characters). Custom names are not truncated. The append uses settings current
   * at application time, so queued edits do not overwrite each other. An old render's unhydrated
   * closure stays inactive; callers must use the actions returned by the latest render.
   */
  function add(input: { name?: string; url: string }): WebPageEntry | null {
    if (!hydrated) return null;
    const url = normalizeWebPageUrl(input.url);
    if (!url) return null;
    const entry = {
      id: randomUUID(),
      name: input.name?.trim() || defaultWebPageName(url),
      url,
    };
    if (!isWebPageEntry(entry)) return null;
    void persistClientSettingsUpdate((current) => ({
      ...current,
      webPages: [...current.webPages, entry],
    })).catch(reportPersistFailure);
    return entry;
  }

  /**
   * Updates an entry, retaining omitted fields and using a bounded hostname for a blank name.
   * Returns false before hydration, for a missing id, an invalid HTTP(S) URL, or failed entry
   * validation (name over 48 or URL over 2048 characters). Custom names are not truncated.
   * Replacement uses the latest array at application time, preserving other queued edits; an id
   * removed meanwhile is not recreated. An old render's unhydrated closure stays inactive, so
   * callers must use the latest render's actions. Success means accepted, not yet saved to disk.
   */
  function update(id: string, patch: { name?: string; url?: string }): boolean {
    if (!hydrated) return false;
    const current = getClientSettings().webPages;
    const entry = current.find((candidate) => candidate.id === id);
    if (!entry) return false;
    const url = patch.url === undefined ? entry.url : normalizeWebPageUrl(patch.url);
    if (!url) return false;
    const name =
      patch.name === undefined ? entry.name : patch.name.trim() || defaultWebPageName(url);
    const next = { ...entry, name, url };
    if (!isWebPageEntry(next)) return false;
    void persistClientSettingsUpdate((latest) => {
      if (!latest.webPages.some((candidate) => candidate.id === id)) return latest;
      return {
        ...latest,
        webPages: latest.webPages.map((candidate) => (candidate.id === id ? next : candidate)),
      };
    }).catch(reportPersistFailure);
    return true;
  }

  /**
   * Removes from the latest array at application time so queued edits do not overwrite each other.
   * Missing ids leave the array unchanged. Before hydration nothing happens, including cleanup;
   * old unhydrated closures remain inactive, so callers must use the latest render's actions.
   * Session/runtime cleanup is immediate and is not rolled back on a logged save failure: the
   * user deleted the page in this run, so its host must unload even if disk persistence fails.
   */
  function remove(id: string): void {
    if (!hydrated) return;
    void persistClientSettingsUpdate((current) => {
      if (!current.webPages.some((entry) => entry.id === id)) return current;
      return { ...current, webPages: current.webPages.filter((entry) => entry.id !== id) };
    }).catch(reportPersistFailure);
    forgetWebPageSession(id);
    useWebPageRuntimeStore.getState().forget(id);
  }

  return { entries, hydrated, add, update, remove };
}
