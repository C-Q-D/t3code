/** Localized usage presentation and existing interaction behavior. */
import { t } from "~/i18n";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import { useAtomValue } from "@effect/atom-react";
import {
  USAGE_CONTRACT_VERSION,
  type EnvironmentId,
  type UsageProviderKind,
} from "@t3tools/contracts";
import {
  CircleAlertIcon,
  ChevronDownIcon,
  FilterIcon,
  MonitorIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  cursorKeychainAccessEnvironments,
  refreshUsageLimits,
} from "@t3tools/client-runtime/state/usage";
import {
  updatingProvidersLabel,
  usageEnvironmentProgress,
  usageLoadingState,
} from "@t3tools/client-runtime/state/usage-progress";

import { isCompatibleUsageContractVersion, type MergedUsage } from "@t3tools/shared/usageMerge";

import { cn } from "../../lib/utils";
import { environmentPresentations } from "../../state/presentation";
import { primaryServerKeybindingsAtom, serverEnvironment } from "../../state/server";
import { isCommandPaletteOpen } from "../../commandPaletteBus";
import { isModelPickerOpen } from "../../modelPickerVisibility";
import { shortcutLabelForCommand } from "../../keybindings";
import { useUsage, type EnvironmentUsageStatus } from "../../state/usage";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  enumerateDays,
  enumerateHourStarts,
  formatDateTimeShort,
  formatDayShort,
  formatUsageContractMismatch,
  makeWindow,
} from "@t3tools/shared/usageFormat";
import { Button } from "../ui/button";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import {
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { ScrollArea } from "../ui/scroll-area";
import { SidebarInset } from "../ui/sidebar";
import { Skeleton } from "../ui/skeleton";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { WorkspaceBreadcrumbText } from "../WorkspaceBreadcrumb";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { UsageHeroCard } from "./UsageHeroCard";
import { UsageCompositionCard } from "./UsageCompositionCard";
import { UsageResourceCard } from "./UsageResourceCard";
import { UsageCostBreakdownCard } from "./UsageCostBreakdownCard";
import { UsageLimitFaders } from "./UsageLimitFaders";
import { UsageLimitExtras } from "./UsageLimitExtras";
import { UsageMetricStrip, UsageMetricStripSkeleton } from "./UsageMetricStrip";
import { UsagePriceOverrides, UsagePriceSummary } from "./UsagePriceOverrides";
import { UsageModelDialog } from "./UsageModelDialog";
import {
  METRIC_OPTIONS,
  WINDOW_OPTIONS,
  resolveUsageShortcut,
  type UsageMetric,
} from "./usageShortcuts";
import { useEscapeToGoBack } from "../../hooks/useNavigateBack";
import { PROVIDER_ORDER, PROVIDER_PRESENTATION, providersWithUsage } from "./usageProviders";
import {
  readUsagePagePreferences,
  saveUsagePagePreferences,
  type UsagePagePreferences,
} from "./usagePagePreferences";

function isUsageMetric(value: string | null | undefined): value is UsageMetric {
  return METRIC_OPTIONS.some((option) => option.value === value);
}

function isUsageWindowDays(value: number): value is UsagePagePreferences["windowDays"] {
  return WINDOW_OPTIONS.some((option) => option.days === value);
}

const providerLabel = (provider: UsageProviderKind) => PROVIDER_PRESENTATION[provider].label;

/** Renders selected environments' usage, subscription limits and pricing controls; preserves persisted filter IDs while displaying localized labels. */
export function UsagePage() {
  const [preferences, setPreferences] = useState(readUsagePagePreferences);
  useEscapeToGoBack();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const shortcutTitle = (
    option: (typeof METRIC_OPTIONS)[number] | (typeof WINDOW_OPTIONS)[number],
  ) => {
    const shortcut = shortcutLabelForCommand(keybindings, option.command, {
      context: { usagePageOpen: true },
    });
    return shortcut ? `${option.label} (${shortcut})` : option.label;
  };
  const [windowSelection, setWindowSelection] = useState(() => ({
    days: preferences.windowDays,
    window: makeWindow(
      preferences.windowDays,
      undefined,
      preferences.windowDays === 1 ? "hour" : "day",
    ),
  }));
  const metric = preferences.metric;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [limitsNow, setLimitsNow] = useState(() => Date.now());
  const refreshingRef = useRef(false);
  const [priceDialog, setPriceDialog] = useState<{ readonly model?: string } | null>(null);
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null);
  const [selectedEnvironmentIds, setSelectedEnvironmentIds] =
    useState<ReadonlySet<EnvironmentId> | null>(null);
  const hiddenProviders = useMemo(
    () => new Set(preferences.hiddenProviders),
    [preferences.hiddenProviders],
  );
  const { days: windowDays, window } = windowSelection;
  const isPast24Hours = windowDays === 1;
  const {
    merged: answeredUsage,
    environments,
    selectedEnvironments,
    shown,
    isPartial,
    refresh,
  } = useUsage(window, selectedEnvironmentIds, hiddenProviders);
  // Until a new window's first answer, the previous one stays on screen, muted.
  const merged = shown?.merged ?? answeredUsage;
  const shownWindow = shown?.window ?? window;
  const shownHourly = shownWindow.resolution === "hour";
  const refreshingUsage = isRefreshing;
  // Usage kept from another window is all old, so every figure stays muted.
  const showingKept = shown !== null && shown.window !== window;
  const loading = useMemo(() => {
    if (showingKept) {
      return { partial: true, everyProvider: true, providers: new Set<UsageProviderKind>() };
    }
    const state = usageLoadingState(selectedEnvironments, refreshingUsage);
    // A hidden provider still refreshing must not add its row or mute the totals.
    const providers = new Set([...state.providers].filter((p) => !hiddenProviders.has(p)));
    return {
      partial: state.everyProvider || providers.size > 0,
      everyProvider: state.everyProvider,
      providers,
    };
  }, [showingKept, refreshingUsage, selectedEnvironments, hiddenProviders]);
  const isProviderLoading = (provider: UsageProviderKind) =>
    loading.everyProvider || loading.providers.has(provider);
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const cursorAccessEnvironments = hiddenProviders.has("cursor")
    ? []
    : cursorKeychainAccessEnvironments(selectedEnvironments);
  const sourceMessages = [
    ...new Set(
      selectedEnvironments.flatMap(
        (environment) =>
          environment.summary?.sources.flatMap((source) =>
            source.message &&
            !source.action &&
            !hiddenProviders.has(source.fingerprint.provider) &&
            (source.status === "partial" ||
              source.status === "failed" ||
              source.fingerprint.provider === "cursor")
              ? [source.message]
              : [],
          ) ?? [],
      ),
    ),
  ];
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });

  const canReadDiagnostics = selectedEnvironments.some(
    (environment) => environment.canReadDiagnostics,
  );
  // Subscription checks do not depend on diagnostics access or a usage response.
  const limitsVisible = selectedEnvironments.length > 0;

  const days = useMemo(
    () => enumerateDays(shownWindow.sinceDay, shownWindow.untilDay),
    [shownWindow.sinceDay, shownWindow.untilDay],
  );
  const hours = useMemo(
    () =>
      shownWindow.sinceTime === undefined || shownWindow.untilTime === undefined
        ? []
        : enumerateHourStarts(shownWindow.sinceTime, shownWindow.untilTime),
    [shownWindow.sinceTime, shownWindow.untilTime],
  );
  const providersWithData = useMemo(() => providersWithUsage(merged.providers), [merged.providers]);
  // A provider still refreshing keeps its row and line before its usage lands.
  const activeProviders = useMemo(
    () =>
      PROVIDER_ORDER.filter(
        (provider) => providersWithData.includes(provider) || loading.providers.has(provider),
      ),
    [loading.providers, providersWithData],
  );
  const selectedModel =
    selectedModelKey === null
      ? undefined
      : merged.models.find((model) => `${model.provider}:${model.model}` === selectedModelKey);
  const updatePreferences = (patch: Partial<UsagePagePreferences>) => {
    const nextPreferences = { ...preferences, ...patch };
    setPreferences(nextPreferences);
    saveUsagePagePreferences(nextPreferences);
  };
  const selectWindow = (days: number) => {
    if (!isUsageWindowDays(days)) return;
    updatePreferences({ windowDays: days });
    setWindowSelection({
      days,
      window: makeWindow(days, undefined, days === 1 ? "hour" : "day"),
    });
  };
  const selectMetric = (nextMetric: UsageMetric) => {
    updatePreferences({ metric: nextMetric });
  };
  const refreshLimits = async (automatic = false, afterPending = false) => {
    try {
      await Promise.all(
        Array.from(presentations, ([environmentId, presentation]) => {
          if (selectedEnvironmentIds !== null && !selectedEnvironmentIds.has(environmentId)) return;
          if (presentation.connection.phase === "connected" && presentation.serverConfig !== null) {
            return refreshUsageLimits(
              environmentId,
              () => refreshProviders({ environmentId, input: {} }),
              automatic,
              afterPending,
            );
          }
        }),
      );
    } finally {
      setLimitsNow(Date.now());
    }
  };
  // Both entry points share the same lock so repeated shortcuts cannot overlap a refresh.
  const refreshLimitsManually = () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setIsRefreshing(true);
    void refreshLimits().finally(() => {
      refreshingRef.current = false;
      setIsRefreshing(false);
    });
  };
  const onUsageKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      isCommandPaletteOpen() ||
      isModelPickerOpen()
    )
      return;

    const command = resolveUsageShortcut(event, keybindings);
    const metricOption = METRIC_OPTIONS.find((option) => option.command === command);
    const periodOption = WINDOW_OPTIONS.find((option) => option.command === command);
    if (!metricOption && !periodOption && command !== "usage.limits") return;

    event.preventDefault();
    event.stopPropagation();
    if (metricOption) selectMetric(metricOption.value);
    if (periodOption) selectWindow(periodOption.days);
    if (command === "usage.limits") refreshLimitsManually();
  });

  useEffect(() => {
    globalThis.window.addEventListener("keydown", onUsageKeyDown, true);
    return () => globalThis.window.removeEventListener("keydown", onUsageKeyDown, true);
  }, []);

  const refreshWindow = () => {
    if (refreshingRef.current) return;
    const nextWindow = makeWindow(windowDays, undefined, isPast24Hours ? "hour" : "day");
    if (
      nextWindow.sinceDay !== window.sinceDay ||
      nextWindow.untilDay !== window.untilDay ||
      nextWindow.sinceTime !== window.sinceTime ||
      nextWindow.untilTime !== window.untilTime
    ) {
      setWindowSelection({ days: windowDays, window: nextWindow });
    }
    refreshingRef.current = true;
    setIsRefreshing(true);
    void Promise.all([
      canReadDiagnostics ? refresh(nextWindow) : undefined,
      refreshLimits(),
    ]).finally(() => {
      refreshingRef.current = false;
      setIsRefreshing(false);
    });
  };
  const connectedLimitsEnvironments = [...presentations]
    .filter(
      ([environmentId, presentation]) =>
        presentation.connection.phase === "connected" &&
        presentation.serverConfig !== null &&
        (selectedEnvironmentIds === null || selectedEnvironmentIds.has(environmentId)),
    )
    .map(([environmentId]) => environmentId)
    .sort()
    .join(",");
  const autoRefreshLimits = useEffectEvent(() => {
    void refreshLimits(true);
  });
  useEffect(() => {
    if (limitsVisible && connectedLimitsEnvironments) autoRefreshLimits();
  }, [limitsVisible, connectedLimitsEnvironments]);

  // Names the period on screen, which is the previous one until the new one answers.
  const windowLabel =
    shownHourly && shownWindow.sinceTime !== undefined && shownWindow.untilTime !== undefined
      ? t.tools.usage.dateRange(
          formatDateTimeShort(
            shownWindow.sinceTime,
            shownWindow.timeZone,
            t.chat.workLog.shared.usage,
          ),
          formatDateTimeShort(
            shownWindow.untilTime,
            shownWindow.timeZone,
            t.chat.workLog.shared.usage,
          ),
        )
      : t.tools.usage.dateRange(
          formatDayShort(shownWindow.sinceDay, t.chat.workLog.shared.usage),
          formatDayShort(shownWindow.untilDay, t.chat.workLog.shared.usage),
        );
  const topbarContent = (
    <div className="flex flex-wrap items-center gap-2.5">
      <ToggleGroup
        aria-label={t.tools.usage.usagePeriod}
        variant="segmented"
        value={[String(windowDays)]}
        onValueChange={(next) => {
          const value = next[0];
          if (value) selectWindow(Number(value));
        }}
      >
        {WINDOW_OPTIONS.map((option) => (
          <Toggle key={option.days} value={String(option.days)} title={shortcutTitle(option)}>
            {option.label}
          </Toggle>
        ))}
      </ToggleGroup>
      <ToggleGroup
        aria-label={t.tools.usage.usageMetric}
        variant="segmented"
        value={[metric]}
        onValueChange={(next) => {
          const value = next[0];
          if (isUsageMetric(value)) selectMetric(value);
        }}
      >
        {METRIC_OPTIONS.map((option) => (
          <Toggle key={option.value} value={option.value} title={shortcutTitle(option)}>
            {option.value === "tokens" ? t.tools.usage.processedTokens : option.label}
          </Toggle>
        ))}
      </ToggleGroup>
      <div className="ml-auto flex flex-wrap items-center gap-2.5">
        <UsageProviderFilter
          hiddenProviders={hiddenProviders}
          onChange={(next) => updatePreferences({ hiddenProviders: next })}
        />
        <UsageEnvironmentFilter
          environments={environments}
          selectedEnvironments={selectedEnvironments}
          selectedEnvironmentIds={selectedEnvironmentIds}
          onSelectionChange={setSelectedEnvironmentIds}
          showUsageStatus={true}
          refreshing={refreshingUsage}
          isPartial={isPartial}
          duplicateSources={merged.duplicateSources}
          contractMismatches={merged.contractMismatches}
          onOpenModelPrices={() => setPriceDialog({})}
        />
        <div className="hidden xl:flex">
          <Button
            onClick={refreshWindow}
            aria-label={t.tools.usage.refreshUsage}
            aria-busy={isRefreshing}
            disabled={isRefreshing}
            size="icon-sm"
            variant="ghost"
          >
            <RefreshIcon size="sm" refreshing={isRefreshing} />
          </Button>
        </div>
        <div className="flex xl:hidden">
          <Button
            onClick={refreshWindow}
            aria-label={t.tools.usage.refreshUsage}
            aria-busy={isRefreshing}
            disabled={isRefreshing}
            size="icon-sm"
            variant="ghost"
          >
            <RefreshIcon size="sm" refreshing={isRefreshing} />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <SidebarInset className="h-full min-h-0 overflow-hidden overscroll-y-none isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-secondary-copy-large leading-normal text-foreground text-shadow-stone">
        <ScrollArea className="min-h-0 flex-1">
          <WorkspacePageContainer
            width="wide"
            className="max-w-[1236px] gap-4.5 px-7 pt-6 pb-10 sm:px-7"
          >
            {topbarContent}
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_408px]">
              <div className="min-w-0">
                {selectedEnvironments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {environments.length === 0
                      ? t.tools.usage.connectToView(false)
                      : t.tools.usage.selectToView(false)}
                  </p>
                ) : !canReadDiagnostics ? (
                  <div className="space-y-2 py-12 text-center text-sm text-muted-foreground">
                    {selectedEnvironments.map((environment) => (
                      <p key={environment.environmentId}>
                        {selectedEnvironments.length > 1 ? `${environment.label}: ` : null}
                        {environment.error}
                      </p>
                    ))}
                  </div>
                ) : shown === null ? (
                  <UsageSkeleton />
                ) : (
                  <UsageHeroCard
                    metric={metric}
                    merged={merged}
                    loading={loading}
                    activeProviders={activeProviders}
                    providersWithData={providersWithData}
                    days={days}
                    hours={hours}
                    resolution={shownHourly ? "hour" : "day"}
                    timeZone={shownWindow.timeZone}
                    referenceTime={shownWindow.untilTime}
                    windowLabel={windowLabel}
                  />
                )}
              </div>
              {limitsVisible ? (
                <section className="min-w-0 flex flex-col gap-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="font-serif text-2xl font-semibold">{t.tools.usage.limits}</h2>
                    <p className="text-xs text-muted-foreground">
                      {t.tools.usage.limitsSectionHint}
                    </p>
                  </div>
                  <UsageLimitFaders
                    selectedEnvironmentIds={selectedEnvironmentIds}
                    hiddenProviders={hiddenProviders}
                    now={limitsNow}
                  />
                </section>
              ) : null}
            </div>
            <UsageLimitExtras
              selectedEnvironmentIds={selectedEnvironmentIds}
              hiddenProviders={hiddenProviders}
              cursorEnvironments={cursorAccessEnvironments}
              onCursorEnabled={() => {
                if (canReadDiagnostics) void refresh();
                void refreshLimits(false, true);
              }}
            />
            {sourceMessages.map((message) => (
              <p key={message} className="text-sm text-muted-foreground">
                {message}
              </p>
            ))}
            {selectedEnvironments.length > 0 && canReadDiagnostics ? (
              shown === null ? (
                <>
                  <UsageMetricStripSkeleton />
                  <Skeleton className="h-44" />
                </>
              ) : (
                <div aria-busy={loading.partial} className="flex flex-col gap-4.5">
                  <UsageMetricStrip
                    metric={metric}
                    merged={merged}
                    loading={loading.partial}
                    days={days}
                    hours={hours}
                    resolution={shownHourly ? "hour" : "day"}
                  />
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="font-serif text-2xl font-semibold">
                      {t.tools.usage.compositionSection}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {t.tools.usage.compositionSectionHint}
                    </p>
                  </div>
                  <div className="flex flex-col gap-4 lg:flex-row">
                    <UsageCompositionCard
                      metric={metric}
                      merged={merged}
                      loadingPartial={loading.partial}
                      isProviderLoading={isProviderLoading}
                      activeProviders={activeProviders}
                      resolution={shownHourly ? "hour" : "day"}
                      timeZone={shownWindow.timeZone}
                      onSelectModel={setSelectedModelKey}
                    />
                    <UsageResourceCard />
                  </div>
                  <UsageCostBreakdownCard
                    metric={metric}
                    merged={merged}
                    loading={loading.partial}
                  />
                  <UsagePriceSummary
                    selectedEnvironmentIds={selectedEnvironmentIds}
                    onEditModel={(model) => setPriceDialog(model === undefined ? {} : { model })}
                  />
                </div>
              )
            ) : null}
          </WorkspacePageContainer>
        </ScrollArea>
      </div>
      {selectedModel !== undefined ? (
        <UsageModelDialog
          model={selectedModel}
          environments={selectedEnvironments}
          metric={metric === "tokens" ? "tokens" : "cost"}
          chartWindow={{
            days,
            hours,
            resolution: shownHourly ? "hour" : "day",
            timeZone: shownWindow.timeZone,
            referenceTime: shownWindow.untilTime,
          }}
          onSetPrice={() => {
            setSelectedModelKey(null);
            setPriceDialog({ model: selectedModel.model });
          }}
          onClose={() => setSelectedModelKey(null)}
        />
      ) : null}
      {priceDialog ? (
        <UsagePriceOverrides
          usage={environments}
          initialSelectedEnvironmentIds={selectedEnvironmentIds}
          initialModel={priceDialog.model}
          onOpenChange={(open) => {
            if (!open) setPriceDialog(null);
          }}
        />
      ) : null}
    </SidebarInset>
  );
}

/** Brand mark for the harness a row belongs to. */
function ProviderMark({
  provider,
  className,
}: {
  readonly provider: UsageProviderKind;
  readonly className: string;
}) {
  const presentation = PROVIDER_PRESENTATION[provider];
  return (
    <ProviderInstanceIcon
      driverKind={presentation.driverKind}
      displayName={presentation.label}
      iconClassName={className}
    />
  );
}

/**
 * Explains failed or incompatible environments and deduplicated transcripts.
 * Shown inside the environment filter so arriving results do not move the page.
 */
function UsageCoverageNotice({
  environments,
  duplicateSources,
  contractMismatches,
}: {
  readonly environments: readonly EnvironmentUsageStatus[];
  readonly duplicateSources: readonly string[];
  readonly contractMismatches: MergedUsage["contractMismatches"];
}) {
  const failed = environments.filter((environment) => environment.error !== null);
  const mismatchByEnvironment = new Map(
    contractMismatches.map((mismatch) => [mismatch.environmentId, mismatch]),
  );
  const incompatible = environments.flatMap((environment) => {
    const mismatch = mismatchByEnvironment.get(environment.environmentId);
    return mismatch === undefined ? [] : [{ environment, mismatch }];
  });
  if (failed.length === 0 && incompatible.length === 0 && duplicateSources.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 border-t border-border px-2 py-2 text-xs text-muted-foreground">
      {failed.map((environment) => (
        <span key={environment.label}>
          {environment.label}: {environment.error}
        </span>
      ))}
      {incompatible.map(({ environment, mismatch }) => (
        <span key={environment.environmentId}>
          {formatUsageContractMismatch(environment.label, mismatch, t.chat.workLog.shared.usage)}
        </span>
      ))}
      {duplicateSources.length > 0 ? (
        <span>
          {t.tools.usage.deduplicatedHint} {duplicateSources.join(", ")}
        </span>
      ) : null}
    </div>
  );
}

/** Environment selection, with each environment's scan status in the menu. */
function UsageEnvironmentFilter({
  environments,
  selectedEnvironments,
  selectedEnvironmentIds,
  onSelectionChange,
  showUsageStatus,
  refreshing,
  isPartial,
  duplicateSources,
  contractMismatches,
  onOpenModelPrices,
}: {
  readonly environments: readonly EnvironmentUsageStatus[];
  readonly selectedEnvironments: readonly EnvironmentUsageStatus[];
  readonly selectedEnvironmentIds: ReadonlySet<EnvironmentId> | null;
  readonly onSelectionChange: (ids: ReadonlySet<EnvironmentId> | null) => void;
  readonly showUsageStatus: boolean;
  readonly refreshing: boolean;
  readonly isPartial: boolean;
  readonly duplicateSources: readonly string[];
  readonly contractMismatches: MergedUsage["contractMismatches"];
  readonly onOpenModelPrices: () => void;
}) {
  const allSelected = selectedEnvironmentIds === null;
  const label = allSelected
    ? t.tools.usage.allEnvironments
    : selectedEnvironments.length === 1
      ? selectedEnvironments[0]!.label
      : t.tools.usage.environmentsCount(selectedEnvironments.length);
  const hasIssue =
    selectedEnvironments.some((environment) => environment.error !== null) ||
    contractMismatches.length > 0;

  return (
    <Menu>
      <MenuTrigger
        render={<Button variant="glass" />}
        className="group/usage-environment min-w-0 max-w-full"
      >
        <MonitorIcon className="size-3.5" aria-hidden />
        <WorkspaceBreadcrumbText>{label}</WorkspaceBreadcrumbText>
        <span className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
          {showUsageStatus && hasIssue ? (
            <CircleAlertIcon
              className="size-3.5 text-warning-foreground"
              aria-label={t.tools.usage.reportFailed}
            />
          ) : (
            <ChevronDownIcon
              className="size-3.5 transition-opacity group-hover/usage-environment:opacity-100 group-focus-visible/usage-environment:opacity-100 group-data-popup-open/usage-environment:opacity-100"
              aria-hidden
            />
          )}
        </span>
      </MenuTrigger>
      <MenuPopup align="start">
        <MenuCheckboxItem
          checked={allSelected}
          closeOnClick={false}
          onCheckedChange={(checked) => onSelectionChange(checked ? null : new Set())}
        >
          {t.tools.usage.allEnvironments}
        </MenuCheckboxItem>
        <MenuSeparator />
        {environments.map((environment) => {
          const checked =
            selectedEnvironmentIds === null ||
            selectedEnvironmentIds.has(environment.environmentId);
          const progress = usageEnvironmentProgress(environment, refreshing);
          const status =
            environment.error !== null
              ? t.tools.usage.unavailable
              : environment.summary !== null &&
                  !isCompatibleUsageContractVersion(
                    environment.summary.contractVersion,
                    USAGE_CONTRACT_VERSION,
                  )
                ? t.tools.usage.updateRequired
                : !environment.isConnected
                  ? t.tools.usage.connecting
                  : progress.phase === "loading"
                    ? t.tools.usage.scanning
                    : progress.phase === "stale"
                      ? t.tools.usage.refreshing
                      : progress.phase === "partway"
                        ? updatingProvidersLabel(progress.providers, providerLabel, t.tools.usage)
                        : t.tools.usage.ready;
          return (
            <MenuCheckboxItem
              key={environment.environmentId}
              checked={checked}
              closeOnClick={false}
              onCheckedChange={(nextChecked) => {
                const next = new Set(selectedEnvironments.map((entry) => entry.environmentId));
                if (nextChecked) next.add(environment.environmentId);
                else next.delete(environment.environmentId);
                onSelectionChange(next.size === environments.length ? null : next);
              }}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="min-w-0 flex-1 truncate">{environment.label}</span>
                {showUsageStatus ? (
                  <span
                    className={cn(
                      "shrink-0 text-xs text-muted-foreground",
                      environment.error !== null && "text-destructive",
                    )}
                  >
                    {status}
                  </span>
                ) : null}
              </span>
            </MenuCheckboxItem>
          );
        })}
        {environments.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">{t.tools.usage.noEnvironments}</p>
        ) : null}
        {showUsageStatus && isPartial ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            {t.tools.usage.partialTotalsHint}
          </p>
        ) : null}
        {showUsageStatus ? (
          <UsageCoverageNotice
            environments={selectedEnvironments}
            duplicateSources={duplicateSources}
            contractMismatches={contractMismatches}
          />
        ) : null}
        <MenuSeparator />
        <MenuItem onClick={onOpenModelPrices}>
          <SlidersHorizontalIcon aria-hidden />
          {t.tools.usage.modelPrices}
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}

/** Provider visibility shared by every tab. Stored as the hidden set. */
function UsageProviderFilter({
  hiddenProviders,
  onChange,
}: {
  readonly hiddenProviders: ReadonlySet<UsageProviderKind>;
  readonly onChange: (hiddenProviders: readonly UsageProviderKind[]) => void;
}) {
  const visible = PROVIDER_ORDER.filter((provider) => !hiddenProviders.has(provider));
  const label =
    visible.length === PROVIDER_ORDER.length
      ? t.tools.usage.allProviders
      : visible.length === 0
        ? t.tools.usage.noProviders
        : visible.length === 1
          ? PROVIDER_PRESENTATION[visible[0]!].label
          : t.tools.usage.providerCount(visible.length);

  return (
    <Menu>
      <MenuTrigger
        render={<Button variant="glass" />}
        className="group/usage-provider min-w-0 max-w-full"
      >
        <FilterIcon className="size-3.5" aria-hidden />
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDownIcon
          className="size-3.5 shrink-0 text-muted-foreground transition-opacity group-hover/usage-provider:opacity-100 group-focus-visible/usage-provider:opacity-100 group-data-popup-open/usage-provider:opacity-100"
          aria-hidden
        />
      </MenuTrigger>
      <MenuPopup align="start">
        <MenuCheckboxItem
          checked={hiddenProviders.size === 0}
          closeOnClick={false}
          onCheckedChange={(checked) => onChange(checked ? [] : PROVIDER_ORDER)}
        >
          {t.tools.usage.allProviders}
        </MenuCheckboxItem>
        <MenuSeparator />
        {PROVIDER_ORDER.map((provider) => (
          <MenuCheckboxItem
            key={provider}
            checked={!hiddenProviders.has(provider)}
            closeOnClick={false}
            onCheckedChange={(checked) =>
              onChange(
                PROVIDER_ORDER.filter((entry) =>
                  entry === provider ? !checked : hiddenProviders.has(entry),
                ),
              )
            }
          >
            <span className="flex min-w-0 items-center gap-2">
              <ProviderMark provider={provider} className="size-3.5" />
              <span className="truncate">{PROVIDER_PRESENTATION[provider].label}</span>
            </span>
          </MenuCheckboxItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}

/** Reserves the hero footprint until usage arrives; independent limits stay visible beside it. */
function UsageSkeleton() {
  return (
    <section className="flex flex-col gap-3.5 rounded-card-large bg-surface-raised px-5 pt-4.5 pb-4 shadow-usage-chart">
      <Skeleton className="h-9 w-36" />
      <Skeleton className="h-50" />
      <Skeleton className="h-4" />
    </section>
  );
}
