/** Configures storage retention and displays environment cleanup results. */
import { t } from "~/i18n";
import type {
  StorageCleanupReport,
  StorageCleanupSettings,
  WorktreeCleanupRules,
} from "@t3tools/contracts";
import { resolveWorktreeCleanup } from "@t3tools/shared/projectSettings";
import { useRef, useState } from "react";
import { FolderOpenIcon, MinusIcon, PlusIcon } from "lucide-react";
import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { formatBytes } from "../../lib/formatBytes";
import { environmentAtomList, environmentIdsKey } from "../../state/environmentAtomList";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";

import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
  useRelativeTimeTick,
} from "./settingsLayout";
import { DatabaseStorageNotice } from "./DatabaseStorageNotice";
import { SettingsScopeNotice } from "./SettingsScopeNotice";
import { FoldedSettingsSection } from "./FoldedSettingsSection";
import type { ScopedSettingsTarget } from "./scopedSettings";
import { useSettingsScope } from "./SettingsScopeContext";
import { searchableSetting } from "./settingsSearch";
import {
  useClearScopedSettings,
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "./useScopedSettings";
import { settingsScopeEnvironmentLabel } from "./settingsScopeAxis";

/**
 * Edits the selected environments' worktree path on blur and preserves the scoped reset.
 * The disabled browse affordance matches P1 without implying a directory picker exists.
 * @returns The path row, or null when a selected environment lacks path support.
 */
function WorktreesDirectoryRow() {
  const { connectedEnvironments, targets } = useSettingsScope();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const mixed = useScopedSettingsMixed(["worktreesDirectory"]);
  const edited = useRef(false);
  if (
    connectedEnvironments.some(
      (environment) =>
        environment.serverConfig?.environment.capabilities.worktreesDirectory !== true,
    )
  )
    return null;
  const scopeKey = targets.map((target) => target.environmentId).join(",");

  return (
    <SettingsRow
      {...searchableSetting("storage-worktrees-location")}
      description={t.settings.storage.folderWorktreesCreatedAnyDriveHint}
      serverScoped
      settingKeys={["worktreesDirectory"]}
      resetAction={
        mixed || settings.worktreesDirectory !== "" ? (
          <SettingResetButton
            label={t.settings.storage.worktreeLocation}
            onClick={() => updateSettings({ worktreesDirectory: "" })}
          />
        ) : null
      }
      control={
        <div className="relative w-65 max-w-full">
          <Input
            size="settings"
            font="mono"
            key={`${scopeKey}:${mixed}:${settings.worktreesDirectory}`}
            aria-label={t.settings.rows.storageWorktreesLocation.title}
            autoCapitalize="none"
            spellCheck={false}
            placeholder={
              mixed ? t.settings.general.mixed : t.settings.connections.endpoints.default
            }
            defaultValue={mixed ? "" : settings.worktreesDirectory}
            onChange={() => {
              edited.current = true;
            }}
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (edited.current && (mixed || value !== settings.worktreesDirectory))
                updateSettings({ worktreesDirectory: value });
              edited.current = false;
            }}
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  tabIndex={0}
                  className="absolute right-1.5 top-1 rounded-full outline-none focus-visible:inset-shadow-focus"
                />
              }
            >
              <button
                type="button"
                disabled
                aria-label={t.settings.storage.browseUnavailable}
                className="flex size-6 items-center justify-center rounded-full bg-secondary text-fg-icon-disabled"
              >
                <FolderOpenIcon className="size-3" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipPopup>{t.settings.storage.browseUnavailable}</TooltipPopup>
          </Tooltip>
        </div>
      }
      className="storage-location-row"
    />
  );
}

/**
 * Edits retention without changing the existing commit and rounding rules.
 * @param props.label Accessible name for this retention rule and its step buttons.
 * @param props.value Saved days (1–3650), or null when disabled.
 * @param props.onChange Persists committed days or null; enabling retains the existing eight-day default.
 * @returns A settings-sized day stepper and the existing enable switch.
 */
function RetentionControl({
  label,
  value,
  onChange,
  minimum = 1,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  minimum?: number;
}) {
  const [draft, setDraft] = useState(value);
  const [savedValue, setSavedValue] = useState(value);
  if (savedValue !== value) {
    setSavedValue(value);
    setDraft(value);
  }

  return (
    <div className="flex items-center gap-3">
      {value !== null ? (
        <NumberFieldPrimitive.Root
          value={draft}
          min={minimum}
          max={3650}
          step={1}
          className="w-auto"
          onValueChange={setDraft}
          onValueCommitted={(next) => {
            if (next === null) setDraft(value);
            else {
              const days = Math.min(3650, Math.max(minimum, Math.round(next)));
              setDraft(days);
              onChange(days);
            }
          }}
        >
          <NumberFieldPrimitive.Group
            render={
              <div className="flex h-8 items-center rounded-card-row bg-input p-0.75 shadow-well-track" />
            }
          >
            <NumberFieldPrimitive.Decrement
              aria-label={t.settings.storage.decrease(label)}
              render={<Button variant="secondary" size="icon-stepper" />}
            >
              <MinusIcon aria-hidden />
            </NumberFieldPrimitive.Decrement>
            <NumberFieldPrimitive.Input
              aria-label={t.settings.storage.inDays(label)}
              render={
                <input className="h-6.5 w-11 min-w-0 rounded-keycap bg-transparent text-center font-mono text-secondary-copy-large tabular-nums outline-none focus-visible:inset-shadow-focus" />
              }
            />
            <span aria-hidden="true" className="pr-2 text-secondary-copy text-secondary-label">
              {t.settings.storage.days}
            </span>
            <NumberFieldPrimitive.Increment
              aria-label={t.settings.storage.increase(label)}
              render={<Button variant="secondary" size="icon-stepper" />}
            >
              <PlusIcon aria-hidden />
            </NumberFieldPrimitive.Increment>
          </NumberFieldPrimitive.Group>
        </NumberFieldPrimitive.Root>
      ) : (
        <span className="text-secondary-copy text-secondary-label">
          {t.settings.connections.status.off}
        </span>
      )}
      <Switch
        aria-label={label}
        checked={value !== null}
        onCheckedChange={(enabled) => onChange(enabled ? 8 : null)}
      />
    </div>
  );
}

/** Resolves cleanup preservation labels in the active language. */
function keepWhenLabels() {
  return {
    "any-local-files": t.settings.merge.storageAnyFiles,
    "uncommitted-changes": t.settings.merge.storageUncommitted,
    "tracked-changes": t.settings.merge.storageTracked,
  } as const;
}

/** One line for the last-run fold; identical results across machines collapse into one. */
function lastRunSummary(
  entries: readonly { readonly label: string; readonly counts: string }[],
  machineCount: number,
) {
  const first = entries[0];
  if (!first) return "";
  if (machineCount <= 1) return first.counts;
  if (entries.length === machineCount && entries.every((entry) => entry.counts === first.counts)) {
    return t.settings.storage.onEveryMachine(first.counts);
  }
  return entries.map((entry) => `${entry.label}: ${entry.counts}`).join(" · ");
}

/**
 * Displays cleanup entries, omitted counts and the empty result without rewriting server reasons.
 * @param props.report Latest cleanup report; entries retain the server's order and outcomes.
 * @param props.environmentLabel Prefix for multi-environment reports; omitted for a single environment.
 * @returns Settings rows with removed file sizes and failed reasons, or the existing empty message.
 */
function CleanupResults({
  report,
  environmentLabel,
}: {
  report: StorageCleanupReport;
  environmentLabel: string;
}) {
  return (
    <>
      {report.entries.map((entry, index) => {
        const name =
          entry.kind === "worktree"
            ? ((entry.threadId === null
                ? entry.path
                : entry.path?.split(/[\\/]/).findLast(Boolean)) ??
              t.settings.merge.storageWorktrees)
            : entry.kind === "logs"
              ? t.settings.merge.storageRotatedLogs
              : t.settings.merge.storageBrowserArtifacts;
        return (
          <SettingsRow
            key={`${entry.path ?? entry.kind}:${entry.threadId ?? index}`}
            title={<span className="wrap-anywhere select-text">{name}</span>}
            description={
              <span className="block space-y-2 wrap-anywhere select-text">
                <span className={`block ${entry.outcome === "failed" ? "text-destructive" : ""}`}>
                  {entry.reason}
                </span>
                <span className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-l border-border/60 pl-3">
                  <span>{t.settings.storageCleanupUi.machine}</span>
                  <span className="text-foreground/80">{environmentLabel}</span>
                  {entry.projectPath && (
                    <>
                      <span>{t.settings.storageCleanupUi.project}</span>
                      <code className="text-foreground/80">{entry.projectPath}</code>
                    </>
                  )}
                  {entry.path && (
                    <>
                      <span>{t.settings.storageCleanupUi.folder}</span>
                      <code className="text-foreground/80">{entry.path}</code>
                    </>
                  )}
                  {entry.threadTitle && (
                    <>
                      <span>{t.settings.storageCleanupUi.thread}</span>
                      <span>{entry.threadTitle}</span>
                    </>
                  )}
                </span>
              </span>
            }
            control={
              (entry.outcome === "removed" ||
                (entry.outcome === "kept" && entry.bytes !== null)) && (
                <span className="text-secondary-copy text-secondary-label">
                  {[
                    entry.kind !== "worktree" && entry.files !== null
                      ? t.settings.merge.storageFiles(entry.files)
                      : null,
                    entry.bytes !== null ? formatBytes(entry.bytes) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )
            }
          />
        );
      })}
      {report.omittedCount > 0 && (
        <p className="px-3.5 py-2.5 text-secondary-copy-medium text-secondary-label">
          {environmentLabel ? `${environmentLabel}: ` : ""}
          {t.settings.merge.storageMoreResults(report.omittedCount)}
        </p>
      )}
      {report.entries.length === 0 && report.omittedCount === 0 && (
        <p className="px-3.5 py-2.5 text-secondary-copy-medium text-secondary-label">
          {environmentLabel ? `${environmentLabel}: ` : ""}
          {t.settings.merge.storageNothingToClean}
        </p>
      )}
    </>
  );
}

const storageCleanupReportsAtom = environmentAtomList(
  "web-storage-cleanup-reports",
  (environmentId) => serverEnvironment.storageCleanupReport({ environmentId, input: {} }),
);
const storageCleanupPermissionsAtom = environmentAtomList(
  "web-storage-cleanup-permissions",
  serverEnvironment.runStorageCleanup.permissionAtom,
);

/**
 * Runs cleanup on permitted environments and displays the latest server reports.
 * Keeps the existing direct execution, single-flight command and failure toasts; no confirmation is added.
 * @returns The P1 artifacts row and an expandable report, or null when cleanup is unsupported.
 */
function CleanupSection() {
  useRelativeTimeTick(60_000);
  const { connectedEnvironments } = useSettingsScope();
  const [pending, setPending] = useState(false);
  const run = useAtomCommand(serverEnvironment.runStorageCleanup);
  const supported = connectedEnvironments.filter(
    (environment) => environment.serverConfig?.environment.capabilities.storageCleanupRun === true,
  );
  const supportedIds = supported.map(({ environmentId }) => environmentId);
  const reports = useAtomValue(storageCleanupReportsAtom(environmentIdsKey(supportedIds)));
  const permissions = useAtomValue(storageCleanupPermissionsAtom(environmentIdsKey(supportedIds)));
  const state = supportedIds.map((environmentId, index) => {
    const query = reports[index]!;
    return {
      environmentId,
      allowed: permissions[index]!,
      report: query._tag === "Success" ? query.value : null,
      loading: query.waiting,
      failed: query._tag === "Failure",
    };
  });
  const hasRules = supported.some((environment) => {
    const settings = environment.serverConfig?.settings;
    if (!settings) return false;
    const enabled = (rules: WorktreeCleanupRules) =>
      rules.worktreeAfterDays !== null ||
      rules.worktreeSettledAfterDays !== null ||
      rules.worktreeOnMerge ||
      rules.worktreeOnDelete ||
      rules.worktreeUnchanged;
    return (
      settings.storageCleanup.browserArtifactsAfterDays !== null ||
      settings.storageCleanup.logsAfterDays !== null ||
      enabled(resolveWorktreeCleanup(settings, null)) ||
      Object.values(settings.projectSettingsOverrides).some(
        (override) =>
          override.worktreeCleanup?.mode === "custom" && enabled(override.worktreeCleanup.rules),
      )
    );
  });
  if (supported.length === 0) return null;
  const summaries = supported.map((environment) => {
    const query = state.find((entry) => entry.environmentId === environment.environmentId);
    const report = query?.report ?? null;
    return {
      environment,
      report,
      label: settingsScopeEnvironmentLabel(environment, connectedEnvironments),
      counts: report
        ? t.settings.merge.storageResultCounts(
            report.counts.removed,
            report.counts.kept,
            report.counts.failed,
          )
        : "",
      description: report
        ? t.settings.merge.storageRunSummary(
            formatRelativeTimeLabel(report.finishedAt),
            formatBytes(report.bytesFreed),
            report.counts.failed,
          )
        : query?.failed
          ? t.settings.merge.storageLoadFailed
          : query?.loading
            ? t.settings.merge.storageLoadingRun
            : t.settings.merge.storageNotRun,
    };
  });
  const deleteNow = async () => {
    if (pending) return;
    setPending(true);
    await Promise.all(
      supported
        .filter((environment) =>
          state.some((entry) => entry.environmentId === environment.environmentId && entry.allowed),
        )
        .map(async (environment) => {
          const result = await run({ environmentId: environment.environmentId, input: {} });
          if (result._tag === "Success") {
            const failures = result.value.entries.filter((entry) => entry.outcome === "failed");
            if (failures.length > 0)
              toastManager.add({
                type: "error",
                title: t.settings.merge.storageCleanupFailed(environment.label),
                description: failures[0]!.reason,
              });
          } else if (!isAtomCommandInterrupted(result)) {
            toastManager.add({
              type: "error",
              title: t.settings.merge.storageRunFailed(environment.label),
              description: String(squashAtomCommandFailure(result)),
            });
          }
        }),
    ).finally(() => setPending(false));
  };
  return (
    <div id="storage-cleanup">
      <SettingsRow
        {...searchableSetting("storage-delete-now")}
        title={t.settings.storage.artifactsAndLogs}
        description={
          <span>
            {!hasRules
              ? t.settings.merge.storageEnableRule
              : summaries.map(({ environment, label, description }) => (
                  <span key={environment.environmentId} className="block">
                    {supported.length > 1 ? `${label}: ` : ""}
                    {description}
                  </span>
                ))}
          </span>
        }
        control={
          <Button
            variant="destructive-outline"
            size="md"
            disabled={pending || !hasRules || !state.some((entry) => entry.allowed)}
            onClick={() => void deleteNow()}
          >
            {pending ? t.settings.merge.storageDeleting : t.settings.merge.storageDeleteNow}
          </Button>
        }
      />
      {summaries.some(({ report }) => report !== null) && (
        <FoldedSettingsSection
          id="storage-cleanup-last-run"
          title={t.settings.merge.storageLastRun}
          headerPlacement="inside"
          summary={lastRunSummary(
            summaries.filter(({ report }) => report !== null),
            connectedEnvironments.length,
          )}
        >
          {summaries.map(
            ({ environment, label, report }) =>
              report && (
                <CleanupResults
                  key={environment.environmentId}
                  report={report}
                  environmentLabel={label}
                />
              ),
          )}
        </FoldedSettingsSection>
      )}
    </div>
  );
}

/**
 * Groups P1 storage controls while retaining additional cleanup rules and scope capabilities.
 * Existing scoped writes, inheritance, reset actions and search destinations remain authoritative.
 * @returns Storage settings for the selected scope, or its existing capability notice.
 */
export function StorageSettingsPanel() {
  const { scope, environments, connectedEnvironments, targets, target } = useSettingsScope();
  const scopedSettings = useScopedSettings();
  const isProjectScope = scope.kind === "project" || scope.kind === "checkout";
  const settings = {
    ...scopedSettings.storageCleanup,
    ...resolveWorktreeCleanup(scopedSettings, null),
  };
  const projectMode = (entry: ScopedSettingsTarget | null) =>
    entry?.sources.worktreeCleanup === "project"
      ? (entry.settings.worktreeCleanup?.mode ?? "inherit")
      : "inherit";
  const mode = projectMode(target);
  const mixedModes = targets.some((entry) => projectMode(entry) !== mode);
  const updateSettings = useUpdateScopedSettings();
  const clearSettings = useClearScopedSettings();
  const ruleStatus = (key: keyof StorageCleanupSettings) =>
    targets.some(
      (target) =>
        ({ ...target.settings.storageCleanup, ...resolveWorktreeCleanup(target.settings, null) })[
          key
        ] !== settings[key],
    )
      ? t.settings.storage.mixedAcrossSelectedMachines
      : undefined;
  const update = (patch: Partial<StorageCleanupSettings>) =>
    updateSettings({ storageCleanup: patch });
  const updateWorktree = (patch: Partial<WorktreeCleanupRules>) =>
    isProjectScope
      ? updateSettings({ worktreeCleanup: { mode: "custom", rules: patch } })
      : update(patch);

  if (
    isProjectScope &&
    connectedEnvironments.some(
      (environment) =>
        environment.serverConfig?.environment.capabilities.projectWorktreeCleanup !== true,
    )
  ) {
    return (
      <SettingsScopeNotice target="all">
        {t.settings.storage.updateSelectedMachinesConfigureProjectHint}
      </SettingsScopeNotice>
    );
  }

  if (
    connectedEnvironments.some(
      (environment) => environment.serverConfig?.environment.capabilities.storageCleanup !== true,
    )
  ) {
    return (
      <SettingsScopeNotice
        target="environment"
        eligibleEnvironmentIds={connectedEnvironments
          .filter(
            (environment) =>
              environment.serverConfig?.environment.capabilities.storageCleanup === true,
          )
          .map((environment) => environment.environmentId)}
      >
        {t.settings.storage.updateSelectedEnvironmentsStorageCleanupHint}
      </SettingsScopeNotice>
    );
  }

  return (
    <SettingsPageContainer>
      {!isProjectScope && (
        <DatabaseStorageNotice
          environments={connectedEnvironments.filter(
            (environment) =>
              environment.serverConfig?.environment.capabilities.databaseStorage === true,
          )}
        />
      )}
      <SettingsSection id="storage-worktrees" title={t.settings.storage.worktreesAndArtifacts}>
        {(!isProjectScope || (!mixedModes && mode === "custom")) && (
          <>
            {connectedEnvironments.length > 0 &&
              connectedEnvironments.every(
                (environment) =>
                  environment.serverConfig?.environment.capabilities.settledWorktreeCleanup ===
                  true,
              ) && (
                <SettingsRow
                  title={t.settings.storageCleanupUi.deleteSettled}
                  status={[
                    ruleStatus("worktreeSettledAfterDays"),
                    environments.length > connectedEnvironments.length
                      ? t.settings.storageCleanupUi.offline
                      : undefined,
                  ]
                    .filter(Boolean)
                    .join(". ")}
                  description={t.settings.storageCleanupUi.hint}
                  serverScoped={!isProjectScope}
                  control={
                    <RetentionControl
                      label={t.settings.storageCleanupUi.deleteSettled}
                      value={settings.worktreeSettledAfterDays}
                      minimum={0}
                      onChange={(worktreeSettledAfterDays) =>
                        updateWorktree({ worktreeSettledAfterDays })
                      }
                    />
                  }
                />
              )}
            <SettingsRow
              title={t.settings.storage.worktreeCleanup}
              status={ruleStatus("worktreeAfterDays")}
              description={t.settings.storage.removeWorktreesAfterTheirThreadsHint}
              serverScoped={!isProjectScope}
              control={
                <Select
                  value={
                    ruleStatus("worktreeAfterDays")
                      ? null
                      : settings.worktreeAfterDays === null
                        ? "off"
                        : "enabled"
                  }
                  onValueChange={(next) => {
                    if (next === "off") updateWorktree({ worktreeAfterDays: null });
                    else if (next === "enabled")
                      updateWorktree({ worktreeAfterDays: settings.worktreeAfterDays ?? 8 });
                  }}
                >
                  <SelectTrigger size="settings" aria-label={t.settings.storage.worktreeCleanup}>
                    <SelectValue>
                      {ruleStatus("worktreeAfterDays")
                        ? t.settings.general.mixed
                        : settings.worktreeAfterDays === null
                          ? t.settings.connections.status.off
                          : t.settings.storage.afterDays(settings.worktreeAfterDays)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end" alignItemWithTrigger={false}>
                    <SelectItem value="off">{t.settings.connections.status.off}</SelectItem>
                    <SelectItem value="enabled">
                      {t.settings.storage.afterDays(settings.worktreeAfterDays ?? 8)}
                    </SelectItem>
                  </SelectPopup>
                </Select>
              }
            />
          </>
        )}
        {!isProjectScope && <WorktreesDirectoryRow />}
        {!isProjectScope && <CleanupSection />}
        {(!isProjectScope || (!mixedModes && mode === "custom")) && (
          <>
            {connectedEnvironments.every(
              (environment) =>
                environment.serverConfig?.environment.capabilities.storageCleanupRun === true,
            ) && (
              <SettingsRow
                {...searchableSetting("storage-worktree-keep-when")}
                status={ruleStatus("worktreeKeepWhen")}
                description={
                  settings.worktreeKeepWhen === "any-local-files"
                    ? t.settings.merge.storageAnyFilesHint
                    : settings.worktreeKeepWhen === "tracked-changes"
                      ? t.settings.merge.storageTrackedHint
                      : t.settings.merge.storageUncommittedHint
                }
                serverScoped={!isProjectScope}
                control={
                  <Select
                    value={ruleStatus("worktreeKeepWhen") ? null : settings.worktreeKeepWhen}
                    onValueChange={(next) => {
                      if (
                        next === "any-local-files" ||
                        next === "uncommitted-changes" ||
                        next === "tracked-changes"
                      )
                        updateWorktree({ worktreeKeepWhen: next });
                    }}
                  >
                    <SelectTrigger size="settings" aria-label={t.settings.merge.storageKeepLocal}>
                      <SelectValue>
                        {ruleStatus("worktreeKeepWhen")
                          ? t.settings.merge.storageMixed
                          : keepWhenLabels()[settings.worktreeKeepWhen]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectPopup align="end" alignItemWithTrigger={false}>
                      <SelectItem value="any-local-files">
                        {t.settings.merge.storageAnyFiles}
                      </SelectItem>
                      <SelectItem value="uncommitted-changes">
                        {t.settings.merge.storageUncommitted}
                      </SelectItem>
                      <SelectItem value="tracked-changes">
                        {t.settings.merge.storageTracked}
                      </SelectItem>
                    </SelectPopup>
                  </Select>
                }
              />
            )}
          </>
        )}
        {isProjectScope && (
          <SettingsRow
            title={t.settings.storage.automaticWorktreeCleanup}
            description={
              mode === "off"
                ? t.settings.storage.keepProjectSWorktreesUntilHint
                : mode === "custom"
                  ? t.settings.storage.projectCleanupRulesHint
                  : t.settings.storage.eachMachineSWorktreeCleanupHint
            }
            serverScoped
            settingKeys={["worktreeCleanup"]}
            mixed={mixedModes}
            control={
              <Select
                value={mixedModes ? null : mode}
                onValueChange={(next) => {
                  if (next === "inherit") clearSettings(["worktreeCleanup"]);
                  else if (next === "off") updateSettings({ worktreeCleanup: { mode: "off" } });
                  else if (next === "custom")
                    updateSettings({ worktreeCleanup: { mode: "custom", rules: {} } });
                }}
              >
                <SelectTrigger
                  size="settings"
                  aria-label={t.settings.storage.automaticWorktreeCleanup}
                >
                  <SelectValue>
                    {mixedModes
                      ? t.settings.general.mixed
                      : mode === "inherit"
                        ? t.settings.storage.inherit
                        : mode === "off"
                          ? t.settings.connections.status.off
                          : t.settings.storage.custom}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="inherit">{t.settings.storage.inherit}</SelectItem>
                  <SelectItem value="off">{t.settings.connections.status.off}</SelectItem>
                  <SelectItem value="custom">{t.settings.storage.custom}</SelectItem>
                </SelectPopup>
              </Select>
            }
          />
        )}
        {(!isProjectScope || (!mixedModes && mode === "custom")) && (
          <>
            <SettingsRow
              title={t.settings.storage.deleteInactiveWorktrees}
              status={ruleStatus("worktreeAfterDays")}
              description={t.settings.storage.removeWorktreesAfterTheirThreadsHint}
              serverScoped={!isProjectScope}
              control={
                <RetentionControl
                  label={t.settings.storage.deleteInactiveWorktrees}
                  value={settings.worktreeAfterDays}
                  onChange={(worktreeAfterDays) => updateWorktree({ worktreeAfterDays })}
                />
              }
            />
            <SettingsRow
              title={t.settings.storage.deleteWorktreesWithDeletedThreads}
              status={ruleStatus("worktreeOnDelete")}
              description={t.settings.storage.removeUnusedWorktreesActiveArchivedHint}
              serverScoped={!isProjectScope}
              control={
                <Switch
                  aria-label={t.settings.storage.deleteWorktreesWithDeletedThreads}
                  checked={settings.worktreeOnDelete}
                  onCheckedChange={(worktreeOnDelete) => updateWorktree({ worktreeOnDelete })}
                />
              }
            />
            <SettingsRow
              title={t.settings.storage.deleteMergedWorktrees}
              status={ruleStatus("worktreeOnMerge")}
              description={t.settings.storage.removeWorktreesWhosePullRequestHint}
              serverScoped={!isProjectScope}
              control={
                <Switch
                  aria-label={t.settings.storage.deleteMergedWorktrees}
                  checked={settings.worktreeOnMerge}
                  onCheckedChange={(worktreeOnMerge) => updateWorktree({ worktreeOnMerge })}
                />
              }
            />
            <SettingsRow
              title={t.settings.storage.deleteUnchangedWorktrees}
              status={ruleStatus("worktreeUnchanged")}
              description={t.settings.storage.removeWorktreesCommitsBeyondDefaultHint}
              serverScoped={!isProjectScope}
              control={
                <Switch
                  aria-label={t.settings.storage.deleteUnchangedWorktrees}
                  checked={settings.worktreeUnchanged}
                  onCheckedChange={(worktreeUnchanged) => updateWorktree({ worktreeUnchanged })}
                />
              }
            />
          </>
        )}
      </SettingsSection>

      {!isProjectScope && (
        <SettingsSection id="storage-artifacts" title={t.settings.rows.storageArtifacts.title}>
          <SettingsRow
            title={t.settings.storage.deleteOldBrowserArtifacts}
            status={ruleStatus("browserArtifactsAfterDays")}
            description={t.settings.storage.deleteSavedBrowserCapturesAfterHint}
            serverScoped
            control={
              <RetentionControl
                label={t.settings.storage.deleteOldBrowserArtifacts}
                value={settings.browserArtifactsAfterDays}
                onChange={(browserArtifactsAfterDays) => update({ browserArtifactsAfterDays })}
              />
            }
          />
          <SettingsRow
            title={t.settings.storage.deleteOldRotatedLogs}
            status={ruleStatus("logsAfterDays")}
            description={t.settings.storage.deleteInactiveRotatedLogFilesHint}
            serverScoped
            control={
              <RetentionControl
                label={t.settings.storage.deleteOldRotatedLogs}
                value={settings.logsAfterDays}
                onChange={(logsAfterDays) => update({ logsAfterDays })}
              />
            }
          />
        </SettingsSection>
      )}
    </SettingsPageContainer>
  );
}
