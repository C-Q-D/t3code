/** Renders the draft heading and inline project selection controls. */
import { t } from "~/i18n";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import type { DraftId } from "~/composerDraftStore";
import { composerDraftHasUserContent, useComposerDraftStore } from "~/composerDraftStore";
import { resolveEnvironmentMachineKind, type ScopedProjectRef } from "@t3tools/contracts";
import { scopedProjectKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import { isScratchProject } from "@t3tools/client-runtime/state/projects";
import { CheckIcon, ChevronDownIcon, FolderPlusIcon, FolderXIcon } from "lucide-react";
import { useAtomValue } from "@effect/atom-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { openCommandPalette } from "~/commandPaletteBus";
import { shortcutLabelForCommand } from "~/keybindings";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useScratchProject } from "~/hooks/useScratchProject";
import { useClientSettings } from "~/hooks/useSettings";
import { hasExplicitComposerModelSelection } from "~/lib/chatThreadActions";
import { cn } from "~/lib/utils";
import {
  deriveLogicalProjectKeyFromSettings,
  selectProjectGroupingSettings,
} from "~/logicalProject";
import {
  buildSidebarProjectPickerEntries,
  buildSidebarProjectSnapshots,
  projectGroupsSpanEnvironments,
} from "~/sidebarProjectGrouping";
import { useProjects, useThreadShells } from "~/state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "~/state/environments";
import { ProjectEnvironmentBadge } from "../ProjectEnvironmentBadge";
import { ProjectFavicon } from "../ProjectFavicon";
import { sortLogicalProjectsForSidebar } from "../Sidebar.logic";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxList,
  ComboboxSearchInput,
  ComboboxTrigger,
  useComboboxFilter,
} from "../ui/combobox";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";

// Action values stay distinct from the logical project keys used by real project rows.
const ADD_PROJECT_VALUE = "add-project";
const NO_PROJECT_VALUE = "no-project";

// C1's raised 50px project choice is specific to the serif hero, rather than a shared button size.
const projectTriggerClassName =
  "pointer-events-auto inline-flex h-12.5 max-w-full shrink-0 cursor-pointer items-center gap-2.5 rounded-card-row border-0 bg-secondary pr-3.5 pl-2.5 align-middle font-serif text-chat-project-choice font-semibold text-foreground shadow-chat-project-choice outline-none hover:bg-accent focus-visible:inset-shadow-focus";

/** Project choices and the two existing actions share the combobox's labeled-value contract. */
interface PickerItem {
  readonly value: string;
  readonly label: string;
}

/** Nullable route context supports both project-backed and no-project drafts. */
interface DraftHeroHeadlineProps {
  readonly draftId: DraftId | null;
  readonly activeProjectRef: ScopedProjectRef | null;
  readonly activeProjectTitle: string | null;
}

/**
 * Renders the draft headline and project picker, applying project selection to the composer draft.
 * @param props - draftId, activeProjectRef, and activeProjectTitle may each be null when their
 * context is unavailable.
 * @returns The headline and project selection controls; never null.
 */
export function DraftHeroHeadline({
  draftId,
  activeProjectRef,
  activeProjectTitle,
}: DraftHeroHeadlineProps) {
  const projects = useProjects();
  const threads = useThreadShells();
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const projectSortOrder = useClientSettings((settings) => settings.sidebarProjectSortOrder);
  const setLogicalProjectDraftThreadId = useComposerDraftStore(
    (store) => store.setLogicalProjectDraftThreadId,
  );
  const getComposerDraft = useComposerDraftStore((store) => store.getComposerDraft);
  const applyStickyState = useComposerDraftStore((store) => store.applyStickyState);
  const setModelSelection = useComposerDraftStore((store) => store.setModelSelection);
  const openAddProject = useCallback(() => openCommandPalette({ open: "add-project" }), []);
  const { scratchEnvironmentId, scratchWorkspaceRootFor, openScratchProject } = useScratchProject();
  const openProjectDraft = useNewThreadHandler();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);

  const environmentLabelById = useMemo(
    () =>
      new Map(
        environments.map((environment) => [environment.environmentId, environment.label] as const),
      ),
    [environments],
  );
  const projectGroups = useMemo(
    () =>
      sortLogicalProjectsForSidebar(
        buildSidebarProjectSnapshots({
          projects,
          settings: projectGroupingSettings,
          primaryEnvironmentId,
          resolveEnvironmentLabel: (environmentId) =>
            environmentLabelById.get(environmentId) ?? null,
        }),
        threads,
        projectSortOrder,
      ),
    [
      environmentLabelById,
      primaryEnvironmentId,
      projectGroupingSettings,
      projectSortOrder,
      projects,
      threads,
    ],
  );
  // Same-named projects on two machines are only told apart by where they
  // live, so rows on another machine carry its icon once the catalog spans
  // more than one environment; a single-machine catalog stays as it was.
  const showProjectEnvironments = useMemo(
    () => projectGroupsSpanEnvironments(projectGroups),
    [projectGroups],
  );
  const environmentMachineById = useMemo(
    () =>
      new Map(
        environments.map(
          (environment) =>
            [
              environment.environmentId,
              resolveEnvironmentMachineKind(environment.serverConfig),
            ] as const,
        ),
      ),
    [environments],
  );
  const projectPickerEntries = useMemo(
    () =>
      buildSidebarProjectPickerEntries({
        groups: projectGroups,
        preferredProjectRef: activeProjectRef,
      }),
    [activeProjectRef, projectGroups],
  );
  const projectEntryByKey = useMemo(
    () => new Map(projectPickerEntries.map((entry) => [entry.group.projectKey, entry] as const)),
    [projectPickerEntries],
  );
  const activeProjectGroup =
    activeProjectRef === null
      ? null
      : (projectGroups.find((group) =>
          group.memberProjectRefs.some(
            (projectRef) => scopedProjectKey(projectRef) === scopedProjectKey(activeProjectRef),
          ),
        ) ?? null);
  const activeProjectKey = activeProjectGroup?.projectKey ?? "";
  const activeProjectDisplayName = activeProjectGroup?.displayName ?? activeProjectTitle;
  const hasResolvedProject = activeProjectTitle !== null;
  const canChooseProject = projectPickerEntries.length > 0;
  const shouldShowProjectMenu = canChooseProject;
  // Scratch projects appear as the no-project action rather than physical project rows.
  const menuEntries = useMemo(
    () =>
      projectPickerEntries.filter(
        ({ targetProject }) =>
          !isScratchProject(targetProject, scratchWorkspaceRootFor(targetProject.environmentId)),
      ),
    [projectPickerEntries, scratchWorkspaceRootFor],
  );
  const activeProject =
    activeProjectRef === null
      ? null
      : (projects.find(
          (project) =>
            project.environmentId === activeProjectRef.environmentId &&
            project.id === activeProjectRef.projectId,
        ) ?? null);
  const scratchTargetEnvironmentId = scratchEnvironmentId(
    activeProjectRef?.environmentId ?? primaryEnvironmentId,
  );
  const scratchWorkspaceRoot = scratchWorkspaceRootFor(scratchTargetEnvironmentId);
  const isScratchDraft =
    activeProject !== null && isScratchProject(activeProject, scratchWorkspaceRoot);
  const canStartWithoutProject =
    scratchTargetEnvironmentId !== null && scratchWorkspaceRoot !== null;

  // {value, label} items let Base UI drive the combobox selection while the
  // popup search filters the same collection. Non-project actions only trail the unfiltered list.
  const pickerItems = useMemo<readonly PickerItem[]>(
    () => [
      ...menuEntries.map(({ group }) => ({ value: group.projectKey, label: group.displayName })),
      ...(canStartWithoutProject
        ? [{ value: NO_PROJECT_VALUE, label: t.chat.draftHero.noProject }]
        : []),
      { value: ADD_PROJECT_VALUE, label: t.chat.draftHero.addProject },
    ],
    [canStartWithoutProject, menuEntries],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const pickerFilter = useComboboxFilter();
  const filteredPickerItems = useMemo(() => {
    const query = pickerQuery.trim();
    if (query.length === 0) return pickerItems;
    return pickerItems.filter(
      (item) =>
        item.value !== ADD_PROJECT_VALUE &&
        item.value !== NO_PROJECT_VALUE &&
        pickerFilter.contains(item, query, (candidate) => candidate.label),
    );
  }, [pickerFilter, pickerItems, pickerQuery]);
  const selectedPickerItem =
    pickerItems.find(
      (item) => item.value === (isScratchDraft ? NO_PROJECT_VALUE : activeProjectKey),
    ) ?? null;

  // The picker can change the draft's target while the no-project home is
  // still being opened; a stale continuation must not retarget it again.
  const latestTargetRef = useRef({ draftId, activeProjectKey, scratchTargetEnvironmentId });
  useEffect(() => {
    latestTargetRef.current = { draftId, activeProjectKey, scratchTargetEnvironmentId };
  }, [activeProjectKey, scratchTargetEnvironmentId, draftId]);
  // With a prompt typed, project selection changes the target of the open
  // draft in place, so the prompt stays in the same composer session. An empty
  // draft instead opens the chosen project's own draft, like starting a new
  // thread there: moving it would replace that draft and strand whatever it
  // holds, such as the browser tabs of the no-project draft.
  const selectProject = (project: (typeof projects)[number], logicalProjectKey: string) => {
    if (!draftId) {
      return;
    }
    latestTargetRef.current = {
      draftId,
      activeProjectKey: logicalProjectKey,
      scratchTargetEnvironmentId: project.environmentId,
    };
    const currentDraft = getComposerDraft(draftId);
    if (!composerDraftHasUserContent(currentDraft)) {
      void openProjectDraft(scopeProjectRef(project.environmentId, project.id));
      return;
    }
    setLogicalProjectDraftThreadId(
      logicalProjectKey,
      scopeProjectRef(project.environmentId, project.id),
      draftId,
    );
    if (!hasExplicitComposerModelSelection(currentDraft)) {
      applyStickyState(draftId);
      const environmentSettings = environments.find(
        (environment) => environment.environmentId === project.environmentId,
      )?.serverConfig?.settings;
      const defaultModelSelection = environmentSettings
        ? resolveProjectSettings(environmentSettings, project.id, project).settings
            .defaultModelSelection
        : project.defaultModelSelection;
      if (defaultModelSelection) {
        setModelSelection(draftId, defaultModelSelection, {
          replaceOptions: true,
        });
      }
    }
  };
  const startScratch = async (): Promise<boolean> => {
    if (scratchTargetEnvironmentId === null || isScratchDraft) {
      return false;
    }
    const requested = { draftId, activeProjectKey, scratchTargetEnvironmentId };
    const project = await openScratchProject(scratchTargetEnvironmentId);
    const latest = latestTargetRef.current;
    if (
      !project ||
      latest.draftId !== requested.draftId ||
      latest.activeProjectKey !== requested.activeProjectKey ||
      latest.scratchTargetEnvironmentId !== requested.scratchTargetEnvironmentId
    ) {
      return false;
    }
    selectProject(project, deriveLogicalProjectKeyFromSettings(project, projectGroupingSettings));
    return true;
  };

  const projectSelector = shouldShowProjectMenu ? (
    <Combobox
      items={pickerItems}
      filteredItems={filteredPickerItems}
      autoHighlight
      itemToStringLabel={(item) => item.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      open={pickerOpen}
      onOpenChange={(open) => {
        setPickerOpen(open);
        setPickerQuery("");
      }}
      value={selectedPickerItem}
      onValueChange={(item) => {
        if (!item) return;
        setPickerOpen(false);
        if (item.value === ADD_PROJECT_VALUE) {
          openAddProject();
          return;
        }
        if (item.value === NO_PROJECT_VALUE) {
          void startScratch();
          return;
        }
        const entry = projectEntryByKey.get(item.value);
        if (!entry || item.value === activeProjectKey) {
          return;
        }
        selectProject(entry.targetProject, entry.group.projectKey);
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            // The trigger's accessible name comes from its visible text (the
            // project title) so the hero sentence reads naturally: an
            // aria-label here would replace the title with an action phrase
            // mid-sentence and baffle screen-reader users.
            <ComboboxTrigger
              render={<button type="button" />}
              data-draft-project-trigger=""
              className={projectTriggerClassName}
            />
          }
        >
          <span className="inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-chat-draft-project-mark shadow-chat-draft-project-mark">
            {activeProject && !isScratchDraft ? (
              <ProjectFavicon project={activeProjectGroup ?? activeProject} className="size-full" />
            ) : (
              <FolderXIcon className="size-5" />
            )}
          </span>
          <span className="min-w-0 max-w-64 truncate">
            {isScratchDraft
              ? t.chat.draftHero.noProject
              : (activeProjectDisplayName ?? t.chat.draftHero.chooseAProject)}
          </span>
          <ChevronDownIcon className="size-5 shrink-0" />
        </TooltipTrigger>
        <TooltipPopup side="top">{t.chat.draftHero.chooseProject}</TooltipPopup>
      </Tooltip>
      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner align="start" sideOffset={10} className="z-130">
          <ComboboxPrimitive.Popup className="dropdown-glass flex max-h-(--available-height) w-65 max-w-(--available-width) flex-col overflow-hidden rounded-overlay-large font-sans text-control font-medium text-foreground leading-chat-project-menu tracking-normal">
            <ComboboxSearchInput
              aria-label={t.sidebar.projects.searchAriaLabel}
              placeholder={t.sidebar.projects.searchPlaceholder}
              value={pickerQuery}
              onChange={(event) => setPickerQuery(event.target.value)}
            />
            <ComboboxEmpty>{t.sidebar.projects.noMatchingProjects}</ComboboxEmpty>
            <ComboboxList>
              {(item: PickerItem) => {
                const entry = projectEntryByKey.get(item.value);
                return (
                  <Fragment key={item.value}>
                    {item.value === NO_PROJECT_VALUE ||
                    (item.value === ADD_PROJECT_VALUE && !canStartWithoutProject) ? (
                      <div
                        role="presentation"
                        className="mx-2 mt-1 mb-1.5 h-px shrink-0 bg-menu-engraving shadow-menu-engraving"
                      />
                    ) : null}
                    <ComboboxPrimitive.Item
                      value={item}
                      className="mb-0.5 flex h-9.5 shrink-0 cursor-pointer items-center gap-2.5 rounded-compact-row px-2.5 outline-none last:mb-0 data-selected:bg-accent not-data-selected:hover:bg-secondary not-data-selected:data-highlighted:bg-secondary focus-visible:inset-shadow-focus"
                    >
                      {item.value === ADD_PROJECT_VALUE ? (
                        <FolderPlusIcon className="size-4 shrink-0" />
                      ) : item.value === NO_PROJECT_VALUE ? (
                        <FolderXIcon className="size-4 shrink-0" />
                      ) : entry ? (
                        <ProjectFavicon
                          project={entry.group}
                          className="size-5 shrink-0 rounded-project-mark shadow-chat-project-mark"
                        />
                      ) : null}
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate",
                                !entry && "text-chat-project-label",
                              )}
                            />
                          }
                        >
                          {item.label}
                        </TooltipTrigger>
                        <TooltipPopup side="top">{item.label}</TooltipPopup>
                      </Tooltip>
                      {entry && showProjectEnvironments ? (
                        <ProjectEnvironmentBadge
                          group={entry.group}
                          primaryEnvironmentId={primaryEnvironmentId}
                          machineByEnvironmentId={environmentMachineById}
                        />
                      ) : null}
                      <ComboboxPrimitive.ItemIndicator>
                        <CheckIcon className="size-3.75 shrink-0" />
                      </ComboboxPrimitive.ItemIndicator>
                    </ComboboxPrimitive.Item>
                  </Fragment>
                );
              }}
            </ComboboxList>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </Combobox>
  ) : (
    <button type="button" onClick={openAddProject} className={projectTriggerClassName}>
      {activeProjectTitle ?? t.chat.draftHero.addAProject}
    </button>
  );

  // The composer hero is a sentence, so the heading's accessible name must be
  // a complete sentence too. The project picker is a control rendered inline
  // in the h1; without an explicit label its widget state bleeds into the
  // announced phrase.
  const headingLabel = isScratchDraft
    ? t.chat.draftHero.whatShouldWeWorkOn
    : hasResolvedProject
      ? t.chat.draftHero.buildIn(activeProjectDisplayName)
      : canChooseProject
        ? t.chat.draftHero.start(activeProjectDisplayName ?? t.chat.draftHero.chooseAProject)
        : t.chat.draftHero.addAProjectToStart;

  // One click out of the project, phrased as the alternative to the question
  // above it. Focus moves to the project picker once this line has gone.
  const noProjectShortcut = shortcutLabelForCommand(keybindings, "chat.newWithoutProject");
  const orStartWithoutProject =
    scratchWorkspaceRoot !== null && !isScratchDraft && (hasResolvedProject || canChooseProject) ? (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="pointer-events-auto cursor-pointer rounded-sm text-secondary-label underline decoration-border underline-offset-4 outline-none hover:text-foreground focus-visible:inset-shadow-focus"
              onClick={() =>
                void startScratch().then((started) => {
                  if (started) {
                    document.querySelector<HTMLElement>("[data-draft-project-trigger]")?.focus();
                  }
                })
              }
            />
          }
        >
          {t.chat.draftHero.orStartWithoutAProject}
        </TooltipTrigger>
        {noProjectShortcut ? <TooltipPopup side="bottom">{noProjectShortcut}</TooltipPopup> : null}
      </Tooltip>
    ) : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-3.5">
      <h1
        aria-label={headingLabel}
        className="flex w-full flex-wrap items-center justify-center gap-3 text-center font-serif text-new-chat-title font-semibold text-balance text-foreground tracking-chat-draft"
      >
        {isScratchDraft ? (
          <>{t.chat.draftHero.whatShouldWeWorkOn}</>
        ) : hasResolvedProject ? (
          <>
            {t.chat.draftHero.buildPrefix}
            {projectSelector}
            {t.chat.draftHero.buildSuffix}
          </>
        ) : canChooseProject ? (
          <>
            {projectSelector}
            {t.chat.draftHero.startSuffix}
          </>
        ) : (
          <>{t.chat.draftHero.addAProjectToStart}</>
        )}
      </h1>
      {/* Reserved whenever threads can skip a project, so the heading does not
          move. Without a project, the picker moves here to choose one. */}
      {scratchWorkspaceRoot === null ? null : (
        <p className="flex min-h-6 items-center justify-center font-sans text-control">
          {isScratchDraft ? projectSelector : orStartWithoutProject}
        </p>
      )}
    </div>
  );
}
