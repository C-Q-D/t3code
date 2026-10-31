/** Manages usage hubs and Cursor usage for the selected environment; never substitutes example providers. */
import { t } from "~/i18n";
import type { EnvironmentId, UnifiedSettings } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { PlusIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { useUpdateEnvironmentSettings } from "../../hooks/useSettings";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { AddUsageLimitSourceDialog } from "./AddUsageLimitSourceDialog";
import { searchableSetting } from "./settingsSearch";
import { SettingsRow, SettingsSection } from "./settingsLayout";

export function UsageProviderSettings({
  environmentId,
  environmentLabel,
  sources,
  cursorKeychainUsageEnabled,
  readOnly,
  children,
}: {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly sources: UnifiedSettings["usageLimitSources"];
  readonly cursorKeychainUsageEnabled: boolean;
  readonly readOnly: boolean;
  /** Related usage rows, including the health interval, share this settings group. */
  readonly children?: ReactNode;
}) {
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  const updateCursorSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: t.settings.usageProvider.updateCursorAccountUsage,
  });
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const platform = useAtomValue(serverEnvironment.configValueAtom(environmentId))?.environment
    .platform;
  const [adding, setAdding] = useState(false);
  const [updatingCursor, setUpdatingCursor] = useState(false);
  const entries = Object.entries(sources);

  const setCursorUsageEnabled = async (enabled: boolean) => {
    setUpdatingCursor(true);
    const result = await updateCursorSettings({
      environmentId,
      input: { patch: { cursorKeychainUsageEnabled: enabled } },
    });
    if (result._tag === "Success") {
      await refreshProviders({ environmentId, input: {} });
    }
    setUpdatingCursor(false);
  };

  return (
    <>
      <SettingsSection title={t.settings.usageProvider.usageGroup}>
        <SettingsRow
          {...searchableSetting("usage-providers")}
          title={t.settings.usageProvider.providerRow}
          description={t.settings.usageProvider.cliProxy}
          control={
            !readOnly ? (
              <Button size="md" variant="outline" onClick={() => setAdding(true)}>
                <PlusIcon aria-hidden />
                {t.settings.usageProvider.addHub}
              </Button>
            ) : null
          }
        >
          <div className="mt-3 divide-y divide-border">
            {entries.length === 0 ? (
              <p className="py-2 text-secondary-copy text-muted-foreground">
                {t.settings.usageProvider.noHubsConfigured}
              </p>
            ) : (
              entries.map(([id, source]) => {
                const label = source.label?.trim() || source.url;
                return (
                  <div key={id} className="flex min-w-0 items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="break-all text-body text-foreground">{label}</p>
                      <p className="break-all text-secondary-copy text-muted-foreground">
                        {t.settings.usageProvider.cliProxy}
                        {source.enabled ? "" : t.settings.usageProvider.disabled}
                        {label !== source.url ? ` · ${source.url}` : ""}
                      </p>
                    </div>
                    {!readOnly ? (
                      <RemoveUsageProviderButton
                        label={label}
                        onConfirm={() => updateSettings({ usageLimitSources: { [id]: null } })}
                      />
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </SettingsRow>
        {platform?.os === "darwin" ? (
          <SettingsRow
            id="cursor-keychain-usage"
            title={t.settings.rows.cursorKeychainUsage.title}
            description={t.settings.usageProvider.readExistingCursorCliLoginHint}
            control={
              <Switch
                aria-label={t.settings.rows.cursorKeychainUsage.title}
                checked={cursorKeychainUsageEnabled}
                disabled={readOnly || updatingCursor}
                onCheckedChange={(enabled) => void setCursorUsageEnabled(enabled)}
              />
            }
          />
        ) : null}
        {children}
      </SettingsSection>
      {adding && !readOnly ? (
        <AddUsageLimitSourceDialog
          open
          onOpenChange={setAdding}
          environmentId={environmentId}
          environmentLabel={environmentLabel}
          sources={sources}
        />
      ) : null}
    </>
  );
}

function RemoveUsageProviderButton({
  label,
  onConfirm,
}: {
  readonly label: string;
  readonly onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="md" variant="ghost" onClick={() => setOpen(true)}>
        {t.settings.usageProvider.remove}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.settings.usageProvider.removeHubConfirmation(label)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.settings.usageProvider.hubSManagementKeyDeletedHint}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              {t.settings.actions.cancel}
            </AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {t.settings.usageProvider.removeHub}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
