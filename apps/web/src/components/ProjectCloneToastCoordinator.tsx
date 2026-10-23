/** Coordinates clone progress and recovery actions across project environments. */
import { t } from "~/i18n";
import { useParams } from "@tanstack/react-router";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  type AtomCommandResult,
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  projectCloneDisplayName,
  projectCloneProgressSummary,
  type EnvironmentId,
  type ProjectCloneSnapshot,
  type ProjectId,
} from "@t3tools/contracts";
import { useEffect, useRef } from "react";
import { GitBranchIcon } from "lucide-react";

import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { useRemoveClonedProject } from "../hooks/useRemoveClonedProject";
import { useEnvironments } from "../state/environments";
import {
  isProjectCloneToastSilenced,
  silenceProjectCloneToasts,
  useEnvironmentProjectClones,
} from "../state/projectClones";
import { sourceControlEnvironment } from "../state/sourceControl";
import { useAtomCommand } from "../state/use-atom-command";
import { type DraftId, useComposerDraftStore } from "../composerDraftStore";
import { toastManager } from "./ui/toast";
import { stackedThreadToast } from "./ui/toastHelpers";

export function ProjectCloneToastCoordinator() {
  const { environments } = useEnvironments();
  return environments.map((environment) => (
    <EnvironmentCloneToasts
      key={environment.environmentId}
      environmentId={environment.environmentId}
    />
  ));
}

interface TrackedToast {
  readonly toastId: ReturnType<typeof toastManager.add>;
  readonly renderedKey: string;
  readonly phase: ProjectCloneSnapshot["phase"];
}

function renderKey(clone: ProjectCloneSnapshot): string {
  return `${clone.phase}:${clone.stage}:${clone.percent ?? ""}:${clone.detail ?? ""}:${clone.stalled === true}:${clone.error ?? ""}`;
}

/**
 * Reports a clone command failure without turning an interrupted command into an error toast.
 * @param title Localized failure heading for this action.
 * @param action Dispatches the selected clone command and resolves its structured result.
 * @returns Completion after inspecting the result; a rejected action promise remains rejected.
 */
async function runCloneAction(
  title: string,
  action: () => Promise<AtomCommandResult<unknown, unknown>>,
) {
  const result = await action();
  if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
    const error = squashAtomCommandFailure(result);
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title,
        description: error instanceof Error ? error.message : t.sidebar.errors.genericError,
      }),
    );
  }
}

/** Tracks clone progress for environmentId and exposes cancel, retry, open, and remove actions through toasts; renders no DOM. */
function EnvironmentCloneToasts({ environmentId }: { environmentId: EnvironmentId }) {
  const clones = useEnvironmentProjectClones(environmentId);
  const handleNewThread = useNewThreadHandler();
  const { draftId: routeDraftId } = useParams({ strict: false });
  const cancelClone = useAtomCommand(sourceControlEnvironment.cancelProjectClone, {
    reportFailure: false,
  });
  const retryClone = useAtomCommand(sourceControlEnvironment.retryProjectClone, {
    reportFailure: false,
  });
  const removeClonedProject = useRemoveClonedProject();
  const toasts = useRef(new Map<ProjectId, TrackedToast>());

  const isViewingProjectDraft = (projectId: ProjectId) => {
    if (!routeDraftId) return false;
    const draft = useComposerDraftStore.getState().getDraftSession(routeDraftId as DraftId);
    return draft?.environmentId === environmentId && draft.projectId === projectId;
  };

  const openProject = (projectId: ProjectId) => {
    void handleNewThread(scopeProjectRef(environmentId, projectId));
  };

  useEffect(() => {
    const seen = new Set<ProjectId>();
    for (const clone of clones) {
      seen.add(clone.projectId);
      const key = renderKey(clone);
      const tracked = toasts.current.get(clone.projectId);
      const name = projectCloneDisplayName(clone);
      const closeToast = () => {
        const current = toasts.current.get(clone.projectId);
        if (!current) return;
        toastManager.close(current.toastId);
        toasts.current.delete(clone.projectId);
      };
      const ref = { environmentId, projectId: clone.projectId };
      if (isViewingProjectDraft(clone.projectId)) {
        silenceProjectCloneToasts(ref);
        closeToast();
        continue;
      }
      if (tracked?.renderedKey === key) continue;
      if (
        isProjectCloneToastSilenced(ref) &&
        (clone.phase === "running" || clone.phase === "done")
      ) {
        closeToast();
        continue;
      }

      if (clone.phase === "running") {
        const options = stackedThreadToast({
          type: "loading",
          title: t.app.clone.cloningRepository,
          description: `${name} · ${projectCloneProgressSummary(clone)}`,
          timeout: 0,
          actionProps: {
            children: t.common.confirm.cancel,
            onClick: () => {
              void runCloneAction(t.app.clone.cancelError, () =>
                cancelClone({ environmentId, input: { projectId: clone.projectId } }),
              );
            },
          },
          data: {
            hideCopyButton: true,
            leadingIcon: <GitBranchIcon aria-hidden className="size-3.75" />,
            iconTone: "neutral",
            progressPercent: clone.percent,
          },
        });
        if (tracked) {
          toastManager.update(tracked.toastId, options);
          toasts.current.set(clone.projectId, { ...tracked, renderedKey: key, phase: "running" });
        } else {
          const toastId = toastManager.add(options);
          toasts.current.set(clone.projectId, { toastId, renderedKey: key, phase: "running" });
        }
        continue;
      }

      if (clone.phase === "done") {
        const options = stackedThreadToast({
          type: "success",
          title: t.app.clone.cloned(name),
          description: clone.destinationPath,
          timeout: 8_000,
          actionProps: {
            children: t.app.projects.open,
            onClick: () => {
              closeToast();
              openProject(clone.projectId);
            },
          },
          data: { hideCopyButton: true },
        });
        if (tracked) {
          toastManager.update(tracked.toastId, options);
          toasts.current.set(clone.projectId, { ...tracked, renderedKey: key, phase: "done" });
        } else {
          const toastId = toastManager.add(options);
          toasts.current.set(clone.projectId, { toastId, renderedKey: key, phase: "done" });
        }
        continue;
      }

      const cancelled = clone.phase === "cancelled";
      const options = stackedThreadToast({
        type: cancelled ? "info" : "error",
        title: cancelled ? t.app.clone.cancelled(name) : t.app.clone.failed(name),
        description: cancelled
          ? clone.destinationPath
          : (clone.error ?? t.app.clone.failedDescription),
        timeout: 0,
        actionProps: {
          children: t.app.actions.retry,
          onClick: () => {
            void runCloneAction(t.app.clone.retryError, () =>
              retryClone({ environmentId, input: { projectId: clone.projectId } }),
            );
          },
        },
        data: {
          ...(cancelled ? { hideCopyButton: true } : {}),
          secondaryActionProps: {
            children: t.app.projects.remove,
            onClick: () => {
              void removeClonedProject({ environmentId, projectId: clone.projectId });
            },
          },
        },
      });
      if (tracked) {
        toastManager.update(tracked.toastId, options);
        toasts.current.set(clone.projectId, { ...tracked, renderedKey: key, phase: clone.phase });
      } else {
        const toastId = toastManager.add(options);
        toasts.current.set(clone.projectId, { toastId, renderedKey: key, phase: clone.phase });
      }
    }

    for (const [projectId, tracked] of toasts.current) {
      if (seen.has(projectId)) continue;
      if (tracked.phase !== "done") toastManager.close(tracked.toastId);
      toasts.current.delete(projectId);
    }
  }, [
    cancelClone,
    clones,
    environmentId,
    isViewingProjectDraft,
    openProject,
    removeClonedProject,
    retryClone,
  ]);

  useEffect(
    () => () => {
      for (const tracked of toasts.current.values()) toastManager.close(tracked.toastId);
      toasts.current.clear();
    },
    [],
  );

  return null;
}
