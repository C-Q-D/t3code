/** Owns the graphite settings navigation and search; child routes own setting controls. */
import { splitThreadSearchText } from "@t3tools/shared/threadSearch";
import { PixelAgentIcon } from "../icons/PixelLucideIcon";
import { workspaceAreaProps } from "../../lib/workspaceFocus";
import { useSettingsSectionNavigation } from "./useSettingsSectionNavigation";
import { t } from "~/i18n";
import { lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  ArchiveIcon,
  CameraIcon,
  CalendarClockIcon,
  FolderGit2Icon,
  GitBranchIcon,
  HardDriveIcon,
  KeyboardIcon,
  NetworkIcon,
  MessagesSquareIcon,
  PaletteIcon,
  SearchIcon,
  SearchXIcon,
  SlidersHorizontalIcon,
  PlugIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import { Input } from "../ui/input";
import { SidebarContent, useSidebar } from "../ui/sidebar";
import { scrollToSettingsTarget } from "./settingsLayout";
import {
  searchSettings,
  isSettingsOverviewVisible,
  SETTINGS_SECTION_LABELS,
  type SettingsPath,
  type SettingsSearchItem,
} from "./settingsSearch";
import { useAvailableSettingsSearchItems } from "./useAvailableSettingsSearchItems";
import { validateSettingsScopeSearch } from "./settingsScope";

const T3ConnectSidebarSignIn = lazy(() =>
  import("../clerk/T3ConnectSidebarSignIn").then((module) => ({
    default: module.T3ConnectSidebarSignIn,
  })),
);
const T3ConnectSidebarAvatar = lazy(() =>
  import("../clerk/T3ConnectSidebarSignIn").then((module) => ({
    default: module.T3ConnectSidebarAvatar,
  })),
);

const SETTINGS_SECTION_ICONS: Readonly<Record<SettingsPath, LucideIcon>> = {
  "/settings/general": SlidersHorizontalIcon,
  "/settings/diagnostics": SlidersHorizontalIcon,
  "/settings/appearance": PaletteIcon,
  "/settings/projects": FolderGit2Icon,
  "/settings/keybindings": KeyboardIcon,
  "/settings/snap-shot": CameraIcon,
  "/settings/providers": PixelAgentIcon,
  "/settings/integrations": PlugIcon,
  "/settings/scheduled-tasks": CalendarClockIcon,
  "/settings/discussions": MessagesSquareIcon,
  "/settings/source-control": GitBranchIcon,
  "/settings/storage": HardDriveIcon,
  "/settings/connections": NetworkIcon,
  "/settings/archived": ArchiveIcon,
};

const SETTINGS_NAV_ITEMS: ReadonlyArray<{
  label: string;
  to: SettingsPath;
  icon: LucideIcon;
}> = (Object.keys(SETTINGS_SECTION_LABELS) as SettingsPath[])
  .filter((to) => to !== "/settings/diagnostics")
  .map((to) => ({
    to,
    label: SETTINGS_SECTION_LABELS[to],
    icon: SETTINGS_SECTION_ICONS[to],
  }));

/** Detail pages share the category that exposes their entry point. */
const SETTINGS_DETAIL_PAGE_PARENTS: Readonly<Record<string, SettingsPath>> = {
  "/settings/open-source-licenses": "/settings/general",
  "/settings/diagnostics": "/settings/general",
};

/** Keeps a newly active result visible without scrolling again on unrelated renders; null denotes unmount. */
function scrollResultIntoView(row: HTMLLIElement | null) {
  row?.scrollIntoView({ block: "nearest" });
}

/**
 * Renders settings navigation, search, and the account footer under the app router and sidebar provider.
 * @param pathname Current route path; detail routes keep their parent section selected.
 * @returns The sidebar content; child settings routes retain ownership of their controls.
 */
export function SettingsSidebarNav({ pathname }: { pathname: string }) {
  const navigate = useNavigate();
  const currentHash = useLocation({ select: (location) => location.hash });
  const currentSearch = useLocation({ select: (location) => location.search });
  const scopeSearch = validateSettingsScopeSearch(currentSearch);
  const navItems = SETTINGS_NAV_ITEMS.filter(
    (item) => item.to !== "/settings/projects" || isSettingsOverviewVisible(scopeSearch),
  );
  const { isMobile, setOpenMobile, open, setOpen } = useSidebar();
  const activePath = SETTINGS_DETAIL_PAGE_PARENTS[pathname] ?? pathname;
  const currentSection =
    navItems.find((item) => activePath === item.to || activePath.startsWith(`${item.to}/`))?.to ??
    navItems[0]?.to ??
    "";
  const sectionNavigation = useSettingsSectionNavigation(currentSection);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const searchableItems = useAvailableSettingsSearchItems(scopeSearch);
  const results = searchSettings(query, searchableItems);
  const isSearching = query.trim().length > 0;
  const hasResults = results.length > 0;
  const maxResultIndex = Math.max(results.length - 1, 0);
  // Persist the clamp so a shrink-then-recover of results keeps the clamped highlight.
  if (activeResultIndex > maxResultIndex) {
    setActiveResultIndex(maxResultIndex);
  }

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const isFindShortcut =
        event.key.toLowerCase() === "f" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey;
      const isSlashShortcut =
        event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (!isFindShortcut && !isSlashShortcut) return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        ((isSlashShortcut &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)) ||
          target.closest(
            '[role="dialog"], [aria-modal="true"], [data-slot$="popup"], [data-keybinding-capture]',
          ) !== null)
      ) {
        return;
      }

      event.preventDefault();
      if (isMobile) {
        setOpenMobile(true);
      } else if (!open) {
        setOpen(true);
      }
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobile, open, setOpen, setOpenMobile]);

  const handleSectionClick = (to: SettingsPath) => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({
      to,
      hash: "",
      replace: true,
      hashScrollIntoView: false,
    });
  };

  const clearSearch = () => {
    setQuery("");
    setActiveResultIndex(0);
  };
  const handleSearchResultClick = (item: SettingsSearchItem) => {
    clearSearch();
    if (isMobile) {
      setOpenMobile(false);
    }
    const targetId = item.targetId ?? item.id;
    if (pathname === item.to && currentHash.replace(/^#/, "") === targetId) {
      scrollToSettingsTarget(targetId);
      return;
    }
    void navigate({
      to: item.to,
      hash: targetId,
      replace: true,
      hashScrollIntoView: false,
      state: { settingsTargetHighlight: true },
    });
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && isSearching) {
      event.preventDefault();
      event.stopPropagation();
      clearSearch();
      return;
    }
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveResultIndex((activeResultIndex + 1) % results.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResultIndex((activeResultIndex - 1 + results.length) % results.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const result = results[activeResultIndex];
      if (result) handleSearchResultClick(result);
    }
  };

  return (
    <div
      {...workspaceAreaProps("settings-nav", 0, t.settings.navigationAdditions.sections)}
      {...sectionNavigation.containerProps}
      className="flex h-full min-h-0 flex-col text-control leading-normal text-foreground text-shadow-stone"
    >
      <div className="shrink-0 px-3 pt-3 pb-2">
        <div
          className="flex h-9.5 items-center gap-2 rounded-full bg-sidebar-control-surface pr-1.5 pl-3.5 shadow-settings-search focus-within:inset-shadow-focus data-searching:inset-shadow-focus"
          data-searching={isSearching || undefined}
        >
          <SearchIcon aria-hidden="true" className="size-3.75 shrink-0" strokeWidth={1.75} />
          {/* Offset the bare Input's own padding so the text keeps the design's 8px icon gap. */}
          <div className="-mx-3.5 min-w-0 flex-1 text-shadow-none">
            <Input
              ref={searchInputRef}
              unstyled
              nativeInput
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setActiveResultIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder={t.settings.sidebarNav.searchPlaceholder}
              aria-label={t.settings.sidebarNav.searchAriaLabel}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={isSearching && hasResults}
              aria-controls={isSearching && hasResults ? "settings-search-results" : undefined}
              aria-activedescendant={
                isSearching && results[activeResultIndex]
                  ? `settings-search-result-${results[activeResultIndex].id}`
                  : undefined
              }
            />
          </div>
          {isSearching ? (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost-muted"
              aria-label={t.settings.sidebarNav.clearSearchAriaLabel}
              onClick={() => {
                clearSearch();
                searchInputRef.current?.focus();
              }}
            >
              <XIcon />
            </Button>
          ) : (
            <Kbd>/</Kbd>
          )}
        </div>
      </div>
      <SidebarContent>
        {isSearching && !hasResults ? (
          <div
            role="status"
            className="flex flex-col items-center gap-2.5 pt-15 text-secondary-label"
          >
            <span className="flex size-10 items-center justify-center rounded-compact-row shadow-settings-empty">
              <SearchXIcon aria-hidden="true" className="size-4.5" strokeWidth={1.75} />
            </span>
            {t.settings.sidebarNav.empty}
          </div>
        ) : isSearching ? (
          <ul
            id="settings-search-results"
            role="listbox"
            aria-label={t.settings.sidebarNav.resultsAriaLabel}
            className="flex flex-col gap-0.5 px-2 py-0.5"
          >
            {results.map((item, index) => (
              <li
                key={item.id}
                role="presentation"
                ref={index === activeResultIndex ? scrollResultIntoView : undefined}
              >
                {/* Search options are two-line navigation rows, rather than action buttons. */}
                <button
                  type="button"
                  id={`settings-search-result-${item.id}`}
                  role="option"
                  aria-selected={index === activeResultIndex}
                  tabIndex={-1}
                  className="group/option flex w-full cursor-pointer flex-col rounded-compact-row px-3 py-2 text-left outline-none hover:bg-sidebar-row-hover focus-visible:inset-shadow-focus aria-selected:bg-sidebar-row-active aria-selected:shadow-raise-tab"
                  onMouseMove={() => setActiveResultIndex(index)}
                  onClick={() => handleSearchResultClick(item)}
                >
                  <span className="w-full truncate group-aria-selected/option:font-semibold">
                    {splitThreadSearchText(item.title, query).map((part) =>
                      part.highlighted ? (
                        <mark
                          key={part.start}
                          className="rounded-settings-match-corner bg-well-search-match text-settings-match"
                        >
                          {part.text}
                        </mark>
                      ) : (
                        part.text
                      ),
                    )}
                  </span>
                  <span className="w-full truncate text-secondary-copy leading-normal text-secondary-label">
                    {SETTINGS_SECTION_LABELS[item.to]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-col gap-0.5 px-2 py-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentSection === item.to;
              return (
                <li key={item.to}>
                  {/* SettingsNav8a uses raised 36px navigation rows, not pill action controls. */}
                  <button
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-compact-row px-3 text-left text-code-foreground outline-none hover:bg-sidebar-row-hover hover:text-foreground focus-visible:inset-shadow-focus aria-current:bg-sidebar-row-active aria-current:font-bold aria-current:text-foreground aria-current:shadow-settings-nav"
                    data-settings-section={item.to}
                    tabIndex={sectionNavigation.tabIndexFor(item.to)}
                    onClick={() => handleSectionClick(item.to)}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
                    <span className="truncate">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </SidebarContent>
      <div className="flex shrink-0 flex-col gap-1.5 px-3 pt-2.5 pb-3">
        <div
          aria-hidden="true"
          className="mx-1 mb-1 h-0.25 bg-settings-divider shadow-settings-footer-rule"
        />
        <div className="flex items-center gap-2">
          <div className="peer min-w-0 flex-1 empty:hidden">
            <Suspense fallback={null}>
              <T3ConnectSidebarSignIn variant="settings" />
            </Suspense>
          </div>
          {/* Clerk hides sign-in for an active account; keep its avatar beside an account label. */}
          <span className="hidden min-w-0 flex-1 truncate px-3 font-semibold peer-empty:block">
            {t.settings.sidebarNav.connectTitle}
          </span>
          <Suspense fallback={null}>
            <T3ConnectSidebarAvatar variant="settings" />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
