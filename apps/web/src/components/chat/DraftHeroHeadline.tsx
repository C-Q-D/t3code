/**
 * Renders the hero heading: the draft variant with inline project selection controls, and the
 * static variant for a server thread with no messages, whose project can no longer change.
 */
import { t } from "~/i18n";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import type { DraftId } from "~/composerDraftStore";
import { composerDraftHasUserContent, useComposerDraftStore } from "~/composerDraftStore";
import { resolveEnvironmentMachineKind, type ScopedProjectRef } from "@t3tools/contracts";
import { scopedProjectKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import { isScratchProject } from "@t3tools/client-runtime/state/projects";
import { CheckIcon, ChevronDownIcon, FolderPlusIcon, FolderXIcon } from "lucide-react";
import { useAtomValue } from "@effect/atom-react";
import { Fragment, useRef, useState } from "react";

import { openCommandPalette } from "~/commandPaletteBus";
import { shortcutLabelForCommand } from "~/keybindings";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { TriageDraftHero } from "./TriageDraftHero";
import { useOrderWhileOpen } from "~/hooks/useOrderWhileOpen";
import { useProjectPin } from "~/hooks/useProjectGroupUpdate";
import { useScratchProject } from "~/hooks/useScratchProject";
import { isTriagePrompt } from "~/hooks/useStartTriage";
import { useClientSettings } from "~/hooks/useSettings";
import { hasExplicitComposerModelSelection } from "~/lib/chatThreadActions";
import { cn } from "~/lib/utils";
import {
  deriveLogicalProjectKeyFromSettings,
  pickableProjectGroups,
  selectProjectGroupingSettings,
} from "@t3tools/client-runtime/state/project-grouping";
import {
  buildSidebarProjectPickerEntries,
  buildSidebarProjectSnapshots,
  projectGroupsSpanEnvironments,
} from "~/sidebarProjectGrouping";
import { useProjects, useThreadShells } from "~/state/entities";
import {
  useEnvironments,
  usePrimaryEnvironmentId,
  useEnvironmentProviders,
} from "~/state/environments";
import { ProjectEnvironmentBadge } from "../ProjectEnvironmentBadge";
import { ProjectFavicon } from "../ProjectFavicon";
import { isProjectPinShortcut, ProjectPinButton } from "../ProjectPinButton";
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
import { resolveProjectDefaultProviderModelSelection } from "../../providerInstances";
import { resolveNewThreadModelSelection } from "@t3tools/shared/usageLimits";

// Action values stay distinct from the logical project keys used by real project rows.
const ADD_PROJECT_VALUE = "add-project";
const NO_PROJECT_VALUE = "no-project";

const heroTitleClassName =
  "flex w-full flex-wrap items-center justify-center gap-3 text-center font-serif text-new-chat-title font-semibold text-balance text-foreground tracking-chat-draft";

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
  const providersByEnvironment = useEnvironmentProviders();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const projectSortOrder = useClientSettings((settings) => settings.sidebarProjectSortOrder);
  const setLogicalProjectDraftThreadId = useComposerDraftStore(
    (store) => store.setLogicalProjectDraftThreadId,
  );
  const getComposerDraft = useComposerDraftStore((store) => store.getComposerDraft);
  // A boolean, so typing in a draft does not re-render the hero.
  const isTriageDraftPrompt = useComposerDraftStore((store) =>
    draftId ? isTriagePrompt(store.getComposerDraft(draftId)?.prompt ?? "") : false,
  );
  const applyStickyState = useComposerDraftStore((store) => store.applyStickyState);
  const setModelSelection = useComposerDraftStore((store) => store.setModelSelection);
  const openAddProject = () => openCommandPalette({ open: "add-project" });
  const { scratchEnvironmentId, scratchWorkspaceRootFor, openScratchProject } = useScratchProject();
  const openProjectDraft = useNewThreadHandler();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const pickerFilter = useComboboxFilter();
  const highlightedPickerValueRef = useRef<string | null>(null);
  const { canPinProjectGroup, toggleProjectGroupPin } = useProjectPin();

  const environmentLabelById = new Map(
    environments.map((environment) => [environment.environmentId, environment.label] as const),
  );
  const projectGroups = sortLogicalProjectsForSidebar(
    buildSidebarProjectSnapshots({
      projects,
      settings: projectGroupingSettings,
      primaryEnvironmentId,
      resolveEnvironmentLabel: (environmentId) => environmentLabelById.get(environmentId) ?? null,
    }),
    threads,
    projectSortOrder,
  );
  const showProjectEnvironments = projectGroupsSpanEnvironments(projectGroups);
  const environmentMachineById = new Map(
    environments.map(
      (environment) =>
        [
          environment.environmentId,
          resolveEnvironmentMachineKind(environment.serverConfig),
        ] as const,
    ),
  );
  const projectPickerEntries = buildSidebarProjectPickerEntries({
    groups: pickableProjectGroups(projectGroups),
    preferredProjectRef: activeProjectRef,
  });
  const projectEntryByKey = new Map(
    projectPickerEntries.map((entry) => [entry.group.projectKey, entry] as const),
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
  const menuEntries = projectPickerEntries.filter(
    ({ targetProject }) =>
      !isScratchProject(targetProject, scratchWorkspaceRootFor(targetProject.environmentId)),
  );
  const activeProject =
    activeProjectRef === null
      ? null
      : (projects.find(
          (project) =>
            project.environmentId === activeProjectRef.environmentId &&
            project.id === activeProjectRef.projectId,
        ) ?? null);
  const scratchTargetEnvironmentId = scratchEnvironmentId(activeProjectRef?.environmentId ?? null);
  const scratchWorkspaceRoot = scratchWorkspaceRootFor(scratchTargetEnvironmentId);
  const isScratchDraft =
    activeProject !== null && isScratchProject(activeProject, scratchWorkspaceRoot);
  const canStartWithoutProject =
    scratchTargetEnvironmentId !== null && scratchWorkspaceRoot !== null;

  // {value, label} items let Base UI drive the combobox selection while the
  // popup search filters the same collection. Non-project actions only trail the unfiltered list.
  const pickerItems = useOrderWhileOpen(
    [
      ...menuEntries.map(({ group }) => ({ value: group.projectKey, label: group.displayName })),
      ...(canStartWithoutProject
        ? [{ value: NO_PROJECT_VALUE, label: t.chat.draftHero.noProject }]
        : []),
      { value: ADD_PROJECT_VALUE, label: t.chat.draftHero.addProject },
    ],
    (item) => item.value,
    pickerOpen,
  );
  const filteredPickerItems = (() => {
    const query = pickerQuery.trim();
    if (query.length === 0) return pickerItems;
    return pickerItems.filter(
      (item) =>
        item.value !== ADD_PROJECT_VALUE &&
        item.value !== NO_PROJECT_VALUE &&
        pickerFilter.contains(item, query, (candidate) => candidate.label),
    );
  })();
  const selectedPickerItem =
    pickerItems.find(
      (item) => item.value === (isScratchDraft ? NO_PROJECT_VALUE : activeProjectKey),
    ) ?? null;

  // The picker can change the draft's target while the no-project home is
  // still being opened; a stale continuation must not retarget it again. Picking
  // a project clears the pending request, and the draft session is compared
  // against the store when the scratch project arrives.
  const pendingScratchRef = useRef<symbol | null>(null);
  const draftTargetKey = () => {
    const session = draftId ? useComposerDraftStore.getState().getDraftSession(draftId) : null;
    return session
      ? `${session.environmentId}:${session.projectId}:${session.logicalProjectKey}`
      : null;
  };
  // Retargeting an empty draft would overwrite the project's draft and strand browser tabs.
  const selectProject = (project: (typeof projects)[number], logicalProjectKey: string) => {
    if (!draftId) {
      return;
    }
    pendingScratchRef.current = null;
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
      const environmentConfig = environments.find(
        (environment) => environment.environmentId === project.environmentId,
      )?.serverConfig;
      const environmentSettings = environmentConfig?.settings;
      const defaultSelection = environmentSettings
        ? resolveProjectSettings(environmentSettings, project.id, project).settings
            .defaultModelSelection
        : project.defaultModelSelection;
      const fallbackResolution = resolveNewThreadModelSelection({
        defaultSelection:
          defaultSelection ??
          (useComposerDraftStore.getState().stickyActiveProvider !== null || !environmentSettings
            ? null
            : resolveProjectDefaultProviderModelSelection(
                providersByEnvironment.get(project.environmentId) ?? [],
                environmentSettings,
                project.id,
              )),
        fallbackSelection: environmentSettings?.fallbackModelSelection ?? null,
        providers: providersByEnvironment.get(project.environmentId) ?? [],
        ...(environmentSettings ? { settings: environmentSettings } : {}),
        projectId: project.id,
        now: Date.now(),
      });
      const defaultModelSelection = fallbackResolution.fallback
        ? fallbackResolution.selection
        : defaultSelection;
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
    const request = Symbol("scratch");
    pendingScratchRef.current = request;
    const requestedTarget = draftTargetKey();
    const project = await openScratchProject(scratchTargetEnvironmentId);
    if (!project || pendingScratchRef.current !== request || draftTargetKey() !== requestedTarget) {
      return false;
    }
    pendingScratchRef.current = null;
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
      onItemHighlighted={(item) => {
        highlightedPickerValueRef.current = item?.value ?? null;
      }}
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
              onKeyDown={(event) => {
                const highlighted = highlightedPickerValueRef.current;
                const group = highlighted ? projectEntryByKey.get(highlighted)?.group : undefined;
                if (
                  !group ||
                  !canPinProjectGroup(group) ||
                  !isProjectPinShortcut(event, keybindings)
                )
                  return;
                event.preventDefault();
                event.stopPropagation();
                toggleProjectGroupPin(group);
              }}
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
                      {entry && canPinProjectGroup(entry.group) ? (
                        <ProjectPinButton
                          name={entry.group.displayName}
                          pinned={entry.group.pinned}
                          shortcutLabel={shortcutLabelForCommand(keybindings, "thread.pin")}
                          onToggle={() => toggleProjectGroupPin(entry.group)}
                        />
                      ) : null}
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

  if (isScratchDraft && isTriageDraftPrompt) {
    const environment = environments.find(
      (entry) => entry.environmentId === activeProject.environmentId,
    );
    return (
      <TriageDraftHero
        machineLabel={environment?.label ?? null}
        serverVersion={environment?.serverConfig?.environment.serverVersion ?? null}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-3.5">
      <h1 className={heroTitleClassName}>
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

/**
 * Renders the hero heading for a server thread with no messages, such as one reverted to its
 * start. The thread is already bound to its project, so the draft picker and the start-without-
 * a-project action would act on a new draft instead and are left out.
 * @param props - projectTitle names the thread's project, or is null for a no-project thread.
 * @returns The static heading; never null.
 */
export function ServerThreadHeroHeadline({
  projectTitle,
}: {
  readonly projectTitle: string | null;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-3.5">
      <h1 className={heroTitleClassName}>
        {projectTitle === null
          ? t.chat.draftHero.whatShouldWeWorkOn
          : t.chat.draftHero.buildIn(projectTitle)}
      </h1>
    </div>
  );
}
