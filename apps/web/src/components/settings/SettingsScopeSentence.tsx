/** Presents environment and project scope pickers; axis helpers retain selection semantics. */
import { t } from "~/i18n";
import { resolveEnvironmentMachineKind } from "@t3tools/contracts";
import { useLocation } from "@tanstack/react-router";
import { CheckIcon, ChevronDownIcon, LayersIcon } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";

import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { useEnvironments, type EnvironmentPresentation } from "../../state/environments";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { ProjectFavicon } from "../ProjectFavicon";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxSearchInput,
  ComboboxTrigger,
} from "../ui/combobox";
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
  projectScopeMenuGroups,
  selectEnvironmentAxis,
  selectProjectAxis,
  settingsScopeEnvironmentAddress,
  settingsScopeEnvironmentLabel,
  settingsScopeEnvironmentLabels,
  settingsScopeProjectMachines,
} from "./settingsScopeAxis";

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
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0">{t.settings.scopeSentence.applying}</span>
        <ProjectScopeMenu {...props} />
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0">
          {scope.search.machine || scope.scope.kind === "checkout"
            ? t.settings.scopeSentence.on
            : t.settings.scopeSentence.across}
        </span>
        <EnvironmentScopeMenu {...props} />
      </span>
    </p>
  );
}

interface ScopeOption {
  value: string;
  label: string;
  secondary?: string;
  icon?: ReactNode;
  offline?: boolean;
}

/**
 * Distinguishes similarly named machines or projects using secondary identity and explicit offline state.
 * @param props.option Menu choice containing its primary label, optional secondary label/icon and offline flag.
 * @returns The shared label content for searchable and compact scope menus.
 */
function ScopeOptionLabel({ option }: { option: ScopeOption }) {
  return (
    <>
      {option.icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{option.label}</span>
        {option.secondary ? (
          <span className="block truncate text-xs text-muted-foreground">{option.secondary}</span>
        ) : null}
      </span>
      {option.offline ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {t.settings.scopeSentence.offline}
        </span>
      ) : null}
    </>
  );
}

/**
 * Uses a searchable picker for large scope lists while retaining the local compact trigger.
 * @param props.ariaLabel Accessible name of the scope axis.
 * @param props.icon Optional selected-choice icon.
 * @param props.label Display label for the current selection, including unavailable selections.
 * @param props.value Current scope identifier.
 * @param props.options Concrete selectable choices in display order.
 * @param props.allOption Optional all-targets choice; null omits it.
 * @param props.searchLabel Accessible search prompt for the expanded picker.
 * @param props.onChange Receives the selected identifier; navigation remains parent-owned.
 * @returns A controlled scope picker.
 */
function ScopeMenu({
  ariaLabel,
  icon,
  label,
  value,
  options,
  allOption,
  searchLabel,
  onChange,
}: {
  ariaLabel: string;
  icon: ReactNode;
  label: string;
  value: string;
  options: ScopeOption[];
  allOption: ScopeOption | null;
  searchLabel: string;
  onChange: (next: string) => void;
}) {
  const [query, setQuery] = useState("");
  const Trigger = options.length > 6 ? ComboboxTrigger : MenuTrigger;
  const trigger = (
    <Trigger
      aria-label={t.settings.scopeSentence.pickerAriaLabel(ariaLabel, label)}
      render={<button type="button" />}
      className={`inline-flex h-7.5 min-w-0 max-w-72 cursor-pointer items-center gap-1.25 rounded-full bg-settings-scope-control pr-2 ${icon ? "pl-2.5" : "pl-3"} text-secondary-copy-large leading-normal font-semibold text-foreground shadow-raise-tab outline-none hover:bg-accent focus-visible:inset-shadow-focus`}
    >
      {icon}
      <span className="min-w-0 truncate">{label}</span>
      <ChevronDownIcon aria-hidden className="size-3.25 shrink-0" />
    </Trigger>
  );
  const choices = allOption ? [allOption, ...options] : options;
  if (options.length > 6) {
    const needle = query.trim().toLowerCase();
    const filteredItems = choices.filter((option) =>
      `${option.label} ${option.secondary ?? ""} ${option.value}`.toLowerCase().includes(needle),
    );
    return (
      <Combobox
        items={choices}
        filteredItems={filteredItems}
        filter={null}
        autoHighlight
        itemToStringLabel={(option) => option.label}
        isItemEqualToValue={(a, b) => a.value === b.value}
        value={choices.find((option) => option.value === value) ?? null}
        onOpenChange={(open) => {
          if (!open) setQuery("");
        }}
        onValueChange={(option) => {
          if (option) onChange(option.value);
        }}
      >
        {trigger}
        <ComboboxPopup align="start" className="w-80">
          <ComboboxSearchInput
            aria-label={searchLabel}
            placeholder={searchLabel}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <ComboboxEmpty>No matches found.</ComboboxEmpty>
          <ComboboxList>
            {(option: ScopeOption) => (
              <ComboboxItem key={option.value} value={option}>
                <ScopeOptionLabel option={option} />
                {option.value === value ? (
                  <CheckIcon aria-hidden className="size-3.5 shrink-0" />
                ) : null}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxPopup>
      </Combobox>
    );
  }
  return (
    <Menu>
      {trigger}
      <MenuPopup align="start">
        <div className="w-72 max-w-full">
          <MenuRadioGroup
            value={value}
            onValueChange={(next) => {
              if (typeof next === "string") onChange(next);
            }}
          >
            {choices.map((option, index) => (
              <Fragment key={option.value}>
                <MenuRadioItem value={option.value} closeOnClick>
                  <span className="flex min-w-0 items-center gap-2">
                    <ScopeOptionLabel option={option} />
                    <MenuRadioItemIndicator />
                  </span>
                </MenuRadioItem>
                {index === 0 && allOption ? <MenuSeparator /> : null}
              </Fragment>
            ))}
          </MenuRadioGroup>
        </div>
      </MenuPopup>
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
  const project = groups.find((group) => group.projectKey === value.project);
  const memberEnvironmentIds = project
    ? new Set(project.memberProjects.map((member) => member.environmentId))
    : null;
  const options = memberEnvironmentIds
    ? environments.filter((environment) => memberEnvironmentIds.has(environment.environmentId))
    : environments;
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
      value={environmentValue}
      onChange={(next) => onChange(selectEnvironmentAxis(value, next))}
      searchLabel={t.settings.scopeSentence.searchEnvironments}
      allOption={
        singleEnvironment
          ? null
          : {
              value: ALL_ENVIRONMENTS_VALUE,
              label: t.settings.scopeSentence.allEnvironments,
              icon: <LayersIcon aria-hidden className="size-3.5 shrink-0" />,
            }
      }
      options={options.map((environment) => {
        const { primary, secondary } = settingsScopeEnvironmentLabels(environment, environments);
        return {
          value: environment.environmentId,
          label: primary,
          secondary:
            environments.length <= 1
              ? ""
              : secondary || settingsScopeEnvironmentAddress(environment),
          icon: (
            <EnvironmentMachineIcon
              aria-hidden
              kind={resolveEnvironmentMachineKind(environment.serverConfig)}
              className="size-3.5 shrink-0"
            />
          ),
          offline: environment.connection.phase !== "connected",
        };
      })}
    />
  );
}

/**
 * Restricts project choices to the selected machine and disambiguates equal names by checkout identity.
 * @param props.value Current machine/project/checkout search axes.
 * @param props.groups Available logical project groups.
 * @param props.environments Available machines used to label duplicate projects.
 * @param props.onChange Receives updated scope axes after selection.
 * @returns A project scope picker that preserves the environment constraint.
 */
function ProjectScopeMenu({ value, groups, environments, onChange }: SettingsScopeMenuProps) {
  const selected = groups.find((group) => group.projectKey === value.project);
  const projects = projectScopeMenuGroups(groups, value).map((group) => ({
    group,
    machines: settingsScopeProjectMachines(group, environments, true).join(", "),
  }));
  return (
    <ScopeMenu
      ariaLabel={t.settings.scopeSentence.projectAriaLabel}
      icon={selected ? <ProjectFavicon project={selected} className="size-3.5 shrink-0" /> : null}
      label={
        selected?.displayName ??
        (value.project
          ? t.settings.scopeSentence.unavailableProject
          : t.settings.scopeSentence.allProjects)
      }
      value={projectAxisValue(value)}
      onChange={(next) => onChange(selectProjectAxis(value, next))}
      searchLabel={t.settings.scopeSentence.searchProjects}
      allOption={{ value: ALL_PROJECTS_VALUE, label: t.settings.scopeSentence.allProjects }}
      options={projects.map(({ group, machines }) => {
        const sameName = projects.filter(
          (other) =>
            other.group.projectKey !== group.projectKey &&
            other.group.displayName === group.displayName,
        );
        return {
          value: group.projectKey,
          label: group.displayName,
          secondary:
            sameName.length === 0
              ? environments.length > 1
                ? group.workspaceRoot
                : ""
              : sameName.some((other) => other.machines === machines)
                ? `${machines} · ${group.workspaceRoot}`
                : machines,
          icon: <ProjectFavicon project={group} className="size-3.5 shrink-0" />,
        };
      })}
    />
  );
}
