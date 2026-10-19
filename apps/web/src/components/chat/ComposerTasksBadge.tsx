/** Shows provider task progress and its disclosure list; task updates remain caller-owned. */
import { t } from "~/i18n";
import { CircleCheckIcon, CircleDotIcon, CircleIcon, ListTodoIcon } from "lucide-react";
import { memo, useRef, type ComponentProps } from "react";

import { formatDuration } from "../../session-logic";
import { useCountPop } from "../../hooks/useCountPop";
import { cn } from "~/lib/utils";
import { ComposerBanner } from "./ComposerBanner";

/** Provider-supplied task summary; completed and total counts are displayed unchanged. */
export interface ComposerTasksProgress {
  readonly step: string;
  readonly completedSteps: number;
  readonly totalSteps: number;
}

/** One provider task and its optional measured duration in milliseconds. */
export interface ComposerTaskStep {
  readonly durationMs?: number;
  readonly step: string;
  readonly status: "pending" | "inProgress" | "completed";
}

const taskStatusLabels = {
  pending: t.composer.tasks.pending,
  inProgress: t.composer.tasks.running,
  completed: t.composer.tasks.completed,
} satisfies Record<ComposerTaskStep["status"], string>;

/** Keeps repeated task labels distinct while retaining the provider's order. */
function keyedTaskSteps(steps: readonly ComposerTaskStep[]) {
  const occurrences = new Map<string, number>();
  return steps.map((step) => {
    const occurrence = occurrences.get(step.step) ?? 0;
    occurrences.set(step.step, occurrence + 1);
    return { key: `${step.step}:${occurrence}`, step };
  });
}

/** U1 keeps the pill compact; the disclosure label still announces the current step. */
function TaskSummary({ progress }: { readonly progress: ComposerTasksProgress }) {
  const countRef = useRef<HTMLSpanElement>(null);
  useCountPop(countRef, progress.completedSteps);
  return (
    <>
      <ComposerBanner.Icon>
        <ListTodoIcon />
      </ComposerBanner.Icon>
      <ComposerBanner.Content>
        <span>{t.composer.tasks.title}</span>
      </ComposerBanner.Content>
      <ComposerBanner.Actions>
        <ComposerBanner.Count
          ref={countRef}
          className={progress.completedSteps >= progress.totalSteps ? "text-success" : undefined}
          data-composer-task-progress="true"
        >
          {progress.completedSteps}/{progress.totalSteps}
        </ComposerBanner.Count>
      </ComposerBanner.Actions>
    </>
  );
}

/** Toggles the caller-owned drawer and announces progress, including its current task. */
export const ComposerTasksBadge = memo(function ComposerTasksBadge({
  expanded,
  onToggle,
  placement = "tab",
  progress,
}: {
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly placement?: "inline" | "tab";
  readonly progress: ComposerTasksProgress;
  readonly steps: readonly ComposerTaskStep[];
}) {
  if (progress.totalSteps <= 0) return null;

  const row = (
    <ComposerBanner.Row
      render={<button type="button" />}
      aria-expanded={expanded}
      aria-label={t.composer.tasks.progressAriaLabel(
        expanded,
        progress.completedSteps,
        progress.totalSteps,
        progress.step,
      )}
      data-composer-tasks-badge="true"
      className="composer-tasks-badge"
      onClick={onToggle}
      onPointerDown={(event) => event.preventDefault()}
    >
      <TaskSummary progress={progress} />
    </ComposerBanner.Row>
  );
  return placement === "inline" ? (
    row
  ) : (
    <ComposerBanner.Root
      density="comfortable"
      data-composer-shoulder-tab
      className="composer-tasks-tab"
    >
      {row}
    </ComposerBanner.Root>
  );
});

/** Renders the disclosure and, when expanded, the ordered tasks with their status and duration. */
export const ComposerTasksContent = memo(function ComposerTasksContent({
  expanded,
  onToggle,
  progress,
  steps,
}: {
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly progress: ComposerTasksProgress;
  readonly steps: readonly ComposerTaskStep[];
}) {
  return (
    <div
      className="composer-tasks"
      data-chat-composer-collapsed-controls="true"
      data-chat-composer-tasks-drawer={expanded ? "true" : undefined}
    >
      <ComposerTasksBadge
        expanded={expanded}
        onToggle={onToggle}
        placement="inline"
        progress={progress}
        steps={steps}
      />
      {expanded ? (
        <ComposerBanner.Scroll data-composer-tasks-scroll="true">
          <ComposerBanner.Children
            render={<ul role="list" />}
            aria-label={t.composer.tasks.listAriaLabel(
              progress.completedSteps,
              progress.totalSteps,
            )}
            data-composer-tasks-list="true"
          >
            {keyedTaskSteps(steps).map(({ key, step }) => (
              <ComposerBanner.Row key={key} render={<li />} data-task-status={step.status}>
                <ComposerBanner.Icon className="h-4">
                  {step.status === "completed" ? (
                    <CircleCheckIcon />
                  ) : step.status === "inProgress" ? (
                    <CircleDotIcon />
                  ) : (
                    <CircleIcon />
                  )}
                </ComposerBanner.Icon>
                <ComposerBanner.Content
                  className={cn(
                    "block wrap-anywhere",
                    step.status === "completed"
                      ? "text-muted-foreground/55"
                      : step.status === "inProgress"
                        ? "text-foreground/90"
                        : "text-muted-foreground/70",
                  )}
                >
                  {step.step}
                </ComposerBanner.Content>
                <ComposerBanner.Actions>
                  <span className="composer-task-status">{taskStatusLabels[step.status]}</span>
                  <span
                    className="w-12 text-right text-3xs/4 text-muted-foreground/45 tabular-nums"
                    data-composer-task-duration="true"
                  >
                    {step.durationMs !== undefined
                      ? formatDuration(step.durationMs)
                      : step.status === "inProgress"
                        ? t.composer.tasks.now
                        : null}
                  </span>
                </ComposerBanner.Actions>
              </ComposerBanner.Row>
            ))}
          </ComposerBanner.Children>
        </ComposerBanner.Scroll>
      ) : null}
    </div>
  );
});

/** Attaches an expanded task list and returns collapse actions to its owner. */
export const ComposerTasksDrawer = memo(function ComposerTasksDrawer({
  onCollapse,
  ...props
}: Omit<ComponentProps<typeof ComposerTasksContent>, "expanded" | "onToggle"> & {
  readonly onCollapse: () => void;
}) {
  return (
    <ComposerBanner.Attachment>
      <ComposerBanner.Root className="composer-tasks-tab">
        <ComposerTasksContent {...props} expanded onToggle={onCollapse} />
      </ComposerBanner.Root>
    </ComposerBanner.Attachment>
  );
});
