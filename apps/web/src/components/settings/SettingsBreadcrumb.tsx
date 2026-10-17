/** Shares settings route labels between the titlebar breadcrumb and the page heading. */
import { t } from "~/i18n";
import { SETTINGS_SECTION_LABELS } from "./settingsSearch";

const SETTINGS_BREADCRUMB_LABELS: Readonly<Record<string, string>> = {
  ...SETTINGS_SECTION_LABELS,
  "/settings/diagnostics": t.settings.pages.diagnostics,
  "/settings/open-source-licenses": t.settings.pages.openSourceLicenses,
};

/** Resolves the current settings section; unknown routes use the settings root label. */
function settingsBreadcrumbLabel(pathname: string): string | null {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  return SETTINGS_BREADCRUMB_LABELS[normalizedPathname] ?? null;
}

/**
 * Renders `Settings / Section` in the titlebar slot; pathname is the current route.
 * Scope selection remains in the scrollable page rather than in window chrome.
 */
export function SettingsBreadcrumb({ pathname }: { pathname: string }) {
  const sectionLabel = settingsBreadcrumbLabel(pathname);

  return (
    <nav aria-label={t.settings.breadcrumb.ariaLabel} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-2 text-secondary-copy-medium leading-normal text-secondary-label">
        {sectionLabel ? (
          <>
            <li className="shrink-0">{t.settings.breadcrumb.title}</li>
            <li aria-hidden="true" className="text-fg-control-disabled">
              /
            </li>
          </>
        ) : null}
        <li aria-current="page" className="truncate text-fg-detail">
          {sectionLabel ?? t.settings.breadcrumb.title}
        </li>
      </ol>
    </nav>
  );
}

/** Renders the current pathname's page title using the same labels as the breadcrumb. */
export function SettingsPageHeading({ pathname }: { pathname: string }) {
  return (
    <h1 className="min-w-0 flex-1 font-serif text-page-title leading-settings-page-heading font-bold">
      {settingsBreadcrumbLabel(pathname) ?? t.settings.breadcrumb.title}
    </h1>
  );
}
