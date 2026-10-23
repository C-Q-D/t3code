/** Renders model reasoning choices with shared pixel artwork. */
import { PixelThinkIcon } from "../icons/PixelLucideIcon";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { t } from "~/i18n";
import {
  getDescriptorStringValue,
  getTraitSelectChange,
  replaceDescriptorCurrentValue,
  REASONING_SELECT_DESCRIPTOR_IDS,
  ULTRATHINK_PROMPT_PREFIX,
} from "@t3tools/client-runtime/model-traits";
import {
  type ModelSelection,
  type ProviderDriverKind,
  type ProviderInstanceId,
  type ProviderOptionDescriptor,
  type ProviderOptionSelection,
  type ScopedThreadRef,
  type ServerProviderModel,
} from "@t3tools/contracts";
import {
  buildProviderOptionSelectionsFromDescriptors,
  getProviderOptionCurrentLabel,
  getProviderOptionCurrentValue,
  getProviderOptionDescriptors,
  isClaudeUltrathinkPrompt,
  normalizeModelSlug,
} from "@t3tools/shared/model";
import { memo } from "react";
import { MenuGroup, MenuPopup, MenuSeparator as MenuDivider, MenuTrigger } from "../ui/menu";
import { TraitsMenu as Menu } from "./TraitsMenu";
import { TraitSegments } from "./TraitSegments";
import { TraitSwitchRow } from "./TraitSwitchRow";
import { reasoningPaletteLevel } from "./reasoningPalette";
import { useComposerDraftStore, DraftId } from "../../composerDraftStore";
import { getProviderModelCapabilities } from "../../providerModels";
import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  ComposerControl,
  ComposerControlChevron,
  ComposerControlIcon,
  type ComposerControlSize,
} from "./ComposerControl";
import { useComposerMenuProps } from "./composerEventScope";
import { useComposerMenuState } from "./useComposerMenuState";

type ProviderOptions = ReadonlyArray<ProviderOptionSelection>;

/**
 * All the picker reads from the prompt while rendering. Passing this instead of
 * the prompt keeps the picker from re-rendering on every keystroke.
 */
export type PromptUltrathink = "none" | "prefix" | "body";

export function readPromptUltrathink(prompt: string): PromptUltrathink {
  if (!isClaudeUltrathinkPrompt(prompt)) return "none";
  return isClaudeUltrathinkPrompt(prompt.replace(/^Ultrathink:\s*/i, "")) ? "body" : "prefix";
}

const SAVED_OPTION_LABELS: Readonly<Record<string, string>> = {
  agent: t.composer.traits.agent,
  effort: t.composer.traits.effort,
  reasoningEffort: t.composer.traits.reasoningEffort,
  variant: t.composer.traits.reasoning,
};

/** Labels saved descriptor IDs when provider metadata is missing, retaining unknown custom IDs. */
function savedOptionLabel(id: string): string {
  return (
    SAVED_OPTION_LABELS[id] ??
    id.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (character) => character.toUpperCase())
  );
}

function buildUnavailableModelOptionDescriptors(
  selections: ProviderOptions | null | undefined,
): ReadonlyArray<ProviderOptionDescriptor> {
  return (selections ?? []).map((selection) =>
    typeof selection.value === "boolean"
      ? {
          id: selection.id,
          label: savedOptionLabel(selection.id),
          type: "boolean" as const,
          currentValue: selection.value,
        }
      : {
          id: selection.id,
          label: savedOptionLabel(selection.id),
          type: "select" as const,
          options: [{ id: selection.value, label: selection.value }],
          currentValue: selection.value,
        },
  );
}

type TraitsPersistence =
  | {
      threadRef?: ScopedThreadRef;
      draftId?: DraftId;
      onModelOptionsChange?: never;
    }
  | {
      threadRef?: undefined;
      onModelOptionsChange: (nextOptions: ProviderOptions | undefined) => void;
    };

/** Identifies the provider default without dispatching a new selection. */
function DefaultBadge() {
  return (
    <Badge variant="outline" size="sm" className="min-w-0">
      {t.composer.traits.default}
    </Badge>
  );
}

/** Derives capability-backed controls and prompt effort locks without writing to the draft. */
function getSelectedTraits(
  provider: ProviderDriverKind,
  models: ReadonlyArray<ServerProviderModel>,
  model: string | null | undefined,
  promptUltrathink: PromptUltrathink,
  modelOptions: ProviderOptions | null | undefined,
  allowPromptInjectedEffort: boolean,
  planModeEnabled: boolean,
) {
  const caps = getProviderModelCapabilities(models, model, provider, planModeEnabled);
  const modelIsUnavailable =
    provider === "opencode" &&
    !models.some((candidate) => candidate.slug === normalizeModelSlug(model, provider));
  const descriptors = modelIsUnavailable
    ? buildUnavailableModelOptionDescriptors(
        planModeEnabled
          ? modelOptions
          : modelOptions?.filter((option) => option.id !== "agent" || option.value !== "plan"),
      )
    : getProviderOptionDescriptors({
        caps,
        selections: modelOptions,
      });
  const selectDescriptors = descriptors.filter(
    (descriptor): descriptor is Extract<ProviderOptionDescriptor, { type: "select" }> =>
      descriptor.type === "select",
  );
  const booleanDescriptors = descriptors.filter(
    (descriptor): descriptor is Extract<ProviderOptionDescriptor, { type: "boolean" }> =>
      descriptor.type === "boolean",
  );
  const primarySelectDescriptor = selectDescriptors[0] ?? null;
  const contextWindowDescriptor =
    selectDescriptors.find((descriptor) => descriptor.id === "contextWindow") ?? null;
  const agentDescriptor = selectDescriptors.find((descriptor) => descriptor.id === "agent") ?? null;
  const fastModeDescriptor =
    booleanDescriptors.find((descriptor) => descriptor.id === "fastMode") ?? null;
  const thinkingDescriptor =
    booleanDescriptors.find((descriptor) => descriptor.id === "thinking") ?? null;

  const ultrathinkPromptControlled =
    allowPromptInjectedEffort &&
    (primarySelectDescriptor?.promptInjectedValues?.length ?? 0) > 0 &&
    promptUltrathink !== "none";
  const ultrathinkInBodyText = ultrathinkPromptControlled && promptUltrathink === "body";
  const effort =
    (ultrathinkPromptControlled
      ? "ultrathink"
      : getDescriptorStringValue(primarySelectDescriptor)) ?? null;
  const thinkingEnabled =
    typeof thinkingDescriptor?.currentValue === "boolean" ? thinkingDescriptor.currentValue : null;
  const contextWindow = getDescriptorStringValue(contextWindowDescriptor);
  const selectedAgent = getDescriptorStringValue(agentDescriptor);
  const selectedAgentLabel = agentDescriptor
    ? getProviderOptionCurrentLabel(agentDescriptor)
    : null;

  return {
    caps,
    descriptors,
    selectDescriptors,
    booleanDescriptors,
    primarySelectDescriptor,
    contextWindowDescriptor,
    agentDescriptor,
    fastModeDescriptor,
    thinkingDescriptor,
    effort,
    thinkingEnabled,
    contextWindow,
    ultrathinkPromptControlled,
    ultrathinkInBodyText,
    selectedAgent,
    selectedAgentLabel,
    modelIsUnavailable,
  };
}

/** Derives visible controls, including read-only saved options for unavailable OpenCode models. */
function getTraitsSectionVisibility(input: {
  provider: ProviderDriverKind;
  models: ReadonlyArray<ServerProviderModel>;
  model: string | null | undefined;
  promptUltrathink?: PromptUltrathink | undefined;
  modelOptions: ProviderOptions | null | undefined;
  allowPromptInjectedEffort?: boolean;
  planModeEnabled: boolean;
}) {
  const selected = getSelectedTraits(
    input.provider,
    input.models,
    input.model,
    input.promptUltrathink ?? "none",
    input.modelOptions,
    input.allowPromptInjectedEffort ?? true,
    input.planModeEnabled,
  );

  const showEffort = selected.primarySelectDescriptor !== null;
  const showThinking = selected.thinkingDescriptor !== null;
  const showFastMode = selected.fastModeDescriptor !== null;
  const showContextWindow = selected.contextWindowDescriptor !== null;
  const showAgent = selected.agentDescriptor !== null;

  return {
    ...selected,
    showEffort,
    showThinking,
    showFastMode,
    showContextWindow,
    showAgent,
    hasAnyControls:
      showEffort ||
      showThinking ||
      showFastMode ||
      showContextWindow ||
      showAgent ||
      (selected.modelIsUnavailable && selected.descriptors.length > 0),
  };
}

/**
 * `modelOptions` must already carry the composer's implicit defaults (see
 * `withImplicitFastModeDefault`) so the persisted selection matches what the
 * picker would write.
 */
export function getReasoningTraitStep(input: {
  provider: ProviderDriverKind;
  instanceId: ProviderInstanceId;
  model: string;
  models: ReadonlyArray<ServerProviderModel>;
  modelOptions: ProviderOptions | undefined;
  reportedModelSelection: ModelSelection | null | undefined;
  prompt: string;
  planModeEnabled: boolean;
  direction: 1 | -1;
}) {
  const selected = getSelectedTraits(
    input.provider,
    input.models,
    input.model,
    readPromptUltrathink(input.prompt),
    input.modelOptions,
    true,
    input.planModeEnabled,
  );
  if (selected.modelIsUnavailable || selected.ultrathinkInBodyText) return null;
  const descriptor = selected.selectDescriptors.find((entry) =>
    REASONING_SELECT_DESCRIPTOR_IDS.has(entry.id),
  );
  if (!descriptor || descriptor.options.length < 2) return null;
  const isPrimary = descriptor.id === selected.primarySelectDescriptor?.id;
  const current =
    isPrimary && selected.ultrathinkPromptControlled
      ? "ultrathink"
      : getDescriptorStringValue(
          descriptor,
          { instanceId: input.instanceId, model: input.model, options: input.modelOptions ?? [] },
          input.reportedModelSelection,
        );
  const ordered = input.direction > 0 ? descriptor.options : descriptor.options.toReversed();
  // A reported value outside the catalog, such as OpenCode's "default", steps
  // from the catalog default, or from the end when there is none.
  const position =
    [current, getDescriptorStringValue(descriptor)]
      .map((value) => ordered.findIndex((option) => option.id === value))
      .find((index) => index >= 0) ?? -1;
  for (const option of [
    ...ordered.slice(position + 1),
    ...ordered.slice(0, Math.max(position, 0)),
  ]) {
    const change = getTraitSelectChange(selected, descriptor, input.prompt, option.id);
    if (!change) return null;
    if ("modelOptions" in change) {
      return change.modelOptions
        ? { prompt: change.prompt, modelOptions: change.modelOptions }
        : null;
    }
    // A slash command refuses the Ultrathink prefix, so skip that level.
    if (change.prompt.startsWith(ULTRATHINK_PROMPT_PREFIX)) return change;
  }
  return null;
}

/** Returns whether this model has any available controls or saved read-only traits. */
export function shouldRenderTraitsControls(input: {
  provider: ProviderDriverKind;
  models: ReadonlyArray<ServerProviderModel>;
  model: string | null | undefined;
  promptUltrathink?: PromptUltrathink | undefined;
  modelOptions: ProviderOptions | null | undefined;
  allowPromptInjectedEffort?: boolean;
  planModeEnabled: boolean;
}): boolean {
  return getTraitsSectionVisibility(input).hasAnyControls;
}

/** Provider capabilities and current draft values; persistence targets are supplied separately. */
export interface TraitsMenuContentProps {
  provider: ProviderDriverKind;
  instanceId?: ProviderInstanceId;
  models: ReadonlyArray<ServerProviderModel>;
  model: string | null | undefined;
  promptUltrathink?: PromptUltrathink | undefined;
  /** Receives an edit of the live prompt; the picker never holds the prompt text itself. */
  onPromptEdit?: (edit: (prompt: string) => string) => void;
  modelOptions?: ProviderOptions | null | undefined;
  reportedModelSelection?: ModelSelection | null | undefined;
  allowPromptInjectedEffort?: boolean;
  planModeEnabled: boolean;
  triggerClassName?: string;
  isComposerOwned?: boolean;
}

/** Uses provider descriptors for every segment and switch, preserving prompt-injected effort rules. */
export const TraitsMenuContent = memo(function TraitsMenuContentImpl({
  provider,
  instanceId,
  models,
  model,
  promptUltrathink,
  onPromptEdit,
  modelOptions,
  reportedModelSelection,
  allowPromptInjectedEffort = true,
  planModeEnabled,
  ...persistence
}: TraitsMenuContentProps & TraitsPersistence) {
  const modelSelection =
    instanceId && model ? { instanceId, model, options: modelOptions ?? [] } : null;
  const setProviderModelOptions = useComposerDraftStore((store) => store.setProviderModelOptions);
  const updateModelOptions = (nextOptions: ProviderOptions | undefined) => {
    if ("onModelOptionsChange" in persistence) {
      persistence.onModelOptionsChange(nextOptions);
      return;
    }
    const threadTarget = persistence.threadRef ?? persistence.draftId;
    if (!threadTarget) {
      return;
    }
    setProviderModelOptions(threadTarget, provider, nextOptions, {
      ...(instanceId ? { instanceId } : {}),
      model,
      persistSticky: true,
    });
  };
  const selected = getTraitsSectionVisibility({
    provider,
    models,
    model,
    promptUltrathink,
    modelOptions,
    allowPromptInjectedEffort,
    planModeEnabled,
  });
  const {
    descriptors,
    selectDescriptors,
    booleanDescriptors,
    primarySelectDescriptor,
    ultrathinkPromptControlled,
    ultrathinkInBodyText,
    hasAnyControls,
    modelIsUnavailable,
  } = selected;
  const updateDescriptors = (nextDescriptors: ReadonlyArray<ProviderOptionDescriptor>) => {
    updateModelOptions(buildProviderOptionSelectionsFromDescriptors(nextDescriptors));
  };

  const handleSelectChange = (
    descriptor: Extract<ProviderOptionDescriptor, { type: "select" }>,
    value: string,
  ) => {
    // Whether a pick applies, and the options it writes, do not depend on the prompt text.
    const change = getTraitSelectChange(selected, descriptor, "", value);
    if (!change) return;
    onPromptEdit?.(
      (prompt) => getTraitSelectChange(selected, descriptor, prompt, value)?.prompt ?? prompt,
    );
    if ("modelOptions" in change) updateModelOptions(change.modelOptions);
  };

  if (!hasAnyControls) {
    return null;
  }

  if (modelIsUnavailable) {
    return (
      <div className="composer-traits-content">
        {descriptors.map((descriptor, index) => {
          const value = getProviderOptionCurrentLabel(
            descriptor,
            modelSelection,
            reportedModelSelection,
          );
          if (!value) return null;
          return (
            <div key={descriptor.id}>
              {index > 0 ? <MenuDivider /> : null}
              <MenuGroup>
                <div className="composer-trait-label">{descriptor.label}</div>
                <div className="px-1 text-secondary-copy text-placeholder">{value}</div>
              </MenuGroup>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="composer-traits-content">
      {selectDescriptors.map((descriptor) => {
        const selectedValue =
          ultrathinkPromptControlled && descriptor.id === primarySelectDescriptor?.id
            ? "ultrathink"
            : (getDescriptorStringValue(descriptor, modelSelection, reportedModelSelection) ?? "");
        const selectedOption = descriptor.options.find((option) => option.id === selectedValue);
        const visibleOptions = descriptor.options.filter(
          (option) => !descriptor.promptInjectedValues?.includes(option.id),
        );

        return (
          <div key={descriptor.id}>
            <MenuGroup>
              <div className="composer-trait-label">
                {descriptor.label}
                {selectedOption?.isDefault ? <DefaultBadge /> : null}
              </div>
              {ultrathinkInBodyText && descriptor.id === primarySelectDescriptor?.id ? (
                <div className="px-1 pb-1.5 text-secondary-copy text-secondary-label">
                  {t.composer.traits.ultrathinkBodyHint}
                </div>
              ) : null}
              {/* Keep menu semantics so arrow navigation and close-on-pick match the old rows. */}
              {visibleOptions.length > 0 ? (
                <TraitSegments
                  aria-label={descriptor.label}
                  className="composer-trait-segments"
                  value={selectedValue}
                  onValueChange={(value) => handleSelectChange(descriptor, value)}
                >
                  {visibleOptions.map((option, index) => (
                    <MenuPrimitive.RadioItem
                      key={option.id}
                      value={option.id}
                      className="composer-trait-segment"
                      data-reasoning-level={
                        descriptor.id === primarySelectDescriptor?.id
                          ? reasoningPaletteLevel(visibleOptions.length, index)
                          : undefined
                      }
                      title={
                        option.isDefault
                          ? `${t.composer.traits.default}${option.description ? ` · ${option.description}` : ""}`
                          : option.description
                      }
                      // The menu boundary delays dismissal only while physical feedback runs.
                      closeOnClick
                      disabled={
                        ultrathinkInBodyText && descriptor.id === primarySelectDescriptor?.id
                      }
                    >
                      <span className="composer-trait-reasoning-label min-w-0 max-w-full">
                        <span className="block truncate">{option.label}</span>
                      </span>
                    </MenuPrimitive.RadioItem>
                  ))}
                </TraitSegments>
              ) : null}
              {descriptor.options.map((option) =>
                descriptor.promptInjectedValues?.includes(option.id) ? (
                  <TraitSwitchRow
                    key={option.id}
                    label={option.label}
                    className="composer-trait-switch-row mt-2.25"
                    checked={selectedValue === option.id}
                    disabled={ultrathinkInBodyText && descriptor.id === primarySelectDescriptor?.id}
                    title={option.description}
                    closeOnClick
                    onCheckedChange={(checked) => {
                      if (checked) {
                        handleSelectChange(descriptor, option.id);
                      } else {
                        // Removing only our prefix restores the provider value already saved underneath.
                        onPromptChange(prompt.replace(/^Ultrathink:\s*/i, ""));
                      }
                    }}
                  />
                ) : null,
              )}
              {selectedOption?.description ? (
                <p className="composer-trait-description">{selectedOption.description}</p>
              ) : null}
            </MenuGroup>
          </div>
        );
      })}
      {booleanDescriptors.map((descriptor) =>
        descriptor.id === "fastMode" ? (
          <MenuGroup key={descriptor.id}>
            <div className="composer-trait-label">{descriptor.label}</div>
            <TraitSegments
              className="composer-trait-segments"
              aria-label={descriptor.label}
              fastMode
              value={descriptor.currentValue === true ? "on" : "off"}
              onValueChange={(value) =>
                updateDescriptors(
                  replaceDescriptorCurrentValue(descriptors, descriptor.id, value === "on"),
                )
              }
            >
              <MenuPrimitive.RadioItem
                value="on"
                data-fast-mode="on"
                className="composer-trait-segment"
                closeOnClick
              >
                <span>{t.composer.traits.fast}</span>
              </MenuPrimitive.RadioItem>
              <MenuPrimitive.RadioItem value="off" className="composer-trait-segment" closeOnClick>
                {t.composer.traits.normal}
              </MenuPrimitive.RadioItem>
            </TraitSegments>
          </MenuGroup>
        ) : (
          <TraitSwitchRow
            key={descriptor.id}
            label={descriptor.label}
            className="composer-trait-switch-row"
            checked={descriptor.currentValue === true}
            closeOnClick
            onCheckedChange={(checked) =>
              updateDescriptors(replaceDescriptorCurrentValue(descriptors, descriptor.id, checked))
            }
          />
        ),
      )}
    </div>
  );
});

/** Pair speed with reasoning while keeping other traits separated. */
export function buildTraitsTriggerDisplay(input: {
  provider: ProviderDriverKind;
  descriptors: ReadonlyArray<ProviderOptionDescriptor>;
  primarySelectDescriptorId: string | null;
  ultrathinkPromptControlled: boolean;
  modelSelection?: ModelSelection | null;
  reportedModelSelection?: ModelSelection | null | undefined;
}): { label: string } {
  let fastModeFallbackLabel: string | null = null;
  let speedLabel: string | null = null;
  let reasoningLabelIndex = -1;
  const labels: Array<string> = [];
  for (const descriptor of input.descriptors) {
    if (descriptor.id === "fastMode" && descriptor.type === "boolean") {
      speedLabel = descriptor.currentValue === true ? t.composer.traits.fast : null;
      fastModeFallbackLabel = speedLabel ?? t.composer.traits.normal;
      continue;
    }
    if (
      input.provider === "codex" &&
      descriptor.id === "serviceTier" &&
      descriptor.type === "select"
    ) {
      const currentValue = getProviderOptionCurrentValue(descriptor);
      const fastTier = descriptor.options.find(({ label }) => label === "Fast");
      const ultrafastTier = descriptor.options.find(({ label }) => label === "Ultrafast");
      if (
        ((fastTier || ultrafastTier) && currentValue === "default") ||
        (fastTier && currentValue === fastTier.id) ||
        (ultrafastTier && currentValue === ultrafastTier.id)
      ) {
        speedLabel =
          ultrafastTier && currentValue === ultrafastTier.id
            ? t.composer.traits.ultrafast
            : fastTier && currentValue === fastTier.id
              ? t.composer.traits.fast
              : null;
        fastModeFallbackLabel =
          descriptor.options.find(({ id }) => id === currentValue)?.label ??
          t.composer.traits.normal;
        continue;
      }
    }
    const label =
      input.ultrathinkPromptControlled && descriptor.id === input.primarySelectDescriptorId
        ? t.composer.traits.ultrathink
        : descriptor.type === "boolean"
          ? t.composer.traits.booleanLabel(descriptor.label, descriptor.currentValue === true)
          : getProviderOptionCurrentLabel(
              descriptor,
              input.modelSelection,
              input.reportedModelSelection,
            );
    if (typeof label === "string" && label.length > 0) {
      // Custom models retain descriptor order, so the primary select can be context.
      if (
        reasoningLabelIndex === -1 &&
        descriptor.type === "select" &&
        ["reasoningEffort", "reasoning", "effort", "variant", "thinking"].includes(descriptor.id)
      ) {
        reasoningLabelIndex = labels.length;
      }
      labels.push(label);
    }
  }

  // Only fall back to text when fast mode is genuinely the sole trait. Keying
  // off an empty label list alone would also catch descriptors that resolved to
  // no label at all, printing a bogus "Normal" for a model without fast mode.
  if (labels.length === 0 && fastModeFallbackLabel !== null) {
    return { label: fastModeFallbackLabel };
  }
  if (speedLabel) {
    if (reasoningLabelIndex >= 0) {
      labels[reasoningLabelIndex] = `${labels[reasoningLabelIndex]} ${speedLabel}`;
    } else {
      labels.push(speedLabel);
    }
  }
  return { label: labels.join(" · ") };
}

/** Opens provider traits on demand; the composer retains its existing trigger and submission state. */
export const TraitsPicker = memo(function TraitsPicker({
  provider,
  instanceId,
  models,
  model,
  promptUltrathink,
  onPromptEdit,
  modelOptions,
  reportedModelSelection,
  allowPromptInjectedEffort = true,
  planModeEnabled,
  triggerClassName,
  isComposerOwned,
  size = "sm",
  hidden = false,
  disabled = false,
  ...persistence
}: TraitsMenuContentProps &
  TraitsPersistence & {
    size?: ComposerControlSize;
    hidden?: boolean;
    disabled?: boolean;
  }) {
  const composerFloatingLayerProps = useComposerMenuProps();
  const [isMenuOpen, setIsMenuOpen] = useComposerMenuState(hidden || disabled);
  const { descriptors, primarySelectDescriptor, ultrathinkPromptControlled } =
    getTraitsSectionVisibility({
      provider,
      models,
      model,
      promptUltrathink,
      modelOptions,
      allowPromptInjectedEffort,
      planModeEnabled,
    });
  if (
    !shouldRenderTraitsControls({
      provider,
      models,
      model,
      promptUltrathink,
      modelOptions,
      allowPromptInjectedEffort,
      planModeEnabled,
    })
  ) {
    return null;
  }

  const { label: triggerLabel } = buildTraitsTriggerDisplay({
    provider,
    descriptors,
    primarySelectDescriptorId: primarySelectDescriptor?.id ?? null,
    ultrathinkPromptControlled,
    modelSelection: instanceId && model ? { instanceId, model, options: modelOptions ?? [] } : null,
    reportedModelSelection,
  });
  const isCodexStyle = provider === "codex";

  return (
    <Menu
      open={isMenuOpen}
      onOpenChange={(open) => {
        setIsMenuOpen(open && !disabled);
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={
                <ComposerControl
                  disabled={disabled}
                  aria-label={triggerLabel}
                  data-composer-shortcut={isComposerOwned ? "composer.effort" : undefined}
                  size={size}
                  className={cn(
                    isCodexStyle
                      ? "min-w-0 max-w-40 shrink justify-start overflow-hidden whitespace-nowrap sm:max-w-48"
                      : "shrink-0 whitespace-nowrap",
                    triggerClassName,
                  )}
                />
              }
            />
          }
        >
          {isCodexStyle ? (
            <span
              className={cn(
                "flex min-w-0 w-full items-center",
                size === "xs" ? "gap-1" : "gap-1.5",
              )}
            >
              <ComposerControlIcon icon={PixelThinkIcon} size={size} />
              <span data-composer-control-label className="min-w-0 truncate">
                {triggerLabel}
              </span>
              <ComposerControlChevron size={size} />
            </span>
          ) : (
            <>
              <ComposerControlIcon icon={PixelThinkIcon} size={size} />
              <span data-composer-control-label>{triggerLabel}</span>
              <ComposerControlChevron size={size} />
            </>
          )}
        </TooltipTrigger>
        <TooltipPopup side="top">{triggerLabel}</TooltipPopup>
      </Tooltip>
      <MenuPopup
        data-composer-traits-popup="true"
        align="start"
        {...(isComposerOwned ? composerFloatingLayerProps : {})}
      >
        <TraitsMenuContent
          provider={provider}
          {...(instanceId ? { instanceId } : {})}
          models={models}
          model={model}
          promptUltrathink={promptUltrathink}
          {...(onPromptEdit ? { onPromptEdit } : {})}
          modelOptions={modelOptions}
          reportedModelSelection={reportedModelSelection}
          allowPromptInjectedEffort={allowPromptInjectedEffort}
          planModeEnabled={planModeEnabled}
          {...persistence}
        />
      </MenuPopup>
    </Menu>
  );
});
