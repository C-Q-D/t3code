/** Owns pull request list filters on the web pull-request surface; host data and agent context remain unchanged. */
import { t } from "~/i18n";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Spinner } from "~/components/ui/spinner";
import type {
  EnvironmentId,
  ProjectId,
  PullRequestFilterOptionsInput,
  PullRequestInvolvement,
  PullRequestListFilters,
  PullRequestListState,
  SourceControlProviderKind,
} from "@t3tools/contracts";
import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleSlashIcon,
  CircleXIcon,
  ChevronDownIcon,
  EyeOffIcon,
  FolderGit2Icon,
  LayersIcon,
  SearchIcon,
} from "lucide-react";
import { type ElementType, type ReactNode, useState } from "react";

import { getSourceControlPresentationForKind } from "~/sourceControlPresentation";
import { useDebouncedValue } from "~/state/queries";
import { type EnvironmentQueryTarget, usePullRequestFilterOptions } from "~/state/pullRequests";
import { ProjectFavicon, type ProjectFaviconProject } from "../ProjectFavicon";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { Well } from "../ui/well";
import { cn } from "~/lib/utils";

import {
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuTrigger,
} from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  pullRequestAuthorChoices,
  selectedPullRequestAuthor,
  pullRequestLabelChoices,
  pullRequestLabelColor,
  type PullRequestAuthorFacet,
  type PullRequestLabelFacet,
} from "./pullRequestList.logic";
import { PullRequestActorAvatar } from "./pullRequestPresentation";
import { PullRequestGlyph } from "./pullRequestIcons";

export interface PullRequestFilterOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
  readonly Icon: ElementType<{ className?: string }>;
  readonly project?: ProjectFaviconProject;
  readonly unavailable?: string | undefined;
}

/** Project filters retain their favicon; non-project options use their supplied semantic icon. */
function PullRequestFilterOptionIcon<Value extends string>({
  option,
}: {
  option: PullRequestFilterOption<Value>;
}) {
  return option.project ? (
    <ProjectFavicon project={option.project} className="size-3.5" />
  ) : (
    <option.Icon aria-hidden className="size-3.5" />
  );
}

export interface PullRequestExpectedHost {
  readonly host: string;
  readonly kind: SourceControlProviderKind;
}

export function pullRequestHostLabel(
  entries: ReadonlyArray<{ readonly host: string; readonly kind: SourceControlProviderKind }>,
  entry: { readonly host: string; readonly kind: SourceControlProviderKind },
): string {
  const sharing = entries.filter((candidate) => candidate.kind === entry.kind);
  return sharing.length > 1
    ? entry.host
    : getSourceControlPresentationForKind(entry.kind).providerName;
}

/**
 * Renders pull request search input from the supplied display data and callbacks.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface.
 */
export function PullRequestSearchInput({
  value,
  busy,
  onChange,
  onSubmit,
}: {
  value: string;
  busy?: boolean;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="group/pr-search relative min-w-0 flex-1">
      <Well tone="input" radius="pill" depth="control" className="flex min-w-0 items-center">
        <span className="ml-3.5 flex shrink-0 items-center text-muted-foreground">
          {busy ? <Spinner aria-hidden /> : <SearchIcon aria-hidden className="size-3.75" />}
        </span>
        <input
          className="pr-list-search h-9.5 min-w-0 flex-1 rounded-full bg-transparent pl-2 pr-3.5 text-control text-foreground outline-none placeholder:text-placeholder"
          type="search"
          value={draft ?? value}
          onFocus={() => setDraft(value)}
          onBlur={() => setDraft(null)}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            onChange(event.currentTarget.value);
            if ((event.nativeEvent as InputEvent).inputType === "insertFromPaste") {
              onSubmit(event.currentTarget.value);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              onSubmit(event.currentTarget.value);
            }
          }}
          placeholder={t.git.pullRequest.searchPullRequestsOrLabelBug}
          aria-label={t.git.pullRequest.searchPullRequests}
        />
      </Well>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full group-focus-within/pr-search:inset-shadow-focus"
      />
    </div>
  );
}

/** Radio sentinel for the unscoped project; actual projects use composite environment/id keys. */
const ALL_PROJECTS_VALUE = "all";
const ALL_HOSTS_VALUE = "";
const ALL_SERVERS_VALUE = "";
const UNFILTERED_VALUE = "all";
/** Project ids are unique only within an environment. */
export const pullRequestProjectKey = (project: {
  readonly id: ProjectId;
  readonly environmentId: EnvironmentId;
}) => JSON.stringify([project.environmentId, project.id]);

const DRAFT_OPTIONS = [
  { value: UNFILTERED_VALUE, label: t.git.pullRequest.all, Icon: LayersIcon },
  { value: "only", label: t.git.pullRequest.draftsOnly, Icon: PullRequestGlyph.draft },
  { value: "hide", label: t.git.pullRequest.hideDrafts, Icon: EyeOffIcon },
] as const satisfies ReadonlyArray<PullRequestFilterOption<string>>;

const REVIEW_OPTIONS = [
  { value: UNFILTERED_VALUE, label: t.git.pullRequest.all, Icon: LayersIcon },
  { value: "approved", label: t.git.pullRequest.approved, Icon: CircleCheckIcon },
  { value: "changes-requested", label: t.git.pullRequest.changesRequested, Icon: CircleXIcon },
  { value: "review-required", label: t.git.pullRequest.reviewRequired, Icon: CircleDashedIcon },
  { value: "none", label: t.git.pullRequest.noReviews, Icon: CircleSlashIcon },
] as const satisfies ReadonlyArray<PullRequestFilterOption<string>>;

const CHECKS_OPTIONS = [
  { value: UNFILTERED_VALUE, label: t.git.pullRequest.all, Icon: LayersIcon },
  { value: "passing", label: t.git.pullRequest.passing, Icon: CircleCheckIcon },
  { value: "failing", label: t.git.pullRequest.failing, Icon: CircleXIcon },
] as const satisfies ReadonlyArray<PullRequestFilterOption<string>>;

/** L6 gives these three feature popups narrower surfaces and 30px rows. */
const SUPPLEMENT_POPUP_WIDTHS = { draft: "w-30", review: "w-32.5", checks: "w-27.5" };
type SupplementPopup = keyof typeof SUPPLEMENT_POPUP_WIDTHS;

/**
 * Renders pull request filter radio group from the supplied display data and callbacks.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface.
 */
function PullRequestFilterRadioGroup<Value extends string>({
  label,
  value,
  options,
  onChange,
  supplement,
}: {
  label: string;
  value: Value;
  options: ReadonlyArray<PullRequestFilterOption<Value>>;
  onChange: (value: Value) => void;
  supplement?: SupplementPopup | undefined;
}) {
  return (
    <MenuRadioGroup
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        if (next !== value) onChange(next as Value);
      }}
    >
      <div className={supplement ? "flex flex-col gap-px" : undefined}>
        {options.map((option) => {
          if (supplement) {
            return (
              <MenuPrimitive.RadioItem
                key={option.value}
                value={option.value}
                className="flex h-7.5 shrink-0 cursor-pointer items-center gap-1.5 rounded-menu-row px-2.25 text-secondary-copy-large text-foreground outline-none data-checked:bg-accent data-highlighted:bg-accent focus-visible:inset-shadow-focus"
              >
                {supplement === "checks" && option.value !== UNFILTERED_VALUE ? (
                  <option.Icon aria-hidden className="size-3.25 shrink-0" />
                ) : null}
                <span className="truncate">{option.label}</span>
              </MenuPrimitive.RadioItem>
            );
          }
          // A host the server has already said it cannot read is not a choice here: offering
          // it would answer the press by replacing a working list with that failure.
          const item = (
            <MenuRadioItem
              density="compact"
              key={option.value}
              value={option.value}
              className={option.unavailable ? "data-disabled:pointer-events-auto" : undefined}
              disabled={option.unavailable !== undefined}
            >
              <span className="flex min-w-0 items-center gap-2">
                {option.project ? <PullRequestFilterOptionIcon option={option} /> : null}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.unavailable ? (
                  <span className="shrink-0">{t.git.pullRequest.unavailable}</span>
                ) : null}
                <MenuRadioItemIndicator />
              </span>
            </MenuRadioItem>
          );
          if (!option.unavailable) return item;
          return (
            <Tooltip key={option.value}>
              <TooltipTrigger render={item} />
              <TooltipPopup side="top">{option.unavailable}</TooltipPopup>
            </Tooltip>
          );
        })}
      </div>
    </MenuRadioGroup>
  );
}

/**
 * A 26px list filter chip; Base UI supplies menu state, keyboard navigation and dismissal.
 * @param props The filter label, active narrowing and trigger contents.
 * @returns A trigger sized for the PR list's wrapping filter bar.
 */
function PullRequestFilterTrigger({
  label,
  active,
  sorting = false,
  children,
}: {
  label: string;
  active: boolean;
  sorting?: boolean;
  children?: ReactNode;
}) {
  return (
    <MenuTrigger
      aria-label={label}
      render={<button type="button" />}
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-0.75 rounded-full pl-2.5 pr-1.5 text-secondary-copy outline-none focus-visible:inset-shadow-focus data-popup-open:bg-pr-filter-open hover:bg-accent",
        sorting ? "h-7 bg-transparent text-secondary-label" : "h-6.5",
        !sorting && active
          ? "bg-accent font-semibold text-foreground inset-shadow-selected-control"
          : !sorting && "bg-pr-filter-idle text-code-foreground shadow-pr-filter-idle",
      )}
    >
      <span className="truncate">{children ?? label}</span>
      <ChevronDownIcon aria-hidden className="size-3 shrink-0" />
    </MenuTrigger>
  );
}

const EMPTY_SUPPLEMENTARY_OPTIONS: ReadonlyArray<string> = [];

/**
 * Opens one list narrowing directly from the filter bar, without changing its stored value.
 * @param props Current value, supported choices and the existing update callback; valueOnly labels sorting by its selected choice.
 * @returns A filter chip and a radio menu, retaining unavailable-option explanations.
 */
export function PullRequestFilterSelect<Value extends string>({
  label,
  value,
  options,
  onChange,
  onOpenChange,
  valueOnly = false,
  supplementaryOptions = EMPTY_SUPPLEMENTARY_OPTIONS,
  supplement,
}: {
  label: string;
  value: Value;
  options: ReadonlyArray<PullRequestFilterOption<Value>>;
  onChange: (value: Value) => void;
  onOpenChange?: ((open: boolean) => void) | undefined;
  valueOnly?: boolean;
  /** Board choices absent from the filter contract remain visible but cannot issue a request. */
  supplementaryOptions?: ReadonlyArray<string>;
  /** L6 supplementary filters have their own feature geometry. */
  supplement?: SupplementPopup;
}) {
  const current = options.find((option) => option.value === value) ?? options[0];
  if (!current) return null;
  const choices = (
    <PullRequestFilterRadioGroup
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      supplement={supplement}
    />
  );
  return (
    <Menu onOpenChange={onOpenChange}>
      <PullRequestFilterTrigger
        label={t.git.pullRequest.filterValue(label, current.label)}
        active={!valueOnly && value !== "all" && value !== ""}
        sorting={valueOnly}
      >
        {valueOnly ? (
          <span className="flex items-center gap-1.25">
            <current.Icon aria-hidden className="size-3.25" />
            {current.label}
          </span>
        ) : value !== "all" && value !== "" ? (
          t.git.pullRequest.filterValue(label, current.label)
        ) : (
          label
        )}
      </PullRequestFilterTrigger>
      {supplement ? (
        <MenuPrimitive.Portal>
          <MenuPrimitive.Positioner align="start" side="bottom" sideOffset={4} className="z-130">
            <MenuPrimitive.Popup
              className={cn(
                "dropdown-glass pr-popup flex max-h-96 max-w-full flex-col gap-px overflow-y-auto rounded-pr-list-popup p-1.5 outline-none",
                SUPPLEMENT_POPUP_WIDTHS[supplement],
              )}
            >
              {choices}
            </MenuPrimitive.Popup>
          </MenuPrimitive.Positioner>
        </MenuPrimitive.Portal>
      ) : (
        <MenuPopup align="start" side="bottom" className={valueOnly ? "w-40" : "w-42.5"}>
          {choices}
          {supplementaryOptions.map((option) => (
            <MenuItem key={option} density="compact" disabled>
              {option}
            </MenuItem>
          ))}
        </MenuPopup>
      )}
    </Menu>
  );
}

/**
 * Renders pull request author filter from the supplied display data and callbacks.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface.
 */
/** The listing's own scope, which the pickers search the host within. */
export type PullRequestFilterOptionScope = EnvironmentQueryTarget<
  Omit<PullRequestFilterOptionsInput, "kind" | "query">
>;

const OPTION_SEARCH_DEBOUNCE_MS = 250;

/** Debounces host searches and hides answers for an older query until the current query settles. */
function useHostedFilterOptions(
  scope: ReadonlyArray<PullRequestFilterOptionScope>,
  kind: PullRequestFilterOptionsInput["kind"],
  query: string,
) {
  const typed = query.trim().slice(0, 100);
  const sent = useDebouncedValue(typed, OPTION_SEARCH_DEBOUNCE_MS);
  const hosted = usePullRequestFilterOptions(
    scope.map(({ environmentId, input }) => ({
      environmentId,
      input: { ...input, kind, ...(sent ? { query: sent } : {}) },
    })),
  );
  // Until the search catches up with the typing, the host's answers are for older text.
  return sent === typed ? hosted : { labels: [], authors: [], error: null, isPending: true };
}

/** Keeps the independent author chip while searching both loaded rows and the selected host scopes. */
function PullRequestAuthorFilter({
  value,
  options,
  scope,
  onChange,
  onOpenChange,
}: {
  onOpenChange?: ((open: boolean) => void) | undefined;
  value: string | undefined;
  options: ReadonlyArray<PullRequestAuthorFacet>;
  scope: ReadonlyArray<PullRequestFilterOptionScope>;
  onChange: (author: string | undefined) => void;
}) {
  const [query, setQuery] = useState("");
  const hosted = useHostedFilterOptions(scope, "authors", query);
  const login = value?.toLowerCase() ?? "";
  const selected = selectedPullRequestAuthor(options, hosted.authors, value);
  const visible = [
    ...(selected ? [selected] : []),
    ...pullRequestAuthorChoices(options, hosted.authors, query).filter(
      (option) => option.actor.login.toLowerCase() !== login,
    ),
  ].slice(0, 30);
  const select = (next: string) => next.toLowerCase() !== login && onChange(next || undefined);
  return (
    <Menu onOpenChange={onOpenChange}>
      <PullRequestFilterTrigger label={t.git.pullRequest.author} active={value !== undefined}>
        {value
          ? t.git.pullRequest.filterValue(t.git.pullRequest.author, value)
          : t.git.pullRequest.author}
      </PullRequestFilterTrigger>
      <MenuPopup align="start" side="bottom">
        <div className="p-1 pb-2">
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              autoFocus
              size="compact"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown" && event.key !== "Escape") event.stopPropagation();
              }}
              placeholder={t.git.pullRequest.searchAuthors}
              aria-label={t.git.pullRequest.searchAuthors}
            />
          </InputGroup>
        </div>
        <MenuRadioGroup value={selected?.actor.login ?? value ?? ""} onValueChange={select}>
          <MenuRadioItem density="compact" value="">
            <span className="flex min-w-0 items-center gap-2">
              <LayersIcon aria-hidden className="size-3.5" />
              {t.git.pullRequest.anyone}
            </span>
          </MenuRadioItem>
          {visible.map((option) => (
            <MenuRadioItem
              density="compact"
              key={option.actor.login.toLowerCase()}
              value={option.actor.login}
            >
              <span className="flex min-w-0 items-center gap-2">
                <PullRequestActorAvatar actor={option.actor} />
                <span className="min-w-0 flex-1 truncate">{option.actor.login}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {option.mergedCount}
                  {t.git.pullRequest.mergesLoaded}
                </span>
              </span>
            </MenuRadioItem>
          ))}
          {visible.length === 0 && !hosted.isPending ? (
            <MenuItem disabled>
              {hosted.error
                ? "Couldn't search authors on the host"
                : t.git.pullRequest.noAuthorsFound}
            </MenuItem>
          ) : null}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}

/**
 * Renders pull request label filter from the supplied display data and callbacks.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface.
 */
function PullRequestLabelFilter({
  value,
  options,
  scope,
  onChange,
  onOpenChange,
}: {
  onOpenChange?: ((open: boolean) => void) | undefined;
  value: ReadonlyArray<string>;
  options: ReadonlyArray<PullRequestLabelFacet>;
  scope: ReadonlyArray<PullRequestFilterOptionScope>;
  onChange: (labels: ReadonlyArray<string>) => void;
}) {
  const [query, setQuery] = useState("");
  const hosted = useHostedFilterOptions(scope, "labels", query);
  const selected = new Set(value.map((name) => name.toLowerCase()));
  const choices = pullRequestLabelChoices(options, hosted.labels, query);
  const visible = [
    ...value
      .filter((name) => !choices.some((option) => option.name.toLowerCase() === name.toLowerCase()))
      .map((name) => ({ name, color: null, count: 0 })),
    ...choices,
  ];
  return (
    <Menu onOpenChange={onOpenChange}>
      <PullRequestFilterTrigger label={t.git.pullRequest.labels} active={value.length > 0}>
        {value.length > 0
          ? t.git.pullRequest.filterValue(
              t.git.pullRequest.labels,
              t.git.pullRequest.selectedLabels(value.length),
            )
          : t.git.pullRequest.labels}
      </PullRequestFilterTrigger>
      <MenuPopup align="start" side="bottom">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            autoFocus
            size="compact"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown" && event.key !== "Escape") event.stopPropagation();
            }}
            placeholder="Search labels"
            aria-label="Search labels"
          />
        </InputGroup>
        {hosted.isPending ? <MenuItem disabled>Searching…</MenuItem> : null}
        {hosted.error ? <MenuItem disabled>Couldn't search labels on the host</MenuItem> : null}
        {visible.length === 0 ? (
          <MenuItem disabled>{t.git.pullRequest.noLabelsInThisView}</MenuItem>
        ) : (
          visible.map((option) => {
            const key = option.name.toLowerCase();
            const checked = selected.has(key);
            const dot = pullRequestLabelColor(option.color);
            return (
              <MenuCheckboxItem
                density="compact"
                key={key}
                checked={checked}
                onCheckedChange={(next) =>
                  onChange(
                    next
                      ? [...value, option.name]
                      : value.filter((name) => name.toLowerCase() !== option.name.toLowerCase()),
                  )
                }
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full bg-muted-foreground"
                    {...(dot ? { style: { backgroundColor: dot } } : {})}
                  />
                  <span className="min-w-0 flex-1 truncate">{option.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {option.count}
                  </span>
                </span>
              </MenuCheckboxItem>
            );
          })
        )}
      </MenuPopup>
    </Menu>
  );
}

const EMPTY_AUTHORS: ReadonlyArray<PullRequestAuthorFacet> = [];
const EMPTY_LABELS: ReadonlyArray<PullRequestLabelFacet> = [];

/**
 * Renders independent list filters while preserving existing scope and facet callbacks.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface.
 */
export function PullRequestFiltersMenu({
  onOpenChange,
  state,
  stateOptions,
  onState,
  involvement,
  involvementOptions,
  onInvolvement,
  filters,
  onFilters,
  authorOptions = EMPTY_AUTHORS,
  labelOptions = EMPTY_LABELS,
  optionScope,
  host,
  hostOptions,
  onHost,
  server,
  serverOptions,
  onServer,
  projects,
  projectId,
  projectEnvironmentId,
  unavailable,
  onProject,
}: {
  onOpenChange?: ((open: boolean) => void) | undefined;
  state: PullRequestListState;
  stateOptions: ReadonlyArray<PullRequestFilterOption<PullRequestListState>>;
  onState: (state: PullRequestListState) => void;
  involvement: PullRequestInvolvement;
  involvementOptions: ReadonlyArray<PullRequestFilterOption<PullRequestInvolvement>>;
  onInvolvement: (involvement: PullRequestInvolvement) => void;
  filters: PullRequestListFilters;
  onFilters: (filters: PullRequestListFilters) => void;
  authorOptions?: ReadonlyArray<PullRequestAuthorFacet>;
  labelOptions?: ReadonlyArray<PullRequestLabelFacet>;
  optionScope: ReadonlyArray<PullRequestFilterOptionScope>;
  host: string | undefined;
  /**
   * Includes the "all hosts" entry, whose value is the empty string. The chip is hidden
   * until at least one host is known.
   */
  hostOptions: ReadonlyArray<PullRequestFilterOption<string>>;
  onHost: (host: string | undefined) => void;
  server: EnvironmentId | undefined;
  /**
   * Includes the "all servers" entry, whose value is the empty string. The chip is hidden
   * until at least one server is known.
   */
  serverOptions: ReadonlyArray<PullRequestFilterOption<string>>;
  onServer: (server: EnvironmentId | undefined) => void;
  projects: ReadonlyArray<ProjectFaviconProject & { readonly id: ProjectId }>;
  projectId: ProjectId | undefined;
  projectEnvironmentId: EnvironmentId | undefined;
  unavailable: ReadonlyMap<string, string>;
  onProject: (projectId: ProjectId | undefined, environmentId: EnvironmentId | undefined) => void;
}) {
  const selectedLabels = (filters.labels ?? []).flatMap((group) => group);
  const updateFilters = (next: Partial<PullRequestListFilters>) =>
    onFilters(
      Object.fromEntries(
        Object.entries({ ...filters, ...next }).filter(([, value]) => value !== undefined),
      ) as PullRequestListFilters,
    );
  const updateFilter = (key: keyof PullRequestListFilters, value: string) =>
    updateFilters({
      [key]: value === UNFILTERED_VALUE ? undefined : value,
    } as Partial<PullRequestListFilters>);
  const projectValue =
    projectId === undefined || projectEnvironmentId === undefined
      ? ALL_PROJECTS_VALUE
      : pullRequestProjectKey({ id: projectId, environmentId: projectEnvironmentId });
  const projectOptions: ReadonlyArray<PullRequestFilterOption<string>> = [
    { value: ALL_PROJECTS_VALUE, label: t.git.pullRequest.allProjects, Icon: LayersIcon },
    ...projects
      .toSorted(
        (left, right) =>
          Number(unavailable.has(pullRequestProjectKey(left))) -
          Number(unavailable.has(pullRequestProjectKey(right))),
      )
      .map((project) => ({
        value: pullRequestProjectKey(project),
        label: project.title,
        Icon: FolderGit2Icon,
        project,
        ...(unavailable.has(pullRequestProjectKey(project))
          ? { unavailable: unavailable.get(pullRequestProjectKey(project)) }
          : {}),
      })),
  ];
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label={t.git.pullRequest.filters}
    >
      <PullRequestFilterSelect
        onOpenChange={onOpenChange}
        label={t.git.pullRequest.state}
        value={state}
        options={stateOptions}
        onChange={onState}
      />
      <PullRequestFilterSelect
        onOpenChange={onOpenChange}
        label={t.git.pullRequest.involvement}
        value={involvement}
        options={involvementOptions}
        onChange={onInvolvement}
        supplementaryOptions={[
          t.git.pullRequest.awaitingMe,
          t.git.pullRequest.reviewRequested,
          t.git.pullRequest.otherInvolvement,
        ]}
      />
      {hostOptions.length > 1 ? (
        <>
          <PullRequestFilterSelect
            onOpenChange={onOpenChange}
            label={t.git.pullRequest.host}
            value={host ?? ALL_HOSTS_VALUE}
            options={hostOptions}
            onChange={(next) => onHost(next === ALL_HOSTS_VALUE ? undefined : next)}
          />
        </>
      ) : null}
      <PullRequestFilterSelect
        onOpenChange={onOpenChange}
        label={t.git.pullRequest.project}
        value={projectValue}
        options={projectOptions}
        onChange={(next) => {
          const project = projects.find((candidate) => pullRequestProjectKey(candidate) === next);
          if (project) onProject(project.id, project.environmentId);
          else if (projectId !== undefined) onProject(undefined, undefined);
        }}
      />
      {serverOptions.length > 1 ? (
        <>
          <PullRequestFilterSelect
            onOpenChange={onOpenChange}
            label={t.git.pullRequest.server}
            value={server ?? ALL_SERVERS_VALUE}
            options={serverOptions}
            onChange={(next) =>
              onServer(next === ALL_SERVERS_VALUE ? undefined : (next as EnvironmentId))
            }
          />
        </>
      ) : null}

      <PullRequestAuthorFilter
        onOpenChange={onOpenChange}
        value={filters.author}
        options={authorOptions}
        scope={optionScope}
        onChange={(author) => updateFilters({ author })}
      />
      <PullRequestLabelFilter
        onOpenChange={onOpenChange}
        value={selectedLabels}
        options={labelOptions}
        scope={optionScope}
        onChange={(labels) =>
          updateFilters({
            labels: labels.length === 0 ? undefined : labels.slice(0, 10).map((label) => [label]),
          })
        }
      />
      <PullRequestFilterSelect
        onOpenChange={onOpenChange}
        label={t.git.pullRequest.draft}
        value={filters.draft ?? UNFILTERED_VALUE}
        options={DRAFT_OPTIONS}
        supplement="draft"
        onChange={(draft) => updateFilter("draft", draft)}
      />
      <PullRequestFilterSelect
        onOpenChange={onOpenChange}
        label={t.git.pullRequest.review}
        value={filters.review ?? UNFILTERED_VALUE}
        options={REVIEW_OPTIONS}
        supplement="review"
        onChange={(review) => updateFilter("review", review)}
      />
      <PullRequestFilterSelect
        onOpenChange={onOpenChange}
        label={t.git.pullRequest.checks}
        value={filters.checks ?? UNFILTERED_VALUE}
        options={CHECKS_OPTIONS}
        supplement="checks"
        onChange={(checks) => updateFilter("checks", checks)}
      />
    </div>
  );
}
