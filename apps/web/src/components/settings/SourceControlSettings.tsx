/** Composes O4 source-control groups while keeping discovery and credential writes environment-local. */
import { t } from "~/i18n";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import { MinusIcon, PlusIcon } from "lucide-react";
import { Input } from "../ui/input";
import * as Duration from "effect/Duration";
import * as Option from "effect/Option";
import { createElement, useState, type ReactNode } from "react";
import type {
  BackgroundActivitySettings,
  SourceControlDiscoveryResult,
  SourceControlProviderAuth,
  SourceControlProviderDiscoveryItem,
  VcsDiscoveryItem,
} from "@t3tools/contracts";
import {
  getBackgroundActivityBaseProfile,
  getBackgroundActivityPresetSettings,
  resolveServerBackgroundActivitySettings,
} from "@t3tools/shared/backgroundActivitySettings";

import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";
import { useSettingsScope } from "./SettingsScopeContext";
import { ProjectDefaultsSettings } from "./ProjectDefaultsSettings";
import { BranchNamingSettings } from "./BranchNamingSettings";
import { useEnvironmentQuery } from "../../state/query";
import { sourceControlEnvironment } from "../../state/sourceControl";
import { Button } from "../ui/button";
import { Collapsible, CollapsibleContent } from "../ui/collapsible";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty";
import { Skeleton } from "../ui/skeleton";
import { NumberField, NumberFieldPrimitive } from "../ui/number-field";
import { SelectButton } from "../ui/select";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

import { SourceControlHostSettings } from "./SourceControlHostSettings";
import { GitHubAccountSettings } from "./GitHubAccountSettings";
import { GitHubTokenSettings } from "./GitHubTokenSettings";
import { RedactedSensitiveText } from "./RedactedSensitiveText";
import { SourceControlWritingSettingsSection } from "./SourceControlWritingSettings";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSearchTarget,
  SettingsSection,
  useSettingsSearchTargetId,
} from "./settingsLayout";
import { searchableSetting, sourceControlHostSettingsSearchId } from "./settingsSearch";
import { PullRequestGlyph } from "~/components/pullRequest/pullRequestIcons";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { sourceControlIcon } from "~/sourceControlPresentation";

const EMPTY_DISCOVERY_RESULT: SourceControlDiscoveryResult = {
  versionControlSystems: [],
  sourceControlProviders: [],
};

const SOURCE_CONTROL_SKELETON_ROWS = ["primary", "secondary"] as const;
const GIT_FETCH_INTERVAL_STEP_SECONDS = 5;
type BackgroundActivityOverridePatch = Partial<{
  [K in keyof BackgroundActivitySettings["overrides"]]:
    | BackgroundActivitySettings["overrides"][K]
    | undefined;
}>;

/** Converts the resolved duration to whole seconds for the existing fetch editor. */
function durationToSeconds(duration: Duration.Duration): number {
  return Math.round(Duration.toMillis(duration) / 1_000);
}

/** Clamps empty or non-finite numeric drafts to zero; valid values become nonnegative whole seconds. */
function normalizeFetchIntervalSeconds(value: number | null): number {
  if (value === null || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

/** Merges fetch overrides, removes cleared keys, and retains the current background profile as its base. */
function backgroundActivityOverrideSettings(
  current: BackgroundActivitySettings,
  overrides: BackgroundActivityOverridePatch,
) {
  const nextOverrides: BackgroundActivityOverridePatch = {
    ...current.overrides,
    ...overrides,
  };
  for (const [key, value] of Object.entries(nextOverrides)) {
    if (value === undefined) {
      delete nextOverrides[key as keyof typeof nextOverrides];
    }
  }
  return {
    backgroundActivity: {
      schemaVersion: 1 as const,
      profile: "custom" as const,
      baseProfile: getBackgroundActivityBaseProfile(current),
      overrides: nextOverrides as BackgroundActivitySettings["overrides"],
    },
  };
}

/** Returns the discovered optional label, or null when discovery supplied none. */
function optionLabel(value: Option.Option<string>): string | null {
  return Option.getOrNull(value);
}

/** Narrows a discovery result by its host authentication field. */
function isProviderDiscoveryItem(
  item: VcsDiscoveryItem | SourceControlProviderDiscoveryItem,
): item is SourceControlProviderDiscoveryItem {
  return "auth" in item;
}

/** Identifies a discovered VCS whose adapter is not implemented. */
function isVcsNotReady(item: VcsDiscoveryItem | SourceControlProviderDiscoveryItem): boolean {
  return !isProviderDiscoveryItem(item) && !item.implemented;
}

/** Shows an account only after the existing explicit disclosure action; null stays empty. */
function RedactedAccount(props: { readonly account: string | null }) {
  return (
    <RedactedSensitiveText
      value={props.account}
      ariaLabel={t.settings.sourceControl.toggleSourceControlAccountVisibility}
      revealTooltip={t.settings.sourceControl.clickToRevealAccount}
      hideTooltip={t.settings.sourceControl.clickToHideAccount}
    />
  );
}

/** Displays a registered host mark in O4's 32px recessed icon well. */
function SourceControlItemMark({ item }: { readonly item: SourceControlProviderDiscoveryItem }) {
  const definition = sourceControlClients.find(item.kind);
  // The registry returns existing components, never a component factory created during rendering.
  const icon = definition ? sourceControlIcon(definition) : PullRequestGlyph.pullRequest;
  return (
    <span className="source-control-icon-well" aria-hidden>
      {createElement(icon, { className: "size-3.75" })}
    </span>
  );
}

/** Explains actual discovery and authentication states without inventing a connected account. */
function itemSummary({
  item,
  auth,
  authAccount,
}: {
  readonly item: VcsDiscoveryItem | SourceControlProviderDiscoveryItem;
  readonly auth: SourceControlProviderAuth | null;
  readonly authAccount: string | null;
}) {
  if (isVcsNotReady(item)) {
    return <span>{t.settings.sourceControl.supportForIsComingSoon(item.label)}</span>;
  }

  if (item.status !== "available") {
    return <span>{t.settings.sourceControl.notAvailableOnThisServer(item.installHint)}</span>;
  }

  if (auth) {
    if (auth.status === "authenticated") {
      const authDetail = optionLabel(auth.detail);
      return (
        <>
          <span>{t.settings.sourceControl.authenticated}</span>
          {authAccount ? (
            <>
              <span aria-hidden>{t.settings.sourceControl.as}</span>
              <RedactedAccount account={authAccount} />
            </>
          ) : null}
          {authDetail ? <span>· {authDetail}</span> : null}
        </>
      );
    }

    if (!item.executable && auth.status === "unauthenticated") {
      return <span>{t.settings.sourceControl.available(item.installHint)}</span>;
    }

    if (auth.status === "unauthenticated" && auth.accounts?.some((entry) => entry.authenticated)) {
      return (
        <span>
          {optionLabel(auth.detail) ?? t.settings.sourceControl.everyHostIsTurnedOff(item.label)}
        </span>
      );
    }

    if (auth.status === "unauthenticated") {
      return (
        <span>
          {t.settings.sourceControl.authenticatedServerSignConfigureCredentials(item.label)}
          <code className="rounded bg-muted px-1 py-px text-2xs">{item.executable}</code>{" "}
          {t.settings.sourceControl.toolServerHostEnableChangeHint}
        </span>
      );
    }
    const authDetail = optionLabel(auth.detail);
    return (
      <span>
        {t.settings.sourceControl.verificationError(item.label)} {authDetail ?? item.installHint}
      </span>
    );
  }

  return <span>{t.settings.sourceControl.availableStatus}</span>;
}

/** Keeps discovery details reachable from both list actions and existing search targets. */
function DiscoveryItemRow({
  item,
  children,
  label,
  open,
  onOpenChange,
  onConfigure,
}: {
  readonly item: SourceControlProviderDiscoveryItem;
  readonly children?: ReactNode;
  readonly label?: string;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onConfigure?: (() => void) | undefined;
}) {
  const version = optionLabel(item.version);
  const auth = item.auth;
  const authenticated = auth?.status === "authenticated";
  const [localExpanded, setLocalExpanded] = useState(false);
  const isExpanded = open ?? localExpanded;
  const setExpanded = onOpenChange ?? setLocalExpanded;
  const hasDetails = children !== undefined;
  const searchTargetId = useSettingsSearchTargetId();
  // A search jump to a setting inside this row opens it when the target arrives.
  const [seenSearchTargetId, setSeenSearchTargetId] = useState<string | null>(null);
  const targetsThisRow =
    searchTargetId === sourceControlHostSettingsSearchId(item.kind) ||
    (item.kind === "github" && searchTargetId === searchableSetting("github-accounts").id);
  if (targetsThisRow && !isExpanded && seenSearchTargetId !== searchTargetId) {
    setExpanded(true);
  }
  if (seenSearchTargetId !== searchTargetId) setSeenSearchTargetId(searchTargetId);

  return (
    <div className="rounded-settings-row-surface">
      <div className="source-control-host-row">
        <SourceControlItemMark item={item} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-control font-semibold">{label ?? item.label}</span>
            {authenticated ? (
              <span className="source-control-connected">{t.settings.sourceControl.connected}</span>
            ) : null}
            {version ? (
              <code className="text-secondary-copy text-muted-foreground">{version}</code>
            ) : null}
          </div>
          {authenticated && !label && (hasDetails || onConfigure) ? null : (
            <div className="flex min-w-0 flex-wrap items-center gap-x-1 text-secondary-copy-medium text-secondary-label">
              {itemSummary({ item, auth, authAccount: auth ? optionLabel(auth.account) : null })}
            </div>
          )}
        </div>
        <Button
          disabled={!hasDetails && !onConfigure}
          size="settings-list"
          variant="secondary"
          onClick={onConfigure ?? (() => setExpanded(!isExpanded))}
          aria-expanded={hasDetails ? isExpanded : undefined}
          aria-label={t.settings.sourceControl.toggleDetails(label ?? item.label)}
        >
          {isExpanded
            ? t.settings.sourceControl.collapse
            : authenticated
              ? t.settings.sourceControl.edit
              : t.settings.sourceControl.connect}
        </Button>
      </div>
      {hasDetails ? (
        <Collapsible open={isExpanded} onOpenChange={setExpanded}>
          <CollapsibleContent>
            <div className="grid gap-3 px-2.5 pb-3 pt-2">
              {auth && authenticated && !label ? (
                <div className="flex flex-wrap items-center gap-x-1 text-secondary-copy-medium text-secondary-label">
                  {itemSummary({ item, auth, authAccount: optionLabel(auth.account) })}
                </div>
              ) : null}
              {children}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

/** Keeps arbitrary second-based intervals and reset semantics behind O4’s compact picker. */
function GitFetchIntervalSettings() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const resolvedBackgroundActivity = resolveServerBackgroundActivitySettings(settings);
  const automaticGitFetchIntervalSeconds = durationToSeconds(
    resolvedBackgroundActivity.automaticGitFetchInterval,
  );
  const defaultAutomaticGitFetchIntervalSeconds = durationToSeconds(
    getBackgroundActivityPresetSettings(
      getBackgroundActivityBaseProfile(settings.backgroundActivity),
    ).automaticGitFetchInterval,
  );
  const canResetFetchInterval =
    automaticGitFetchIntervalSeconds !== defaultAutomaticGitFetchIntervalSeconds;
  const setting = searchableSetting("git-fetch-interval");

  return (
    <SettingsRow
      {...setting}
      resetAction={
        canResetFetchInterval ? (
          <SettingResetButton
            label={t.settings.sourceControl.fetchInterval}
            onClick={() =>
              updateSettings(
                backgroundActivityOverrideSettings(settings.backgroundActivity, {
                  automaticGitFetchInterval: undefined,
                }),
              )
            }
          />
        ) : null
      }
      control={
        <Popover>
          <PopoverTrigger render={<SelectButton size="settings" />} aria-label={setting.title}>
            {automaticGitFetchIntervalSeconds > 0 && automaticGitFetchIntervalSeconds % 60 === 0
              ? t.settings.sourceControl.intervalMinutes(automaticGitFetchIntervalSeconds / 60)
              : `${automaticGitFetchIntervalSeconds} ${t.settings.backgroundActivity.seconds}`}
          </PopoverTrigger>
          <PopoverPopup align="end" width="sm">
            <div className="grid gap-3">
              <p className="text-secondary-copy-medium text-secondary-label">
                {t.settings.sourceControl.refreshRemoteBranchesBackgroundAvoidHint}{" "}
                {t.settings.sourceControl.intervalConfiguredGitSharedBackgroundHint}
              </p>
              <div className="flex items-center gap-2">
                <NumberField
                  value={automaticGitFetchIntervalSeconds}
                  min={0}
                  step={GIT_FETCH_INTERVAL_STEP_SECONDS}
                  size="sm"
                  className="w-32"
                  onValueChange={(value) =>
                    updateSettings(
                      backgroundActivityOverrideSettings(settings.backgroundActivity, {
                        automaticGitFetchInterval: Duration.seconds(
                          normalizeFetchIntervalSeconds(value),
                        ),
                      }),
                    )
                  }
                >
                  <div className="flex h-8 items-center rounded-card-row bg-input p-0.75 shadow-well-track">
                    <NumberFieldPrimitive.Group className="flex items-center">
                      <NumberFieldPrimitive.Decrement
                        render={<Button size="icon-stepper" variant="secondary" />}
                        aria-label={t.settings.sourceControl.decreaseFetchInterval}
                      >
                        <MinusIcon aria-hidden />
                      </NumberFieldPrimitive.Decrement>
                      <div className="w-15 min-w-0 rounded-keycap focus-within:inset-shadow-focus">
                        <NumberFieldPrimitive.Input
                          render={<Input unstyled size="stepper" font="mono" />}
                          aria-label={t.settings.sourceControl.automaticGitFetchIntervalInSeconds}
                        />
                      </div>
                      <NumberFieldPrimitive.Increment
                        render={<Button size="icon-stepper" variant="secondary" />}
                        aria-label={t.settings.sourceControl.increaseFetchInterval}
                      >
                        <PlusIcon aria-hidden />
                      </NumberFieldPrimitive.Increment>
                    </NumberFieldPrimitive.Group>
                  </div>
                </NumberField>
                <span className="text-secondary-copy-medium text-secondary-label">
                  {t.settings.backgroundActivity.seconds}
                </span>
              </div>
            </div>
          </PopoverPopup>
        </Popover>
      }
    />
  );
}

/** Reserves host-list space while the initial discovery request is pending. */
function SourceControlSectionSkeleton({
  title,
  headerAction,
}: {
  readonly title: string;
  readonly headerAction?: ReactNode;
}) {
  return (
    <SettingsSection title={title} headerAction={headerAction}>
      {SOURCE_CONTROL_SKELETON_ROWS.map((row) => (
        <div key={row} className="source-control-host-row">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="size-8" />
                <Skeleton shape="pill" className="h-4 w-28" />
                <Skeleton shape="pill" className="h-5 w-14" />
              </div>
              <Skeleton shape="pill" className="h-3 w-full max-w-xs" />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Skeleton className="size-7" />
              <Skeleton shape="pill" className="h-7 w-12" />
            </div>
          </div>
        </div>
      ))}
    </SettingsSection>
  );
}

/** Offers the existing scan action for missing tools or a discovery error. */
function EmptySourceControlDiscovery({
  error,
  isPending,
  onScan,
}: {
  readonly error: string | null;
  readonly isPending: boolean;
  readonly onScan: () => void;
}) {
  const hasError = error !== null;

  return (
    <SettingsSearchTarget
      id={searchableSetting("source-control").id}
      className="source-control-empty"
    >
      <Empty>
        <EmptyMedia variant="icon">
          <PullRequestGlyph.pullRequest />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>
            {hasError
              ? t.settings.sourceControl.couldNotScanTheServerEnvironment
              : t.settings.sourceControl.nothingDetectedYet}
          </EmptyTitle>
          <EmptyDescription>
            {hasError ? error : t.settings.sourceControl.installGitServerAddOptionalError}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" variant="outline" onClick={onScan} disabled={isPending}>
            <RefreshIcon size="sm" refreshing={isPending} />
            {t.settings.sourceControl.scan}
          </Button>
        </EmptyContent>
      </Empty>
    </SettingsSearchTarget>
  );
}

/** Arranges O4 groups and confines credential drafts to the selected environment. */
export function SourceControlSettingsPanel() {
  const { scope, environment, connectedEnvironments } = useSettingsScope();

  const environmentId =
    environment?.connection.phase === "connected" ? environment.environmentId : null;
  const aggregate = scope.environmentIds.length !== 1 && connectedEnvironments.length > 1;
  const environmentSuffix = aggregate && environment ? ` · ${environment.label}` : "";
  const discovery = useEnvironmentQuery(
    environmentId === null
      ? null
      : sourceControlEnvironment.discovery({
          environmentId,
          input: {},
        }),
  );
  const result = discovery.data ?? EMPTY_DISCOVERY_RESULT;
  const hasVersionControlSystems = result.versionControlSystems.length > 0;
  const hasDiscoveryItems = hasVersionControlSystems || result.sourceControlProviders.length > 0;
  const github = result.sourceControlProviders.find((item) => item.kind === "github");
  const [githubOpen, setGithubOpen] = useState(false);
  const isInitialScanPending = discovery.isPending && discovery.data === null;
  const handleScan = () => {
    discovery.refresh();
  };
  const hostSettingsPanel = (kind: string) => {
    const definition = sourceControlClients.find(kind);
    if (!definition?.settings || environmentId === null) return undefined;
    return (
      <SettingsSearchTarget id={sourceControlHostSettingsSearchId(kind)}>
        <SourceControlHostSettings
          // Drafts belong to one environment; switching must not carry them over.
          key={environmentId}
          environmentId={environmentId}
          definition={{ ...definition, settings: definition.settings }}
          onSaved={handleScan}
        />
      </SettingsSearchTarget>
    );
  };
  const scanButton = (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost-muted"
            onClick={handleScan}
            disabled={discovery.isPending}
            aria-label={t.settings.sourceControl.rescanServerEnvironment}
          >
            <RefreshIcon refreshing={discovery.isPending} />
          </Button>
        }
      />
      <TooltipPopup side="top">
        {t.settings.sourceControl.rescanGitAndHostingIntegrations}
      </TooltipPopup>
    </Tooltip>
  );

  return (
    <SettingsPageContainer>
      <ProjectDefaultsSettings
        category="source-control"
        sourceControlRows={
          <>
            {environmentId === null ? (
              <SettingsSearchTarget
                id={searchableSetting("source-control").id}
                className="source-control-empty"
              >
                {t.settings.sourceControl.connectEnvironmentInspectVersionControlHint}
              </SettingsSearchTarget>
            ) : isInitialScanPending ? (
              <div className="px-3.5 py-2.5">
                <Skeleton className="h-8 w-full" />
              </div>
            ) : hasDiscoveryItems ? (
              <>
                <SettingsRow
                  id={searchableSetting("source-control").id}
                  title={t.settings.sourceControl.versionControl(environmentSuffix)}
                  control={
                    <div className="flex items-center gap-2">
                      {/* Discovery reports installed drivers; the design's selector has no write API. */}
                      <SelectButton size="settings" disabled>
                        {result.versionControlSystems
                          .filter((item) => item.status === "available" && item.implemented)
                          .map((item) => item.label)
                          .join(" · ") || t.settings.sourceControl.nothingDetectedYet}
                      </SelectButton>
                      {scanButton}
                    </div>
                  }
                >
                  <p className="text-secondary-copy-medium text-secondary-label">
                    {t.settings.sourceControl.detectedToolsOnly}
                  </p>
                  {result.versionControlSystems.map((item) => (
                    <div
                      key={item.kind}
                      className="flex flex-wrap items-center gap-2 text-secondary-copy-medium text-secondary-label"
                    >
                      <span>{item.label}</span>
                      {optionLabel(item.version) ? <code>{optionLabel(item.version)}</code> : null}
                      {itemSummary({ item, auth: null, authAccount: null })}
                    </div>
                  ))}
                </SettingsRow>
                {result.versionControlSystems.some((item) => item.kind === "git") ? (
                  <GitFetchIntervalSettings />
                ) : null}
              </>
            ) : (
              <EmptySourceControlDiscovery
                error={discovery.error}
                isPending={discovery.isPending}
                onScan={handleScan}
              />
            )}
          </>
        }
      />
      <SettingsSection title={t.settings.rows.worktreeBranchNaming.title}>
        <BranchNamingSettings />
      </SettingsSection>
      {environmentId !== null && github ? (
        <SettingsSection title="GitHub">
          <SettingsSearchTarget
            id={searchableSetting("github-accounts").id}
            className="source-control-host-list"
          >
            <DiscoveryItemRow
              item={github}
              label={t.settings.sourceControl.githubAccountAndToken}
              open={githubOpen}
              onOpenChange={setGithubOpen}
            >
              <div className="grid gap-4">
                <GitHubTokenSettings
                  key={`token-${environmentId}`}
                  environmentId={environmentId}
                  onSaved={handleScan}
                />
                {github.status === "available" ? (
                  <GitHubAccountSettings
                    key={environmentId}
                    environmentId={environmentId}
                    auth={github.auth}
                    onSaved={handleScan}
                  />
                ) : null}
              </div>
            </DiscoveryItemRow>
          </SettingsSearchTarget>
        </SettingsSection>
      ) : null}
      <SourceControlWritingSettingsSection />
      {isInitialScanPending && environmentId !== null ? (
        <SourceControlSectionSkeleton
          title={t.settings.sourceControl.hostCredentials}
          headerAction={scanButton}
        />
      ) : environmentId !== null && result.sourceControlProviders.length > 0 ? (
        <SettingsSection title={t.settings.sourceControl.hostCredentials}>
          <div className="source-control-host-list">
            {result.sourceControlProviders.map((item) => (
              <DiscoveryItemRow
                key={item.kind}
                item={item}
                onConfigure={
                  item.kind === "github"
                    ? () => {
                        setGithubOpen(true);
                        document.getElementById(searchableSetting("github-accounts").id)?.focus();
                      }
                    : undefined
                }
              >
                {item.kind === "github" ? undefined : hostSettingsPanel(item.kind)}
              </DiscoveryItemRow>
            ))}
          </div>
        </SettingsSection>
      ) : null}
    </SettingsPageContainer>
  );
}
