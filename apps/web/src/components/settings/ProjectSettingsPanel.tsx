/** Project overview and identity controls; mutations and picker dialogs retain their existing scope. */
import { readUnloadedThreadCount } from "../../state/olderSettledShelf";
import { useProjectGroupUpdate, type ProjectGroupUpdate } from "../../hooks/useProjectGroupUpdate";
import { t } from "~/i18n";
import { useComposerMenuState } from "../chat/useComposerMenuState";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { AuthOrchestrationOperateScope } from "@t3tools/contracts";
import { useEnvironmentsWithScope, readEnvironmentScope } from "../../state/session";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
  mapAtomCommandResult,
  settlePromise,
} from "@t3tools/client-runtime/state/runtime";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { planProjectRemoval } from "@t3tools/client-runtime/state/projects";
import { AsyncResult } from "effect/reactivity";
import { type EnvironmentId } from "@t3tools/contracts";
import { Navigate, useLocation, useNavigate } from "@tanstack/react-router";
import * as Cause from "effect/Cause";
import { InfoIcon, MonitorIcon, Trash2Icon } from "lucide-react";
import { lazy, Suspense, useRef, useState, type ReactNode } from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { releaseProjectDraftUploads } from "../../lib/composerDraftUploads";
import { readLocalApi } from "../../localApi";
import {
  type SidebarProjectGroupMember,
  type SidebarProjectSnapshot,
} from "../../sidebarProjectGrouping";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { useThreadShells, waitForProjectRemoval } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { ProjectFavicon } from "../ProjectFavicon";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import {
  canPickExternalProjectFavicon,
  ProjectFaviconPickerDialog,
} from "./ProjectFaviconPickerDialog";
import { ProjectActionsSettings } from "./ProjectActionsSettings";
import { ProjectDefaultsSettings } from "./ProjectDefaultsSettings";
import {
  defaultProjectIcon,
  hasDefaultProjectIcon,
  projectGroupTitleNeedsUpdate,
} from "./ProjectSettingsPanel.logic";
import { useSettingsProjectGroups } from "./useSettingsProjectGroups";

const ProjectIconPickerDialog = lazy(() =>
  import("./ProjectIconPickerDialog").then((module) => ({
    default: module.ProjectIconPickerDialog,
  })),
);

/** Keeps long overview values readable with both keyboard focus and pointer hover. */
function ProjectOverviewValue({ value }: { value: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className="block truncate rounded-settings-row-surface outline-none focus-visible:inset-shadow-focus"
          />
        }
      >
        {value}
      </TooltipTrigger>
      <TooltipPopup>{value}</TooltipPopup>
    </Tooltip>
  );
}

/** `project` is the Projects page shortcut: the new-thread defaults people change most. */
export type ProjectSettingsCategory = "general" | "integrations" | "source-control" | "project";

/** Identifies the selected checkout members across regrouping without retaining project objects. */
interface ProjectSelection {
  readonly key: string;
  readonly environmentId: EnvironmentId | null;
  readonly checkoutKey: string | null;
  readonly memberKeys: ReadonlyArray<string>;
}

/** Compares selection axes and ordered member keys so unchanged renders do not schedule state updates. */
function sameProjectSelection(a: ProjectSelection | null, b: ProjectSelection): boolean {
  return (
    a !== null &&
    a.key === b.key &&
    a.environmentId === b.environmentId &&
    a.checkoutKey === b.checkoutKey &&
    a.memberKeys.length === b.memberKeys.length &&
    a.memberKeys.every((key, index) => key === b.memberKeys[index])
  );
}

/** Resolves the selected project and optional checkout filters, retaining missing-project recovery. */
export function ProjectSettingsPanel({
  projectKey,
  environmentId = null,
  checkoutKey = null,
  unavailable,
}: {
  projectKey: string;
  environmentId?: EnvironmentId | null;
  checkoutKey?: string | null;
  unavailable?: ReactNode;
}) {
  const groups = useSettingsProjectGroups();
  const pathname = useLocation({ select: (location) => location.pathname });

  const selected = groups.find((group) => group.projectKey === projectKey) ?? null;
  const members =
    selected?.memberProjects.filter(
      (member) =>
        (environmentId === null || member.environmentId === environmentId) &&
        (checkoutKey === null || member.physicalProjectKey === checkoutKey),
    ) ?? [];

  // Retain group members so grouping-rule changes can follow the project to its new group.
  const [lastSelection, setLastSelection] = useState<ProjectSelection | null>(null);
  if (selected && members.length > 0) {
    const current: ProjectSelection = {
      key: selected.projectKey,
      environmentId,
      checkoutKey,
      memberKeys: members.map((member) => member.physicalProjectKey),
    };
    if (!sameProjectSelection(lastSelection, current)) setLastSelection(current);
  }

  const successor =
    members.length === 0 &&
    lastSelection?.key === projectKey &&
    lastSelection.environmentId === environmentId &&
    lastSelection.checkoutKey === checkoutKey
      ? groups.find((group) =>
          group.memberProjects.some((member) =>
            lastSelection.memberKeys.includes(member.physicalProjectKey),
          ),
        )
      : undefined;
  if (successor) {
    return (
      <Navigate
        to={pathname}
        search={{
          project: successor.projectKey,
          machine: environmentId ?? undefined,
          checkout: checkoutKey ?? undefined,
        }}
        replace
        hashScrollIntoView={false}
      />
    );
  }

  if ((!selected || members.length === 0) && unavailable != null) return unavailable;

  if (!selected) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        {groups.length === 0
          ? t.settings.projectSettings.addProjectSidebarConfigureHint
          : t.settings.projectSettings.thisProjectIsNoLongerAvailable}
      </div>
    );
  }
  if (members.length === 0)
    return (
      <p className="p-8 text-sm text-muted-foreground">
        {t.settings.projectSettings.checkoutLongerAvailableSelectedProjectHint}
      </p>
    );
  const scopedGroup = {
    ...selected,
    memberProjects: members,
    environmentId: members[0]!.environmentId,
    id: members[0]!.id,
  };
  return (
    <ProjectDetail
      key={`${selected.projectKey}:${environmentId ?? "all"}:${checkoutKey ?? "all"}`}
      group={scopedGroup}
      allMembers={selected.memberProjects}
      hasOtherMembers={members.length < selected.memberProjects.length}
    />
  );
}

/** Presents the selected members; group edits fan out only to those members after permission checks. */
function ProjectDetail({
  group,
  allMembers,
  hasOtherMembers,
}: {
  group: SidebarProjectSnapshot;
  /** Pin and archive belong to the whole project, even when one machine is picked. */
  allMembers: ReadonlyArray<SidebarProjectGroupMember>;
  hasOtherMembers: boolean;
}) {
  const navigate = useNavigate({ from: "/settings" });
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const environmentById = new Map(
    environments.map((environment) => [environment.environmentId, environment]),
  );
  const editableIds = useEnvironmentsWithScope(allMembers, AuthOrchestrationOperateScope);
  const canEditGroup = group.memberProjects.every((member) =>
    editableIds.has(member.environmentId),
  );
  const representative =
    group.memberProjects.find(
      (member) => environmentById.get(member.environmentId)?.serverConfig != null,
    ) ?? group.memberProjects[0]!;
  const threads = useThreadShells();
  const updateProject = useOrchestrationCommand(projectEnvironment.update, {
    reportFailure: false,
  });
  const deleteProject = useOrchestrationCommand(projectEnvironment.delete, {
    reportFailure: false,
  });
  const projectNameEditedRef = useRef(false);

  const faviconPath = representative.faviconPath ?? null;
  const projectIcon = representative.projectIcon ?? null;
  const pickProjectFavicon =
    typeof window !== "undefined" &&
    group.memberProjects.every(
      (member) =>
        member.environmentId === primaryEnvironmentId &&
        canPickExternalProjectFavicon(member.workspaceRoot, navigator.platform),
    )
      ? window.desktopBridge?.pickProjectFavicon
      : undefined;

  const reportFailure = (title: string, result: AtomCommandResult<void, unknown>) => {
    if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return;
    const error = squashAtomCommandFailure(result);
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title,
        description:
          error instanceof Error ? error.message : t.settings.archive.actionErrorDescription,
      }),
    );
  };

  const checkProjectAccess = (
    members: ReadonlyArray<SidebarProjectGroupMember>,
    failureTitle: string,
  ) => {
    const denied = members.find(
      (member) => !readEnvironmentScope(member.environmentId, AuthOrchestrationOperateScope),
    );
    if (!denied) return null;
    const result = AsyncResult.failure<void, Error>(
      Cause.fail(
        new Error(
          t.settings.projectSettings.connectionChangeProjectsError(denied.environmentLabel),
        ),
      ),
    );
    reportFailure(failureTitle, result);
    return result;
  };

  const updateAllMembers = async (
    input: ProjectGroupUpdate | ((member: SidebarProjectGroupMember) => ProjectGroupUpdate),
    failureTitle: string,
  ): Promise<AtomCommandResult<void, unknown>> => {
    const denied = checkProjectAccess(group.memberProjects, failureTitle);
    if (denied) return denied;
    const unavailable = group.memberProjects.find((member) => {
      const environment = environmentById.get(member.environmentId);
      return environment?.connection.phase !== "connected" || !environment.serverConfig;
    });
    if (unavailable) {
      const error = new Error(
        t.settings.projectSettings.connectAndTryAgain(unavailable.environmentLabel),
      );
      const result: AtomCommandResult<void, unknown> = AsyncResult.failure(Cause.fail(error));
      reportFailure(failureTitle, result);
      return result;
    }
    for (const member of group.memberProjects) {
      const revoked = checkProjectAccess([member], failureTitle);
      if (revoked) return revoked;
      const result = mapAtomCommandResult(
        await updateProject({
          environmentId: member.environmentId,
          input: { projectId: member.id, ...(typeof input === "function" ? input(member) : input) },
        }),
        () => undefined,
      );
      if (result._tag === "Failure") {
        reportFailure(
          group.memberProjects.length > 1
            ? t.settings.projectSettings.on(failureTitle, member.environmentLabel)
            : failureTitle,
          result,
        );
        return result;
      }
    }
    return AsyncResult.success(undefined);
  };

  const { updateProjectGroup, canOrganizeProjectGroup } = useProjectGroupUpdate();
  const canOrganize =
    allMembers.every((member) => editableIds.has(member.environmentId)) &&
    canOrganizeProjectGroup(allMembers);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const organize = async (input: ProjectGroupUpdate, failureTitle: string) => {
    setIsOrganizing(true);
    await updateProjectGroup(allMembers, input, failureTitle);
    setIsOrganizing(false);
  };

  const renameGroup = async (nextTitle: string, wasEdited: boolean) => {
    const title = nextTitle.trim();
    if (!title) {
      toastManager.add({
        type: "warning",
        title: t.settings.projectSettings.projectTitleCannotBeEmpty,
      });
      return;
    }
    if (
      !projectGroupTitleNeedsUpdate(
        group.memberProjects.map((member) => member.title),
        title,
        wasEdited,
      )
    ) {
      return;
    }
    await updateAllMembers({ title }, t.settings.projectSettings.failedToRenameProject);
  };

  const [faviconPickerOpen, setFaviconPickerOpen] = useComposerMenuState(!canEditGroup);
  const [iconPickerOpen, setIconPickerOpen] = useComposerMenuState(!canEditGroup);
  const [isSavingFavicon, setIsSavingFavicon] = useState(false);
  const savingFaviconRef = useRef(false);
  const setProjectIcon = async (input: Parameters<typeof updateAllMembers>[0]) => {
    if (savingFaviconRef.current) return;
    savingFaviconRef.current = true;
    setIsSavingFavicon(true);
    return await (async () => {
      await updateAllMembers(input, t.settings.projectSettings.failedToUpdateProjectIcon);
    })().finally(() => {
      savingFaviconRef.current = false;
      setIsSavingFavicon(false);
    });
  };

  const hasMultipleCheckouts = group.memberProjects.length > 1;

  const removeMembers = async (members: ReadonlyArray<SidebarProjectGroupMember>) => {
    if (checkProjectAccess(members, t.settings.projectSettings.failedToRemoveProject)) return;
    const api = readLocalApi();
    if (!api) return;

    const { projectThreads, isWholeGroup, targetKind } = planProjectRemoval({
      members,
      groupMemberCount: group.memberProjects.length,
      hasOtherMembers,
      displayName: group.displayName,
      threads,
      unloadedThreadCount: readUnloadedThreadCount(members, threads),
    });
    const singleMember = members.length === 1 ? members[0]! : null;
    const targetLabel = singleMember?.title ?? group.displayName;
    const confirmed = await settlePromise(() =>
      api.dialogs.confirm(
        [
          projectThreads.length > 0
            ? t.settings.projectSettings.removeAndDeleteItsThread(
                targetKind,
                targetLabel,
                projectThreads.length,
                Boolean(projectThreads.length === 1),
              )
            : t.settings.projectSettings.remove(targetKind, targetLabel),
          ...(singleMember
            ? [
                t.settings.projectSettings.path(singleMember.workspaceRoot),
                ...(singleMember.environmentLabel
                  ? [t.settings.projectSettings.environment(singleMember.environmentLabel)]
                  : []),
              ]
            : [t.settings.projectSettings.thisRemovesGroupedProjectEntries(members.length)]),
          ...(projectThreads.length > 0
            ? [t.settings.projectSettings.permanentlyClearsConversationHistoryThreadsHint]
            : [t.settings.projectSettings.permanentlyClearsAnyArchivedConversationHint]),
          isWholeGroup && !hasOtherMembers
            ? t.settings.projectSettings.removesProjectEntriesFilesDiskHint
            : t.settings.projectSettings.otherEntriesGroupedProjectUnaffectedHint,
          t.settings.projectSettings.thisActionCannotBeUndone,
        ].join("\n"),
        { variant: "destructive" },
      ),
    );
    if (confirmed._tag === "Failure" || !confirmed.value) return;
    if (checkProjectAccess(members, t.settings.projectSettings.failedToRemoveProject)) return;

    const draftStore = useComposerDraftStore.getState();
    for (const member of members) {
      if (checkProjectAccess([member], t.settings.projectSettings.failedToRemoveProject)) return;
      const memberThreads = projectThreads.filter(
        (thread) => thread.environmentId === member.environmentId && thread.projectId === member.id,
      );
      const result = mapAtomCommandResult(
        await deleteProject({
          environmentId: member.environmentId,
          input: {
            projectId: member.id,
            force: true,
          },
        }),
        () => undefined,
      );
      if (result._tag === "Failure") {
        reportFailure(t.settings.projectSettings.failedToRemove(member.title), result);
        return;
      }
      const projectRef = scopeProjectRef(member.environmentId, member.id);
      await waitForProjectRemoval(projectRef);
      releaseProjectDraftUploads(
        projectRef,
        memberThreads.map((thread) => scopeThreadRef(thread.environmentId, thread.id)),
      );
      const projectDraftThread = draftStore.getDraftThreadByProjectRef(projectRef);
      if (projectDraftThread) {
        draftStore.clearDraftThread(projectDraftThread.draftId);
      }
      draftStore.clearProjectDraftThreadId(projectRef);
    }

    if (isWholeGroup && !hasOtherMembers) {
      void navigate({
        to: "/settings/projects",
        search: ({ machine }) => ({ project: undefined, machine, checkout: undefined }),
        replace: true,
      });
    }
  };

  const checkoutChoices = (
    <SettingsSection title={t.settings.projectSettings.checkouts}>
      {group.memberProjects.map((member) => (
        <SettingsRow
          key={member.physicalProjectKey}
          title={member.environmentLabel ?? t.settings.scopeNotice.environment}
          description={member.workspaceRoot}
          control={
            <Button
              size="toolbar"
              variant="outline"
              disabled={!editableIds.has(member.environmentId)}
              onClick={() => void removeMembers([member])}
              aria-label={t.settings.projectSettings.removeCheckout(member.workspaceRoot)}
            >
              {t.settings.projectSettings.removeAction}
            </Button>
          }
        />
      ))}
    </SettingsSection>
  );

  return (
    <>
      <SettingsPageContainer>
        <SettingsSection id="project-summary" title={t.settings.projectSettings.overview}>
          <dl className="flex flex-wrap gap-2.5 py-2.5 pr-3 pl-3.5 text-control">
            <div className="flex w-40 flex-col gap-0.5 rounded-settings-row-surface bg-settings-project-well px-3.5 py-2.5 shadow-settings-project-well">
              <dt className="text-secondary-copy text-secondary-label">
                {t.settings.projectSettings.overviewName}
              </dt>
              <dd className="flex min-w-0 items-center gap-2 font-semibold">
                <ProjectFavicon project={representative} className="size-4.5 shrink-0" />
                <ProjectOverviewValue value={group.displayName} />
              </dd>
            </div>
            <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5 rounded-settings-row-surface bg-settings-project-well px-3.5 py-2.5 shadow-settings-project-well">
              <dt className="text-secondary-copy text-secondary-label">
                {t.settings.projectSettings.overviewPath}
              </dt>
              <dd className="min-w-0 font-mono text-secondary-copy-medium">
                <ProjectOverviewValue
                  value={group.memberProjects.map((member) => member.workspaceRoot).join(" · ")}
                />
              </dd>
            </div>
            <div className="flex w-30 flex-col gap-0.5 rounded-settings-row-surface bg-settings-project-well px-3.5 py-2.5 shadow-settings-project-well">
              <dt className="text-secondary-copy text-secondary-label">
                {t.settings.projectSettings.overviewEnvironment}
              </dt>
              <dd className="flex min-w-0 items-center gap-1.5 font-semibold">
                <MonitorIcon className="size-3.5 shrink-0" />
                <ProjectOverviewValue
                  value={Array.from(
                    new Set(
                      group.memberProjects.map(
                        (member) => member.environmentLabel ?? t.settings.scopeNotice.environment,
                      ),
                    ),
                  ).join(" · ")}
                />
              </dd>
            </div>
          </dl>
        </SettingsSection>
        <ProjectActionsSettings />
        <Alert variant="info">
          <InfoIcon aria-hidden />
          <AlertDescription>
            {t.settings.projectSettings.tFindSettingKeepProjectHint}
          </AlertDescription>
        </Alert>
        <SettingsSection id="project-overview" title={t.settings.projectSettings.identity}>
          {!canEditGroup ? (
            <p className="px-3 py-2 text-sm text-muted-foreground sm:px-4">
              {group.memberProjects.length > 1
                ? t.settings.projectSettings.sharedSettingsRequirePermissionChangeHint
                : t.settings.projectSettings.connectionChangeProjectError}
            </p>
          ) : null}
          <SettingsRow
            title={t.settings.diagnostics.columns.name}
            description={t.settings.projectSettings.sharedNameProjectGroupSidebarHint}
            control={
              <Input
                key={`${group.projectKey}:${group.displayName}`}
                size="settings"
                className="w-full sm:w-64"
                aria-label={t.settings.projectSettings.projectName}
                disabled={!canEditGroup}
                defaultValue={group.displayName}
                onChange={() => {
                  projectNameEditedRef.current = true;
                }}
                onBlur={(event) => {
                  const wasEdited = projectNameEditedRef.current;
                  projectNameEditedRef.current = false;
                  void renameGroup(event.currentTarget.value, wasEdited);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            }
          />
          <SettingsRow
            title={t.settings.projectSettings.projectIcon}
            description={
              projectIcon?.kind === "lucide"
                ? `${projectIcon.name} · ${projectIcon.color}`
                : projectIcon?.kind === "monogram"
                  ? `${projectIcon.text} · ${projectIcon.color}`
                  : projectIcon?.kind === "emoji"
                    ? projectIcon.emoji
                    : (faviconPath ?? t.settings.projectSettings.automatic)
            }
            resetAction={
              group.memberProjects.some((member) => !hasDefaultProjectIcon(member)) ? (
                <SettingResetButton
                  label={t.settings.projectSettings.iconResetLabel}
                  disabled={isSavingFavicon || !canEditGroup}
                  onClick={() => void setProjectIcon(defaultProjectIcon)}
                />
              ) : null
            }
            control={
              <div className="flex items-center gap-2">
                <ProjectFavicon project={representative} className="size-6" />
                <Button
                  size="toolbar"
                  variant="outline"
                  type="button"
                  aria-label={t.settings.projectSettings.chooseAProjectIcon}
                  disabled={isSavingFavicon || !canEditGroup}
                  onClick={() => setIconPickerOpen(true)}
                >
                  {t.settings.projectSettings.chooseIcon}
                </Button>
                <Button
                  size="toolbar"
                  variant="outline"
                  type="button"
                  aria-label={t.settings.projectSettings.chooseAProjectIconFile}
                  disabled={isSavingFavicon || !canEditGroup}
                  onClick={() => setFaviconPickerOpen(true)}
                >
                  {t.settings.projectSettings.chooseFile}
                </Button>
              </div>
            }
          />
          {canOrganize ? (
            <>
              <SettingsRow
                title="Pin"
                description="Pinned projects come first in project pickers."
                control={
                  <Switch
                    checked={group.pinned}
                    disabled={isOrganizing}
                    onCheckedChange={(checked) =>
                      void organize(
                        { pinned: Boolean(checked) },
                        checked ? "Failed to pin project" : "Failed to unpin project",
                      )
                    }
                    aria-label="Pin project"
                  />
                }
              />
              <SettingsRow
                title="Archive"
                description={
                  group.archived
                    ? "Hidden from project pickers. Threads and files are kept."
                    : "Hides the project from project pickers. Threads and files are kept."
                }
                control={
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isOrganizing}
                    onClick={() =>
                      void organize(
                        { archived: !group.archived },
                        group.archived
                          ? "Failed to unarchive project"
                          : "Failed to archive project",
                      )
                    }
                  >
                    {group.archived ? "Unarchive" : "Archive"}
                  </Button>
                }
              />
            </>
          ) : null}
        </SettingsSection>
        <ProjectDefaultsSettings category="project" />
        {hasMultipleCheckouts ? checkoutChoices : null}
        <SettingsSection title={t.settings.projectSettings.danger}>
          <SettingsRow
            title={
              hasOtherMembers
                ? t.settings.projectSettings.removeCheckoutAction
                : group.memberProjects.length > 1
                  ? t.settings.projectSettings.removeThisProjectEverywhere
                  : t.settings.projectSettings.removeProject
            }
            description={
              hasOtherMembers
                ? t.settings.projectSettings.deletesSelectedMachineSCheckoutHint
                : group.memberProjects.length > 1
                  ? t.settings.projectSettings.deletesAllCheckoutEntriesTheirHint(
                      group.memberProjects.length,
                    )
                  : t.settings.projectSettings.deletesProjectEntryThreadsFilesHint
            }
            control={
              <Button
                size="toolbar"
                variant="destructive-outline"
                disabled={!canEditGroup}
                onClick={() => void removeMembers(group.memberProjects)}
              >
                <Trash2Icon />
                {hasOtherMembers
                  ? t.settings.projectSettings.removeCheckoutAction
                  : group.memberProjects.length > 1
                    ? t.settings.projectSettings.removeAllEntries
                    : t.settings.projectSettings.removeProject}
              </Button>
            }
          />
        </SettingsSection>
      </SettingsPageContainer>

      <ProjectFaviconPickerDialog
        key={`${representative.environmentId}:${representative.workspaceRoot}:${faviconPickerOpen}`}
        cwd={representative.workspaceRoot}
        environmentId={representative.environmentId}
        onOpenChange={setFaviconPickerOpen}
        {...(pickProjectFavicon
          ? { onPickExternal: () => pickProjectFavicon(representative.workspaceRoot) }
          : {})}
        onSelect={(path) => void setProjectIcon({ faviconPath: path, projectIcon: null })}
        open={faviconPickerOpen && canEditGroup}
        projectName={group.displayName}
      />
      {iconPickerOpen && canEditGroup ? (
        <Suspense fallback={null}>
          <ProjectIconPickerDialog
            current={projectIcon}
            projectName={representative.title}
            open
            onOpenChange={setIconPickerOpen}
            onSelect={(icon) => void setProjectIcon({ faviconPath: null, projectIcon: icon })}
          />
        </Suspense>
      ) : null}
    </>
  );
}
