/** Displays permissions for the authenticated connection without changing session grants. */
import { type AuthGrantScope, type EnvironmentId, sessionGrantsScope } from "@t3tools/contracts";
import { AUTH_SCOPE_OPTIONS } from "@t3tools/shared/authScopeOptions";
import { t } from "~/i18n";
import { useEnvironmentSessionState } from "~/state/session";

/** Localized presentation for the shared scope list; wire scope identifiers remain unchanged. */
export const authScopeMessages = {
  "orchestration:read": t.settings.connections.scopes.orchestrationRead,
  "orchestration:operate": t.settings.connections.scopes.orchestrationOperate,
  "settings:write": t.settings.connections.scopes.settingsWrite,
  "providers:manage": t.settings.connections.scopes.providersManage,
  "environment:maintain": t.settings.connections.scopes.environmentMaintain,
  "preview:operate": t.settings.connections.scopes.previewOperate,
  "diagnostics:read": t.settings.connections.scopes.diagnosticsRead,
  "terminal:read": t.settings.connections.scopes.terminalRead,
  "terminal:operate": t.settings.connections.scopes.terminalOperate,
  "source-control:write": t.settings.connections.scopes.sourceControlWrite,
  "filesystem:read": t.settings.connections.scopes.filesystemRead,
  "filesystem:write": t.settings.connections.scopes.filesystemWrite,
  "access:read": t.settings.connections.scopes.accessRead,
  "access:write": t.settings.connections.scopes.accessWrite,
  "relay:read": t.settings.connections.scopes.relayRead,
  "relay:write": t.settings.connections.scopes.relayWrite,
} satisfies Record<AuthGrantScope, { readonly title: string; readonly description: string }>;

/** Shows grants for an environment and explains whether they belong to the active route. */
export function SessionPermissions({
  environmentId,
  connected,
  routeContext = false,
}: {
  readonly environmentId: EnvironmentId;
  readonly connected: boolean;
  readonly routeContext?: boolean;
}) {
  const session = useEnvironmentSessionState(environmentId);
  return connected && !session.hasError && !session.isPending && session.data?.authenticated ? (
    <div className="space-y-3 py-3 text-xs">
      <p className="text-muted-foreground">
        {routeContext
          ? t.settings.merge.activeRoutePermissions
          : t.settings.merge.currentConnectionPermissions}
      </p>
      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {AUTH_SCOPE_OPTIONS.map(({ scope }) => (
          <li key={scope} className="flex items-start justify-between gap-3">
            <span>{authScopeMessages[scope].title}</span>
            <span className="shrink-0 text-muted-foreground">
              {sessionGrantsScope(session.data!, scope)
                ? t.settings.merge.permissionAllowed
                : t.settings.merge.permissionNotGranted}
            </span>
          </li>
        ))}
      </ul>
    </div>
  ) : (
    <p className="py-3 text-xs text-muted-foreground">{t.settings.merge.permissionsNotChecked}</p>
  );
}
