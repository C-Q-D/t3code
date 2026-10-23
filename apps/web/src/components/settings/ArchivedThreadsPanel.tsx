/** Lists archived threads and applies permission-checked restore or delete actions. */
import { t } from "~/i18n";
import { settingsScopeEnvironmentLabels } from "./settingsScopeAxis";
import { Spinner } from "~/components/ui/spinner";
import { ArchiveIcon } from "lucide-react";
import { type ScopedThreadRef } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { presentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useSettingsScope } from "./SettingsScopeContext";
import { useThreadActions } from "../../hooks/useThreadActions";
import { readLocalApi } from "../../localApi";
import { useArchivedThreadSnapshots } from "../../lib/archivedThreadsState";
import { useNowMinute } from "../../hooks/useNowMinute";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { Button } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { ProjectFavicon } from "../ProjectFavicon";

/**
 * Renders scoped archive groups with P3 list wells, preserving snapshot ordering.
 * Successful mutations refresh snapshots; deletion requires confirmation and failures use toasts.
 * @returns Project groups or the existing loading, error, and empty states.
 */
export function ArchivedThreadsPanel() {
  const nowMinute = useNowMinute();
  const nowMs = Date.parse(`${nowMinute}:00.000Z`);
  const { scope, groups: projectGroups, environments } = useSettingsScope();
  const { unarchiveThread, confirmAndDeleteThread } = useThreadActions();
  const {
    snapshots: archivedSnapshots,
    error: archiveError,
    isLoading: isLoadingArchive,
    refresh: refreshArchivedThreads,
  } = useArchivedThreadSnapshots(scope.environmentIds);

  const { groups: archivedGroups, hasMultipleEnvironments } = (() => {
    const selectedProjectKeys =
      scope.kind === "project" || scope.kind === "checkout"
        ? new Set(scope.members.map((member) => `${member.environmentId}:${member.id}`))
        : null;
    const projectsByEnvironmentAndId = new Map(
      archivedSnapshots.flatMap(({ environmentId, snapshot }) =>
        snapshot.projects
          .filter(
            (project) =>
              selectedProjectKeys === null ||
              selectedProjectKeys.has(`${environmentId}:${project.id}`),
          )
          .map(
            (project) => [`${environmentId}:${project.id}`, { ...project, environmentId }] as const,
          ),
      ),
    );
    const environmentLabels = new Map(
      environments.map((environment) => {
        const { primary, secondary } = settingsScopeEnvironmentLabels(environment, environments);
        return [environment.environmentId, secondary ? `${primary} (${secondary})` : primary];
      }),
    );
    const threads = archivedSnapshots.flatMap(({ environmentId, snapshot }) =>
      snapshot.threads.map((thread) => ({
        ...presentThreadShell(environmentId, thread),
        environmentLabel: environmentLabels.get(environmentId) ?? environmentId,
      })),
    );
    const hasMultipleEnvironments =
      new Set(
        threads
          .filter((thread) =>
            projectsByEnvironmentAndId.has(`${thread.environmentId}:${thread.projectId}`),
          )
          .map((thread) => thread.environmentId),
      ).size > 1;
    const logicalGroupsByProjectKey = new Map(
      projectGroups.flatMap((group) =>
        group.memberProjectRefs.map(
          (member) => [`${member.environmentId}:${member.projectId}`, group] as const,
        ),
      ),
    );

    const archivedProjects = Array.from(projectsByEnvironmentAndId.values());
    const groups = new Map<
      string,
      {
        readonly project: (typeof archivedProjects)[number];
        readonly title: string;
        readonly threads: Array<(typeof threads)[number]>;
      }
    >();
    for (const project of archivedProjects) {
      const projectThreads: Array<(typeof threads)[number]> = [];
      for (const thread of threads) {
        if (thread.projectId === project.id && thread.environmentId === project.environmentId) {
          projectThreads.push(thread);
        }
      }
      if (projectThreads.length > 0) {
        const physicalProjectKey = `${project.environmentId}:${project.id}` as const;
        const logicalGroup = hasMultipleEnvironments
          ? logicalGroupsByProjectKey.get(physicalProjectKey)
          : undefined;
        const groupKey = logicalGroup?.projectKey ?? physicalProjectKey;
        const group = groups.get(groupKey);
        if (group) {
          group.threads.push(...projectThreads);
        } else {
          groups.set(groupKey, {
            project,
            title: logicalGroup?.displayName ?? project.title,
            threads: projectThreads,
          });
        }
      }
    }
    const sortedGroups = Array.from(groups, ([key, group]) => ({
      ...group,
      key,
      threads: group.threads.toSorted((left, right) => {
        const leftKey = left.archivedAt ?? left.createdAt;
        const rightKey = right.archivedAt ?? right.createdAt;
        return rightKey.localeCompare(leftKey) || right.id.localeCompare(left.id);
      }),
    }));
    return { groups: sortedGroups, hasMultipleEnvironments };
  })();

  const handleArchivedThreadContextMenu = async (
    threadRef: ScopedThreadRef,
    position: { x: number; y: number },
  ) => {
    const api = readLocalApi();
    if (!api) return;
    const clicked = await api.contextMenu.show(
      [
        { id: "unarchive", label: t.settings.archive.unarchive },
        { id: "delete", label: t.settings.actions.delete, destructive: true },
      ],
      position,
    );

    if (clicked === "unarchive") {
      const result = await unarchiveThread(threadRef);
      if (result._tag === "Success") {
        refreshArchivedThreads();
      } else if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t.settings.archive.unarchiveError,
            description:
              error instanceof Error ? error.message : t.settings.archive.actionErrorDescription,
          }),
        );
      }
      return;
    }

    if (clicked === "delete") {
      const result = await confirmAndDeleteThread(threadRef);
      if (result._tag === "Success") {
        refreshArchivedThreads();
      } else if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t.settings.archive.deleteError,
            description:
              error instanceof Error ? error.message : t.settings.archive.actionErrorDescription,
          }),
        );
      }
    }
  };

  return (
    <SettingsPageContainer>
      {archivedGroups.length === 0 ? (
        <SettingsSection
          id={isLoadingArchive ? undefined : searchableSetting("archive").id}
          title={searchableSetting("archive").title}
        >
          <div className="archive-thread-list">
            <div className="archive-thread-empty" role="status">
              {isLoadingArchive && (
                <span className="mb-2 inline-flex">
                  <Spinner size="sm" tone="muted" />
                </span>
              )}
              <p>
                {isLoadingArchive
                  ? t.settings.archive.loading
                  : archiveError
                    ? t.settings.archive.loadError
                    : t.settings.archive.empty}
              </p>
              <p>
                {isLoadingArchive
                  ? t.settings.archive.loadingHint
                  : (archiveError ?? t.settings.archive.emptyHint)}
              </p>
            </div>
          </div>
        </SettingsSection>
      ) : (
        archivedGroups.map(({ key, project, title, threads: projectThreads }, index) => (
          <SettingsSection
            key={key}
            id={index === 0 ? searchableSetting("archive").id : undefined}
            title={title}
            icon={<ProjectFavicon project={project} />}
          >
            <div className="archive-thread-list">
              {projectThreads.map((thread) => (
                <div
                  className="archive-thread-row"
                  key={`${thread.environmentId}:${thread.id}`}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    void (async () => {
                      const result = await settlePromise(() =>
                        handleArchivedThreadContextMenu(
                          scopeThreadRef(thread.environmentId, thread.id),
                          {
                            x: event.clientX,
                            y: event.clientY,
                          },
                        ),
                      );
                      if (result._tag === "Failure") {
                        const error = squashAtomCommandFailure(result);
                        toastManager.add(
                          stackedThreadToast({
                            type: "error",
                            title: t.settings.archive.actionError,
                            description:
                              error instanceof Error
                                ? error.message
                                : t.settings.archive.actionErrorDescription,
                          }),
                        );
                      }
                    })();
                  }}
                >
                  <span className="archive-thread-icon" aria-hidden="true">
                    <ArchiveIcon className="size-3.75" strokeWidth={1.75} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.25">
                    <div className="truncate text-control leading-normal font-semibold">
                      {thread.title}
                    </div>
                    <div className="truncate text-secondary-copy-medium leading-normal text-secondary-label">
                      {hasMultipleEnvironments ? `${thread.environmentLabel} · ` : null}
                      {t.settings.archive.historyHint(
                        formatRelativeTimeLabel(thread.archivedAt ?? thread.createdAt, nowMs),
                        formatRelativeTimeLabel(thread.createdAt, nowMs),
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="settings-list"
                    onClick={() => {
                      void (async () => {
                        const result = await unarchiveThread(
                          scopeThreadRef(thread.environmentId, thread.id),
                        );
                        if (result._tag === "Success") {
                          refreshArchivedThreads();
                          return;
                        }
                        if (!isAtomCommandInterrupted(result)) {
                          const error = squashAtomCommandFailure(result);
                          toastManager.add(
                            stackedThreadToast({
                              type: "error",
                              title: t.settings.archive.unarchiveError,
                              description:
                                error instanceof Error
                                  ? error.message
                                  : t.settings.archive.actionErrorDescription,
                            }),
                          );
                        }
                      })();
                    }}
                  >
                    <span>{t.settings.archive.unarchive}</span>
                  </Button>
                </div>
              ))}
            </div>
          </SettingsSection>
        ))
      )}
    </SettingsPageContainer>
  );
}
