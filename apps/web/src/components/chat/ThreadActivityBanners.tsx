/** Builds activity notices from thread state without owning commands or composer draft state. */
import { t } from "~/i18n";
import type {
  OrchestrationV2PendingBackgroundTask,
  OrchestrationV2ProviderGoal,
  ThreadId,
} from "@t3tools/contracts";
import type { EnvironmentThreadShell, ThreadStructure } from "@t3tools/client-runtime/state/shell";
import {
  presentPendingBackgroundWork,
  presentProviderGoal,
  type RunStopPresentation,
} from "@t3tools/client-runtime/state/thread-execution";
import { childThreadInputsTitle } from "@t3tools/client-runtime/state/threads";
import { formatDuration } from "@t3tools/shared/orchestrationTiming";
import * as DateTime from "effect/DateTime";
import {
  CircleDashedIcon,
  CircleStopIcon,
  GitBranchIcon,
  MessageCircleIcon,
  ShieldQuestionIcon,
  TargetIcon,
  TerminalIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Fragment } from "react";
import { tickTextContent } from "~/lib/tickTextContent";
import { Button, InlineButton } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";

/** Subagents and side chats waiting on the user, unless the parent is itself waiting on them. */
export function childInputBannerItem(input: {
  readonly childThreadInputs: ReadonlyArray<EnvironmentThreadShell>;
  readonly parentAwaitingUser: boolean;
  readonly onOpenThread: (threadId: ThreadId) => void;
}): ComposerBannerStackItem | null {
  const { childThreadInputs, onOpenThread } = input;
  const first = childThreadInputs[0];
  if (!first || input.parentAwaitingUser) return null;
  return {
    id: `child-input:${first.id}`,
    variant: "info",
    priority: "activity",
    icon: first.hasPendingApprovals ? <ShieldQuestionIcon /> : <MessageCircleIcon />,
    title: childThreadInputs.some((child) => child.hasPendingApprovals)
      ? childThreadInputsTitle(childThreadInputs)
      : t.chat.view.subagentsNeedInput(childThreadInputs.length),
    description: childThreadInputs.map((child, index) => (
      <Fragment key={child.id}>
        {index > 0 ? " " : null}
        <span className="whitespace-nowrap">
          <InlineButton tone="muted" onClick={() => onOpenThread(child.id)}>
            {child.title}
          </InlineButton>
          {index < childThreadInputs.length - 1 ? "," : null}
        </span>
      </Fragment>
    )),
    actions: (
      <Button size="xs" variant="ghost" onClick={() => onOpenThread(first.id)}>
        {first.hasPendingApprovals ? t.chat.machineThreadUi.approval : t.chat.view.openQuestion}
      </Button>
    ),
  };
}

/** Uses current-plan progress, not the goal token budget; command failures remain owned by the caller. */
export function goalBannerItem(input: {
  readonly threadId: ThreadId;
  readonly goal: OrchestrationV2ProviderGoal;
  readonly progress: ComposerBannerStackItem["progress"];
  readonly isWorking: boolean;
  readonly onSendCommand: (text: string, failureMessage: string) => Promise<void>;
}): ComposerBannerStackItem {
  const { isWorking, onSendCommand } = input;
  const presentation = presentProviderGoal(input.goal, isWorking);
  return {
    id: `goal:${input.threadId}`,
    variant: "default",
    priority: "activity",
    icon: <TargetIcon />,
    title:
      presentation.usage === null
        ? presentation.title
        : `${presentation.title} · ${presentation.usage}`,
    description: presentation.objective,
    // Use only the current run's plan counts; goal token budgets are not task completion.
    progress: input.progress ?? null,
    actions: isWorking ? undefined : (
      <>
        {presentation.canResume ? (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void onSendCommand("/goal resume", t.chat.view.resumeGoalError)}
          >
            {t.chat.view.resume}
          </Button>
        ) : null}
        <Button
          size="xs"
          variant="ghost"
          onClick={() => void onSendCommand("/goal clear", t.chat.view.clearGoalError)}
        >
          {t.chat.view.clear}
        </Button>
      </>
    ),
  };
}

/** Offers stop and navigation for pending tasks; no notice is returned once every task is complete. */
export function backgroundWorkBannerItem(input: {
  readonly threadId: ThreadId;
  readonly tasks: ReadonlyArray<OrchestrationV2PendingBackgroundTask>;
  readonly turnItems: ThreadStructure["turnItems"];
  readonly stopDisabled: boolean;
  readonly stopping: boolean;
  readonly onStop: () => Promise<void>;
  readonly onOpenThread: (threadId: ThreadId) => void;
}): ComposerBannerStackItem | null {
  const { onOpenThread } = input;
  const presentation = presentPendingBackgroundWork(input.tasks);
  if (presentation === null) return null;
  const rows = presentation.items.map((task) => {
    // Same key derivePendingBackgroundWork gives turn-item tasks; subagent items carry progress.
    const item = input.turnItems.findLast(
      (candidate) => (candidate.nativeItemRef?.nativeId || candidate.id) === task.taskId,
    );
    const subagent = item?.type === "subagent" ? item : undefined;
    return {
      task,
      activity: subagent?.progress?.replace(/\s+/gu, " ").trim() || null,
      startedAtMs: item?.startedAt ? DateTime.toEpochMillis(item.startedAt) : null,
      updatedAtMs: subagent ? DateTime.toEpochMillis(subagent.updatedAt) : 0,
      childThreadId: task.childThreadId ?? subagent?.childThreadId ?? undefined,
    };
  });
  const [only] = rows.length === 1 ? rows : [];
  const isCommand = (row: (typeof rows)[number]) => row.task.kind !== "subagent";
  const onlyThreadId = only?.childThreadId;
  const startedAtMs = only?.startedAtMs ?? null;
  return {
    id: `background-work:${input.threadId}`,
    variant: "default",
    priority: "activity",
    icon: rows.every(isCommand) ? <TerminalIcon /> : <CircleDashedIcon />,
    title: presentation.title,
    description:
      presentation.items.length === 1 && presentation.items[0]?.childThreadId === undefined
        ? undefined
        : presentation.items.map((item, index) => {
            const childThreadId = item.childThreadId;
            const separator = index < presentation.items.length - 1 ? "," : null;
            return (
              <Fragment key={item.taskId}>
                {index > 0 ? " " : null}
                {childThreadId === undefined ? (
                  <>
                    {item.label}
                    {separator}
                  </>
                ) : (
                  <span className="whitespace-nowrap">
                    <InlineButton
                      tone="muted"
                      aria-label={
                        presentation.items.length === 1
                          ? t.chat.view.showSubagent(item.label)
                          : t.chat.view.openSubagent(item.label)
                      }
                      onClick={() => onOpenThread(childThreadId)}
                    >
                      {presentation.items.length === 1
                        ? t.chat.view.showSubagentAction
                        : item.label}
                    </InlineButton>
                    {separator}
                  </span>
                )}
              </Fragment>
            );
          }),
    actions: (
      <>
        {startedAtMs === null ? null : (
          <span
            ref={tickTextContent(
              (nowMs) => formatDuration(Math.max(1_000, nowMs - startedAtMs)),
              true,
            )}
            className="tabular-nums"
          />
        )}
        {onlyThreadId === undefined ? null : (
          <InlineButton tone="muted" onClick={() => onOpenThread(onlyThreadId)}>
            {t.chat.view.showSubagentAction}
          </InlineButton>
        )}
        <InlineButton disabled={input.stopDisabled} onClick={() => void input.onStop()}>
          {input.stopping ? t.chat.view.stopping : t.chat.view.stop}
        </InlineButton>
      </>
    ),
  };
}

/** The local checkout moved off the branch this thread last ran on. */
export function branchMismatchBannerItem(input: {
  readonly mismatchKey: string;
  readonly mismatch: { readonly threadBranch: string; readonly currentBranch: string };
  readonly restoreDisabled: boolean;
  readonly restoring: boolean;
  readonly onRestore: () => void;
  readonly onDismiss: () => void;
}): ComposerBannerStackItem {
  const { mismatch } = input;
  return {
    id: `branch-mismatch:${input.mismatchKey}`,
    variant: "info",
    icon: <GitBranchIcon />,
    title: (
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="shrink-0 font-normal text-warning-foreground">
          {t.chat.view.branchChanged}
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <code className="min-w-0 truncate font-medium text-warning-foreground">
                {mismatch.threadBranch}
              </code>
            }
          />
          <TooltipPopup side="top">
            {t.chat.view.branchMismatchHint(mismatch.threadBranch, mismatch.currentBranch)}
          </TooltipPopup>
        </Tooltip>
      </span>
    ),
    actions: (
      <Button
        size="md"
        variant="secondary"
        disabled={input.restoreDisabled}
        onClick={input.onRestore}
      >
        {input.restoring ? t.chat.view.restoring : t.chat.view.restoreBranch}
      </Button>
    ),
    dismissLabel: t.chat.view.dismissBranchNotice,
    onDismiss: input.onDismiss,
  };
}

/** Keeps stop progress and force-stop recovery visible in the local banner stack. */
export function runStopBannerItem(input: {
  readonly threadId: ThreadId;
  readonly stop: RunStopPresentation;
  readonly canForceStop: boolean;
  readonly forceStopping: boolean;
  readonly onForceStop: () => void;
}): ComposerBannerStackItem {
  const unresponsive = input.stop.state === "unresponsive";
  const requestedAtMs = Date.parse(input.stop.requestedAt);
  return {
    variant: "info",
    priority: "activity",
    id: `run-stop:${input.threadId}`,
    icon: unresponsive ? (
      <TriangleAlertIcon className="text-warning-foreground" />
    ) : (
      <CircleStopIcon />
    ),
    title: unresponsive ? "Agent not responding to Stop" : "Stopping",
    description: unresponsive
      ? "It may be short on memory. Force stop kills its processes."
      : undefined,
    actions: (
      <>
        <span
          ref={tickTextContent(
            (nowMs) => formatDuration(Math.max(1_000, nowMs - requestedAtMs)),
            true,
          )}
          className="tabular-nums"
        />
        {unresponsive && input.canForceStop ? (
          <InlineButton disabled={input.forceStopping} onClick={input.onForceStop}>
            {input.forceStopping ? "Force stopping..." : "Force stop"}
          </InlineButton>
        ) : null}
      </>
    ),
  };
}
