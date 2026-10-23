/** Presents clone progress and recovery actions while blocking sends against unfinished checkouts. */
import { t } from "~/i18n";
import { useStableCallback } from "../../hooks/useStableCallback";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { DownloadIcon, HourglassIcon, FolderXIcon } from "lucide-react";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { useRemoveClonedProject } from "../../hooks/useRemoveClonedProject";
import { sourceControlEnvironment } from "../../state/sourceControl";
import { useProjectClone } from "../../state/projectClones";
import {
  projectCloneDisplayName,
  projectCloneProgressSummary,
  type ScopedProjectRef,
} from "@t3tools/contracts";
import { dismissProjectFileCopy, useProjectFileCopy } from "../../lib/addProjectToMachine";
import { type ComposerBannerStackItem } from "./ComposerBannerStack";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
/**
 * A project still being cloned or copied into place: the composer banner with its cancel,
 * retry, and remove actions, and the reason sending waits until it is done.
 */
export function useProjectCloneBanner(activeProjectRef: ScopedProjectRef | null) {
  const activeProjectClone = useProjectClone(activeProjectRef);
  const cancelProjectClone = useAtomCommand(sourceControlEnvironment.cancelProjectClone, {
    reportFailure: false,
  });
  const retryProjectClone = useAtomCommand(sourceControlEnvironment.retryProjectClone, {
    reportFailure: false,
  });
  const removeClonedProject = useRemoveClonedProject();
  const runProjectCloneAction = async (
    title: string,
    action: () => Promise<AtomCommandResult<unknown, unknown>>,
  ): Promise<void> => {
    const result = await action();
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title,
          description: error instanceof Error ? error.message : t.chat.view.genericError,
        }),
      );
    }
  };
  const runProjectCloneActionStable = useStableCallback(runProjectCloneAction);
  const activeProjectFileCopy = useProjectFileCopy(activeProjectRef);
  const projectCloneSendBlockReason =
    activeProjectClone?.phase === "running"
      ? t.chat.view.cloningRepository
      : activeProjectClone !== null && activeProjectClone.phase !== "done"
        ? t.chat.view.repositoryNotCloned
        : activeProjectFileCopy?.phase === "copying"
          ? t.chat.machineThreadUi.copying
          : null;
  const projectCloneBannerItem = (() => {
    if (activeProjectFileCopy?.phase === "failed" && activeProjectRef) {
      return {
        id: `project-file-copy:${activeProjectRef.projectId}`,
        variant: "error",
        icon: <DownloadIcon />,
        title: activeProjectFileCopy.title,
        description: activeProjectFileCopy.failures.join("\n"),
        onDismiss: () => dismissProjectFileCopy(activeProjectRef),
      };
    }
    if (!activeProjectClone || !activeProjectRef || activeProjectClone.phase === "done") {
      return null;
    }
    const name = projectCloneDisplayName(activeProjectClone);
    const { environmentId, projectId } = activeProjectRef;
    if (activeProjectClone.phase === "running") {
      return {
        id: `project-clone:${projectId}`,
        variant: "info",
        priority: "activity",
        icon: <HourglassIcon />,
        title: t.chat.view.cloningRepository,
        description: (
          <>
            {t.chat.view.cloning(name)} {projectCloneProgressSummary(activeProjectClone)}
          </>
        ),
        actions: (
          <Button
            size="md"
            variant="secondary"
            onClick={() =>
              void runProjectCloneActionStable(t.chat.view.cancelCloneError, () =>
                cancelProjectClone({ environmentId, input: { projectId } }),
              )
            }
          >
            {t.chat.view.cancel}
          </Button>
        ),
      };
    }
    const cancelled = activeProjectClone.phase === "cancelled";
    return {
      id: `project-clone:${projectId}`,
      variant: cancelled ? "warning" : "error",
      icon: <FolderXIcon />,
      title: t.chat.view.repositoryNotCloned,
      description: (
        <>
          {cancelled ? t.chat.view.cancelledCloning(name) : t.chat.view.cloneError(name)}{" "}
          {cancelled ? t.chat.view.retryCloneHint : activeProjectClone.error}
        </>
      ),
      actions: (
        <>
          <Button
            size="md"
            variant="secondary"
            onClick={() => void removeClonedProject({ environmentId, projectId })}
          >
            {t.chat.view.removeProject}
          </Button>
          <Button
            size="md"
            variant="secondary"
            onClick={() =>
              void runProjectCloneActionStable(t.chat.view.retryCloneError, () =>
                retryProjectClone({ environmentId, input: { projectId } }),
              )
            }
          >
            {t.chat.view.retry}
          </Button>
        </>
      ),
    };
  })() as ComposerBannerStackItem | null;
  return {
    projectCloneBannerItem,
    projectCloneSendBlockReason,
  };
}
