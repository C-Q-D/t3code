/** Owns scoped default-setting rows; General composes individual rows while other pages retain their groups. */
import { t } from "~/i18n";
import {
  DEFAULT_SERVER_SETTINGS,
  type ModelSelection,
  type ProviderInstanceId,
  type WorktreeSubmodules,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import {
  getCustomModelOptionsByInstance,
  resolveEffectiveDefaultModelSelection,
} from "../../modelSelection";
import {
  providerInstanceEntriesFor,
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  resolveDefaultProviderModelSelection,
} from "../../providerInstances";
import { useEnvironmentProviders, useEnvironments } from "../../state/environments";
import { EMPTY_SERVER_PROVIDERS } from "../../state/server";
import { resolveEnvModeLabel, WORKTREE_SUBMODULES_LABELS } from "../BranchToolbar.logic";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { runtimeModeConfig, runtimeModeOptions } from "../chat/runtimeModeConfig";
import { PULL_REQUEST_MERGE_METHOD_LABELS } from "../pullRequest/pullRequestDetail.logic";
import { TraitsPicker } from "../chat/TraitsPicker";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { toastManager } from "../ui/toast";
import { Switch } from "../ui/switch";
import type { ProjectSettingsCategory } from "./ProjectSettingsPanel";
import { searchableSetting } from "./settingsSearch";
import { useSettingsScope } from "./SettingsScopeContext";
import {
  SETTINGS_PICKER_TRIGGER_CLASSNAME,
  SettingResetButton,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { mergeEnvironmentSettings } from "../../hooks/useSettings";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useScopedSettingSource,
  useUpdateScopedSettings,
} from "./useScopedSettings";

const WORKTREE_SUBMODULES_OPTIONS = ["recursive", "top-level", "none"] as const;
/** Accepts only supported submodule choices before they reach the scoped settings command. */
function isWorktreeSubmodules(value: string | null): value is WorktreeSubmodules {
  return value !== null && (WORKTREE_SUBMODULES_OPTIONS as readonly string[]).includes(value);
}

/** Edits the default model; title only changes its presentation, including in the existing project group. */
export function DefaultModelSetting({
  title = t.settings.scheduledTasks.editor.modelLabel,
}: { title?: string } = {}) {
  const { scope, target, targets, connectedEnvironments } = useSettingsScope();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const navigate = useNavigate();
  const { environments } = useEnvironments();
  const providersByEnvironment = useEnvironmentProviders();
  const representative = target
    ? environments.find((environment) => environment.environmentId === target.environmentId)
    : undefined;
  const providers =
    (representative?.serverConfig
      ? providersByEnvironment.get(representative.environmentId)
      : undefined) ?? EMPTY_SERVER_PROVIDERS;
  const storedSelection = resolveDefaultProviderModelSelection(
    providers,
    settings.defaultModelSelection,
  );
  const selection = storedSelection
    ? resolveEffectiveDefaultModelSelection(settings, providers, storedSelection)
    : null;
  const entries = providerInstanceEntriesFor(providers, settings, target?.projectId ?? null);
  const modelOptions = getCustomModelOptionsByInstance(
    settings,
    providers,
    selection?.instanceId,
    selection?.model,
  );
  const activeEntry = entries.find((entry) => entry.instanceId === selection?.instanceId);
  const mixedModel = useScopedSettingsMixed(["defaultModelSelection"]);
  const mixedFallback = useScopedSettingsMixed(["fallbackModelSelection"]);
  const fallbackSelection = settings.fallbackModelSelection ?? selection;
  const fallbackModelOptions = getCustomModelOptionsByInstance(
    settings,
    providers,
    fallbackSelection?.instanceId,
    fallbackSelection?.model,
  );
  const modelSource = useScopedSettingSource(["defaultModelSelection"]);
  const isProjectScope = scope.kind === "project" || scope.kind === "checkout";
  const unavailable = connectedEnvironments.length === 0;
  /** Rejects a model unavailable on any selected target before requesting a scoped write. */
  function modelDisabledReason(instanceId: ProviderInstanceId, model: string): string | null {
    const sourceEntry = entries.find((entry) => entry.instanceId === instanceId);
    for (const candidate of targets) {
      const environment = environments.find(
        (entry) => entry.environmentId === candidate.environmentId,
      );
      const providers = providersByEnvironment.get(candidate.environmentId);
      if (!environment?.serverConfig || !providers) continue;
      const entry = applyProviderInstanceSettings(
        deriveProviderInstanceEntries(providers),
        candidate.settings,
        candidate.projectId,
      ).find((option) => option.instanceId === instanceId);
      const options = getCustomModelOptionsByInstance(
        mergeEnvironmentSettings(candidate.settings, settings),
        providers,
      ).get(instanceId);
      if (
        !entry?.enabled ||
        !entry.isAvailable ||
        entry.driverKind !== sourceEntry?.driverKind ||
        !options?.some((option) => option.slug === model && !option.isUnavailable)
      ) {
        return t.settings.projectDefaults.modelUnavailableSelectEnvironmentModelHint(
          environment?.label,
        );
      }
    }
    return null;
  }

  /** Persists a valid model selection, or clears it so the resolver supplies the default. */
  const setModel = (value: ModelSelection | null) => {
    const reason = value ? modelDisabledReason(value.instanceId, value.model) : null;
    if (reason) {
      toastManager.add({
        type: "error",
        title: t.settings.projectDefaults.defaultModelNotSaved,
        description: reason,
      });
      return;
    }
    updateSettings({ defaultModelSelection: value });
  };

  const fallbackRow = !isProjectScope ? (
    <SettingsRow
      serverScoped
      settingKeys={["fallbackModelSelection"]}
      mixed={mixedFallback}
      id="fallback-model"
      title={t.settings.fallbackModel.title}
      description={t.settings.fallbackModel.description}
      resetAction={
        mixedFallback || settings.fallbackModelSelection !== null ? (
          <SettingResetButton
            label={t.settings.fallbackModel.reset}
            onClick={() => updateSettings({ fallbackModelSelection: null })}
          />
        ) : null
      }
      control={
        fallbackSelection ? (
          <ProviderModelPicker
            environmentId={representative?.environmentId ?? null}
            activeInstanceId={fallbackSelection.instanceId}
            model={fallbackSelection.model}
            lockedProvider={null}
            instanceEntries={entries}
            modelOptionsByInstance={fallbackModelOptions}
            triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
            triggerAriaLabel={t.settings.fallbackModel.title}
            {...(mixedFallback
              ? { triggerLabel: t.settings.general.mixed }
              : settings.fallbackModelSelection === null
                ? { triggerLabel: t.settings.fallbackModel.none }
                : {})}
            getModelDisabledReason={modelDisabledReason}
            onInstanceModelChange={(instanceId, model) => {
              const reason = modelDisabledReason(instanceId, model);
              if (reason) {
                toastManager.add({
                  type: "error",
                  title: t.settings.fallbackModel.notSaved,
                  description: reason,
                });
                return;
              }
              updateSettings({ fallbackModelSelection: createModelSelection(instanceId, model) });
            }}
          />
        ) : (
          <span className="text-sm text-muted-foreground">
            {t.settings.fallbackModel.noProviders}
          </span>
        )
      }
    />
  ) : null;

  return (
    <>
      <SettingsRow
        serverScoped
        settingKeys={["defaultModelSelection"]}
        mixed={mixedModel}
        id="default-model"
        title={title}
        description={
          isProjectScope
            ? t.settings.projectDefaults.modelForNewThreadsInThisProject
            : t.settings.projectDefaults.defaultModelThreadsProjectsOverrideHint
        }
        status={
          unavailable || mixedModel || modelSource === "project"
            ? undefined
            : settings.defaultModelSelection === null
              ? t.settings.projectDefaults.automatic
              : undefined
        }
        resetAction={
          settings.defaultModelSelection !== null ? (
            <SettingResetButton
              label={t.settings.projectDefaults.defaultModel}
              onClick={() => setModel(null)}
            />
          ) : null
        }
        control={
          selection && activeEntry ? (
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
              <ProviderModelPicker
                environmentId={representative?.environmentId ?? null}
                activeInstanceId={selection.instanceId}
                model={selection.model}
                lockedProvider={null}
                instanceEntries={entries}
                modelOptionsByInstance={modelOptions}
                triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                {...(mixedModel ? { triggerLabel: t.settings.general.mixed } : {})}
                getModelDisabledReason={modelDisabledReason}
                onOpenProviderSetup={(instanceId) => {
                  if (representative)
                    void navigate({
                      to: "/settings/providers",
                      search: { environmentId: representative.environmentId, instanceId },
                    });
                }}
                onInstanceModelChange={(instanceId, model) =>
                  setModel(createModelSelection(instanceId, model))
                }
              />
              {!mixedModel ? (
                <TraitsPicker
                  provider={activeEntry.driverKind}
                  models={activeEntry.models}
                  model={selection.model}
                  modelOptions={selection.options ?? []}
                  allowPromptInjectedEffort={false}
                  planModeEnabled={settings.planModeEnabled}
                  triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                  onModelOptionsChange={(options) =>
                    setModel(createModelSelection(selection.instanceId, selection.model, options))
                  }
                />
              ) : null}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              {t.settings.projectDefaults.noProvidersAvailable}
            </span>
          )
        }
      />
      {fallbackRow}
    </>
  );
}

/** Edits default approval permissions through the existing scope, preserving mixed and reset states. */
export function DefaultPermissionsSetting({
  controlSize = "sm",
}: { controlSize?: "sm" | "settings" } = {}) {
  const { scope } = useSettingsScope();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const isProjectScope = scope.kind === "project" || scope.kind === "checkout";
  const mixedPermissions = useScopedSettingsMixed(["defaultRuntimeMode"]);
  const PermissionIcon = runtimeModeConfig[settings.defaultRuntimeMode].icon;
  return (
    <SettingsRow
      serverScoped
      settingKeys={["defaultRuntimeMode"]}
      mixed={mixedPermissions}
      {...searchableSetting("default-permissions")}
      description={
        isProjectScope
          ? t.settings.projectDefaults.permissionsThreadsProjectHint
          : t.settings.projectDefaults.defaultPermissionsThreadsProjectsOverrideHint
      }
      resetAction={
        settings.defaultRuntimeMode !== DEFAULT_SERVER_SETTINGS.defaultRuntimeMode ? (
          <SettingResetButton
            label={t.settings.projectDefaults.defaultPermissions}
            onClick={() =>
              updateSettings({
                defaultRuntimeMode: DEFAULT_SERVER_SETTINGS.defaultRuntimeMode,
              })
            }
          />
        ) : null
      }
      control={
        <Select
          value={mixedPermissions ? null : settings.defaultRuntimeMode}
          onValueChange={(value) => {
            if (value) updateSettings({ defaultRuntimeMode: value });
          }}
        >
          <SelectTrigger
            size={controlSize}
            aria-label={t.settings.projectDefaults.permissionsAriaLabel}
          >
            {!mixedPermissions && (
              <PermissionIcon className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <SelectValue>
              {mixedPermissions
                ? t.settings.general.mixed
                : runtimeModeConfig[settings.defaultRuntimeMode].label}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {runtimeModeOptions.map((mode) => {
              const option = runtimeModeConfig[mode];
              const Icon = option.icon;
              return (
                <SelectItem key={mode} value={mode} className="min-w-64">
                  <div className="grid gap-0.5">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                      {option.label}
                    </span>
                    <span className="text-xs leading-4 text-muted-foreground">
                      {option.description}
                    </span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectPopup>
        </Select>
      }
    />
  );
}

/** Edits new-thread workspace mode; the optional title lets General use M2 without changing the project group. */
export function DefaultWorkspaceSetting({
  title = t.settings.scheduledTasks.editor.workspaceLabel,
  controlSize = "sm",
}: { title?: string; controlSize?: "sm" | "settings" } = {}) {
  const { scope, target, connectedEnvironments } = useSettingsScope();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const isProjectScope = scope.kind === "project" || scope.kind === "checkout";
  const unavailable = connectedEnvironments.length === 0;
  // Resolve file-backed defaults at the selected checkout; resets still clear the original tier.
  const effective = target
    ? resolveProjectSettings(target.settings, null, null, null).settings
    : null;
  const mixedWorkspace = useScopedSettingsMixed(["defaultThreadEnvMode"]);
  return (
    <SettingsRow
      serverScoped
      settingKeys={["defaultThreadEnvMode"]}
      mixed={mixedWorkspace}
      id={searchableSetting("new-threads").id}
      title={title}
      description={
        isProjectScope
          ? t.settings.projectDefaults.threadsProjectStartHint
          : t.settings.projectDefaults.threadsStartProjectsTheirTHint
      }
      resetAction={
        !isProjectScope && settings.defaultThreadEnvMode !== null ? (
          <SettingResetButton
            label={t.settings.projectDefaults.defaultWorkspace}
            onClick={() => updateSettings({ defaultThreadEnvMode: null })}
          />
        ) : null
      }
      control={
        <Select
          value={mixedWorkspace ? null : (effective?.defaultThreadEnvMode ?? null)}
          onValueChange={(value) => {
            if (value === "local" || value === "worktree")
              updateSettings({ defaultThreadEnvMode: value });
          }}
        >
          <SelectTrigger
            size={controlSize}
            aria-label={t.settings.projectDefaults.workspaceAriaLabel}
          >
            <SelectValue>
              {(value: string | null) =>
                value === "local" || value === "worktree"
                  ? resolveEnvModeLabel(value)
                  : unavailable
                    ? t.settings.resourceTelemetry.unavailable
                    : t.settings.general.mixed
              }
            </SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            <SelectItem value="local">{resolveEnvModeLabel("local")}</SelectItem>
            <SelectItem value="worktree">{resolveEnvModeLabel("worktree")}</SelectItem>
          </SelectPopup>
        </Select>
      }
    />
  );
}

/** Edits checkout submodule population, retaining t3.json resolution and tier-specific resets. */
export function DefaultSubmodulesSetting({
  controlSize = "sm",
}: { controlSize?: "sm" | "settings" } = {}) {
  const { scope, target, connectedEnvironments } = useSettingsScope();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const isProjectScope = scope.kind === "project" || scope.kind === "checkout";
  const unavailable = connectedEnvironments.length === 0;
  // Resolve file-backed defaults at the selected checkout; resets still clear the original tier.
  const effective = target
    ? resolveProjectSettings(target.settings, null, null, null).settings
    : null;
  const mixedSubmodules = useScopedSettingsMixed(["worktreeSubmodules"]);
  return (
    <SettingsRow
      serverScoped
      settingKeys={["worktreeSubmodules"]}
      mixed={mixedSubmodules}
      {...searchableSetting("worktree-submodules")}
      description={
        isProjectScope
          ? t.settings.projectDefaults.worktreesProjectPopulateGitSubmodulesHint
          : t.settings.projectDefaults.worktreesPopulateGitSubmodulesProjectsHint
      }
      resetAction={
        !isProjectScope && settings.worktreeSubmodules !== null ? (
          <SettingResetButton
            label={t.settings.projectDefaults.worktreeSubmodules}
            onClick={() => updateSettings({ worktreeSubmodules: null })}
          />
        ) : null
      }
      control={
        <Select
          value={mixedSubmodules ? null : (effective?.worktreeSubmodules ?? null)}
          onValueChange={(value) => {
            if (isWorktreeSubmodules(value)) updateSettings({ worktreeSubmodules: value });
          }}
        >
          <SelectTrigger
            size={controlSize}
            aria-label={t.settings.projectDefaults.submodulesAriaLabel}
          >
            <SelectValue>
              {(value: string | null) =>
                isWorktreeSubmodules(value)
                  ? WORKTREE_SUBMODULES_LABELS[value]
                  : unavailable
                    ? t.settings.resourceTelemetry.unavailable
                    : t.settings.general.mixed
              }
            </SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {WORKTREE_SUBMODULES_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {WORKTREE_SUBMODULES_LABELS[option]}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}

/** Keeps the existing grouped defaults for project, source-control and integration settings callers. */
export function ProjectDefaultsSettings({
  category,
  sourceControlRows,
}: {
  category: Exclude<ProjectSettingsCategory, "general">;
  /** Discovery and fetch rows join the O4 group without duplicating the scoped defaults. */
  sourceControlRows?: ReactNode;
}) {
  const { scope } = useSettingsScope();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const isProjectScope = scope.kind === "project" || scope.kind === "checkout";
  const mixedBrowser = useScopedSettingsMixed(["enableAgentBrowserAccess"]);
  const mixedAutoPull = useScopedSettingsMixed(["defaultAutoPull"]);
  const mixedAgentCredits = useScopedSettingsMixed(["removeAgentCreditsOnMerge"]);
  const mixedMergeMethod = useScopedSettingsMixed(["pullRequestMergeMethod"]);
  return (
    <SettingsSection
      id={
        category === "project"
          ? "project-defaults"
          : category === "integrations"
            ? "browser-access"
            : "source-control-defaults"
      }
      title={
        category === "project"
          ? t.settings.rows.newThreads.title
          : category === "integrations"
            ? t.settings.sections.browser
            : t.settings.sourceControl.syncAndMerge
      }
    >
      {category === "project" ? (
        <>
          <DefaultModelSetting />
          <DefaultWorkspaceSetting controlSize="settings" />
        </>
      ) : category === "source-control" ? (
        <>
          <SettingsRow
            serverScoped
            settingKeys={["defaultAutoPull"]}
            mixed={mixedAutoPull}
            id="automatic-pull"
            title={t.settings.rows.automaticPull.title}
            aria-description={
              isProjectScope
                ? t.settings.projectDefaults.keepsProjectSDefaultBranchHint
                : t.settings.projectDefaults.keepsDefaultBranchCurrentCheckoutHint
            }
            resetAction={
              settings.defaultAutoPull ? (
                <SettingResetButton
                  label={t.settings.projectDefaults.defaultAutomaticPull}
                  tooltip={t.settings.projectDefaults.resetAutomaticPullToOff}
                  onClick={() => updateSettings({ defaultAutoPull: false })}
                />
              ) : null
            }
            control={
              <Switch
                aria-label={t.settings.projectDefaults.automaticPullAriaLabel}
                mixed={mixedAutoPull}
                checked={mixedAutoPull ? false : settings.defaultAutoPull}
                onCheckedChange={(enabled) => updateSettings({ defaultAutoPull: enabled })}
              />
            }
          />
          <SettingsRow
            serverScoped
            settingKeys={["removeAgentCreditsOnMerge"]}
            mixed={mixedAgentCredits}
            {...searchableSetting("remove-agent-credits-on-merge")}
            aria-description={t.settings.projectDefaults.removeRecognizedAgentCreditLinesHint}
            resetAction={
              settings.removeAgentCreditsOnMerge ? (
                <SettingResetButton
                  label={t.settings.projectDefaults.agentCreditRemoval}
                  tooltip={t.settings.projectDefaults.keepAgentCredits}
                  onClick={() => updateSettings({ removeAgentCreditsOnMerge: false })}
                />
              ) : null
            }
            control={
              <Switch
                aria-label={t.settings.rows.removeAgentCreditsOnMerge.title}
                mixed={mixedAgentCredits}
                checked={mixedAgentCredits ? false : settings.removeAgentCreditsOnMerge}
                onCheckedChange={(enabled) =>
                  updateSettings({ removeAgentCreditsOnMerge: enabled })
                }
              />
            }
          />
          <SettingsRow
            serverScoped
            settingKeys={["pullRequestMergeMethod"]}
            mixed={mixedMergeMethod}
            {...searchableSetting("pull-request-merge-method")}
            aria-description={
              isProjectScope
                ? t.settings.projectDefaults.pullRequestsProjectStartMethodHint
                : t.settings.projectDefaults.pullRequestsStartMethodLastHint
            }
            resetAction={
              settings.pullRequestMergeMethod !== null ? (
                <SettingResetButton
                  label={t.settings.projectDefaults.defaultMergeMethod}
                  tooltip={t.settings.projectDefaults.resetToLastSelected}
                  onClick={() => updateSettings({ pullRequestMergeMethod: null })}
                />
              ) : null
            }
            control={
              <Select
                value={mixedMergeMethod ? null : (settings.pullRequestMergeMethod ?? "last")}
                onValueChange={(value) => {
                  if (value === "last") updateSettings({ pullRequestMergeMethod: null });
                  else if (value === "merge" || value === "squash" || value === "rebase")
                    updateSettings({ pullRequestMergeMethod: value });
                }}
              >
                <SelectTrigger
                  size="settings"
                  aria-label={t.settings.projectDefaults.defaultPullRequestMergeMethod}
                >
                  <SelectValue>
                    {(value: string | null) =>
                      value === "merge" || value === "squash" || value === "rebase"
                        ? PULL_REQUEST_MERGE_METHOD_LABELS[value]
                        : value === "last"
                          ? t.settings.projectDefaults.lastSelected
                          : t.settings.general.mixed
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="last">{t.settings.projectDefaults.lastSelected}</SelectItem>
                  <SelectItem value="merge">{PULL_REQUEST_MERGE_METHOD_LABELS.merge}</SelectItem>
                  <SelectItem value="squash">{PULL_REQUEST_MERGE_METHOD_LABELS.squash}</SelectItem>
                  <SelectItem value="rebase">{PULL_REQUEST_MERGE_METHOD_LABELS.rebase}</SelectItem>
                </SelectPopup>
              </Select>
            }
          />
          {sourceControlRows}
        </>
      ) : (
        <>
          <SettingsRow
            serverScoped
            settingKeys={["enableAgentBrowserAccess"]}
            mixed={mixedBrowser}
            id={searchableSetting("agent-browser-access").id}
            title={t.settings.rows.agentBrowserAccess.title}
            description={
              isProjectScope
                ? t.settings.projectDefaults.allowAgentsProjectSharedBrowserHint
                : t.settings.projectDefaults.allowAgentsSharedBrowserProjectsHint
            }
            resetAction={
              settings.enableAgentBrowserAccess !==
              DEFAULT_SERVER_SETTINGS.enableAgentBrowserAccess ? (
                <SettingResetButton
                  label={t.settings.projectDefaults.defaultBrowserAccess}
                  onClick={() =>
                    updateSettings({
                      enableAgentBrowserAccess: DEFAULT_SERVER_SETTINGS.enableAgentBrowserAccess,
                    })
                  }
                />
              ) : null
            }
            control={
              <Switch
                aria-label={t.settings.rows.agentBrowserAccess.title}
                mixed={mixedBrowser}
                checked={mixedBrowser ? false : settings.enableAgentBrowserAccess}
                onCheckedChange={(enabled) => updateSettings({ enableAgentBrowserAccess: enabled })}
              />
            }
          />
        </>
      )}
    </SettingsSection>
  );
}
