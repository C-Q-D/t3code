/** Installs or removes the bundled desktop CLI launcher. */
import { t } from "~/i18n";
import { useState } from "react";

import {
  desktopCliCommandStateAtom,
  getDesktopCliCommandBridge,
  refreshDesktopCliCommandState,
} from "~/state/desktopCliCommand";
import { useEnvironmentQuery } from "~/state/query";
import { Button } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

/**
 * Uses the desktop bridge to install or remove the CLI shortcut and suppresses stale load results after unmount.
 * @returns Installation controls, or the existing unavailable state without a bridge; explicit actions report failures and are not retried here.
 */
export function CliCommandSettingsRow() {
  const bridge = getDesktopCliCommandBridge();
  const query = useEnvironmentQuery(bridge ? desktopCliCommandStateAtom : null);
  const state = query.data;
  const [pending, setPending] = useState(false);

  const change = (action: "install" | "uninstall") => {
    if (!bridge || pending) return;
    setPending(true);
    void bridge[action]()
      .then(refreshDesktopCliCommandState)
      .catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title:
              action === "install"
                ? t.settings.merge.cliInstallFailed
                : t.settings.merge.cliRemoveFailed,
            description: error instanceof Error ? error.message : t.settings.merge.cliFailure,
          }),
        );
      })
      .finally(() => setPending(false));
  };

  if (!bridge || !state?.supported) return null;
  const installed = state.installedPath !== null;
  const description = state.shadowedBy
    ? t.settings.merge.cliShadowed(state.shadowedBy)
    : !installed
      ? t.settings.merge.cliDescription
      : state.onPath
        ? t.settings.merge.cliInstalled(state.installedPath ?? "")
        : t.settings.merge.cliMissingPath(state.installedPath ?? "");

  return (
    <SettingsRow
      {...searchableSetting("cli-command")}
      description={description}
      control={
        <Button
          size="sm"
          variant="outline"
          disabled={pending || query.isPending}
          onClick={() => change(installed ? "uninstall" : "install")}
        >
          {installed ? t.settings.merge.cliRemove : t.settings.merge.cliInstall}
        </Button>
      }
    />
  );
}
