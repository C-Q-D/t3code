/** Localized device UI and interactions; preserves user data, commands, and protocol values. */
import { t } from "~/i18n";
import type { ReactNode } from "react";
import type { DeviceToolVersions as ToolVersions } from "@t3tools/contracts";
import { InlineButton } from "~/components/ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "~/components/ui/popover";

/**
 * Renders installed and required tool versions, filtering with labels from the active dictionary.
 * @param props View data, control flags, and callbacks defined by the component props type; optional fields retain their declared defaults.
 * @returns Rendered UI for the supplied props.
 */
export function DeviceToolVersions({
  tools,
  action,
  kind,
  owner,
  error,
}: {
  tools: ToolVersions | undefined;
  action?: ReactNode;
  kind?: keyof ToolVersions;
  owner?: string | undefined;
  error?: string | undefined;
}) {
  const selected = kind ? tools?.[kind] : undefined;
  const version =
    selected?.runningVersion ??
    (selected?.installedVersions.includes(selected.requiredVersion)
      ? selected.requiredVersion
      : selected?.installedVersions
          .toSorted((a, b) => a.localeCompare(b, undefined, { numeric: true }))
          .at(-1));
  const label = kind === "hub" ? t.tools.device.hub : t.tools.device.agentDevice;
  return (
    <Popover>
      <PopoverTrigger
        aria-label={
          kind ? t.tools.device.versionDetails(label, version, selected !== undefined) : undefined
        }
        render={<InlineButton tone="muted" />}
      >
        {kind
          ? version
            ? `v${version}`
            : selected
              ? t.tools.device.notInstalled
              : t.tools.device.versionUnknown
          : error
            ? t.tools.device.versionsUnavailable
            : t.tools.device.versions}
      </PopoverTrigger>
      <PopoverPopup align="end" width="md">
        <PopoverTitle>{kind ? label : t.tools.device.tools}</PopoverTitle>
        {tools ? (
          <div className="mt-4 divide-y divide-border/50">
            {(
              [
                [t.tools.device.hub, tools.hub],
                [t.tools.device.agentDevice, tools.agent],
              ] as const
            )
              .filter(([name]) => !kind || name === label)
              .map(([name, tool]) => (
                <div key={name} className="space-y-2 py-3 first:pt-0 last:pb-0">
                  {!kind ? <p className="text-xs font-medium">{name}</p> : null}
                  <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">{t.tools.device.running}</dt>
                    <dd className="text-right font-mono">
                      {tool.runningVersion ?? t.tools.device.notRunning}
                    </dd>
                    <dt className="text-muted-foreground">{t.tools.device.required}</dt>
                    <dd className="text-right font-mono">{tool.requiredVersion}</dd>
                    <dt className="text-muted-foreground">{t.tools.device.installed}</dt>
                    <dd className="text-right font-mono break-words">
                      {tool.installedVersions.join(", ") || t.tools.device.none}
                    </dd>
                  </dl>
                </div>
              ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">{t.tools.device.versionsUnchecked}</p>
        )}
        <p className="mt-4 border-t border-border/50 pt-3 text-xs text-muted-foreground">
          {owner ? t.tools.device.managedBy(owner) : ""}
          {t.tools.device.automaticUpdates}
        </p>
        {error ? (
          <p role="status" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </PopoverPopup>
    </Popover>
  );
}
