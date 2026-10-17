/** Presents project scope guidance and explicit target changes without broadening writes automatically. */
import { t } from "~/i18n";
import { Button } from "../ui/button";
import { Alert, AlertAction, AlertDescription } from "../ui/alert";
import { SettingsPageContainer } from "./settingsLayout";
import { useSettingsScope } from "./SettingsScopeContext";
import { useEnvironments } from "../../state/environments";
import type { SettingsScopeSearch } from "./settingsScope";
import { useSettingsProjectGroups } from "./useSettingsProjectGroups";
import { useLocation, useNavigate } from "@tanstack/react-router";
import type { EnvironmentId } from "@t3tools/contracts";
import { InfoIcon } from "lucide-react";
import { SETTINGS_DEVICE_ONLY_PATHS } from "./SettingsScopeSentence";

/** Shows the actual selected project's name; device-only pages have no project-scoped writes. */
export function SettingsProjectScopeNotice() {
  const { scope } = useSettingsScope();
  const pathname = useLocation({ select: (location) => location.pathname });
  if (
    SETTINGS_DEVICE_ONLY_PATHS.has(pathname) ||
    (scope.kind !== "project" && scope.kind !== "checkout")
  )
    return null;
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-compact-row bg-update-surface px-3.5 py-2.25 text-secondary-copy-medium leading-normal text-update-foreground text-shadow-none"
    >
      <InfoIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <p>{t.settings.scopeNotice.projectChanges(scope.group.displayName)}</p>
    </div>
  );
}

/** Offer an explicit target change when a category has no settings at this scope. */
export function SettingsScopeNotice({
  children,
  target,
  targetId,
  eligibleEnvironmentIds,
}: {
  children: string;
  target: "environment" | "all" | "project" | "checkout";
  targetId?: string;
  eligibleEnvironmentIds?: readonly EnvironmentId[];
}) {
  const { selectScope, search } = useSettingsScope();
  const navigate = useNavigate({ from: "/settings" });
  const pathname = useLocation({ select: (location) => location.pathname });
  const { environments } = useEnvironments();
  const groups = useSettingsProjectGroups();
  const choices: { label: string; search: SettingsScopeSearch }[] =
    target === "checkout"
      ? groups
          .filter((group) => !search.project || group.projectKey === search.project)
          .flatMap((group) =>
            group.memberProjects.map((member) => ({
              label: t.settings.scopeNotice.checkoutLabel(
                group.displayName,
                member.environmentLabel ?? t.settings.scopeNotice.environment,
                member.workspaceRoot,
              ),
              search: {
                project: group.projectKey,
                machine: member.environmentId,
                checkout: member.physicalProjectKey,
              },
            })),
          )
      : target === "project"
        ? groups.map((group) => ({
            label: group.displayName,
            search: { project: group.projectKey },
          }))
        : target === "environment"
          ? environments
              .filter(
                (entry) =>
                  eligibleEnvironmentIds === undefined ||
                  eligibleEnvironmentIds.includes(entry.environmentId),
              )
              .map((entry) => ({
                label: environments.some(
                  (other) =>
                    other.environmentId !== entry.environmentId && other.label === entry.label,
                )
                  ? t.settings.scopeNotice.environmentLabel(
                      entry.label,
                      entry.displayUrl || entry.environmentId,
                    )
                  : entry.label,
                search: { machine: entry.environmentId },
              }))
          : [{ label: t.settings.scopeNotice.openAllEnvironments, search: {} }];
  return (
    <SettingsPageContainer>
      <Alert role="status">
        <AlertDescription>
          <p>{children}</p>
          <AlertAction className="flex-wrap">
            {choices.map((choice) => (
              <Button
                key={JSON.stringify(choice.search)}
                size="sm-multiline"
                variant="outline"
                className="max-w-full break-all text-left"
                onClick={() => {
                  if (targetId)
                    void navigate({ to: pathname, search: () => choice.search, hash: targetId });
                  else selectScope(choice.search);
                }}
              >
                {choice.label}
              </Button>
            ))}
          </AlertAction>
        </AlertDescription>
      </Alert>
    </SettingsPageContainer>
  );
}
