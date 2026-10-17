/** Scoped branch naming controls; drafts keep their existing blur-to-save behavior. */
import { t } from "~/i18n";
import { useRef } from "react";
import { BranchNamingMode, DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";

import { Input } from "../ui/input";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { Textarea } from "../ui/textarea";
import { SettingsRow, SettingResetButton } from "./settingsLayout";
import { useSettingsScope } from "./SettingsScopeContext";
import { searchableSetting } from "./settingsSearch";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "./useScopedSettings";

const MODES = t.settings.rows.worktreeBranchNaming.options;

/** Renders O4's three naming modes and the fields required by the selected mode. */
export function BranchNamingSettings() {
  const settings = useScopedSettings();
  const { targets } = useSettingsScope();
  const scopeKey = targets.map((target) => `${target.environmentId}:${target.projectId}`).join(",");
  const prefixEdited = useRef(false);
  const instructionsEdited = useRef(false);
  const updateSettings = useUpdateScopedSettings();
  const modeMixed = useScopedSettingsMixed(["branchNamingMode"]);
  const prefixMixed = useScopedSettingsMixed(["branchNamePrefix"]);
  const instructionsMixed = useScopedSettingsMixed(["branchNameInstructions"]);

  return (
    <>
      <SettingsRow
        serverScoped
        settingKeys={["branchNamingMode"]}
        {...searchableSetting("worktree-branch-naming")}
        aria-description={t.settings.branchNaming.worktreeBranchesNamedFirstMessageHint}
        resetAction={
          settings.branchNamingMode !== DEFAULT_SERVER_SETTINGS.branchNamingMode || modeMixed ? (
            <SettingResetButton
              label={t.settings.branchNaming.branchNaming}
              onClick={() =>
                updateSettings({ branchNamingMode: DEFAULT_SERVER_SETTINGS.branchNamingMode })
              }
            />
          ) : null
        }
        control={
          <ToggleGroup
            size="settings"
            value={modeMixed ? [] : [settings.branchNamingMode]}
            aria-label={t.settings.rows.worktreeBranchNaming.title}
            onValueChange={(values) => {
              const value = values[0];
              if (value === "static" || value === "semantic" || value === "custom") {
                updateSettings({ branchNamingMode: value });
              }
            }}
          >
            {BranchNamingMode.literals.map((mode) => (
              <ToggleGroupItem key={mode} value={mode}>
                {MODES[mode]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      />
      {!modeMixed && settings.branchNamingMode === "static" ? (
        <SettingsRow
          serverScoped
          settingKeys={["branchNamePrefix"]}
          title={t.settings.branchNaming.branchPrefix}
          description={t.settings.branchNaming.exampleTTProducesTHint}
          resetAction={
            prefixMixed ||
            settings.branchNamePrefix !== DEFAULT_SERVER_SETTINGS.branchNamePrefix ? (
              <SettingResetButton
                label={t.settings.branchNaming.prefixResetLabel}
                onClick={() =>
                  updateSettings({ branchNamePrefix: DEFAULT_SERVER_SETTINGS.branchNamePrefix })
                }
              />
            ) : null
          }
          control={
            <Input
              size="settings"
              key={`${scopeKey}:${prefixMixed}:${settings.branchNamePrefix}`}
              aria-label={t.settings.branchNaming.branchPrefix}
              autoCapitalize="none"
              spellCheck={false}
              onChange={() => {
                prefixEdited.current = true;
              }}
              placeholder={
                prefixMixed ? t.settings.general.mixed : t.settings.branchNaming.noPrefix
              }
              defaultValue={prefixMixed ? "" : settings.branchNamePrefix}
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (prefixEdited.current && (prefixMixed || value !== settings.branchNamePrefix))
                  updateSettings({ branchNamePrefix: value });
                prefixEdited.current = false;
              }}
            />
          }
        />
      ) : null}
      {!modeMixed && settings.branchNamingMode === "custom" ? (
        <SettingsRow
          serverScoped
          settingKeys={["branchNameInstructions"]}
          title={t.settings.branchNaming.branchNamingInstructions}
          description={t.settings.branchNaming.appendedNamingPromptModelReturnsHint}
          resetAction={
            instructionsMixed || settings.branchNameInstructions !== "" ? (
              <SettingResetButton
                label={t.settings.branchNaming.instructionsResetLabel}
                onClick={() => updateSettings({ branchNameInstructions: "" })}
              />
            ) : null
          }
        >
          <div className="mt-3 max-w-2xl pb-3.5">
            <Textarea
              key={`${scopeKey}:${instructionsMixed}:${settings.branchNameInstructions}`}
              aria-label={t.settings.branchNaming.branchNamingInstructions}
              onChange={() => {
                instructionsEdited.current = true;
              }}
              rows={4}
              defaultValue={instructionsMixed ? "" : settings.branchNameInstructions}
              placeholder={
                instructionsMixed
                  ? t.settings.branchNaming.mixedEnterInstructionsApplyAllHint
                  : t.settings.branchNaming.juliusFollowedIssueIdShortHint
              }
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (
                  instructionsEdited.current &&
                  (instructionsMixed || value !== settings.branchNameInstructions)
                )
                  updateSettings({ branchNameInstructions: value });
                instructionsEdited.current = false;
              }}
            />
          </div>
        </SettingsRow>
      ) : null}
    </>
  );
}
