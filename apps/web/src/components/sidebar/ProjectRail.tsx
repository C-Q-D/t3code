/** Project filters and utility navigation for the persistent frame column; shares sidebar storage. */
import { useAtomValue } from "@effect/atom-react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ChartNoAxesColumnIcon,
  CheckIcon,
  FolderIcon,
  LayersIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
} from "lucide-react";
import { useState, useEffect, useReducer, useRef, type ComponentProps } from "react";
import { t } from "~/i18n";
import { cn } from "~/lib/utils";
import { openCommandPalette } from "../../commandPaletteBus";
import { useClientSettings } from "../../hooks/useSettings";
import { getProjectOrderKey, selectProjectGroupingSettings } from "../../logicalProject";
import {
  buildSidebarProjectSnapshots,
  getSidebarProjectSettingsKey,
  projectGroupsSpanEnvironments,
  type SidebarProjectSnapshot,
} from "../../sidebarProjectGrouping";
import { legacyProjectCwdPreferenceKey, useUiStateStore } from "../../uiStateStore";
import {
  useAllEnvironmentProjectSnapshotsReady,
  useProjects,
  useThreadShells,
} from "../../state/entities";
import {
  useEnvironmentIdentities,
  useEnvironmentMachines,
  usePrimaryEnvironmentId,
  usePullRequestsSupported,
} from "../../state/environments";
import { environmentProjects } from "../../state/projects";
import {
  filterSidebarProjectScopeItems,
  orderItemsByPreferredIds,
  sortSidebarV2ProjectGroups,
} from "../Sidebar.logic";
import { ProjectFavicon } from "../ProjectFavicon";
import { ProjectEnvironmentBadge } from "../ProjectEnvironmentBadge";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxPopup,
  ComboboxTrigger,
  useComboboxFilter,
} from "../ui/combobox";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { isSidebarUtilityPage, useNavigateToMainApp } from "./mainAppLocation";
import {
  deriveProjectRailSelection,
  reduceProjectRailPickerState,
  toggleProjectRailScope,
} from "./projectRail.logic";

/**
 * Feature-specific 38px stone key. label supplies the localized accessible name and, unless
 * tooltip overrides it, the tooltip text.
 * Forward native button props, including Base UI's ref and event handlers, to the actual button.
 */
function ProjectRailKey({
  label,
  tooltip = label,
  children,
  className,
  ...props
}: ComponentProps<"button"> & { label: string; tooltip?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            {...props}
            className={cn(
              "relative flex size-9.5 shrink-0 cursor-pointer items-center justify-center rounded-project-rail border-0 p-0 text-secondary-label outline-none hover:bg-project-rail-hover hover:text-foreground focus-visible:inset-shadow-focus",
              className,
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="right">{tooltip}</TooltipPopup>
    </Tooltip>
  );
}

/** Renders the project rail outside the collapsible sidebar; routes retain their existing return target. */
export function ProjectRail() {
  const projects = useProjects();
  const threads = useThreadShells();
  const identities = useEnvironmentIdentities();
  const machines = useEnvironmentMachines();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const settings = useClientSettings(selectProjectGroupingSettings);
  const sortOrder = useClientSettings((state) => state.sidebarProjectSortOrder);
  const projectOrder = useUiStateStore((state) => state.projectOrder);
  const persistedKey = useUiStateStore((state) => state.sidebarProjectScopeKey);
  const setScope = useUiStateStore((state) => state.setSidebarProjectScopeKey);
  const snapshotsReady = useAllEnvironmentProjectSnapshotsReady();
  const configsReady = useAtomValue(environmentProjects.projectConfigsReadyAtom);
  const navigate = useNavigate();
  const navigateToMainApp = useNavigateToMainApp();
  const pathname = useLocation({ select: (location) => location.pathname });
  const onUtilityPage = isSidebarUtilityPage(pathname);
  const pullRequestsSupported = usePullRequestsSupported();
  const [{ open, query }, dispatchPicker] = useReducer(reduceProjectRailPickerState, {
    open: false,
    query: "",
  });
  const highlightedKey = useRef<string | null>(null);
  const suppressScopeChange = useRef(false);
  const filter = useComboboxFilter();
  // The compiler leaves this picker pipeline uncached; preserve grouping across query-only renders.
  const calculateGroups = () => {
    const orderedProjects =
      sortOrder === "manual"
        ? orderItemsByPreferredIds({
            items: projects,
            preferredIds: projectOrder,
            getId: getProjectOrderKey,
            getPreferenceIds: (project) => [
              getProjectOrderKey(project),
              legacyProjectCwdPreferenceKey(project.workspaceRoot),
            ],
          })
        : projects;
    return sortSidebarV2ProjectGroups(
      buildSidebarProjectSnapshots({
        projects: orderedProjects,
        groupScratchProjects: true,
        settings,
        primaryEnvironmentId,
        resolveEnvironmentLabel: (id) =>
          identities.find((identity) => identity.environmentId === id)?.label ?? null,
      }),
      threads,
      sortOrder,
    );
  };
  const [groupsCache, setGroupsCache] = useState(() => ({
    inputs: [
      identities,
      primaryEnvironmentId,
      projectOrder,
      projects,
      settings,
      sortOrder,
      threads,
    ] as const,
    value: calculateGroups(),
  }));
  let groups = groupsCache.value;
  if (
    !Object.is(groupsCache.inputs[0], identities) ||
    !Object.is(groupsCache.inputs[1], primaryEnvironmentId) ||
    !Object.is(groupsCache.inputs[2], projectOrder) ||
    !Object.is(groupsCache.inputs[3], projects) ||
    !Object.is(groupsCache.inputs[4], settings) ||
    !Object.is(groupsCache.inputs[5], sortOrder) ||
    !Object.is(groupsCache.inputs[6], threads)
  ) {
    groups = calculateGroups();
    setGroupsCache({
      inputs: [
        identities,
        primaryEnvironmentId,
        projectOrder,
        projects,
        settings,
        sortOrder,
        threads,
      ] as const,
      value: groups,
    });
  }
  const calculateSelection = () =>
    deriveProjectRailSelection({
      groups,
      key: persistedKey,
      settings,
      canClearMissingScope: snapshotsReady && configsReady,
    });
  const [selectionCache, setSelectionCache] = useState(() => ({
    inputs: [configsReady, groups, persistedKey, settings, snapshotsReady] as const,
    value: calculateSelection(),
  }));
  let selection = selectionCache.value;
  if (
    !Object.is(selectionCache.inputs[0], configsReady) ||
    !Object.is(selectionCache.inputs[1], groups) ||
    !Object.is(selectionCache.inputs[2], persistedKey) ||
    !Object.is(selectionCache.inputs[3], settings) ||
    !Object.is(selectionCache.inputs[4], snapshotsReady)
  ) {
    selection = calculateSelection();
    setSelectionCache({
      inputs: [configsReady, groups, persistedKey, settings, snapshotsReady] as const,
      value: selection,
    });
  }
  useEffect(() => {
    // Settings unmounts Sidebar, so the rail must also reconcile deleted scopes after all snapshots arrive.
    if (selection.key !== persistedKey) setScope(selection.key);
  }, [persistedKey, selection.key, setScope]);
  const calculateItems = () => [
    { value: "all", label: t.sidebar.projects.all },
    ...groups.map((group) => ({ value: group.projectKey, label: group.displayName })),
  ];
  const [itemsCache, setItemsCache] = useState(() => ({
    inputs: [groups] as const,
    value: calculateItems(),
  }));
  let items = itemsCache.value;
  if (!Object.is(itemsCache.inputs[0], groups)) {
    items = calculateItems();
    setItemsCache({ inputs: [groups] as const, value: items });
  }
  const calculateFilteredItems = () =>
    filterSidebarProjectScopeItems({
      items,
      query,
      matches: (item, search) => filter.contains(item.label, search),
    });
  const [filteredItemsCache, setFilteredItemsCache] = useState(() => ({
    inputs: [filter, items, query] as const,
    value: calculateFilteredItems(),
  }));
  let filteredItems = filteredItemsCache.value;
  if (
    !Object.is(filteredItemsCache.inputs[0], filter) ||
    !Object.is(filteredItemsCache.inputs[1], items) ||
    !Object.is(filteredItemsCache.inputs[2], query)
  ) {
    filteredItems = calculateFilteredItems();
    setFilteredItemsCache({ inputs: [filter, items, query] as const, value: filteredItems });
  }
  const showEnvironments = projectGroupsSpanEnvironments(groups);
  const activeItem = items.find((item) => item.value === (selection.key ?? "all")) ?? null;

  /** Open the chosen group's physical project settings without changing the current thread filter. */
  function openProjectSettings(project: SidebarProjectSnapshot) {
    // Base UI can commit its highlighted item as the popup closes; settings must not select it.
    suppressScopeChange.current = true;
    dispatchPicker({ type: "project-settings-opened" });
    void navigate({
      to: "/projects/$projectKey",
      params: { projectKey: getSidebarProjectSettingsKey(project, settings, projects) },
    });
  }

  // Rail keys are icon-only, so their names must appear quickly; the short delay still skips
  // keys the pointer merely crosses, and neighbors open instantly once one tooltip is showing.
  return (
    <TooltipProvider delay={100} closeDelay={0}>
      <nav
        className="flex h-full min-h-0 flex-col items-center gap-2 pt-1.5 pb-1"
        aria-label={t.sidebar.projects.title}
      >
        {onUtilityPage ? (
          <ProjectRailKey
            label={t.sidebar.chrome.back}
            className="project-rail-back bg-primary text-primary-foreground shadow-primary-button hover:bg-message-action-hover hover:text-primary-foreground"
            onClick={() => void navigateToMainApp()}
          >
            <ArrowLeftIcon className="size-4.5" strokeWidth={2} />
          </ProjectRailKey>
        ) : null}
        <Combobox
          items={items}
          filteredItems={filteredItems}
          autoHighlight
          open={open}
          onOpenChange={(nextOpen) => {
            if (nextOpen) suppressScopeChange.current = false;
            dispatchPicker({ type: "open-changed", open: nextOpen });
          }}
          itemToStringLabel={(item) => item.label}
          isItemEqualToValue={(a, b) => a.value === b.value}
          value={activeItem}
          onItemHighlighted={(item) => {
            highlightedKey.current = item?.value ?? null;
          }}
          onValueChange={(item) => {
            if (suppressScopeChange.current) return;
            if (item) setScope(item.value === "all" ? null : item.value);
          }}
        >
          <ComboboxTrigger
            // Base UI opens on mousedown; reserve opening for the explicit context-menu gestures.
            onMouseDown={(event) => event.preventBaseUIHandler()}
            onClick={(event) => {
              event.preventBaseUIHandler();
              suppressScopeChange.current = true;
              dispatchPicker({ type: "open-changed", open: false });
              setScope(null);
              if (onUtilityPage) void navigateToMainApp();
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              suppressScopeChange.current = false;
              dispatchPicker({ type: "open-changed", open: true });
            }}
            onKeyDown={(event) => {
              event.preventBaseUIHandler();
              if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                event.preventDefault();
                suppressScopeChange.current = false;
                dispatchPicker({ type: "open-changed", open: true });
              }
            }}
            onKeyUp={(event) => event.preventBaseUIHandler()}
            render={
              <ProjectRailKey
                label={t.sidebar.projects.todayTooltip}
                className={cn(
                  "bg-popover text-foreground shadow-raise-new-thread",
                  selection.key === null && "inset-shadow-selected",
                )}
              />
            }
          >
            <LayersIcon className="size-4.5" strokeWidth={1.75} />
          </ComboboxTrigger>
          <ComboboxPopup side="right" align="start" sideOffset={8} className="w-70">
            <div className="flex min-h-0 flex-1 flex-col gap-0.5 p-2">
              <div className="mb-1 flex h-8.5 shrink-0 items-center gap-2 rounded-full bg-input px-3 text-placeholder shadow-input-well focus-within:inset-shadow-focus">
                <SearchIcon className="size-3.25" strokeWidth={1.75} aria-hidden />
                <ComboboxPrimitive.Input
                  aria-label={t.sidebar.projects.searchAriaLabel}
                  placeholder={t.sidebar.projects.searchPlaceholder}
                  value={query}
                  onChange={(event) =>
                    dispatchPicker({ type: "query-changed", query: event.target.value })
                  }
                  onKeyDown={(event) => {
                    if (
                      event.defaultPrevented ||
                      event.nativeEvent.isComposing ||
                      event.ctrlKey ||
                      event.altKey ||
                      event.metaKey
                    )
                      return;
                    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))
                      return;
                    const project = groups.find(
                      (group) => group.projectKey === highlightedKey.current,
                    );
                    if (project) {
                      event.preventDefault();
                      openProjectSettings(project);
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent text-control text-foreground outline-none placeholder:text-placeholder"
                />
              </div>
              <ComboboxEmpty>{t.sidebar.projects.noMatchingProjects}</ComboboxEmpty>
              <ComboboxPrimitive.List className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
                {(item: (typeof items)[number]) => {
                  const project = groups.find((group) => group.projectKey === item.value);
                  return (
                    <ComboboxPrimitive.Item
                      key={item.value}
                      value={item}
                      className="flex h-9 shrink-0 cursor-pointer items-center gap-2.5 rounded-menu-row py-0 pr-1.5 pl-2.5 text-control text-foreground outline-none data-highlighted:bg-accent data-selected:bg-accent"
                      onContextMenu={(event) => {
                        if (project) {
                          event.preventDefault();
                          openProjectSettings(project);
                        }
                      }}
                    >
                      {project ? (
                        <ProjectFavicon project={project} className="size-4.5 shrink-0" />
                      ) : (
                        <FolderIcon className="size-3.75 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {project && showEnvironments ? (
                        <ProjectEnvironmentBadge
                          group={project}
                          primaryEnvironmentId={primaryEnvironmentId}
                          machineByEnvironmentId={machines}
                        />
                      ) : null}
                      <ComboboxPrimitive.ItemIndicator>
                        <CheckIcon className="size-3.5" strokeWidth={2.25} />
                      </ComboboxPrimitive.ItemIndicator>
                      {project ? (
                        <button
                          type="button"
                          tabIndex={-1}
                          aria-label={t.sidebar.projects.settingsAriaLabel(project.displayName)}
                          className="flex size-6.5 shrink-0 cursor-pointer items-center justify-center rounded-project-rail-settings border-0 bg-secondary p-0 text-fg-detail outline-none focus-visible:inset-shadow-focus"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            openProjectSettings(project);
                          }}
                        >
                          <SettingsIcon className="size-3.25" strokeWidth={1.75} />
                        </button>
                      ) : null}
                    </ComboboxPrimitive.Item>
                  );
                }}
              </ComboboxPrimitive.List>
            </div>
          </ComboboxPopup>
        </Combobox>
        <div
          className="my-0.5 h-0.25 w-4.5 shrink-0 bg-project-rail-divider shadow-project-rail-divider"
          aria-hidden
        />
        <div className="project-rail-scroll flex min-h-0 w-full flex-col gap-2 overflow-y-auto px-1 pb-1">
          {groups.map((project) => (
            <ProjectRailKey
              key={project.projectKey}
              label={t.sidebar.projects.filterByProjectAriaLabel(project.displayName)}
              tooltip={project.displayName}
              aria-pressed={selection.project?.projectKey === project.projectKey}
              className={cn(
                "self-center hover:bg-popover",
                selection.project?.projectKey === project.projectKey
                  ? "bg-popover shadow-raise-new-thread inset-shadow-selected"
                  : "bg-project-rail-idle shadow-well-project hover:inset-shadow-project-rail-hover",
              )}
              onClick={() => setScope(toggleProjectRailScope(selection.key, project.projectKey))}
            >
              <ProjectFavicon project={project} className="size-4.5" />
            </ProjectRailKey>
          ))}
          <ProjectRailKey
            label={t.sidebar.header.addProject}
            className="self-center outline outline-1 -outline-offset-1 outline-dashed outline-border"
            onClick={() => openCommandPalette({ open: "add-project" })}
          >
            <PlusIcon className="size-4.5" strokeWidth={2} />
          </ProjectRailKey>
        </div>
        <div className="mt-auto flex shrink-0 flex-col items-center gap-2">
          {pullRequestsSupported ? (
            <ProjectRailKey
              label={t.sidebar.chrome.pullRequests}
              aria-current={pathname === "/pull-requests" ? "page" : undefined}
              className={
                pathname === "/pull-requests" ? "bg-popover shadow-raise-new-thread" : undefined
              }
              onClick={() =>
                void navigate({ to: "/pull-requests", search: readPullRequestListPreferences() })
              }
            >
              <PullRequestGlyph.pullRequest className="size-4.5" />
            </ProjectRailKey>
          ) : null}
          <ProjectRailKey
            label={t.sidebar.chrome.usage}
            aria-current={pathname === "/usage" ? "page" : undefined}
            className={pathname === "/usage" ? "bg-popover shadow-raise-new-thread" : undefined}
            onClick={() => void navigate({ to: "/usage" })}
          >
            <ChartNoAxesColumnIcon className="size-4.5" strokeWidth={1.75} />
          </ProjectRailKey>
          <ProjectRailKey
            label={t.sidebar.chrome.settings}
            aria-current={
              pathname === "/settings" || pathname.startsWith("/settings/") ? "page" : undefined
            }
            className={
              pathname === "/settings" || pathname.startsWith("/settings/")
                ? "bg-popover shadow-raise-new-thread"
                : undefined
            }
            onClick={() => void navigate({ to: "/settings" })}
          >
            <SettingsIcon className="size-4.5" strokeWidth={1.75} />
          </ProjectRailKey>
        </div>
      </nav>
    </TooltipProvider>
  );
}
