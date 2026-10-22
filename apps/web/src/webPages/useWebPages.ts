/** Edits saved page settings; opening pages remains the caller's choice. */
import { WebPageEntry } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { randomUUID } from "~/lib/utils";
import {
  getClientSettings,
  updateClientSettings,
  useClientSettings,
  useClientSettingsHydrated,
} from "../hooks/useSettings";
import { defaultWebPageName, normalizeWebPageUrl } from "./webPageEntries";
import { forgetWebPageSession } from "./webPageSession";
import { useWebPageRuntimeStore } from "./webPageRuntimeStore";

const isWebPageEntry = Schema.is(WebPageEntry);

/** Returns saved entries and synchronous edit results; persistence failures use the settings layer's reporting. */
export function useWebPages() {
  const entries = useClientSettings((settings) => settings.webPages);
  const hydrated = useClientSettingsHydrated();

  /** Appends a valid URL and trimmed or hostname-derived name; invalid input returns null without saving. */
  function add(input: { name?: string; url: string }): WebPageEntry | null {
    const url = normalizeWebPageUrl(input.url);
    if (!url) return null;
    const entry = {
      id: randomUUID(),
      name: input.name?.trim() || defaultWebPageName(url),
      url,
    };
    if (!isWebPageEntry(entry)) return null;
    // Read at command time so successive edits do not use a stale render snapshot.
    void updateClientSettings({ webPages: [...getClientSettings().webPages, entry] });
    return entry;
  }

  /** Updates an existing entry; omitted fields stay unchanged and blank names use the resulting URL's host. */
  function update(id: string, patch: { name?: string; url?: string }): boolean {
    const current = getClientSettings().webPages;
    const entry = current.find((candidate) => candidate.id === id);
    if (!entry) return false;
    const url = patch.url === undefined ? entry.url : normalizeWebPageUrl(patch.url);
    if (!url) return false;
    const name =
      patch.name === undefined ? entry.name : patch.name.trim() || defaultWebPageName(url);
    const next = { ...entry, name, url };
    if (!isWebPageEntry(next)) return false;
    void updateClientSettings({
      webPages: current.map((candidate) => (candidate.id === id ? next : candidate)),
    });
    return true;
  }

  /** Removes the saved entry and its optional session and runtime state, including its active selection. */
  function remove(id: string): void {
    void updateClientSettings({
      webPages: getClientSettings().webPages.filter((entry) => entry.id !== id),
    });
    forgetWebPageSession(id);
    useWebPageRuntimeStore.getState().forget(id);
  }

  return { entries, hydrated, add, update, remove };
}
