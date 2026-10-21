/** Displays thread automations and their permitted management actions. */
import { t } from "~/i18n";
import { useAtomValue } from "@effect/atom-react";
import { ThreadDetailsControl } from "./ThreadDetailsControl";
import { useNavigate } from "@tanstack/react-router";
import { PauseIcon, PencilIcon, PlayIcon } from "lucide-react";
import { useState } from "react";
import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type ScheduledTask,
  type ThreadId,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";

import { ThreadDetailsSection } from "./ThreadDetailsSection";
import { ScheduledRelativeLabel, scheduleLabel } from "../settings/ScheduledTasksSettings";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";

import { readEnvironmentScope } from "../../state/session";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
/**
 * Thread details panel section listing the automations (scheduled tasks) bound
 * to this thread. Fed by the live scheduled-task subscription, so run status
 * and next-run times update as the scheduler works — no manual refresh.
 * Renders nothing when the thread has no bound automations.
 */
export function ThreadAutomationsPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const canOperate = useAtomValue(
    serverEnvironment.runScheduledTaskNow.permissionAtom(props.environmentId),
  );
  const tasksQuery = useEnvironmentQuery(
    serverEnvironment.scheduledTasksLive({ environmentId: props.environmentId, input: {} }),
  );
  const setTaskEnabled = useAtomCommand(serverEnvironment.setScheduledTaskEnabled, {
    label: "thread automation toggle",
  });
  const runTaskNow = useAtomCommand(serverEnvironment.runScheduledTaskNow, {
    label: "thread automation run now",
  });
  const navigate = useNavigate();
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const boundTasks = (tasksQuery.data?.tasks ?? []).filter(
    (task) => task.threadId === props.threadId,
  );

  if (tasksQuery.error === null && boundTasks.length === 0) return null;

  const reportFailure = (title: string, error: unknown) => {
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title,
        description: error instanceof Error ? error.message : String(error),
      }),
    );
  };

  const toggleEnabled = async (task: ScheduledTask, enabled: boolean) => {
    if (
      busyTaskId !== null ||
      !readEnvironmentScope(props.environmentId, AuthOrchestrationOperateScope)
    )
      return;
    setBusyTaskId(task.id);
    // Partial update: only the enabled flag changes, so a toggle can never
    // revert concurrent edits made to the task elsewhere.
    const result = await setTaskEnabled({
      environmentId: props.environmentId,
      input: { id: task.id, enabled },
    });
    setBusyTaskId(null);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      reportFailure(t.chat.details.couldNotUpdateAutomation, squashAtomCommandFailure(result));
    }
  };

  const runNow = async (task: ScheduledTask) => {
    if (
      busyTaskId !== null ||
      !readEnvironmentScope(props.environmentId, AuthOrchestrationOperateScope)
    )
      return;
    setBusyTaskId(task.id);
    const result = await runTaskNow({
      environmentId: props.environmentId,
      input: { id: task.id },
    });
    setBusyTaskId(null);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      reportFailure(t.chat.details.couldNotRunAutomation, squashAtomCommandFailure(result));
    }
  };

  return (
    <ThreadDetailsSection
      headingId="thread-details-automations-heading"
      title={t.chat.details.automations}
      data-thread-automations-panel
    >
      {tasksQuery.error !== null ? (
        <p className="px-2.5 py-1.5 text-2xs text-destructive">
          {t.chat.details.loadAutomationsError(tasksQuery.error)}
        </p>
      ) : null}

      <ul className="m-0 -mt-1 flex list-none flex-col gap-1.5 p-0">
        {boundTasks.map((task) => (
          <li key={task.id} className="flex min-w-0 items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger
                render={<span className="min-w-0 flex-1 truncate text-secondary-copy-large" />}
              >
                <span className={task.enabled ? "text-foreground" : "text-secondary-label"}>
                  {task.title}
                </span>
                <span className="text-secondary-copy text-secondary-label">
                  {task.enabled && task.nextRunAt != null ? (
                    <>
                      {t.chat.details.nextRunSuffix("")}
                      <ScheduledRelativeLabel value={task.nextRunAt} />
                    </>
                  ) : task.enabled ? (
                    ""
                  ) : (
                    t.chat.details.pausedSuffix
                  )}
                </span>
              </TooltipTrigger>
              <TooltipPopup>
                <p>{task.title}</p>
                <p>
                  {scheduleLabel(task.schedule)}
                  {task.enabled && task.nextRunAt !== null ? (
                    <>
                      {t.chat.details.nextRunSuffix("")}
                      <ScheduledRelativeLabel value={task.nextRunAt} />
                    </>
                  ) : task.enabled ? (
                    ""
                  ) : (
                    t.chat.details.pausedSuffix
                  )}
                </p>
              </TooltipPopup>
            </Tooltip>
            {/* Webhooks still require a payload; paused tasks resume through the enabled flag. */}
            {task.enabled && task.schedule.type !== "webhook" ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <ThreadDetailsControl
                      part="icon"
                      aria-label={t.chat.details.runTask(task.title)}
                      disabled={
                        !canOperate || busyTaskId !== null || task.lastRunStatus === "running"
                      }
                      onClick={() => void runNow(task)}
                    >
                      <PlayIcon className="size-3.5" />
                    </ThreadDetailsControl>
                  }
                />
                <TooltipPopup>{t.chat.details.runNow}</TooltipPopup>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger
                render={
                  <ThreadDetailsControl
                    part="icon"
                    aria-label={
                      task.enabled
                        ? t.chat.details.pauseTask(task.title)
                        : t.chat.details.resumeTask(task.title)
                    }
                    disabled={!canOperate || busyTaskId !== null}
                    onClick={() => void toggleEnabled(task, !task.enabled)}
                  >
                    {task.enabled ? (
                      <PauseIcon className="size-3.5" />
                    ) : (
                      <PlayIcon className="size-3.5" />
                    )}
                  </ThreadDetailsControl>
                }
              />
              <TooltipPopup>
                {task.enabled
                  ? t.chat.details.pauseTask(task.title)
                  : t.chat.details.resumeTask(task.title)}
              </TooltipPopup>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <ThreadDetailsControl
                    part="icon"
                    aria-label={t.chat.details.editTask(task.title)}
                    disabled={!canOperate || busyTaskId !== null}
                    onClick={() => {
                      if (!readEnvironmentScope(props.environmentId, AuthOrchestrationOperateScope))
                        return;
                      void navigate({
                        to: "/settings/scheduled-tasks",
                        search: { environmentId: props.environmentId, taskId: task.id },
                      });
                    }}
                  >
                    <PencilIcon className="size-3.25" />
                  </ThreadDetailsControl>
                }
              />
              <TooltipPopup>{t.chat.details.editAutomation}</TooltipPopup>
            </Tooltip>
          </li>
        ))}
      </ul>
      <ThreadDetailsControl
        part="link"
        onClick={() =>
          void navigate({
            to: "/settings/scheduled-tasks",
            search: { environmentId: props.environmentId },
          })
        }
      >
        {t.chat.details.manageScheduledTasks}
      </ThreadDetailsControl>
    </ThreadDetailsSection>
  );
}
