/** Edits destination environment rewrite settings through the existing scoped settings writer. */
import { AuthProvidersManageScope, type ReplyRewriteSettingsPatch } from "@t3tools/contracts";
import { useState } from "react";
import { t } from "~/i18n";
import { useEnvironmentsWithScope } from "~/state/session";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { SettingsSection, SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { useSettingsScope } from "./SettingsScopeContext";
import {
  useScopedSettings,
  useScopedSettingsWriteAllowed,
  useUpdateScopedSettings,
} from "./useScopedSettings";

const TEXT_FIELDS = ["binaryPath", "provider", "modelId", "thinkingLevel"] as const;

export function ReplyRewriteSettings() {
  const { scope, targets } = useSettingsScope();
  if (scope.kind === "project" || scope.kind === "checkout") return null;
  return (
    <ReplyRewriteSettingsEditor key={targets.map((target) => target.environmentId).join(",")} />
  );
}

function ReplyRewriteSettingsEditor() {
  const settings = useScopedSettings((settings) => settings.replyRewrite);
  const { connectedEnvironments, targets } = useSettingsScope();
  const updateSettings = useUpdateScopedSettings();
  const settingsAllowed = useScopedSettingsWriteAllowed();
  const providerGrants = useEnvironmentsWithScope(connectedEnvironments, AuthProvidersManageScope);
  const binaryAllowed =
    connectedEnvironments.length > 0 &&
    connectedEnvironments.every((environment) => providerGrants.has(environment.environmentId));
  const [draft, setDraft] = useState<{ text: string; base: readonly string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const promptValues = targets.map((target) => target.settings.replyRewrite.customPrompt);
  const promptMixed = promptValues.some((value) => value !== promptValues[0]);
  const autoMixed = targets.some((target) => target.settings.replyRewrite.auto !== settings.auto);
  const tierMixed = targets.some(
    (target) => target.settings.replyRewrite.requestedServiceTier !== settings.requestedServiceTier,
  );
  const conflict =
    draft !== null && draft.base.some((value, index) => value !== promptValues[index]);
  const save = async (patch: ReplyRewriteSettingsPatch) => {
    setSaving(true);
    setSaved(false);
    let failed = false;
    try {
      await updateSettings(
        { replyRewrite: patch },
        {
          onFailed: () => {
            failed = true;
          },
        },
      );
      if (!failed) {
        setDraft(null);
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  };
  return (
    <SettingsSection id="reply-rewrite" title={t.settings.replyRewrite.title}>
      <SettingsRow
        serverScoped
        settingKeys={["replyRewrite"]}
        mixed={autoMixed}
        {...searchableSetting("reply-rewrite-auto")}
        description={t.settings.replyRewrite.description}
        control={
          <Switch
            mixed={autoMixed}
            checked={autoMixed ? false : settings.auto}
            disabled={!settingsAllowed}
            aria-label={t.settings.replyRewrite.auto}
            onCheckedChange={(auto) => updateSettings({ replyRewrite: { auto: Boolean(auto) } })}
          />
        }
      />
      {TEXT_FIELDS.map((field) => {
        const values = targets.map((target) => target.settings.replyRewrite[field]);
        const mixed = values.some((value) => value !== values[0]);
        const allowed = field === "binaryPath" ? binaryAllowed : settingsAllowed;
        return (
          <SettingsRow
            key={field}
            mixed={mixed}
            {...searchableSetting(`reply-rewrite-${field}`)}
            description={
              field === "binaryPath" ? t.settings.replyRewrite.binaryPermission : undefined
            }
            control={
              <div className="w-64 max-w-full">
                <Input
                  key={`${field}:${values.join("\u0000")}`}
                  size="sm"
                  aria-label={t.settings.replyRewrite.fields[field]}
                  disabled={!allowed}
                  defaultValue={mixed ? "" : settings[field]}
                  placeholder={mixed ? t.settings.replyRewrite.mixed : undefined}
                  onBlur={(event) => {
                    const value = event.target.value.trim();
                    if (!value) {
                      event.target.value = mixed ? "" : settings[field];
                      toastManager.add({
                        type: "warning",
                        title: t.settings.replyRewrite.required,
                      });
                      return;
                    }
                    if (value && (mixed || value !== settings[field]))
                      updateSettings({ replyRewrite: { [field]: value } });
                  }}
                />
              </div>
            }
          />
        );
      })}
      <SettingsRow
        serverScoped
        settingKeys={["replyRewrite"]}
        {...searchableSetting("reply-rewrite-tier")}
        mixed={tierMixed}
        description={t.settings.replyRewrite.tierDescription}
        control={
          <Select
            value={tierMixed ? null : settings.requestedServiceTier}
            onValueChange={(value) => {
              if (value === "priority" || value === "default")
                updateSettings({ replyRewrite: { requestedServiceTier: value } });
            }}
          >
            <SelectTrigger size="sm" aria-label={t.settings.replyRewrite.tier}>
              <SelectValue placeholder={t.settings.replyRewrite.mixed} />
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="priority">priority</SelectItem>
              <SelectItem value="default">default</SelectItem>
            </SelectPopup>
          </Select>
        }
      />
      <SettingsRow
        serverScoped
        settingKeys={["replyRewrite"]}
        {...searchableSetting("reply-rewrite-prompt")}
        mixed={promptMixed}
        description={t.settings.replyRewrite.promptDescription}
      >
        <div className="mt-3 max-w-2xl space-y-2 pb-3.5">
          <Textarea
            rows={6}
            aria-label={t.settings.replyRewrite.prompt}
            disabled={!settingsAllowed || saving}
            value={draft?.text ?? (promptMixed ? "" : settings.customPrompt)}
            placeholder={
              promptMixed ? t.settings.replyRewrite.mixed : t.settings.replyRewrite.defaultPrompt
            }
            onChange={(event) => {
              setSaved(false);
              setDraft({ text: event.target.value, base: draft?.base ?? promptValues });
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={!settingsAllowed || saving || !draft || conflict}
              onClick={() => void save({ customPrompt: draft?.text ?? "" })}
            >
              {t.settings.replyRewrite.save}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!settingsAllowed || saving}
              onClick={() => void save({ customPrompt: "" })}
            >
              {t.settings.replyRewrite.reset}
            </Button>
            {draft ? (
              <Button size="sm" variant="ghost" disabled={saving} onClick={() => setDraft(null)}>
                {t.settings.replyRewrite.reload}
              </Button>
            ) : null}
          </div>
          <p role="status" className="text-xs text-muted-foreground">
            {conflict
              ? t.settings.replyRewrite.conflict
              : saving
                ? t.settings.replyRewrite.saving
                : saved
                  ? t.settings.replyRewrite.saved
                  : ""}
          </p>
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}
