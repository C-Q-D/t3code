/** Scoped source-control writing and review-guide preferences, independent of branch naming. */
import { t } from "~/i18n";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import type {
  ProviderInstanceId,
  ServerSettings,
  SourceControlWritingStyleMode,
} from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import { createModelSelection } from "@t3tools/shared/model";
import {
  resolveReviewGuideModelSelection,
  resolveSourceControlWriterModelSelection,
} from "@t3tools/shared/serverSettings";

import {
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "./useScopedSettings";
import { useScopedModelDisabledReason } from "./useScopedModelAvailability";
import { useSettingsScope } from "./SettingsScopeContext";
import { providerInstanceEntriesFor } from "../../providerInstances";
import {
  getCustomModelOptionsByInstance,
  resolveAppModelSelectionState,
  selectsPlanAgent,
} from "../../modelSelection";
import { useEnvironmentProviders } from "../../state/environments";
import { EMPTY_SERVER_PROVIDERS } from "../../state/server";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { TraitsPicker } from "../chat/TraitsPicker";
import {
  Select,
  SelectButton,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { Button } from "../ui/button";
import { SettingResetButton, SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

const MODE_OPTIONS = t.settings.sourceControlWriting.modeOptions;
// O4 gives model and trait pickers the same 32px capsule as settings selects.
const SOURCE_CONTROL_MODEL_TRIGGER_CLASSNAME =
  "h-8 min-w-30 max-w-full shrink-0 rounded-full border-0 bg-select-control px-3 text-secondary-copy-large text-fg-detail shadow-raise-xs-control hover:bg-accent sm:text-secondary-copy-large";

/** Keeps mixed-target editing and model availability checks inside the O4 writing group. */
export function SourceControlWritingSettingsSection() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const mixedReviewGuidesEnabled = useScopedSettingsMixed(["reviewGuidesEnabled"]);
  const navigate = useNavigate();
  const { environment, connectedEnvironments, targets, target } = useSettingsScope();
  const environmentId = environment?.environmentId ?? null;
  const hasServerTargets = connectedEnvironments.length > 0;
  const providersByEnvironment = useEnvironmentProviders();
  const serverProviders =
    (environment?.serverConfig
      ? providersByEnvironment.get(environment.environmentId)
      : undefined) ?? EMPTY_SERVER_PROVIDERS;
  const styleFieldMixed = (field: keyof ServerSettings["sourceControlWritingStyle"]) => {
    const first = targets[0];
    return (
      first !== undefined &&
      targets.some(
        (candidate) =>
          candidate.settings.sourceControlWritingStyle[field] !==
          first.settings.sourceControlWritingStyle[field],
      )
    );
  };
  const modeMixed = styleFieldMixed("mode");
  const instructionsMixed = styleFieldMixed("customInstructions");
  const templatesMixed = styleFieldMixed("followChangeRequestTemplates");
  const writingStyleMixed = modeMixed || instructionsMixed;
  const mixedWriterModel = useScopedSettingsMixed(["sourceControlWriterModelSelection"]);
  const mixedReviewGuideModel = useScopedSettingsMixed(["reviewGuideModelSelection"]);
  const mixedReviewGuideInstructions = useScopedSettingsMixed(["reviewGuideInstructions"]);
  const reviewGuideInstructionsEdited = useRef(false);
  const scopeKey = targets.map((target) => `${target.environmentId}:${target.projectId}`).join(",");
  const customInstructionsRef = useRef<HTMLTextAreaElement>(null);
  const [editingAllInstructions, setEditingAllInstructions] = useState(false);
  const [allInstructions, setAllInstructions] = useState<string | null>(null);
  const style = settings.sourceControlWritingStyle;
  const defaults = DEFAULT_UNIFIED_SETTINGS.sourceControlWritingStyle;
  const isSourceControlWritingStyleDirty =
    writingStyleMixed ||
    style.mode !== defaults.mode ||
    style.customInstructions !== defaults.customInstructions;

  const textGenerationProviders = serverProviders.filter(
    (provider) => provider.supportsTextGeneration !== false,
  );
  const instanceEntries = providerInstanceEntriesFor(
    textGenerationProviders,
    settings,
    target?.projectId ?? null,
  );
  const projectEnabledInstanceIds = new Set(
    instanceEntries
      .filter((entry) => entry.enabled && entry.isAvailable)
      .map((entry) => entry.instanceId),
  );
  const projectEffectiveTextGenerationProviders = textGenerationProviders.filter((provider) =>
    projectEnabledInstanceIds.has(provider.instanceId),
  );
  const defaultModelSelection = resolveAppModelSelectionState(
    settings,
    projectEffectiveTextGenerationProviders,
  );
  const usesDedicatedModel = settings.sourceControlWriterModelSelection !== null;
  const activeSelection = resolveAppModelSelectionState(
    {
      ...settings,
      textGenerationModelSelection: resolveSourceControlWriterModelSelection(
        settings,
        projectEffectiveTextGenerationProviders,
        target?.projectId ?? null,
      ),
    },
    projectEffectiveTextGenerationProviders,
  );
  const canEnableDedicatedModel = instanceEntries.some(
    (entry) =>
      entry.instanceId === defaultModelSelection.instanceId && entry.enabled && entry.isAvailable,
  );
  const modelOptionsByInstance = getCustomModelOptionsByInstance(
    settings,
    projectEffectiveTextGenerationProviders,
    activeSelection.instanceId,
    activeSelection.model,
  );
  const writerModelDisabledReason = useScopedModelDisabledReason(settings, instanceEntries);
  const writerInstanceEntry = instanceEntries.find(
    (entry) => entry.instanceId === activeSelection.instanceId,
  );
  const usesReviewGuideModel = settings.reviewGuideModelSelection !== null;
  const reviewGuideSelection = resolveAppModelSelectionState(
    {
      ...settings,
      textGenerationModelSelection: resolveReviewGuideModelSelection(
        settings,
        textGenerationProviders,
        target?.projectId ?? null,
      ),
    },
    textGenerationProviders,
  );
  const reviewGuideModelOptionsByInstance = getCustomModelOptionsByInstance(
    settings,
    textGenerationProviders,
    reviewGuideSelection.instanceId,
    reviewGuideSelection.model,
  );
  const reviewGuideInstanceEntry = instanceEntries.find(
    (entry) => entry.instanceId === reviewGuideSelection.instanceId,
  );

  return (
    <SettingsSection id="source-control-text-generation" title={t.settings.sourceControl.writing}>
      <SettingsRow
        serverScoped
        settingKeys={["sourceControlWritingStyle"]}
        mixed={writingStyleMixed}
        {...searchableSetting("source-control-writing-style")}
        aria-description={MODE_OPTIONS[style.mode].description}
        resetAction={
          isSourceControlWritingStyleDirty ? (
            <SettingResetButton
              label={t.settings.sourceControlWriting.sourceControlWritingStyle}
              onClick={() =>
                updateSettings({
                  sourceControlWritingStyle: {
                    mode: defaults.mode,
                    customInstructions: defaults.customInstructions,
                  },
                })
              }
            />
          ) : null
        }
        control={
          <Select
            value={modeMixed ? null : style.mode}
            onValueChange={(value) => {
              const customInstructions = customInstructionsRef.current?.value.trim();
              updateSettings({
                sourceControlWritingStyle: {
                  mode: value as SourceControlWritingStyleMode,
                  ...(customInstructions !== undefined ? { customInstructions } : {}),
                },
              });
            }}
          >
            <SelectTrigger
              size="settings"
              aria-label={t.settings.rows.sourceControlWritingStyle.title}
            >
              <SelectValue>
                {(value: SourceControlWritingStyleMode | null) =>
                  value === null ? t.settings.general.mixed : MODE_OPTIONS[value].label
                }
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {(Object.keys(MODE_OPTIONS) as SourceControlWritingStyleMode[]).map((mode) => (
                <SelectItem key={mode} hideIndicator value={mode}>
                  {MODE_OPTIONS[mode].label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      >
        {writingStyleMixed ? (
          <div className="mt-3 max-w-2xl space-y-2 pb-3.5">
            {editingAllInstructions ? (
              <>
                <Textarea
                  value={allInstructions ?? ""}
                  onChange={(event) => setAllInstructions(event.target.value)}
                  rows={4}
                  aria-label={t.settings.sourceControlWriting.customSourceControlInstructionsAll}
                  placeholder={
                    t.settings.sourceControlWriting.writeInstructionsEachSelectedEnvironmentHint
                  }
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={allInstructions === null}
                  onClick={() => {
                    if (allInstructions === null) return;
                    updateSettings({
                      sourceControlWritingStyle: {
                        mode: "custom",
                        customInstructions: allInstructions.trim(),
                      },
                    });
                    setEditingAllInstructions(false);
                  }}
                >
                  {t.settings.sourceControlWriting.applyInstructionsToAll}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAllInstructions(null);
                  setEditingAllInstructions(true);
                }}
              >
                {t.settings.sourceControlWriting.writeCustomInstructionsForAll}
              </Button>
            )}
          </div>
        ) : style.mode === "custom" ? (
          <div className="mt-3 max-w-2xl pb-3.5">
            <Textarea
              key={style.customInstructions}
              ref={customInstructionsRef}
              defaultValue={style.customInstructions}
              onBlur={(event) => {
                const customInstructions = event.target.value.trim();
                if (customInstructions !== style.customInstructions) {
                  updateSettings({ sourceControlWritingStyle: { customInstructions } });
                }
              }}
              rows={4}
              placeholder={t.settings.sourceControlWriting.keepTitlesConciseShortBulletHint}
              aria-label={t.settings.sourceControlWriting.customSourceControlWritingInstructions}
            />
          </div>
        ) : null}
      </SettingsRow>

      <SettingsRow
        serverScoped
        settingKeys={["sourceControlWritingStyle"]}
        mixed={templatesMixed}
        {...searchableSetting("follow-change-request-templates")}
        aria-description={t.settings.sourceControlWriting.repositorySTemplateChangeRequestHint}
        resetAction={
          templatesMixed ||
          style.followChangeRequestTemplates !== defaults.followChangeRequestTemplates ? (
            <SettingResetButton
              label={t.settings.sourceControlWriting.changeRequestTemplates}
              onClick={() =>
                updateSettings({
                  sourceControlWritingStyle: {
                    followChangeRequestTemplates: defaults.followChangeRequestTemplates,
                  },
                })
              }
            />
          ) : null
        }
        control={
          <Switch
            mixed={templatesMixed}
            checked={templatesMixed ? false : style.followChangeRequestTemplates}
            onCheckedChange={(checked) =>
              updateSettings({
                sourceControlWritingStyle: {
                  followChangeRequestTemplates: Boolean(checked),
                },
              })
            }
            aria-label={t.settings.rows.followChangeRequestTemplates.title}
          />
        }
      />

      <SettingsRow
        serverScoped
        settingKeys={["sourceControlWriterModelSelection"]}
        {...searchableSetting("source-control-writer-model")}
        aria-description={t.settings.sourceControlWriting.modelSourceControlTextBranchHint}
        control={
          !hasServerTargets ? (
            <span className="text-sm text-muted-foreground">
              {t.settings.sourceControlWriting.connectEnvironmentSourceControlWriterHint}
            </span>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!usesDedicatedModel ? (
                <div className="flex flex-col items-end gap-1">
                  <SelectButton
                    size="settings"
                    disabled
                    aria-label={t.settings.rows.sourceControlWriterModel.title}
                  >
                    {mixedWriterModel
                      ? t.settings.general.mixed
                      : defaultModelSelection.model || t.settings.rows.textGenerationModel.empty}
                  </SelectButton>
                  <p className="text-secondary-copy-medium text-secondary-label">
                    {t.settings.sourceControlWriting.followsScopedTextGenerationModel}
                  </p>
                </div>
              ) : null}
              {usesDedicatedModel && !canEnableDedicatedModel ? (
                <span className="text-sm text-muted-foreground">
                  {t.settings.rows.textGenerationModel.empty}
                </span>
              ) : null}
              {usesDedicatedModel && canEnableDedicatedModel ? (
                <ProviderModelPicker
                  environmentId={environmentId}
                  activeInstanceId={activeSelection.instanceId}
                  model={activeSelection.model}
                  lockedProvider={null}
                  instanceEntries={instanceEntries}
                  modelOptionsByInstance={modelOptionsByInstance}
                  triggerClassName={SOURCE_CONTROL_MODEL_TRIGGER_CLASSNAME}
                  triggerAriaLabel={t.settings.rows.sourceControlWriterModel.title}
                  {...(mixedWriterModel ? { triggerLabel: t.settings.general.mixed } : {})}
                  {...(environmentId
                    ? {
                        onOpenProviderSetup: (instanceId: ProviderInstanceId) => {
                          void navigate({
                            to: "/settings/providers",
                            search: { environmentId, instanceId },
                          });
                        },
                      }
                    : {})}
                  getModelDisabledReason={writerModelDisabledReason}
                  onInstanceModelChange={(instanceId, model) => {
                    const reason = writerModelDisabledReason(instanceId, model);
                    if (reason) {
                      toastManager.add({
                        type: "error",
                        title: t.settings.sourceControlWriting.sourceControlWriterModelNotSaved,
                        description: reason,
                      });
                      return;
                    }
                    updateSettings({
                      sourceControlWriterModelSelection: createModelSelection(instanceId, model),
                    });
                  }}
                />
              ) : null}
              {usesDedicatedModel &&
              canEnableDedicatedModel &&
              !mixedWriterModel &&
              writerInstanceEntry ? (
                <TraitsPicker
                  provider={writerInstanceEntry.driverKind}
                  models={writerInstanceEntry.models}
                  model={activeSelection.model}
                  modelOptions={activeSelection.options ?? []}
                  allowPromptInjectedEffort={false}
                  planModeEnabled={
                    settings.planModeEnabled || selectsPlanAgent(activeSelection.options)
                  }
                  triggerClassName={SOURCE_CONTROL_MODEL_TRIGGER_CLASSNAME}
                  onModelOptionsChange={(options) =>
                    updateSettings({
                      sourceControlWriterModelSelection: createModelSelection(
                        activeSelection.instanceId,
                        activeSelection.model,
                        options,
                      ),
                    })
                  }
                />
              ) : null}
              <Switch
                checked={usesDedicatedModel}
                disabled={!usesDedicatedModel && !canEnableDedicatedModel}
                onCheckedChange={(checked) =>
                  updateSettings({
                    sourceControlWriterModelSelection: checked
                      ? createModelSelection(
                          defaultModelSelection.instanceId,
                          defaultModelSelection.model,
                          defaultModelSelection.options,
                        )
                      : null,
                  })
                }
                aria-label={t.settings.sourceControlWriting.separateSourceControlWriterModel}
              />
            </div>
          )
        }
      />

      <SettingsRow
        serverScoped
        settingKeys={["reviewGuidesEnabled"]}
        mixed={mixedReviewGuidesEnabled}
        {...searchableSetting("review-guides")}
        description={t.settings.reviewGuideUi.description}
        control={
          <Switch
            mixed={mixedReviewGuidesEnabled}
            checked={mixedReviewGuidesEnabled ? false : settings.reviewGuidesEnabled}
            onCheckedChange={(checked) => updateSettings({ reviewGuidesEnabled: Boolean(checked) })}
            aria-label={t.settings.reviewGuideUi.label}
          />
        }
      />

      {settings.reviewGuidesEnabled || mixedReviewGuidesEnabled ? (
        <>
          <SettingsRow
            serverScoped
            settingKeys={["reviewGuideModelSelection"]}
            {...searchableSetting("review-guide-model")}
            description={t.settings.reviewGuideUi.modelDescription}
            control={
              !hasServerTargets ? (
                <span className="text-sm text-muted-foreground">
                  {t.settings.reviewGuideUi.connectFirst}
                </span>
              ) : (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {(usesReviewGuideModel || mixedReviewGuideModel) && canEnableDedicatedModel ? (
                    <ProviderModelPicker
                      environmentId={environmentId}
                      activeInstanceId={reviewGuideSelection.instanceId}
                      model={reviewGuideSelection.model}
                      lockedProvider={null}
                      instanceEntries={instanceEntries}
                      modelOptionsByInstance={reviewGuideModelOptionsByInstance}
                      triggerClassName={SOURCE_CONTROL_MODEL_TRIGGER_CLASSNAME}
                      triggerAriaLabel={t.settings.reviewGuideUi.model}
                      {...(mixedReviewGuideModel
                        ? { triggerLabel: t.settings.reviewGuideUi.mixed }
                        : {})}
                      getModelDisabledReason={writerModelDisabledReason}
                      onInstanceModelChange={(instanceId, model) => {
                        const reason = writerModelDisabledReason(instanceId, model);
                        if (reason) {
                          toastManager.add({
                            type: "error",
                            title: t.settings.reviewGuideUi.saveFailed,
                            description: reason,
                          });
                          return;
                        }
                        updateSettings({
                          reviewGuideModelSelection: createModelSelection(instanceId, model),
                        });
                      }}
                    />
                  ) : null}
                  {usesReviewGuideModel &&
                  canEnableDedicatedModel &&
                  !mixedReviewGuideModel &&
                  reviewGuideInstanceEntry ? (
                    <TraitsPicker
                      provider={reviewGuideInstanceEntry.driverKind}
                      models={reviewGuideInstanceEntry.models}
                      model={reviewGuideSelection.model}
                      modelOptions={reviewGuideSelection.options ?? []}
                      allowPromptInjectedEffort={false}
                      planModeEnabled={
                        settings.planModeEnabled || selectsPlanAgent(reviewGuideSelection.options)
                      }
                      triggerClassName={SOURCE_CONTROL_MODEL_TRIGGER_CLASSNAME}
                      onModelOptionsChange={(options) =>
                        updateSettings({
                          reviewGuideModelSelection: createModelSelection(
                            reviewGuideSelection.instanceId,
                            reviewGuideSelection.model,
                            options,
                          ),
                        })
                      }
                    />
                  ) : null}
                  <Switch
                    mixed={mixedReviewGuideModel}
                    checked={mixedReviewGuideModel ? false : usesReviewGuideModel}
                    disabled={!usesReviewGuideModel && !canEnableDedicatedModel}
                    onCheckedChange={(checked) => {
                      if (!checked) {
                        updateSettings({ reviewGuideModelSelection: null });
                        return;
                      }
                      const reason = writerModelDisabledReason(
                        activeSelection.instanceId,
                        activeSelection.model,
                      );
                      if (reason) {
                        toastManager.add({
                          type: "error",
                          title: t.settings.reviewGuideUi.saveFailed,
                          description: reason,
                        });
                        return;
                      }
                      updateSettings({
                        reviewGuideModelSelection: createModelSelection(
                          activeSelection.instanceId,
                          activeSelection.model,
                          activeSelection.options,
                        ),
                      });
                    }}
                    aria-label={t.settings.reviewGuideUi.separate}
                  />
                </div>
              )
            }
          />

          <SettingsRow
            serverScoped
            settingKeys={["reviewGuideInstructions"]}
            {...searchableSetting("review-guide-instructions")}
            description={t.settings.reviewGuideUi.instructionsHint}
            resetAction={
              mixedReviewGuideInstructions || settings.reviewGuideInstructions !== "" ? (
                <SettingResetButton
                  label={t.settings.reviewGuideUi.instructionsReset}
                  onClick={() => updateSettings({ reviewGuideInstructions: "" })}
                />
              ) : null
            }
          >
            <div className="mt-3 max-w-2xl pb-3.5">
              <Textarea
                key={`${scopeKey}:${mixedReviewGuideInstructions}:${settings.reviewGuideInstructions}`}
                aria-label={t.settings.reviewGuideUi.instructions}
                onChange={() => {
                  reviewGuideInstructionsEdited.current = true;
                }}
                rows={4}
                defaultValue={mixedReviewGuideInstructions ? "" : settings.reviewGuideInstructions}
                placeholder={
                  mixedReviewGuideInstructions
                    ? t.settings.branchNaming.mixedEnterInstructionsApplyAllHint
                    : t.settings.reviewGuideUi.placeholder
                }
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (
                    reviewGuideInstructionsEdited.current &&
                    (mixedReviewGuideInstructions || value !== settings.reviewGuideInstructions)
                  )
                    updateSettings({ reviewGuideInstructions: value });
                  reviewGuideInstructionsEdited.current = false;
                }}
              />
            </div>
          </SettingsRow>
        </>
      ) : null}
    </SettingsSection>
  );
}
