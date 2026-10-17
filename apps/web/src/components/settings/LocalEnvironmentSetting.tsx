/** Configures local-agent availability through the existing desktop restart confirmation. */
import { t } from "~/i18n";
import { useState } from "react";

import { isLocalEnvironmentDisabled } from "../../localEnvironment";
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
import { Spinner } from "../ui/spinner";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

/** The picker reflects startup state; choosing a different value opens confirmation before the desktop relaunches. */
export function LocalEnvironmentSetting() {
  const setEnabled = window.desktopBridge?.setLocalEnvironmentEnabled;
  const [enabled] = useState(() => !isLocalEnvironmentDisabled());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!setEnabled) return null;

  const applyChange = async () => {
    setIsUpdating(true);
    setError(null);
    try {
      await setEnabled(!enabled);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t.settings.localEnvironmentSetting.couldnTChangeThisSetting,
      );
      setIsUpdating(false);
    }
  };

  return (
    <>
      <SettingsRow
        {...searchableSetting("local-environment")}
        control={
          <Select
            value={enabled ? "enabled" : "disabled"}
            onValueChange={(value) => {
              if (value !== null && (value === "enabled") !== enabled) setConfirmOpen(true);
            }}
          >
            <SelectTrigger
              size="settings"
              disabled={isUpdating}
              aria-label={t.settings.rows.localEnvironment.title}
              aria-description={
                enabled
                  ? t.settings.localEnvironmentSetting.runAgentsComputerTurnOffHint
                  : t.settings.localEnvironmentSetting.turnedOffAgentsRunRemoteHint
              }
            >
              <SelectValue>
                {enabled
                  ? t.settings.connections.groups.thisDevice
                  : t.settings.connections.status.off}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem value="enabled">{t.settings.connections.groups.thisDevice}</SelectItem>
              <SelectItem value="disabled">{t.settings.connections.status.off}</SelectItem>
            </SelectPopup>
          </Select>
        }
      />
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (isUpdating) return;
          setConfirmOpen(open);
          if (!open) setError(null);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {enabled
                ? t.settings.localEnvironmentSetting.turnOffLocalEnvironment
                : t.settings.localEnvironmentSetting.turnOnLocalEnvironment}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {enabled
                ? t.settings.localEnvironmentSetting.tCodeRestartWithoutRunningHint
                : t.settings.localEnvironmentSetting.tCodeRestartStartRunningHint}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <p className="px-6 pb-4 text-sm text-destructive">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogClose disabled={isUpdating} render={<Button variant="outline" />}>
              {t.settings.actions.cancel}
            </AlertDialogClose>
            <Button
              variant={enabled ? "destructive" : "default"}
              disabled={isUpdating}
              onClick={() => void applyChange()}
            >
              {isUpdating ? (
                <>
                  <Spinner size="sm" />
                  {t.settings.connections.endpoints.restarting}
                </>
              ) : enabled ? (
                t.settings.localEnvironmentSetting.restartAndTurnOff
              ) : (
                t.settings.localEnvironmentSetting.restartAndTurnOn
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
