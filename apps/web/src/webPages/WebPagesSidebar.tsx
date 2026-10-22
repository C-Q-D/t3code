/** Lists saved pages; row subscriptions keep background navigation out of sidebar rendering. */
import type { WebPageEntry } from "@t3tools/contracts";
import { MoreHorizontalIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../components/ui/menu";
import { SidebarContent } from "../components/ui/sidebar";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "../components/ui/empty";
import { previewBridge } from "../components/preview/previewBridge";
import { t } from "../i18n";
import { cn } from "../lib/utils";
import { readLocalApi } from "../localApi";
import { useWebPages } from "./useWebPages";
import { filterWebPages } from "./webPageEntries";
import { readWebPageFavicon } from "./webPageSession";
import { useWebPageRuntimeStore, webPageRuntimeTabId } from "./webPageRuntimeStore";
import { WebPageEditDialog } from "./WebPageEditDialog";

/** Renders one entry; only this row observes its runtime selection, running flag, and favicon. */
function WebPageRow({
  entry,
  hydrated,
  onEdit,
  onRemove,
}: {
  entry: WebPageEntry;
  hydrated: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const selected = useWebPageRuntimeStore((state) => state.activeId === entry.id);
  const running = useWebPageRuntimeStore((state) => state.opened[entry.id] === true);
  const favicon = useWebPageRuntimeStore((state) => state.faviconById[entry.id]);
  const icon = favicon ?? readWebPageFavicon(entry.id);
  return (
    <li
      className={cn(
        "group flex items-center rounded-compact-row hover:bg-sidebar-row-hover",
        selected && "bg-sidebar-row-active shadow-raise-tab",
      )}
    >
      <button
        type="button"
        aria-current={selected ? "page" : undefined}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-compact-row px-3 py-2 text-left outline-none focus-visible:inset-shadow-focus"
        onClick={() => useWebPageRuntimeStore.getState().select(entry.id)}
      >
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-compact-row bg-input text-secondary-label"
        >
          {icon ? (
            <img src={icon} alt="" className="size-5" />
          ) : (
            entry.name.slice(0, 1).toLocaleUpperCase()
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-control">{entry.name}</span>
          <span className="block truncate text-secondary-copy text-secondary-label">
            {new URL(entry.url).hostname}
          </span>
        </span>
      </button>
      {running ? (
        <span className="size-1.5 shrink-0 rounded-full bg-success">
          <span className="sr-only">{t.webPages.running}</span>
        </span>
      ) : null}
      <div className="mr-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
        <Menu>
          <MenuTrigger
            render={
              <Button
                variant="ghost-muted"
                size="icon-xs"
                aria-label={t.webPages.moreActions(entry.name)}
              />
            }
          >
            <MoreHorizontalIcon />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem disabled={!hydrated} onClick={onEdit}>
              {t.webPages.edit}
            </MenuItem>
            {running ? (
              <MenuItem onClick={() => useWebPageRuntimeStore.getState().pause(entry.id)}>
                {t.webPages.pause}
              </MenuItem>
            ) : null}
            <MenuItem variant="destructive" disabled={!hydrated} onClick={onRemove}>
              {t.webPages.remove}
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    </li>
  );
}

/** Owns search and edit sessions; saved entries come from settings and runtime mutations use L1 actions. */
export function WebPagesSidebar() {
  const { entries, hydrated, add, update, remove } = useWebPages();
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<{ entry?: WebPageEntry } | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const filtered = filterWebPages(entries, query);

  /** A cancelled or unavailable confirmation never removes saved settings or runtime state. */
  async function confirmRemove(entry: WebPageEntry) {
    const api = readLocalApi();
    if (!hydrated || !api) return;
    try {
      if (await api.dialogs.confirm(t.webPages.confirmDelete(entry.name))) {
        remove(entry.id);
        addButton.current?.focus();
      }
    } catch (error) {
      console.error("Could not confirm web page removal.", error);
    }
  }

  /** Saves a normalized form; changing a running target navigates its existing guest in place. */
  function save(input: { url: string; name: string }) {
    if (!hydrated) return false;
    const entry = editor?.entry;
    if (!entry) {
      const created = add(input);
      if (!created) return false;
      useWebPageRuntimeStore.getState().select(created.id);
      return true;
    }
    if (!update(entry.id, input)) return false;
    if (input.url !== entry.url && useWebPageRuntimeStore.getState().opened[entry.id]) {
      void previewBridge?.navigate(webPageRuntimeTabId(entry.id), input.url).catch((error) => {
        console.error("Could not navigate the edited web page.", error);
      });
    }
    return true;
  }

  return (
    <>
      <div className="shrink-0 space-y-3 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-control font-semibold">{t.webPages.title}</h2>
          <Button
            ref={addButton}
            size="sm"
            variant="outline"
            disabled={!hydrated}
            onClick={() => setEditor({})}
          >
            <PlusIcon />
            {t.webPages.add}
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <SearchIcon aria-hidden className="size-3.5 shrink-0 text-secondary-label" />
          <Input
            type="search"
            size="sm"
            aria-label={t.webPages.search}
            placeholder={t.webPages.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <Button
              size="icon-xs"
              variant="ghost-muted"
              aria-label={t.settings.sidebarNav.clearSearchAriaLabel}
              onClick={() => setQuery("")}
            >
              <XIcon />
            </Button>
          ) : null}
        </div>
      </div>
      <SidebarContent>
        {!hydrated ? null : entries.length === 0 ? (
          <Empty size="compact">
            <EmptyHeader>
              <EmptyTitle>{t.webPages.emptyTitle}</EmptyTitle>
              <EmptyDescription>{t.webPages.emptyDescription}</EmptyDescription>
            </EmptyHeader>
            <Button onClick={() => setEditor({})}>{t.webPages.addPage}</Button>
          </Empty>
        ) : filtered.length === 0 ? (
          <p role="status" className="px-4 py-8 text-center text-secondary-label">
            {t.webPages.noMatches}
          </p>
        ) : (
          <ul aria-label={t.webPages.savedPages} className="flex flex-col gap-0.5 px-2 py-0.5">
            {filtered.map((entry) => (
              <WebPageRow
                key={entry.id}
                entry={entry}
                hydrated={hydrated}
                onEdit={() => setEditor({ entry })}
                onRemove={() => void confirmRemove(entry)}
              />
            ))}
          </ul>
        )}
      </SidebarContent>
      {editor ? (
        <WebPageEditDialog {...editor} onSave={save} onClose={() => setEditor(null)} />
      ) : null}
    </>
  );
}
