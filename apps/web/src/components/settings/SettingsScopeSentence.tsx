/** Presents environment and project scope pickers; axis helpers retain selection semantics. */
import { t } from "~/i18n";
import { resolveEnvironmentMachineKind } from "@t3tools/contracts";
import { useLocation } from "@tanstack/react-router";
import { ChevronDownIcon, LayersIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { useEnvironments, type EnvironmentPresentation } from "../../state/environments";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { ProjectFavicon } from "../ProjectFavicon";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { useOptionalSettingsScope } from "./SettingsScopeContext";
import { resolveSettingsScope, type SettingsScopeSearch } from "./settingsScope";
import {
  ALL_ENVIRONMENTS_VALUE,
  ALL_PROJECTS_VALUE,
  environmentAxisValue,
  projectAxisValue,
  selectEnvironmentAxis,
  selectProjectAxis,
  settingsScopeEnvironmentLabel,
} from "./settingsScopeAxis";

/** Pages whose every row is saved on this client; they have no scope to pick. */
export const SETTINGS_DEVICE_ONLY_PATHS: ReadonlySet<string> = new Set([
  "/settings/appearance",
  "/settings/snap-shot",
  "/settings/connections",
]);

/** Current axis values, available choices, and the existing scope-selection action. */
interface SettingsScopeMenuProps {
  readonly value: SettingsScopeSearch;
  readonly groups: readonly SidebarProjectSnapshot[];
  readonly environments: readonly EnvironmentPresentation[];
  readonly singleEnvironment: boolean;
  readonly onChange: (next: SettingsScopeSearch) => void;
}

/**
 * "Applies to <environment> in <project>" at the top of a settings page.
 * The two pickers are the targets a change is written to. A project is
 * the same project on every environment, so the environment alone decides
 * where a project override is written.
 */
export function SettingsScopeSentence() {
  const scope = useOptionalSettingsScope();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { environments } = useEnvironments();
  if (scope === null || SETTINGS_DEVICE_ONLY_PATHS.has(pathname)) return null;
  const props: SettingsScopeMenuProps = {
    value: scope.search,
    singleEnvironment: scope.singleEnvironment,
    groups: scope.groups,
    environments,
    onChange: scope.selectScope,
  };
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-2 text-control leading-normal text-code-foreground">
      {/* Keep each connective with its picker when a narrow page wraps the sentence. */}
      <span className="flex min-w-0 items-center gap-2">
        <span className="shrink-0">{t.settings.scopeSentence.applying}</span>
        <EnvironmentScopeMenu {...props} />
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="shrink-0">{t.settings.scopeSentence.within}</span>
        <ProjectScopeMenu {...props} />
      </span>
    </p>
  );
}

/** Renders an axis picker labelled by ariaLabel/label, with its existing radio choices as children. */
function ScopeMenu({
  ariaLabel,
  icon,
  label,
  children,
}: {
  ariaLabel: string;
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <Menu>
      <MenuTrigger
        aria-label={t.settings.scopeSentence.pickerAriaLabel(ariaLabel, label)}
        render={<button type="button" />}
        className={`inline-flex h-7.5 min-w-0 max-w-72 cursor-pointer items-center gap-1.25 rounded-full bg-settings-scope-control pr-2 ${icon ? "pl-2.5" : "pl-3"} text-secondary-copy-large leading-normal font-semibold text-foreground shadow-raise-tab outline-none hover:bg-accent focus-visible:inset-shadow-focus`}
      >
        {icon}
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDownIcon aria-hidden className="size-3.25 shrink-0" />
      </MenuTrigger>
      <MenuPopup align="start">{children}</MenuPopup>
    </Menu>
  );
}

/** Lists environment choices from props; selection still runs selectEnvironmentAxis, including checkout handling. */
function EnvironmentScopeMenu({
  value,
  groups,
  environments,
  onChange,
  singleEnvironment,
}: SettingsScopeMenuProps) {
  const resolved = resolveSettingsScope(value, groups, environments);
  const environmentValue = environmentAxisValue(
    value,
    resolved.kind === "checkout" ? resolved.environmentId : null,
  );
  const selected = environments.find(
    (environment) => environment.environmentId === environmentValue,
  );
  return (
    <ScopeMenu
      ariaLabel={t.settings.scopeSentence.environmentAriaLabel}
      icon={
        selected ? (
          <EnvironmentMachineIcon
            aria-hidden
            kind={resolveEnvironmentMachineKind(selected.serverConfig)}
            className="size-3.5 shrink-0"
          />
        ) : null
      }
      label={
        selected
          ? settingsScopeEnvironmentLabel(selected, environments)
          : environmentValue !== ALL_ENVIRONMENTS_VALUE
            ? t.settings.scopeSentence.unavailableEnvironment
            : singleEnvironment
              ? t.settings.scopeSentence.noEnvironments
              : t.settings.scopeSentence.allEnvironments
      }
    >
      <MenuRadioGroup
        value={environmentValue}
        onValueChange={(next) => {
          if (typeof next === "string") onChange(selectEnvironmentAxis(value, next));
        }}
      >
        {!singleEnvironment ? (
          <>
            <MenuRadioItem value={ALL_ENVIRONMENTS_VALUE} closeOnClick>
              <span className="flex min-w-0 items-center gap-2">
                <LayersIcon aria-hidden className="size-3.5" />
                <span className="min-w-0 flex-1 truncate">
                  {t.settings.scopeSentence.allEnvironments}
                </span>
                <MenuRadioItemIndicator />
              </span>
            </MenuRadioItem>
            <MenuSeparator />
          </>
        ) : null}
        {environments.map((environment) => (
          <MenuRadioItem
            key={environment.environmentId}
            value={environment.environmentId}
            closeOnClick
          >
            <span className="flex min-w-0 items-center gap-2">
              <EnvironmentMachineIcon
                aria-hidden
                kind={resolveEnvironmentMachineKind(environment.serverConfig)}
                className="size-3.5"
              />
              <span className="min-w-0 flex-1 truncate">
                {settingsScopeEnvironmentLabel(environment, environments)}
              </span>
              {environment.connection.phase === "connected" ? null : (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t.settings.scopeSentence.offline}
                </span>
              )}
              <MenuRadioItemIndicator />
            </span>
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </ScopeMenu>
  );
}

/** Lists real project groups and the all-projects choice; forwards axis changes through onChange. */
function ProjectScopeMenu({ value, groups, onChange }: SettingsScopeMenuProps) {
  const selected = groups.find((group) => group.projectKey === value.project);
  return (
    <ScopeMenu
      ariaLabel={t.settings.scopeSentence.projectAriaLabel}
      icon={selected ? <ProjectFavicon project={selected} className="size-4 shrink-0" /> : null}
      label={
        selected?.displayName ??
        (value.project
          ? t.settings.scopeSentence.unavailableProject
          : t.settings.scopeSentence.allProjects)
      }
    >
      <MenuRadioGroup
        value={projectAxisValue(value)}
        onValueChange={(next) => {
          if (typeof next === "string") onChange(selectProjectAxis(value, next));
        }}
      >
        <MenuRadioItem value={ALL_PROJECTS_VALUE} closeOnClick>
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{t.settings.scopeSentence.allProjects}</span>
            <MenuRadioItemIndicator />
          </span>
        </MenuRadioItem>
        <MenuSeparator />
        {groups.map((group) => (
          <MenuRadioItem key={group.projectKey} value={group.projectKey} closeOnClick>
            <span className="flex min-w-0 items-center gap-2">
              <ProjectFavicon project={group} className="size-3.5" />
              <span className="min-w-0 flex-1 truncate">{group.displayName}</span>
              <MenuRadioItemIndicator />
            </span>
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </ScopeMenu>
  );
}
