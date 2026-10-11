/** Presents permission status and the actions required to grant missing permissions. */
import { t } from "~/i18n";
import { CircleCheckIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "../ui/button";

export interface PermissionItem {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  granted: boolean;
  onAllow: () => void;
}

/** Renders the supplied permission entries and their request actions; busy disables concurrent requests. */
export function PermissionChecklist({
  permissions,
  busy = false,
}: {
  permissions: readonly PermissionItem[];
  busy?: boolean;
}) {
  return (
    <div className="space-y-2">
      {permissions.map((permission) => (
        <div key={permission.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
          {permission.icon}
          <div className="min-w-0 flex-1">
            <p className="font-medium">{permission.title}</p>
            <p className="text-xs text-muted-foreground">{permission.description}</p>
          </div>
          {permission.granted ? (
            <span role="status" className="flex items-center gap-1 text-xs text-success">
              <CircleCheckIcon className="size-4" aria-hidden="true" />
              {t.app.permissions.allowed}
            </span>
          ) : (
            <Button size="xs" variant="outline" disabled={busy} onClick={permission.onAllow}>
              {t.app.permissions.allow}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Renders a continue action, disabled unless ready and not busy; children override the default label and remaining props configure the button. */
export function PermissionContinueButton({
  ready,
  busy = false,
  children = t.app.actions.continue,
  ...props
}: Omit<ComponentProps<typeof Button>, "disabled"> & { ready: boolean; busy?: boolean }) {
  return (
    <Button {...props} disabled={!ready || busy}>
      {children}
    </Button>
  );
}
