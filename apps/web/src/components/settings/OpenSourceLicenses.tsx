import { t } from "~/i18n";
import { ChevronRightIcon, ExternalLinkIcon, ScaleIcon, SearchIcon } from "lucide-react";
import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { FetchHttpClient, HttpClient } from "effect/http";
import { Atom } from "effect/reactivity";
import { useState } from "react";

import {
  decodeThirdPartyLicenseManifest,
  filterThirdPartyLicenseEntries,
  formatLicenseBundles,
  thirdPartyLicenseEntryKey,
  type ThirdPartyLicenseEntry,
} from "@t3tools/shared/thirdPartyLicenses";

import { Button } from "../ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { Input } from "../ui/input";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

/** Keeps manifest decoding and transport failures in one recoverable page error channel. */
class LicenseManifestLoadError extends Data.TaggedError("LicenseManifestLoadError")<{
  readonly message: string;
}> {}

// Not keepAlive: a failed load must not stick for the session, so each visit to the page loads
// the manifest again (a static asset the HTTP cache serves).
const licenseManifestAtom = Atom.make(
  Effect.gen(function* () {
    const response = yield* HttpClient.get(
      `${import.meta.env.BASE_URL.replace(/\/$/, "")}/third-party-licenses.json`,
    );
    if (response.status < 200 || response.status >= 300) {
      return yield* new LicenseManifestLoadError({
        message: t.settings.openSourceLicenses.licenseManifestRequestFailedStatusError(
          String(response.status),
        ),
      });
    }
    const body = yield* response.json;
    return yield* Effect.try({
      try: () => decodeThirdPartyLicenseManifest(body),
      catch: (error) =>
        new LicenseManifestLoadError({
          message:
            error instanceof Error
              ? error.message
              : t.settings.openSourceLicenses.theLicenseManifestCouldNotLoad,
        }),
    });
  }).pipe(
    Effect.catchTags({
      HttpClientError: (error) =>
        Effect.fail(new LicenseManifestLoadError({ message: error.message })),
    }),
    Effect.timeoutOrElse({
      duration: "30 seconds",
      orElse: () =>
        Effect.fail(new LicenseManifestLoadError({ message: t.settings.merge.licenseTimeout })),
    }),
    Effect.provide(FetchHttpClient.layer),
  ),
).pipe(Atom.withLabel("settings:open-source-licenses"));

/**
 * Renders a real manifest entry; open and onOpenChange keep expansion controlled by the parent.
 * Package names and versions can shrink and wrap unbroken text to preserve the trailing controls.
 */
function LicenseNoticeRow({
  entry,
  open,
  onOpenChange,
}: {
  readonly entry: ThirdPartyLicenseEntry;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <article>
        <div className="licenses-notice-row">
          <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-3 text-left outline-none">
            <span className="licenses-icon-well">
              <ScaleIcon aria-hidden className="size-3.75" strokeWidth={1.75} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.25">
              <span className="flex min-w-0 flex-wrap items-baseline gap-2">
                <span className="min-w-0 text-control leading-normal font-semibold wrap-anywhere text-foreground">
                  {entry.name}
                </span>
                {entry.version ? (
                  <code className="min-w-0 text-secondary-copy wrap-anywhere text-muted-foreground">
                    {entry.version}
                  </code>
                ) : null}
              </span>
              <span className="text-secondary-copy-medium leading-normal text-secondary-label">
                {formatLicenseBundles(entry.bundles)}
              </span>
            </span>
            <span className="max-w-2/5 shrink-0 truncate font-mono text-secondary-copy text-muted-foreground">
              {entry.license}
            </span>
            <ChevronRightIcon
              aria-hidden
              className="size-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none group-data-panel-open:rotate-90"
            />
          </CollapsibleTrigger>
          {entry.sourceUrl ? (
            <Button
              aria-label={t.settings.openSourceLicenses.viewProjectSourceFor(entry.name)}
              render={<a href={entry.sourceUrl} rel="noreferrer noopener" target="_blank" />}
              size="icon-sm"
              title={t.settings.openSourceLicenses.projectSource}
              variant="ghost-muted"
            >
              <ExternalLinkIcon aria-hidden className="size-3.75" />
            </Button>
          ) : null}
        </div>
        <CollapsiblePanel animate={false}>
          {open ? (
            <div className="px-3 pt-1 pb-4 sm:pl-13.5">
              <pre className="whitespace-pre-wrap break-words font-mono text-secondary-copy leading-5 text-code-foreground">
                {entry.noticeText}
              </pre>
            </div>
          ) : null}
        </CollapsiblePanel>
      </article>
    </Collapsible>
  );
}

/** Shows total notices or filtered/total counts supplied by the manifest view. */
function LicenseCount({
  filteredCount,
  totalCount,
}: {
  filteredCount: number;
  totalCount: number;
}) {
  return (
    <p className="whitespace-nowrap text-secondary-copy font-normal text-muted-foreground tabular-nums">
      {filteredCount === totalCount
        ? t.settings.openSourceLicenses.notices(String(totalCount))
        : t.settings.openSourceLicenses.of(String(filteredCount), String(totalCount))}
    </p>
  );
}

/** Keeps the existing query/count controls; empty blur and Escape close the search input. */
function LicenseHeaderAction({
  query,
  onQueryChange,
  searchOpen,
  onSearchOpenChange,
  filteredCount,
  totalCount,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  filteredCount: number;
  totalCount: number;
}) {
  if (!searchOpen) {
    return (
      <div className="flex items-center gap-1.5">
        <LicenseCount filteredCount={filteredCount} totalCount={totalCount} />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={t.settings.openSourceLicenses.searchOpenSourceLicenses}
                onClick={() => onSearchOpenChange(true)}
                size="icon-sm"
                type="button"
                variant="ghost-muted"
              >
                <SearchIcon className="size-3" />
              </Button>
            }
          />
          <TooltipPopup side="top">{t.settings.openSourceLicenses.searchLicenses}</TooltipPopup>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="hidden sm:block">
        <LicenseCount filteredCount={filteredCount} totalCount={totalCount} />
      </div>
      <div className="w-36 sm:w-44">
        <Input
          aria-label={t.settings.openSourceLicenses.searchOpenSourceLicenses}
          autoFocus
          onBlur={() => {
            if (query.length === 0) onSearchOpenChange(false);
          }}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            onQueryChange("");
            onSearchOpenChange(false);
          }}
          placeholder={t.settings.openSourceLicenses.searchLicenses}
          size="settings"
          type="search"
          value={query}
        />
      </div>
    </div>
  );
}

/** Displays a manifest failure message and invokes onRetry only on an explicit user action. */
function LicenseManifestError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 px-3 py-5 sm:px-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-control font-semibold text-foreground">
          {t.settings.openSourceLicenses.openSourceNoticesAreUnavailable}
        </h3>
        <p className="text-pretty text-secondary-copy-medium leading-normal text-secondary-label">
          {message}
        </p>
      </div>
      <Button type="button" size="settings-list" variant="outline" onClick={onRetry}>
        {t.settings.snapShotSetup.retry}
      </Button>
    </div>
  );
}

/** Loads the shipped manifest without settings mutations and preserves its order, search and one-open-row behavior. */
export function OpenSourceLicensesPanel() {
  const result = useAtomValue(licenseManifestAtom);
  const retry = useAtomRefresh(licenseManifestAtom);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [openEntryKey, setOpenEntryKey] = useState<string | null>(null);
  const manifest = result._tag === "Success" ? result.value : null;
  const entries = manifest?.entries ?? [];
  const filteredEntries = filterThirdPartyLicenseEntries(entries, query);
  const errorMessage =
    result._tag === "Failure" && !result.waiting
      ? Option.match(Cause.findErrorOption(result.cause), {
          onNone: () => t.settings.openSourceLicenses.theLicenseManifestCouldNotLoad,
          onSome: (error) => error.message,
        })
      : null;

  return (
    <SettingsPageContainer>
      <SettingsSection
        title={t.settings.openSourceLicenses.title}
        headerAction={
          manifest ? (
            <LicenseHeaderAction
              query={query}
              onQueryChange={setQuery}
              searchOpen={searchOpen}
              onSearchOpenChange={setSearchOpen}
              filteredCount={filteredEntries.length}
              totalCount={entries.length}
            />
          ) : null
        }
      >
        {manifest ? (
          <div className="licenses-notice-list">
            {filteredEntries.length > 0 ? (
              filteredEntries.map((entry) => {
                const entryKey = thirdPartyLicenseEntryKey(entry);
                return (
                  <LicenseNoticeRow
                    key={entryKey}
                    entry={entry}
                    open={openEntryKey === entryKey}
                    onOpenChange={(open) => setOpenEntryKey(open ? entryKey : null)}
                  />
                );
              })
            ) : (
              <p className="licenses-empty">
                {t.settings.openSourceLicenses.noLicensesMatchThatSearch}
              </p>
            )}
          </div>
        ) : errorMessage !== null ? (
          <LicenseManifestError message={errorMessage} onRetry={retry} />
        ) : (
          <p className="px-3.5 py-5 text-secondary-copy-large text-secondary-label">
            {t.settings.openSourceLicenses.loadingOpenSourceNotices}
          </p>
        )}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
