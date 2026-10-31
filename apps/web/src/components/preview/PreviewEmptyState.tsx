/** K6 preview launch states; discovery and navigation remain owned by the existing hook and callbacks. */
import { t } from "~/i18n";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { History, Radio, X } from "lucide-react";
import type { BrowserHistoryEntry } from "~/browserHistoryStore";
import { useDiscoveredLocalServers } from "./useDiscoveredLocalServers";

/** Preview launch inputs; callbacks own navigation and history mutations. */
interface Props {
  threadRef: ScopedThreadRef;
  environmentId: EnvironmentId;
  configuredUrls?: ReadonlyArray<string> | undefined;
  recentEntries: ReadonlyArray<BrowserHistoryEntry>;
  onRemoveRecent: (url: string) => void;
  onOpenUrl: (url: string) => void;
}

/**
 * Displays the eight latest valid history entries and discovered services without merging the groups.
 * @param props Discovery scope, history and existing open/remove actions; configured URLs are optional.
 * @returns The K6 launch view, with guidance when both sources are empty.
 */
export function PreviewEmptyState({
  environmentId,
  configuredUrls,
  recentEntries,
  onRemoveRecent,
  onOpenUrl,
}: Props) {
  const servers = useDiscoveredLocalServers({ environmentId, configuredUrls });
  const recents = recentEntries.filter((entry) => URL.canParse(entry.url)).slice(0, 8);

  return (
    <div className="scrollbar-gutter-both flex h-full min-h-0 w-full overflow-y-auto bg-code py-6">
      <div className="pn6-preview-empty m-auto flex max-w-95 flex-col gap-3.5">
        <h1 className="text-center font-serif text-pn6-empty-title font-bold text-foreground">
          {t.tools.preview.emptyTitle}
        </h1>
        {servers.length === 0 && recents.length === 0 ? (
          <p className="text-center text-secondary-copy text-muted-foreground">
            {t.tools.preview.emptyHint}
          </p>
        ) : null}
        {recents.length > 0 ? (
          <section className="flex flex-col gap-1.5">
            <h2 className="px-1 text-meta-large text-muted-foreground">
              {t.tools.preview.recentlyUsed}
            </h2>
            <div className="flex flex-col gap-0.5">
              {recents.map((entry) => {
                const parsed = new URL(entry.url);
                const label = `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}${parsed.search}${parsed.hash}`;
                return (
                  <div key={entry.url} className="group relative">
                    <button
                      type="button"
                      onClick={() => onOpenUrl(entry.url)}
                      aria-label={entry.title ? `${entry.title}: ${label}` : label}
                      className="flex h-9 w-full items-center gap-2.5 rounded-compact-row px-2.5 pr-9 text-left font-mono text-secondary-copy text-foreground outline-none hover:bg-pn6-recent-hover focus-visible:inset-shadow-focus"
                    >
                      <History className="size-3.5 shrink-0" />
                      <span className="truncate">{label}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={t.tools.preview.removeHistory(label)}
                      onClick={() => onRemoveRecent(entry.url)}
                      className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full text-muted-foreground opacity-0 outline-none group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-secondary focus-visible:inset-shadow-focus"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
        {servers.length > 0 ? (
          <section className="flex flex-col gap-1.5">
            <h2 className="px-1 text-meta-large text-muted-foreground">
              {t.tools.preview.localServers}
            </h2>
            <div className="flex flex-col gap-0.5">
              {servers.map((server) => (
                <button
                  type="button"
                  key={`${server.host}:${server.port}`}
                  aria-label={`${server.host}:${server.port}${server.processName ? ` (${server.processName})` : ""}: ${t.tools.preview.listening}`}
                  onClick={() => onOpenUrl(server.requestedUrl)}
                  className="flex h-9 w-full items-center gap-2.5 rounded-compact-row px-2.5 font-mono text-secondary-copy text-foreground outline-none hover:bg-pn6-recent-hover focus-visible:inset-shadow-focus"
                >
                  <Radio className="size-3.5 shrink-0" />
                  <span>:{server.port}</span>
                  <span className="ml-auto font-sans text-success-foreground">
                    {t.tools.preview.listening}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
