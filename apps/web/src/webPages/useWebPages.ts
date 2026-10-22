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

  /**
   * Appends an entry, using a bounded hostname when the name is blank. Returns null while settings
   * are not hydrated, for an invalid HTTP(S) URL, or when entry validation fails (name over 48 or
   * URL over 2048 characters). Custom names are not truncated. Rejecting edits before hydration
   * prevents a patch built from defaults from overwriting saved entries after disk loading.
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
    // Read at command time so successive edits do not use a stale render snapshot.
    void updateClientSettings({ webPages: [...getClientSettings().webPages, entry] });
    return entry;
  }

  /**
   * Updates an entry, retaining omitted fields and using a bounded hostname for a blank name.
   * Returns false before hydration, for a missing id, an invalid HTTP(S) URL, or failed entry
   * validation (name over 48 or URL over 2048 characters). Custom names are not truncated.
   * The hydration guard prevents a default-based patch from replacing saved entries.
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
    void updateClientSettings({
      webPages: current.map((candidate) => (candidate.id === id ? next : candidate)),
    });
    return true;
  }

  /**
   * Removes an entry and its session/runtime state. Before hydration this does nothing, including
   * no session or runtime cleanup, because a default-based patch would erase loaded entries.
   */
  function remove(id: string): void {
    if (!hydrated) return;
    void updateClientSettings({
      webPages: getClientSettings().webPages.filter((entry) => entry.id !== id),
    });
    forgetWebPageSession(id);
    useWebPageRuntimeStore.getState().forget(id);
  }

  return { entries, hydrated, add, update, remove };
}
