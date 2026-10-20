/** Graphite scheduled-task lists, real delivery records and editors; RPC validation and persistence remain owned by the existing commands. */
import { t } from "~/i18n";
import { cn } from "~/lib/utils";
import { useAtomValue } from "@effect/atom-react";
import {
  Clock3Icon,
  CalendarClockIcon,
  TimerIcon,
  WebhookIcon,
  CopyIcon,
  InboxIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EnvironmentId,
  ModelSelection,
  OrchestrationV2ThreadLaunchWorkspaceStrategy,
  ProjectId,
  ScheduledTask,
  ScheduledTaskId,
  ScheduledTaskSchedule,
  ScheduledTaskUpsertInput,
  ScheduledTaskWebhookDeliveryOutcome,
  ScheduledTaskWebhookDeliverySummary,
  ThreadId,
} from "@t3tools/contracts";
import { DEFAULT_WEBHOOK_PROMPT } from "@t3tools/client-runtime/scheduled-task-webhook";
import {
  MAX_WEBHOOK_DELIVERY_AGE_MINUTES,
  MIN_SCHEDULED_TASK_INTERVAL_MS,
  ProviderInstanceId,
  resolveEnvironmentMachineKind,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";

import { formatRelativeTime } from "../../timestampFormat";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { getCustomModelOptionsByInstance } from "../../modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
} from "../../providerInstances";
import { usePrimaryCloudLinkState } from "../../cloud/primaryCloudLinkState";
import { requestConfirmDialog } from "../../confirmDialog";
import { webhookAddress } from "@t3tools/client-runtime/webhook-address";
import { Link } from "@tanstack/react-router";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import {
  useEnvironment,
  useEnvironmentHttpBaseUrl,
  type EnvironmentPresentation,
} from "../../state/environments";
import { useProjects } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { WorktreeBaseBranchPicker } from "../WorktreeBaseBranchPicker";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { AuthOrchestrationOperateScope } from "@t3tools/contracts";
import { readEnvironmentScope } from "~/state/session";
import { useSettingsScope } from "./SettingsScopeContext";
import {
  WEBHOOK_SIGNATURE_DEFAULTS,
  matchesScheduledTaskScope,
  scheduleFromDraft,
  scheduledTaskRunRecords,
  type ScheduledTaskRunRecord,
  scheduledTaskDefaultModel,
  taskToDraft,
  type DraftState,
  type ScheduleMode,
} from "./scheduledTasksSettings.logic";
import { Label } from "../ui/label";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuSeparator } from "../ui/menu";
import { ToggleGroup, Toggle } from "../ui/toggle-group";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "../ui/empty";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { stackedThreadToast, toastManager } from "../ui/toast";
import {
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
  SETTINGS_PICKER_TRIGGER_CLASSNAME,
  useRelativeTimeTick,
} from "./settingsLayout";

/** O2 displays the calendar week Sunday-first; persisted JS weekday numbers are unchanged. */
const WEEKDAY_ORDER = [0, 1, 2, 3, 4, 5, 6] as const;
const WEEKDAY_LABELS = [
  t.settings.scheduledTasks.weekdays.sunday,
  t.settings.scheduledTasks.weekdays.monday,
  t.settings.scheduledTasks.weekdays.tuesday,
  t.settings.scheduledTasks.weekdays.wednesday,
  t.settings.scheduledTasks.weekdays.thursday,
  t.settings.scheduledTasks.weekdays.friday,
  t.settings.scheduledTasks.weekdays.saturday,
];
const WEEKDAY_SHORT = [
  t.settings.scheduledTasks.shortWeekdays.sunday,
  t.settings.scheduledTasks.shortWeekdays.monday,
  t.settings.scheduledTasks.shortWeekdays.tuesday,
  t.settings.scheduledTasks.shortWeekdays.wednesday,
  t.settings.scheduledTasks.shortWeekdays.thursday,
  t.settings.scheduledTasks.shortWeekdays.friday,
  t.settings.scheduledTasks.shortWeekdays.saturday,
];

const WORKSPACE_MODE_LABELS = t.settings.scheduledTasks.workspaceOptions;

const EMPTY_DRAFT: DraftState = {
  editingId: null,
  title: "",
  prompt: "",
  enabled: true,
  scheduleMode: "fixed",
  intervalMinutes: "15",
  timeOfDay: "09:00",
  weekdays: new Set([1, 2, 3, 4, 5]),
  projectId: "",
  threadId: "",
  workspaceMode: "worktree",
  baseRef: "main",
  startFromOrigin: true,
  existingWorktreePath: "",
  modelKey: "",
  runtimeMode: "full-access",
  interactionMode: "default",
  baseModelSelection: null,
  signatureEnabled: false,
  ...WEBHOOK_SIGNATURE_DEFAULTS,
  signatureSecret: "",
  maxDeliveryAgeMinutes: "",
};

/** Align an O2 field caption (64px) with its control; htmlFor links labelled inputs and optional hint explains constraints. */
function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3.5">
      <div className="w-16 shrink-0 pt-2 text-secondary-copy-medium text-secondary-label">
        <label htmlFor={htmlFor}>
          <span>{label}</span>
          {hint ? <span className="block text-meta text-muted-foreground">{hint}</span> : null}
        </label>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Decode a provider:model picker value; malformed keys return null and do not change the saved selection. */
function splitModelKey(value: string): ModelSelection | null {
  const index = value.indexOf(":");
  if (index <= 0 || index === value.length - 1) return null;
  return {
    instanceId: ProviderInstanceId.make(value.slice(0, index)),
    model: value.slice(index + 1),
  };
}

/** Describe the supplied persisted schedule using localized labels; weekday numbering remains JavaScript day-of-week. */
export function scheduleLabel(schedule: ScheduledTaskSchedule): string {
  if (schedule.type === "webhook") return t.settings.scheduledTasks.schedule.webhook;
  if (schedule.type === "interval") {
    const minutes = schedule.everyMs / 60_000;
    return Number.isInteger(minutes)
      ? t.settings.scheduledTasks.schedule.intervalMinutes(minutes)
      : t.settings.scheduledTasks.schedule.intervalSeconds(Math.round(schedule.everyMs / 1000));
  }
  const weekdays = schedule.weekdays ?? [];
  const days =
    weekdays.length === 0
      ? t.settings.scheduledTasks.schedule.daily
      : weekdays.length === 5 && weekdays.every((day) => day >= 1 && day <= 5)
        ? t.settings.scheduledTasks.schedule.weekdays
        : weekdays.map((day) => WEEKDAY_LABELS[day]).join(", ");
  return t.settings.scheduledTasks.schedule.fixedTime(days, schedule.timeOfDay);
}

/**
 * Human label for a run timestamp. `formatRelativeTime` only handles the
 * past, and `nextRunAt` is a future instant — render "in 5m" style labels
 * for upcoming runs instead of a misleading "just now".
 */
export function relativeLabel(value: string | null): string {
  if (!value) return t.settings.scheduledTasks.schedule.unscheduled;
  const diffMs = new Date(value).getTime() - Date.now();
  if (diffMs <= 0) {
    const relative = formatRelativeTime(value);
    if (!relative) return t.settings.scheduledTasks.schedule.unscheduled;
    return relative.suffix ? `${relative.value} ${relative.suffix}` : relative.value;
  }
  const minutes = Math.ceil(diffMs / 60_000);
  if (minutes < 2) return t.settings.scheduledTasks.schedule.underMinute;
  if (minutes < 60) return t.settings.scheduledTasks.schedule.inMinutes(minutes);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t.settings.scheduledTasks.schedule.inHours(hours);
  return t.settings.scheduledTasks.schedule.inDays(Math.round(hours / 24));
}

const DELIVERY_OUTCOME_LABELS = t.settings.scheduledTasks.outcomes;

/** Map a persisted webhook outcome to its O2 semantic badge; expired remains visible although absent from the board. */
function deliveryOutcomeVariant(outcome: ScheduledTaskWebhookDeliveryOutcome) {
  if (outcome === "accepted") return "success";
  if (outcome === "rejected_signature") return "restricted";
  if (outcome === "disabled") return "settings-neutral";
  if (outcome === "rate_limited" || outcome === "expired") {
    return "warning";
  }
  return "danger";
}

/** Render tasks in the active settings scope; optional environment/task IDs retain deep-link editor opening. Commands own persistence failures. */
export function ScheduledTasksSettings(target: {
  readonly environmentId?: EnvironmentId;
  readonly taskId?: ScheduledTaskId | undefined;
}) {
  const { scope, environments, connectedEnvironments, environment } = useSettingsScope();
  const [editor, setEditor] = useState<{
    environmentId: EnvironmentId;
    task: ScheduledTask | null;
  } | null>(null);
  const openForEdit = useCallback((environmentId: EnvironmentId, task: ScheduledTask) => {
    setEditor({ environmentId, task });
  }, []);
  const defaultEnvironment = environment ?? connectedEnvironments[0];
  return (
    <SettingsPageContainer>
      {scope.kind === "unavailable" ? (
        <SettingsSection title={t.settings.scheduledTasks.unavailableScope}>
          <SettingsRow title={scope.message} />
        </SettingsSection>
      ) : environments.length === 0 ? (
        <SettingsSection title={t.settings.scheduledTasks.tasksHeading}>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Clock3Icon />
              </EmptyMedia>
              <EmptyTitle>{t.settings.scheduledTasks.noEnvironments}</EmptyTitle>
              <EmptyDescription>{t.settings.scheduledTasks.connectHint}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </SettingsSection>
      ) : (
        environments.map((entry) => (
          <ScheduledTaskEnvironmentSection
            key={`${entry.environmentId}:${target.taskId ?? ""}`}
            environment={entry}
            showEnvironmentHeading={environments.length > 1}
            taskId={
              (target.environmentId ?? defaultEnvironment?.environmentId) === entry.environmentId
                ? target.taskId
                : undefined
            }
            onEdit={openForEdit}
            editingTaskId={
              editor?.environmentId === entry.environmentId ? editor.task?.id : undefined
            }
            onCreate={() => setEditor({ environmentId: entry.environmentId, task: null })}
          />
        ))
      )}
      {editor ? (
        <ScheduledTaskEditorDialog
          key={`${editor.environmentId}:${editor.task?.id ?? "new"}`}
          initialEnvironmentId={editor.environmentId}
          task={editor.task}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </SettingsPageContainer>
  );
}

/** Subscribe to one environment and filter by the selected scope; open a linked task once and expose only real records. */
function ScheduledTaskEnvironmentSection({
  environment,
  showEnvironmentHeading,
  taskId,
  onEdit,
  onCreate,
  editingTaskId,
}: {
  readonly environment: EnvironmentPresentation;
  readonly showEnvironmentHeading: boolean;
  readonly taskId?: ScheduledTaskId | undefined;
  readonly onEdit: (environmentId: EnvironmentId, task: ScheduledTask) => void;
  readonly onCreate: () => void;
  readonly editingTaskId?: ScheduledTaskId | undefined;
}) {
  const { scope } = useSettingsScope();
  const canCreate = useAtomValue(
    serverEnvironment.upsertScheduledTask.permissionAtom(environment.environmentId),
  );
  const connected =
    environment.connection.phase === "connected" && environment.serverConfig !== null;
  const tasksQuery = useEnvironmentQuery(
    connected
      ? serverEnvironment.scheduledTasksLive({
          environmentId: environment.environmentId,
          input: {},
        })
      : null,
  );
  const tasks = tasksQuery.data?.tasks.filter((task) =>
    matchesScheduledTaskScope(scope, environment.environmentId, task.projectId),
  );
  const records = scheduledTaskRunRecords(tasks ?? []);
  const linkedTask = tasks?.find((task) => task.id === taskId);
  const openedLink = useRef(false);
  useEffect(() => {
    if (!openedLink.current && linkedTask) {
      openedLink.current = true;
      onEdit(environment.environmentId, linkedTask);
    }
  }, [environment.environmentId, linkedTask, onEdit]);
  useRelativeTimeTick(60_000);
  return (
    <div className="space-y-5.5">
      <SettingsSection
        title={showEnvironmentHeading ? environment.label : t.settings.scheduledTasks.tasksHeading}
        icon={
          showEnvironmentHeading ? (
            <EnvironmentMachineIcon
              kind={resolveEnvironmentMachineKind(environment.serverConfig)}
              className="size-3.5"
            />
          ) : undefined
        }
      >
        {!connected ? (
          <SettingsRow
            title={t.settings.scheduledTasks.disconnected}
            description={t.settings.scheduledTasks.reconnectHint(environment.label)}
          />
        ) : tasksQuery.error ? (
          <SettingsRow title={t.settings.scheduledTasks.loadError} description={tasksQuery.error} />
        ) : !tasks ? (
          <SettingsRow title={t.settings.scheduledTasks.loading} role="status" />
        ) : (
          <>
            {taskId && !linkedTask ? (
              <SettingsRow
                title={t.settings.scheduledTasks.unavailableTask}
                description={t.settings.scheduledTasks.unavailableTaskHint}
                role="status"
              />
            ) : null}
            {tasks.length === 0 ? (
              <div className="px-3.5 py-2.5">
                <TaskEmpty>{t.settings.scheduledTasks.emptyScopeHint}</TaskEmpty>
              </div>
            ) : (
              <div className="space-y-0.5 px-3.5 pt-2.5">
                {tasks.map((task) => (
                  <ScheduledTaskRow
                    key={task.id}
                    environmentId={environment.environmentId}
                    task={task}
                    isEditing={editingTaskId === task.id}
                    onEdit={() => onEdit(environment.environmentId, task)}
                  />
                ))}
              </div>
            )}
          </>
        )}
        <div className="px-4.5 pb-3 pt-1.5">
          <Button
            size="toolbar"
            variant="outline"
            disabled={!connected || !canCreate}
            onClick={onCreate}
          >
            <PlusIcon className="size-3.25" />
            {t.settings.scheduledTasks.newTask}
          </Button>
        </div>
      </SettingsSection>
      {connected && tasks ? (
        <SettingsSection title={t.settings.scheduledTasks.deliveries.title}>
          <div className="space-y-0.5 px-3.5 py-2.5">
            {records.length === 0 ? (
              <TaskEmpty>{t.settings.scheduledTasks.deliveries.empty}</TaskEmpty>
            ) : (
              records.map((record) => (
                <ScheduledTaskRecordRow
                  key={record.task.id}
                  environmentId={environment.environmentId}
                  record={record}
                />
              ))
            )}
          </div>
        </SettingsSection>
      ) : null}
    </div>
  );
}

/** Render one task and its existing guarded actions; environmentId identifies the RPC destination and onEdit opens its editor. */
function ScheduledTaskRow({
  environmentId,
  task,
  onEdit,
  isEditing,
}: {
  readonly environmentId: EnvironmentId;
  readonly task: ScheduledTask;
  readonly onEdit: () => void;
  readonly isEditing: boolean;
}) {
  const canOperate = useAtomValue(
    serverEnvironment.upsertScheduledTask.permissionAtom(environmentId),
  );
  const [busy, setBusy] = useState(false);
  const [deliveriesOpen, setDeliveriesOpen] = useState(false);
  const isWebhook = task.schedule.type === "webhook";
  const toggle = useAtomCommand(serverEnvironment.setScheduledTaskEnabled, {
    label: "scheduled task enabled",
  });
  const run = useAtomCommand(serverEnvironment.runScheduledTaskNow, {
    label: "scheduled task run now",
  });
  const remove = useAtomCommand(serverEnvironment.deleteScheduledTask, {
    label: "scheduled task delete",
  });
  const act = async (action: "toggle" | "run" | "delete") => {
    if (busy || !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope)) return;
    setBusy(true);
    const result =
      action === "toggle"
        ? await toggle({ environmentId, input: { id: task.id, enabled: !task.enabled } })
        : action === "run"
          ? await run({ environmentId, input: { id: task.id } })
          : await remove({ environmentId, input: { id: task.id } });
    setBusy(false);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t.settings.scheduledTasks.updateError,
          description: String(squashAtomCommandFailure(result)),
        }),
      );
    }
  };
  return (
    <div
      className={cn(
        "settings-list-row flex min-h-16 gap-y-3 hover:bg-secondary focus-within:bg-secondary",
        isEditing && "bg-secondary shadow-settings-connect-row",
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-device-control bg-settings-task-well shadow-settings-task-well">
        {isWebhook ? (
          <WebhookIcon className="size-3.75" />
        ) : task.schedule.type === "interval" ? (
          <TimerIcon className="size-3.75" />
        ) : (
          <CalendarClockIcon className="size-3.75" />
        )}
      </span>
      <button
        type="button"
        onClick={onEdit}
        disabled={busy || !canOperate}
        className="min-w-0 flex-1 rounded-settings-row-surface text-left outline-none focus-visible:inset-shadow-focus"
      >
        <span className="block truncate text-control font-semibold">{task.title}</span>
        <span className="block truncate text-secondary-copy-medium text-secondary-label">
          {scheduleLabel(task.schedule)}
        </span>
      </button>
      {!task.enabled || !isWebhook ? (
        <span className="max-w-40 font-mono text-secondary-copy text-muted-foreground">
          {!task.enabled
            ? t.settings.scheduledTasks.paused
            : task.nextRunAt
              ? t.settings.scheduledTasks.nextRunHint(relativeLabel(task.nextRunAt))
              : t.settings.scheduledTasks.schedule.unscheduled}
        </span>
      ) : null}
      <div className="flex items-center gap-2">
        <Switch
          checked={task.enabled}
          disabled={busy || !canOperate}
          aria-label={t.settings.scheduledTasks.enableAriaLabel(task.title)}
          onCheckedChange={() => void act("toggle")}
        />
        <Menu>
          <MenuTrigger
            render={
              <Button
                size="icon-md"
                variant="ghost"
                disabled={busy || !canOperate}
                aria-label={t.settings.scheduledTasks.actionsAriaLabel(task.title)}
              />
            }
          >
            <MoreHorizontalIcon className="size-4" />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem onClick={onEdit}>
              <PencilIcon />
              {t.settings.actions.edit}
            </MenuItem>
            {isWebhook ? (
              <MenuItem onClick={() => setDeliveriesOpen(true)}>
                <InboxIcon />
                {t.settings.scheduledTasks.deliveries.title}
              </MenuItem>
            ) : (
              <MenuItem onClick={() => void act("run")}>
                <PlayIcon />
                {t.settings.actions.runNow}
              </MenuItem>
            )}
            <MenuSeparator />
            <MenuItem onClick={() => void act("delete")}>
              <Trash2Icon />
              {t.settings.actions.delete}
            </MenuItem>
          </MenuPopup>
        </Menu>
        {deliveriesOpen ? (
          <WebhookDeliveriesDialog
            environmentId={environmentId}
            task={task}
            onClose={() => setDeliveriesOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Render the O2 recessed empty state using real loading/error/empty copy supplied by the caller. */
function TaskEmpty({ children }: { readonly children: ReactNode }) {
  return (
    <p className="rounded-settings-row-surface bg-settings-task-well px-4 py-4.5 text-center text-secondary-copy-large leading-relaxed text-secondary-label shadow-settings-task-well">
      {children}
    </p>
  );
}

/** Render one projected latest run; webhook rows open the existing delivery list only on demand. */
function ScheduledTaskRecordRow({
  environmentId,
  record,
}: {
  readonly environmentId: EnvironmentId;
  readonly record: ScheduledTaskRunRecord;
}) {
  const [deliveriesOpen, setDeliveriesOpen] = useState(false);
  const { task, status, runAt, error, variant } = record;
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-control font-semibold">{task.title}</span>
          <Badge size="settings" variant={variant}>
            {t.settings.scheduledTasks.runStatuses[status]}
          </Badge>
        </div>
        {error ? (
          <p className="text-secondary-copy-medium text-error wrap-anywhere">{error}</p>
        ) : null}
      </div>
      {runAt ? (
        <span className="font-mono text-secondary-copy text-muted-foreground">
          {relativeLabel(runAt)}
        </span>
      ) : null}
    </>
  );
  return (
    <>
      {task.schedule.type === "webhook" ? (
        <button
          type="button"
          onClick={() => setDeliveriesOpen(true)}
          className="settings-list-row flex min-h-16 w-full flex-wrap gap-y-3 text-left outline-none hover:bg-secondary focus-visible:inset-shadow-focus"
        >
          {content}
        </button>
      ) : (
        <div className="settings-list-row flex min-h-16 flex-wrap gap-y-3">{content}</div>
      )}
      {deliveriesOpen ? (
        <WebhookDeliveriesDialog
          environmentId={environmentId}
          task={task}
          onClose={() => setDeliveriesOpen(false)}
        />
      ) : null}
    </>
  );
}

/** Query webhook deliveries only while this dialog is open; its list retains manual refresh and selecting a row loads detail. onClose dismisses without writes. */
function WebhookDeliveriesDialog({
  environmentId,
  task,
  onClose,
}: {
  readonly environmentId: EnvironmentId;
  readonly task: ScheduledTask;
  readonly onClose: () => void;
}) {
  const deliveriesQuery = useEnvironmentQuery(
    serverEnvironment.scheduledTaskWebhookDeliveries({ environmentId, input: { id: task.id } }),
  );
  const [selectedId, setSelectedId] = useState<ScheduledTaskWebhookDeliverySummary["id"] | null>(
    null,
  );
  const selectedQuery = useEnvironmentQuery(
    selectedId === null
      ? null
      : serverEnvironment.scheduledTaskWebhookDelivery({
          environmentId,
          input: { id: task.id, deliveryId: selectedId },
        }),
  );
  const deliveries = deliveriesQuery.data?.deliveries ?? null;
  const selected = selectedQuery.data?.delivery ?? null;
  const error = selectedId === null ? deliveriesQuery.error : selectedQuery.error;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.settings.scheduledTasks.deliveries.taskTitle(task.title)}</DialogTitle>
          <DialogDescription>{t.settings.scheduledTasks.deliveries.description}</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {error ? <p className="text-secondary-copy-medium text-error">{error}</p> : null}
          {selectedId !== null && selected === null && selectedQuery.error === null ? (
            <p className="text-secondary-copy-medium text-muted-foreground" role="status">
              {t.settings.scheduledTasks.deliveries.loadingDelivery}
            </p>
          ) : selected ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-secondary-copy-medium">
                <Badge size="settings" variant={deliveryOutcomeVariant(selected.outcome)}>
                  {DELIVERY_OUTCOME_LABELS[selected.outcome]}
                </Badge>
                <span>
                  {selected.method} · {relativeLabel(selected.receivedAt)}
                </span>
                {selected.signatureVerified ? (
                  <span className="text-muted-foreground">
                    {t.settings.scheduledTasks.deliveries.signatureVerified}
                  </span>
                ) : null}
              </div>
              {selected.error ? (
                <p className="text-secondary-copy-medium text-error">{selected.error}</p>
              ) : null}
              <DeliveryBlock title={t.settings.scheduledTasks.deliveries.promptTitle}>
                {selected.renderedPrompt ?? t.settings.scheduledTasks.deliveries.noRunHint}
              </DeliveryBlock>
              {selected.missingFields.length > 0 ? (
                <p className="text-secondary-copy-medium text-muted-foreground">
                  {t.settings.scheduledTasks.deliveries.emptyPlaceholders}{" "}
                  {selected.missingFields.join(", ")}
                </p>
              ) : null}
              <DeliveryBlock title={t.settings.scheduledTasks.deliveries.headers}>
                {Object.entries(selected.headers)
                  .map(([name, value]) => `${name}: ${value}`)
                  .join("\n")}
              </DeliveryBlock>
              {selected.query ? (
                <DeliveryBlock title={t.settings.scheduledTasks.deliveries.query}>
                  {selected.query}
                </DeliveryBlock>
              ) : null}
              <DeliveryBlock
                title={
                  selected.bodyTruncated
                    ? t.settings.scheduledTasks.deliveries.bodyTruncated
                    : t.settings.scheduledTasks.deliveries.body
                }
              >
                {selected.body || t.settings.scheduledTasks.deliveries.emptyBody}
              </DeliveryBlock>
            </div>
          ) : selectedId !== null ? null : deliveries === null ? (
            <p className="text-secondary-copy-medium text-muted-foreground" role="status">
              {t.settings.scheduledTasks.deliveries.loading}
            </p>
          ) : deliveries.length === 0 ? (
            <p className="text-secondary-copy-medium text-muted-foreground">
              {t.settings.scheduledTasks.deliveries.empty}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {deliveries.map((delivery) => (
                <li key={delivery.id}>
                  <button
                    type="button"
                    className="flex min-h-16 w-full flex-wrap items-center gap-3 rounded-settings-row-surface px-2.5 py-2 text-left text-control outline-none hover:bg-secondary focus-visible:inset-shadow-focus"
                    onClick={() => setSelectedId(delivery.id)}
                  >
                    <Badge size="settings" variant={deliveryOutcomeVariant(delivery.outcome)}>
                      {DELIVERY_OUTCOME_LABELS[delivery.outcome]}
                    </Badge>
                    <span>{delivery.method}</span>
                    <span className="text-muted-foreground">
                      {relativeLabel(delivery.receivedAt)}
                    </span>
                    {delivery.missingFields.length > 0 ? (
                      <span className="text-muted-foreground">
                        {t.settings.scheduledTasks.deliveries.missingFieldCount(
                          delivery.missingFields.length,
                        )}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogPanel>
        <DialogFooter>
          {selectedId !== null ? (
            <Button variant="outline" size="sm" onClick={() => setSelectedId(null)}>
              {t.settings.actions.back}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={deliveriesQuery.isPending}
              onClick={deliveriesQuery.refresh}
            >
              {t.settings.actions.refresh}
            </Button>
          )}
          <DialogClose render={<Button size="sm" />}>{t.settings.actions.done}</DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/** Render a titled delivery payload as escaped, scrollable text; children may contain arbitrary request content. */
function DeliveryBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{title}</Label>
      <pre className="max-h-64 overflow-auto rounded-settings-row-surface bg-settings-task-well p-3 font-mono text-secondary-copy text-code-foreground shadow-settings-task-well whitespace-pre-wrap break-all">
        {children}
      </pre>
    </div>
  );
}

/** Show the saved task endpoint in its environment; null tasks show the save hint and token rotation retains explicit confirmation. */
function WebhookEndpointField({
  environmentId,
  task,
}: {
  readonly environmentId: EnvironmentId;
  readonly task: ScheduledTask | null;
}) {
  const canRotate = useAtomValue(
    serverEnvironment.rotateScheduledTaskWebhookToken.permissionAtom(environmentId),
  );
  const httpBaseUrl = useEnvironmentHttpBaseUrl(environmentId);
  const { copyToClipboard, isCopied } = useCopyToClipboard({ target: "webhook URL" });
  const rotate = useAtomCommand(serverEnvironment.rotateScheduledTaskWebhookToken, {
    label: "scheduled task rotate webhook token",
  });
  const [rotating, setRotating] = useState(false);
  const endpoint = task?.webhook;
  if (!task || !endpoint) {
    return (
      <p className="text-secondary-copy-medium text-muted-foreground">
        {t.settings.scheduledTasks.webhook.urlHint}
      </p>
    );
  }
  const { address: url, copyable, note } = webhookAddress(endpoint, httpBaseUrl);
  const rotateUrl = async () => {
    const confirmed =
      (await requestConfirmDialog(t.settings.scheduledTasks.webhook.rotateConfirmation, {
        variant: "destructive",
      })) ??
      // No themed dialog host is mounted; fall back to the native prompt
      // rather than rotating unasked.
      window.confirm(t.settings.scheduledTasks.webhook.rotateNativeConfirmation);
    if (!confirmed) return;
    setRotating(true);
    const result = await rotate({ environmentId, input: { id: task.id } });
    setRotating(false);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t.settings.scheduledTasks.webhook.rotateError,
          description: String(squashAtomCommandFailure(result)),
        }),
      );
    }
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Input
          size="settings"
          readOnly
          aria-label={t.settings.scheduledTasks.webhook.urlTitle}
          value={url}
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          size="sm"
          variant="outline"
          type="button"
          // A bare path is not a URL a sender can call.
          disabled={!copyable}
          onClick={() => copyToClipboard(url, undefined)}
        >
          <CopyIcon />
          {isCopied
            ? t.settings.scheduledTasks.webhook.copied
            : t.settings.scheduledTasks.webhook.copy}
        </Button>
        <Button
          size="sm"
          variant="outline"
          type="button"
          disabled={rotating || !canRotate}
          onClick={() => void rotateUrl()}
        >
          {t.settings.scheduledTasks.webhook.rotate}
        </Button>
      </div>
      {note !== null ? <p className="text-secondary-copy text-muted-foreground">{note}</p> : null}
      {endpoint.url !== null ? <WebhookDeliveryMode environmentId={environmentId} /> : null}
    </div>
  );
}

/**
 * Whether T3 Connect forwards requests live or holds them while the
 * environment is offline. The setting is per environment and only readable
 * for this machine's own environment, so other environments show nothing.
 */
function WebhookDeliveryMode({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const cloudLink = usePrimaryCloudLinkState();
  if (cloudLink.target?.environmentId !== environmentId || cloudLink.data === null) return null;
  return (
    <p className="text-secondary-copy text-muted-foreground">
      {cloudLink.data.holdWebhooksWhileOffline
        ? t.settings.scheduledTasks.webhook.heldHint
        : t.settings.scheduledTasks.webhook.liveHint}
      <Link to="/settings/connections" className="underline underline-offset-2">
        {t.settings.scheduledTasks.webhook.openConnections}
      </Link>
    </p>
  );
}

/** Edit or create a task in the initial environment; preserve validation, provider options and the submission lock, closing only after success or cancellation. */
function ScheduledTaskEditorDialog({
  initialEnvironmentId,
  task,
  onClose,
}: {
  readonly initialEnvironmentId: EnvironmentId;
  readonly task: ScheduledTask | null;
  readonly onClose: () => void;
}) {
  const { scope, connectedEnvironments } = useSettingsScope();
  const [environmentId, setEnvironmentId] = useState(initialEnvironmentId);
  const environment = useEnvironment(environmentId);
  const connected =
    environment?.connection.phase === "connected" && environment.serverConfig !== null;
  const tasksQuery = useEnvironmentQuery(
    connected ? serverEnvironment.scheduledTasksLive({ environmentId, input: {} }) : null,
  );
  const allProjects = useProjects();
  const projects = useMemo(
    () =>
      allProjects.filter(
        (project) =>
          project.environmentId === environmentId &&
          matchesScheduledTaskScope(scope, environmentId, project.id),
      ),
    [allProjects, environmentId, scope],
  );
  const settings = useEnvironmentSettings(environmentId);
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(environmentId)) ?? EMPTY_SERVER_PROVIDERS;
  const canOperate = useAtomValue(
    serverEnvironment.upsertScheduledTask.permissionAtom(environmentId),
  );
  const upsertTask = useAtomCommand(serverEnvironment.upsertScheduledTask, {
    label: "scheduled task upsert",
  });
  const [draft, setDraft] = useState<DraftState>(() =>
    task ? taskToDraft(task) : { ...EMPTY_DRAFT, projectId: projects[0]?.id ?? "" },
  );
  const [saving, setSaving] = useState(false);
  const submissionPending = useRef(false);
  const editingTaskMissing =
    draft.editingId !== null &&
    tasksQuery.data !== null &&
    !tasksQuery.data.tasks.some((entry) => entry.id === draft.editingId);
  // The live row, so a rotated URL shows up without reopening the dialog.
  // Once the list has loaded, a missing task is gone; don't keep showing its URL.
  const liveTask = tasksQuery.data
    ? (tasksQuery.data.tasks.find((entry) => entry.id === draft.editingId) ?? null)
    : task;
  const selectedProjectId = draft.projectId || projects[0]?.id || "";
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  // The task runs in selectedProject, so its model picker should reflect that
  // project's effective enablement, not just the machine's.
  const instanceEntries = useMemo(
    () =>
      sortProviderInstanceEntries(
        applyProviderInstanceSettings(
          deriveProviderInstanceEntries(providers),
          settings,
          selectedProject?.id ?? null,
        ),
      ),
    [providers, settings, selectedProject?.id],
  );

  // The real model picker is keyed by a `${instanceId}:${model}` string, which
  // is exactly how the draft stores its selection.
  const firstInstance = instanceEntries[0];
  const draftSelection = draft.modelKey ? splitModelKey(draft.modelKey) : null;
  const activeSelection =
    draftSelection &&
    instanceEntries.some((entry) => entry.instanceId === draftSelection.instanceId && entry.enabled)
      ? draftSelection
      : scheduledTaskDefaultModel(settings, selectedProject ?? null, instanceEntries);
  const activeInstanceId =
    activeSelection?.instanceId ?? firstInstance?.instanceId ?? ("" as ProviderInstanceId);
  const activeModel = activeSelection?.model ?? "";
  const modelOptionsByInstance = useMemo(
    () => getCustomModelOptionsByInstance(settings, providers, activeInstanceId, activeModel),
    [settings, providers, activeInstanceId, activeModel],
  );

  const reportFailure = (title: string, error: unknown) => {
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title,
        description: error instanceof Error ? error.message : String(error),
      }),
    );
  };

  const submit = async () => {
    if (
      !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope) ||
      submissionPending.current ||
      saving ||
      editingTaskMissing ||
      !connected ||
      tasksQuery.data === null
    )
      return;
    const selection = activeSelection;
    if (
      !draft.title.trim() ||
      !draft.prompt.trim() ||
      !projects.some((project) => project.id === selectedProjectId) ||
      selection === null
    ) {
      reportFailure(
        t.settings.scheduledTasks.editor.incompleteError,
        t.settings.scheduledTasks.editor.incompleteHint,
      );
      return;
    }
    const schedule = scheduleFromDraft(draft);
    if (schedule === null) {
      reportFailure(
        t.settings.scheduledTasks.editor.ageError,
        t.settings.scheduledTasks.editor.ageErrorHint(MAX_WEBHOOK_DELIVERY_AGE_MINUTES),
      );
      return;
    }
    if (
      schedule.type === "webhook" &&
      schedule.signature &&
      (!schedule.signature.header ||
        (!schedule.signature.secret &&
          !(liveTask?.schedule.type === "webhook" && liveTask.webhook?.hasSecret)))
    ) {
      reportFailure(
        t.settings.scheduledTasks.editor.secretError,
        t.settings.scheduledTasks.editor.secretErrorHint,
      );
      return;
    }
    if (
      schedule.type === "interval" &&
      (!Number.isSafeInteger(schedule.everyMs) || schedule.everyMs < MIN_SCHEDULED_TASK_INTERVAL_MS)
    ) {
      reportFailure(
        t.settings.scheduledTasks.editor.intervalError,
        t.settings.scheduledTasks.editor.intervalErrorHint,
      );
      return;
    }
    if (draft.workspaceMode === "existing_worktree" && !draft.existingWorktreePath.trim()) {
      reportFailure(
        t.settings.scheduledTasks.editor.checkoutError,
        t.settings.scheduledTasks.editor.checkoutErrorHint,
      );
      return;
    }
    // Keep the original selection object (with provider options) when the
    // picker still points at the same instance+model.
    const modelSelection =
      draft.baseModelSelection !== null &&
      draft.baseModelSelection.instanceId === selection.instanceId &&
      draft.baseModelSelection.model === selection.model
        ? draft.baseModelSelection
        : selection;
    const workspaceStrategy: OrchestrationV2ThreadLaunchWorkspaceStrategy =
      draft.workspaceMode === "root"
        ? { type: "root" }
        : draft.workspaceMode === "existing_worktree"
          ? { type: "existing_worktree", worktreePath: draft.existingWorktreePath.trim() }
          : {
              type: "worktree",
              baseRef: draft.baseRef.trim() || "main",
              startFromOrigin: draft.startFromOrigin,
            };
    const input: ScheduledTaskUpsertInput = {
      ...(draft.editingId ? { id: draft.editingId as ScheduledTaskId, requireExisting: true } : {}),
      title: draft.title.trim(),
      prompt: draft.prompt.trim(),
      enabled: draft.enabled,
      schedule,
      projectId: selectedProjectId as ProjectId,
      threadId: draft.threadId ? (draft.threadId as ThreadId) : null,
      workspaceStrategy,
      modelSelection,
      runtimeMode: draft.runtimeMode,
      interactionMode: draft.interactionMode,
      creationSource: "web",
    };
    // Lock before React renders, and keep successful creates locked until the form closes.
    submissionPending.current = true;
    setSaving(true);
    const result = await upsertTask({ environmentId, input });
    setSaving(false);
    if (result._tag === "Failure") {
      submissionPending.current = false;
      if (!isAtomCommandInterrupted(result)) {
        reportFailure(t.settings.scheduledTasks.editor.saveError, squashAtomCommandFailure(result));
      }
      return;
    }
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogPopup className="max-w-120" bottomStickOnMobile={false}>
        <DialogHeader>
          <div className="flex items-center gap-2.5 pr-6">
            <span className="flex size-7.5 shrink-0 items-center justify-center rounded-tag bg-settings-task-well shadow-settings-task-well">
              <CalendarClockIcon className="size-3.75" />
            </span>
            <DialogTitle>{task?.title ?? t.settings.scheduledTasks.newTask}</DialogTitle>
          </div>
          <DialogDescription>{t.settings.scheduledTasks.editor.description}</DialogDescription>
        </DialogHeader>

        <DialogPanel>
          <fieldset disabled={saving} className="space-y-4">
            {!connected ? (
              <p className="text-secondary-copy-medium text-error">
                {t.settings.scheduledTasks.editor.reconnectHint}
              </p>
            ) : null}
            <div className="space-y-4">
              {task?.schedule.type === "interval" &&
              task.schedule.everyMs < MIN_SCHEDULED_TASK_INTERVAL_MS ? (
                <p className="text-secondary-copy-medium text-muted-foreground" role="status">
                  {t.settings.scheduledTasks.editor.legacyIntervalHint}
                </p>
              ) : null}
              <div className="flex flex-wrap items-start gap-3.5">
                <span className="w-16 shrink-0 pt-2 text-secondary-copy-medium text-secondary-label">
                  {t.settings.scheduledTasks.editor.scheduleLabel}
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <ToggleGroup
                    size="dialog"
                    aria-label={t.settings.scheduledTasks.editor.scheduleAriaLabel}
                    value={[draft.scheduleMode]}
                    onValueChange={(values) => {
                      const mode = values[0] as ScheduleMode | undefined;
                      if (mode === "fixed" || mode === "interval" || mode === "webhook")
                        setDraft((current) => ({
                          ...current,
                          scheduleMode: mode,
                          prompt:
                            mode === "webhook" && !current.prompt.trim()
                              ? DEFAULT_WEBHOOK_PROMPT
                              : current.prompt,
                        }));
                    }}
                  >
                    <Toggle value="interval">
                      {t.settings.scheduledTasks.editor.intervalSchedule}
                    </Toggle>
                    <Toggle value="fixed">{t.settings.scheduledTasks.editor.fixedSchedule}</Toggle>
                    <Toggle value="webhook">
                      {t.settings.scheduledTasks.editor.webhookSchedule}
                    </Toggle>
                  </ToggleGroup>
                  {draft.scheduleMode === "fixed" ? (
                    <div className="w-24">
                      <Input
                        type="time"
                        size="md"
                        font="mono"
                        id="scheduled-task-time"
                        aria-label={t.settings.scheduledTasks.editor.timeLabel}
                        nativeInput
                        value={draft.timeOfDay}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, timeOfDay: event.target.value }))
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              {draft.scheduleMode === "webhook" ? (
                <div className="space-y-4">
                  <WebhookEndpointField environmentId={environmentId} task={liveTask} />
                  <p className="text-secondary-copy text-muted-foreground">
                    {t.settings.scheduledTasks.editor.webhookPromptHint}
                  </p>
                  <Field
                    label={t.settings.scheduledTasks.editor.maxDeliveryAgeLabel}
                    hint={t.settings.scheduledTasks.editor.maxDeliveryAgeHint}
                    htmlFor="scheduled-task-max-age"
                  >
                    <Input
                      size="settings"
                      id="scheduled-task-max-age"
                      type="number"
                      nativeInput
                      min={1}
                      max={MAX_WEBHOOK_DELIVERY_AGE_MINUTES}
                      placeholder={t.settings.scheduledTasks.editor.maxDeliveryAgePlaceholder}
                      value={draft.maxDeliveryAgeMinutes}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          maxDeliveryAgeMinutes: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <Label htmlFor="scheduled-task-signature">
                        {t.settings.scheduledTasks.editor.requireSignatureLabel}
                      </Label>
                      <p className="text-secondary-copy-medium text-muted-foreground">
                        {t.settings.scheduledTasks.editor.requireSignatureHint}
                      </p>
                    </div>
                    <Switch
                      id="scheduled-task-signature"
                      checked={draft.signatureEnabled}
                      onCheckedChange={(signatureEnabled) =>
                        setDraft((current) => ({ ...current, signatureEnabled }))
                      }
                    />
                  </div>
                  {draft.signatureEnabled ? (
                    <div className="space-y-4">
                      <Field
                        label={t.settings.scheduledTasks.editor.signatureHeaderLabel}
                        htmlFor="scheduled-task-signature-header"
                      >
                        <Input
                          size="settings"
                          id="scheduled-task-signature-header"
                          value={draft.signatureHeader}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              signatureHeader: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field
                        label={t.settings.scheduledTasks.editor.signaturePrefixLabel}
                        htmlFor="scheduled-task-signature-prefix"
                      >
                        <Input
                          size="settings"
                          id="scheduled-task-signature-prefix"
                          value={draft.signaturePrefix}
                          placeholder={t.settings.scheduledTasks.editor.signaturePrefixPlaceholder}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              signaturePrefix: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field
                        label={t.settings.scheduledTasks.editor.signatureEncodingLabel}
                        htmlFor="scheduled-task-signature-encoding"
                      >
                        <Select
                          value={draft.signatureEncoding}
                          onValueChange={(value) =>
                            setDraft((current) => ({
                              ...current,
                              signatureEncoding: value === "base64" ? "base64" : "hex",
                            }))
                          }
                        >
                          <SelectTrigger size="settings" id="scheduled-task-signature-encoding">
                            <SelectValue>{draft.signatureEncoding}</SelectValue>
                          </SelectTrigger>
                          <SelectPopup>
                            <SelectItem value="hex">hex</SelectItem>
                            <SelectItem value="base64">base64</SelectItem>
                          </SelectPopup>
                        </Select>
                      </Field>
                      <Field
                        label={t.settings.scheduledTasks.editor.signatureSecretLabel}
                        htmlFor="scheduled-task-signature-secret"
                      >
                        <Input
                          size="settings"
                          id="scheduled-task-signature-secret"
                          type="password"
                          autoComplete="off"
                          value={draft.signatureSecret}
                          placeholder={
                            liveTask?.schedule.type === "webhook" && liveTask.webhook?.hasSecret
                              ? t.settings.scheduledTasks.editor.signatureSecretUnchanged
                              : t.settings.scheduledTasks.editor.signatureSecretPlaceholder
                          }
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              signatureSecret: event.target.value,
                            }))
                          }
                        />
                      </Field>
                    </div>
                  ) : null}
                </div>
              ) : draft.scheduleMode === "fixed" ? (
                <div className="space-y-4">
                  <Field label={t.settings.scheduledTasks.editor.weekdaysLabel}>
                    <div
                      role="group"
                      aria-label={t.settings.scheduledTasks.editor.weekdaysAriaLabel}
                      className="flex flex-wrap gap-1.5"
                    >
                      {WEEKDAY_ORDER.map((day) => (
                        <label
                          key={day}
                          className={cn(
                            "relative flex size-8.5 cursor-pointer items-center justify-center rounded-full text-secondary-copy-medium font-bold in-[fieldset:disabled]:cursor-not-allowed in-[fieldset:disabled]:opacity-40",
                            draft.weekdays.has(day)
                              ? "bg-primary text-primary-foreground shadow-primary-edge"
                              : "bg-input text-secondary-label shadow-input-well",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="peer sr-only"
                            aria-label={WEEKDAY_LABELS[day]}
                            checked={draft.weekdays.has(day)}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setDraft((current) => {
                                if (!checked && current.weekdays.size === 1) return current;
                                const weekdays = new Set(current.weekdays);
                                if (checked) weekdays.add(day);
                                else weekdays.delete(day);
                                return { ...current, weekdays };
                              });
                            }}
                          />
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 rounded-full peer-focus-visible:inset-shadow-focus"
                          />
                          {WEEKDAY_SHORT[day]}
                        </label>
                      ))}
                    </div>
                  </Field>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Label htmlFor="scheduled-task-interval">
                    {t.settings.scheduledTasks.editor.intervalLabel}
                  </Label>
                  <Input
                    size="settings"
                    type="number"
                    id="scheduled-task-interval"
                    nativeInput
                    min={1}
                    step="any"
                    className="w-24"
                    value={draft.intervalMinutes}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, intervalMinutes: event.target.value }))
                    }
                  />
                  <span className="text-secondary-copy text-muted-foreground">
                    {t.settings.scheduledTasks.editor.intervalUnit}
                  </span>
                </div>
              )}
            </div>

            <Field label={t.settings.scheduledTasks.editor.workspaceLabel}>
              <div
                className="space-y-1"
                role="radiogroup"
                aria-label={t.settings.scheduledTasks.editor.workspaceLabel}
              >
                {(["worktree", "root", "existing_worktree"] as const).map((mode) => (
                  <label
                    key={mode}
                    className={cn(
                      "relative flex min-h-9 cursor-pointer items-center gap-2.5 rounded-compact-row px-3 text-control text-code-foreground in-[fieldset:disabled]:cursor-not-allowed in-[fieldset:disabled]:opacity-40",
                      draft.workspaceMode === mode && "bg-accent inset-shadow-selected-control",
                    )}
                  >
                    <input
                      type="radio"
                      name="scheduled-task-workspace"
                      value={mode}
                      checked={draft.workspaceMode === mode}
                      onChange={() => setDraft((current) => ({ ...current, workspaceMode: mode }))}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-compact-row peer-focus-visible:inset-shadow-focus"
                    />
                    <span
                      aria-hidden="true"
                      className="flex size-3.5 shrink-0 items-center justify-center rounded-full shadow-outline-control peer-checked:bg-primary peer-checked:shadow-none"
                    >
                      <span
                        className={
                          draft.workspaceMode === mode
                            ? "size-1.25 rounded-full bg-primary-foreground"
                            : "hidden"
                        }
                      />
                    </span>
                    {WORKSPACE_MODE_LABELS[mode]}
                  </label>
                ))}
              </div>
            </Field>
            <Field
              label={t.settings.scheduledTasks.editor.environmentLabel}
              htmlFor="scheduled-task-environment"
            >
              <Select
                value={environmentId}
                disabled={task !== null || saving}
                onValueChange={(id) => {
                  const next = connectedEnvironments.find((entry) => entry.environmentId === id);
                  if (!next) return;
                  setEnvironmentId(next.environmentId);
                  setDraft((current) => ({
                    ...current,
                    projectId: "",
                    modelKey: "",
                    baseModelSelection: null,
                    baseRef: "main",
                    startFromOrigin: true,
                    existingWorktreePath: "",
                  }));
                }}
              >
                <SelectTrigger id="scheduled-task-environment" size="settings">
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      <EnvironmentMachineIcon
                        kind={resolveEnvironmentMachineKind(environment?.serverConfig ?? null)}
                        className="size-4"
                      />
                      {environment?.label ?? t.settings.scopeSentence.unavailableEnvironment}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {connectedEnvironments.map((entry) => (
                    <SelectItem key={entry.environmentId} value={entry.environmentId}>
                      <EnvironmentMachineIcon
                        kind={resolveEnvironmentMachineKind(entry.serverConfig)}
                        className="size-4"
                      />
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </Field>
            {tasksQuery.error ? (
              <p className="text-secondary-copy-medium text-error" role="status">
                {tasksQuery.error}
              </p>
            ) : null}
            {editingTaskMissing ? (
              <p className="text-secondary-copy text-error" role="status">
                {t.settings.scheduledTasks.editor.taskMissingHint}
              </p>
            ) : null}
            <Field
              label={t.settings.scheduledTasks.editor.nameLabel}
              htmlFor="scheduled-task-title"
            >
              <Input
                size="settings"
                id="scheduled-task-title"
                placeholder={t.settings.scheduledTasks.editor.namePlaceholder}
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, title: event.target.value }))
                }
              />
            </Field>

            <div className="space-y-4">
              <Field label={t.settings.pages.projects} htmlFor="scheduled-task-project">
                <Select
                  value={selectedProjectId}
                  onValueChange={(projectId) =>
                    setDraft((current) => ({ ...current, projectId: projectId ?? "" }))
                  }
                >
                  <SelectTrigger size="settings" id="scheduled-task-project">
                    <SelectValue placeholder={t.settings.scheduledTasks.editor.projectPlaceholder}>
                      {selectedProject?.title}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.title}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>
            </div>

            {draft.workspaceMode === "worktree" ? (
              <Field
                label={t.settings.scheduledTasks.editor.baseBranchLabel}
                htmlFor="scheduled-task-base-ref"
              >
                <WorktreeBaseBranchPicker
                  key={`${environmentId}:${selectedProjectId}`}
                  id="scheduled-task-base-ref"
                  environmentId={environmentId}
                  cwd={selectedProject?.workspaceRoot ?? null}
                  value={draft.baseRef}
                  onValueChange={(baseRef) => setDraft((current) => ({ ...current, baseRef }))}
                  startFromOrigin={draft.startFromOrigin}
                  onStartFromOriginChange={(startFromOrigin) =>
                    setDraft((current) => ({ ...current, startFromOrigin }))
                  }
                  disabled={saving || !connected}
                />
              </Field>
            ) : null}
            {draft.workspaceMode === "existing_worktree" ? (
              <Field
                label={t.settings.scheduledTasks.editor.checkoutLabel}
                htmlFor="scheduled-task-checkout"
              >
                <Input
                  size="settings"
                  id="scheduled-task-checkout"
                  value={draft.existingWorktreePath}
                  placeholder="/path/to/checkout"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      existingWorktreePath: event.target.value,
                    }))
                  }
                />
              </Field>
            ) : null}

            <Field
              label={t.settings.scheduledTasks.editor.promptLabel}
              htmlFor="scheduled-task-prompt"
            >
              <Textarea
                id="scheduled-task-prompt"
                className="max-h-64 overflow-y-auto"
                placeholder={t.settings.scheduledTasks.editor.promptPlaceholder}
                value={draft.prompt}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, prompt: event.target.value }))
                }
              />
            </Field>

            <Field label={t.settings.scheduledTasks.editor.modelLabel}>
              <div>
                <ProviderModelPicker
                  environmentId={environmentId}
                  disabled={saving || !connected}
                  activeInstanceId={activeInstanceId}
                  model={activeModel}
                  lockedProvider={null}
                  instanceEntries={instanceEntries}
                  modelOptionsByInstance={modelOptionsByInstance}
                  isComposerOwned={false}
                  triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                  onInstanceModelChange={(instanceId, model) =>
                    setDraft((current) => ({ ...current, modelKey: `${instanceId}:${model}` }))
                  }
                />
              </div>
            </Field>

            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <Label htmlFor="scheduled-task-enabled">
                  {t.settings.scheduledTasks.editor.enabledLabel}
                </Label>
                <p
                  id="scheduled-task-enabled-description"
                  className="text-secondary-copy-medium text-muted-foreground"
                >
                  {t.settings.scheduledTasks.editor.enabledHint}
                </p>
              </div>
              <Switch
                id="scheduled-task-enabled"
                aria-describedby="scheduled-task-enabled-description"
                checked={draft.enabled}
                onCheckedChange={(enabled) => setDraft((current) => ({ ...current, enabled }))}
              />
            </div>
          </fieldset>
        </DialogPanel>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="dialog-action" disabled={saving} />}>
            {t.settings.actions.cancel}
          </DialogClose>
          <Button
            size="dialog-action-wide"
            disabled={!canOperate || saving || editingTaskMissing || !connected || !tasksQuery.data}
            onClick={() => void submit()}
          >
            {draft.editingId
              ? t.settings.scheduledTasks.editor.save
              : t.settings.scheduledTasks.editor.create}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
