/** Presents per-environment pull request sharing permissions; the overview switch never grants access. */
import { t } from "~/i18n";
import { useAtomValue } from "@effect/atom-react";
import { resolveEnvironmentMachineKind } from "@t3tools/contracts";
import {
  pullRequestRoutingConnectionKey,
  pullRequestRoutingPermissionFor,
  type PullRequestRoutingPermission,
} from "@t3tools/client-runtime/connection";
import { useState } from "react";

import { environmentCatalog } from "~/connection/catalog";
import type { EnvironmentPresentation } from "~/state/environments";
import { useAtomCommand } from "~/state/use-atom-command";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { toastManager } from "../ui/toast";
import { EnvironmentRow, EnvironmentTransportLabel } from "./EnvironmentRow";
import { SettingsRow } from "./settingsLayout";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { searchableSetting } from "./settingsSearch";

const options: ReadonlyArray<{ value: PullRequestRoutingPermission; label: string }> = [
  { value: "off", label: t.settings.connections.status.off },
  { value: "read", label: t.settings.gitHubRouting.readPrs },
  { value: "read-write", label: t.settings.gitHubRouting.readAndAct },
];

const summaryLabels = {
  "read-write": t.settings.gitHubRouting.readAndActAriaLabel,
  read: t.settings.gitHubRouting.readPrsAriaLabel,
};

/**
 * Summarizes sharing machines by permission, preserving their order within each group.
 * Null when nothing is shared.
 */
export function summarizePullRequestRouting(
  entries: ReadonlyArray<{
    readonly label: string;
    readonly permission: PullRequestRoutingPermission;
  }>,
): string | null {
  const groups = (["read-write", "read"] as const).flatMap((permission) => {
    const labels = entries.filter((entry) => entry.permission === permission);
    return labels.length === 0
      ? []
      : [`${labels.map((entry) => entry.label).join(", ")} ${summaryLabels[permission]}`];
  });
  return groups.length === 0 ? null : groups.join(" · ");
}

/**
 * Shows P2's sharing overview and the existing per-machine permission controls.
 * environments contains enabled machines; fewer than two hides the row as before.
 * The disabled overview is display-only because there is no global sharing permission.
 * Catalog readiness, unsupported routes, saving guards and command error reporting stay authoritative.
 */
export function PullRequestRoutingSettings({
  environments,
}: {
  readonly environments: ReadonlyArray<EnvironmentPresentation>;
}) {
  const permissions = useAtomValue(environmentCatalog.pullRequestRoutingPermissionsValueAtom);
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const update = useAtomCommand(environmentCatalog.setPullRequestRoutingPermission);
  const [saving, setSaving] = useState(false);

  if (environments.length < 2) return null;

  const { id, title } = searchableSetting("pull-request-routing");
  const summary = summarizePullRequestRouting(
    environments.map((environment) => ({
      label: environment.label,
      permission: pullRequestRoutingPermissionFor(environment.entry, permissions),
    })),
  );
  return (
    <SettingsRow
      id={id}
      title={title}
      status={summary ?? t.settings.connections.status.off}
      control={
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                tabIndex={0}
                className="inline-flex rounded-full outline-none focus-visible:inset-shadow-focus"
              />
            }
          >
            <Switch checked={summary !== null} disabled aria-label={title} />
          </TooltipTrigger>
          <TooltipPopup side="top">
            {t.settings.connections.groups.sharingOverviewHint}
          </TooltipPopup>
        </Tooltip>
      }
    >
      <p className="text-secondary-copy-medium text-secondary-label">
        {t.settings.gitHubRouting.machinesTrustReadPrDataHint}
      </p>
      <div className="space-y-0.5">
        {environments.map((environment) => (
          <EnvironmentRow
            key={environment.environmentId}
            kind={resolveEnvironmentMachineKind(environment.serverConfig)}
            label={environment.label}
            subtitle={<EnvironmentTransportLabel environment={environment} />}
          >
            <Select
              items={options}
              value={pullRequestRoutingPermissionFor(environment.entry, permissions)}
              disabled={
                !catalog.isReady ||
                saving ||
                pullRequestRoutingConnectionKey(environment.entry) === null
              }
              onValueChange={(permission) => {
                if (permission === null) return;
                setSaving(true);
                void update({ environmentId: environment.environmentId, permission }).then(
                  (result) => {
                    setSaving(false);
                    if (result._tag === "Failure")
                      toastManager.add({
                        type: "error",
                        title: t.settings.gitHubRouting.saveGitHubRoutingPermissionError,
                      });
                  },
                );
              }}
            >
              <SelectTrigger
                size="settings"
                aria-label={t.settings.gitHubRouting.gitHubRouting(environment.label)}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {options.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </EnvironmentRow>
        ))}
      </div>
    </SettingsRow>
  );
}
