/** Presents environment identity and controls; transport labels keep their existing route semantics. */
import { t } from "~/i18n";
import {
  type ConnectionTarget,
  connectionRouteId,
  connectionRouteLabel,
  connectionRoutes,
} from "@t3tools/client-runtime/connection";
import type { DesktopSshEnvironmentTarget, EnvironmentMachineKind } from "@t3tools/contracts";
import * as Option from "effect/Option";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import type { EnvironmentPresentation } from "~/state/environments";
import { isDesktopLocalConnectionTarget } from "~/connection/desktopLocal";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";

/** Formats an SSH target authority, including its optional user and port, without opening a connection. */
export function formatDesktopSshTarget(target: DesktopSshEnvironmentTarget): string {
  const authority = target.username ? `${target.username}@${target.hostname}` : target.hostname;
  return target.port ? `${authority}:${target.port}` : authority;
}

/**
 * How this client reaches a machine, printed first in every environment row so
 * T3 Connect, SSH, WSL, and plain remote links are told apart without a legend.
 * A machine with several routes names the one in use, or how many it has.
 */
export function environmentTransportLabel(
  environment: EnvironmentPresentation,
  activeTarget: ConnectionTarget | null = null,
): string {
  const { entry } = environment;
  if (entry.target._tag === "PrimaryConnectionTarget")
    return t.settings.rows.connectionsEnvironment.title;
  const routes = connectionRoutes(entry);
  if (routes.length > 1) {
    const active =
      activeTarget === null
        ? undefined
        : routes.find(
            (route) => connectionRouteId(route.target) === connectionRouteId(activeTarget),
          );
    return active === undefined
      ? connectionRouteLabel(routes[0]!)
      : t.settings.environmentRow.via(connectionRouteLabel(active));
  }
  if (environment.relayManaged) return "T3 Connect";
  if (isDesktopLocalConnectionTarget(entry.target)) return "WSL";
  if (
    entry.target._tag === "SshConnectionTarget" &&
    Option.isSome(entry.profile) &&
    entry.profile.value._tag === "SshConnectionProfile"
  ) {
    return `SSH ${formatDesktopSshTarget(entry.profile.value.target)}`;
  }
  return environment.displayUrl ?? t.settings.connections.pairing.remoteLink;
}

/**
 * One machine in a grouped settings list: icon, name, a single subtitle line,
 * and controls on the right. Every environment list on the Connections page
 * uses this so the lists share one rhythm.
 */
export function EnvironmentRow({
  kind,
  label,
  subtitle,
  status,
  below,
  detail,
  dimmed = false,
  className,
  children,
}: {
  readonly kind: EnvironmentMachineKind;
  readonly label: string;
  readonly subtitle: ReactNode;
  /** Connected status beside the name; absent for rows without a verified connection. */
  readonly status?: string | null;
  /** Extra content under the subtitle, such as update progress. */
  readonly below?: ReactNode;
  /** Expanded content under the whole row, aligned with the label, such as its routes. */
  readonly detail?: ReactNode;
  readonly dimmed?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}) {
  return (
    <div
      className={cn("connections-environment-row grid min-h-12", dimmed && "opacity-60", className)}
    >
      <span className="flex size-8 items-center justify-center rounded-connections-icon bg-connections-well shadow-connections-icon">
        <EnvironmentMachineIcon aria-hidden kind={kind} className="size-3.75" />
      </span>
      <div className="min-w-0 space-y-0.25">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-control font-semibold text-foreground">{label}</p>
          {status ? (
            <span className="flex h-5 shrink-0 items-center rounded-full bg-status-success px-2 text-meta font-semibold text-success-foreground text-shadow-none">
              {status}
            </span>
          ) : null}
        </div>
        <div className="truncate text-secondary-copy-medium text-secondary-label">{subtitle}</div>
        {below}
      </div>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
      {detail ? <div className="col-span-2 col-start-2 min-w-0">{detail}</div> : null}
    </div>
  );
}
