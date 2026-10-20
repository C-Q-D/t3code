/** Localized usage presentation and existing interaction behavior. */
import { t } from "~/i18n";
import { ChatGptUsageButton } from "../settings/ChatGptUsageButton";
import { usesChatGptSharing } from "@t3tools/shared/usageLimits";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import { useAtomValue } from "@effect/atom-react";
import {
  ProviderDriverKind,
  USAGE_CONTRACT_VERSION,
  type EnvironmentId,
  type UsageProviderKind,
} from "@t3tools/contracts";
import {
  CircleAlertIcon,
  ChevronDownIcon,
  FilterIcon,
  InfoIcon,
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

import {
  isCompatibleUsageContractVersion,
  type DailyTotals,
  type HourlyTotals,
  type MergedUsage,
} from "@t3tools/shared/usageMerge";

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
  formatCount,
  formatDateTimeShort,
  formatDayShort,
  formatHourShort,
  formatPercent,
  formatTokens,
  formatUsageContractMismatch,
  formatUsd,
  makeWindow,
} from "@t3tools/shared/usageFormat";
import { Button, InlineButton } from "../ui/button";
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
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { WorkspaceBreadcrumbText } from "../WorkspaceBreadcrumb";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { UsageLimitsSection } from "./UsageLimits";
import { UsagePriceOverrides, UsagePriceSummary } from "./UsagePriceOverrides";
import { UsageProviderChart } from "./UsageProviderChart";
import { SpeedPremium, UsageModelDialog } from "./UsageModelDialog";
import { UsageShareBar } from "./UsageShareBar";
import {
  costTypeSegments,
  modelShare,
  sortModelsByTokens,
  speedCostSegments,
  tokenTypeSegments,
} from "./usageBreakdown";
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
  const [breakdown, setBreakdown] = useState<"model" | "time">("model");
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
  // Cost and token views also show quota cards once usage has answered.
  const limitsVisible = selectedEnvironments.length > 0 && shown !== null && canReadDiagnostics;

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
  // Newest first: the window can run 90 periods, so the interesting end
  // belongs at the top of the table.
  const breakdownPeriods = useMemo<readonly (DailyTotals | HourlyTotals)[]>(
    () => (shownHourly ? merged.hourly : merged.daily).toReversed(),
    [shownHourly, merged.daily, merged.hourly],
  );
  const breakdownModels = useMemo(
    () =>
      breakdown === "model" && metric === "tokens"
        ? sortModelsByTokens(merged.models)
        : merged.models,
    [breakdown, merged.models, metric],
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
  const chartLoadingProviders = useMemo(
    () =>
      new Set(
        activeProviders.filter(
          (provider) => loading.everyProvider || loading.providers.has(provider),
        ),
      ),
    [activeProviders, loading.everyProvider, loading.providers],
  );
  const selectedModel =
    selectedModelKey === null
      ? undefined
      : merged.models.find((model) => `${model.provider}:${model.model}` === selectedModelKey);
  const summaryRows: Array<
    | { readonly kind: "usage"; readonly provider: UsageProviderKind }
    | { readonly kind: "enable"; readonly environment: EnvironmentUsageStatus }
  > = activeProviders.map((provider) => ({ kind: "usage", provider }));
  const cursorInsertAt =
    Math.max(activeProviders.indexOf("codex"), activeProviders.indexOf("claude")) + 1;
  summaryRows.splice(
    cursorInsertAt,
    0,
    ...cursorAccessEnvironments.map((environment) => ({ kind: "enable" as const, environment })),
  );
  const timeValueColumnWidth = `${60 / (activeProviders.length + 2)}%`;

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
    void Promise.all([refresh(nextWindow), refreshLimits()]).finally(() => {
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
            disabled={isRefreshing || !canReadDiagnostics}
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
            disabled={isRefreshing || !canReadDiagnostics}
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
          {/* M1 caps the content at 980px; border-box width includes its two 28px gutters. */}
          <WorkspacePageContainer
            width="wide"
            className="max-w-259 gap-4.5 px-7 pt-6 pb-10 sm:px-7"
          >
            {topbarContent}
            {selectedEnvironments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {environments.length === 0
                  ? t.tools.usage.connectToView(false)
                  : t.tools.usage.selectToView(false)}
              </p>
            ) : shown === null ? (
              <UsageSkeleton />
            ) : !canReadDiagnostics ? (
              <div className="space-y-2 py-12 text-center text-sm text-muted-foreground">
                {selectedEnvironments.map((environment) => (
                  <p key={environment.environmentId}>
                    {selectedEnvironments.length > 1 ? `${environment.label}: ` : null}
                    {environment.error}
                  </p>
                ))}
              </div>
            ) : (
              <div aria-busy={loading.partial} className="flex flex-col gap-4.5">
                {sourceMessages.map((message) => (
                  <p key={message} className="mb-4 text-sm text-muted-foreground">
                    {message}
                  </p>
                ))}
                <section className="usage-chart-surface flex flex-col gap-3.5 rounded-card-large bg-surface-raised px-5 pt-4.5 pb-4 shadow-usage-chart">
                  <div className="flex flex-wrap items-baseline gap-3.5">
                    <span
                      className={cn(
                        "font-serif text-usage-total font-bold tabular-nums",
                        figureClass(loading.partial),
                      )}
                    >
                      {metric === "cost"
                        ? formatUsd(merged.costUsd)
                        : formatTokens(merged.totalTokens)}
                    </span>
                    <span
                      className="text-secondary-copy-large text-secondary-label"
                      aria-label={windowLabel}
                    >
                      {shownHourly ? t.tools.usage.past24h : t.tools.usage.pastDays(days.length)}
                    </span>
                    <span className="sr-only">
                      {formatCount(merged.sessions)}
                      {t.tools.usage.sessionsSuffix}
                      {metric === "cost" && t.tools.usage.apiEstimate}
                    </span>
                    {metric === "cost" && merged.costQuality.unpricedShare > 0 ? (
                      <Popover>
                        <PopoverTrigger
                          openOnHover
                          render={<InlineButton tone="muted" />}
                          aria-label={t.tools.usage.unpricedDetails}
                        >
                          <InfoIcon className="size-3" aria-hidden />
                        </PopoverTrigger>
                        <PopoverPopup side="top" tooltipStyle>
                          {t.tools.usage.estimateExcludes}{" "}
                          {formatPercent(merged.costQuality.unpricedShare)}
                          {t.tools.usage.unpricedRecordsSuffix}
                        </PopoverPopup>
                      </Popover>
                    ) : null}
                    <div className="ml-auto flex flex-wrap items-center gap-3.5">
                      {summaryRows.map((row) => {
                        if (row.kind === "enable")
                          return (
                            <CursorEnableRow
                              key={`enable:${row.environment.environmentId}`}
                              environmentId={row.environment.environmentId}
                              label={row.environment.label}
                              showEnvironment={selectedEnvironments.length > 1}
                              onEnabled={() => {
                                void refresh();
                                void refreshLimits(false, true);
                              }}
                            />
                          );
                        const totals = merged.providers.find(
                          (entry) => entry.provider === row.provider,
                        );
                        const share =
                          metric === "cost" ? (totals?.costShare ?? 0) : (totals?.tokenShare ?? 0);
                        const providerLoading = isProviderLoading(row.provider);
                        const awaitingData =
                          providerLoading && !providersWithData.includes(row.provider);
                        return (
                          <span
                            key={row.provider}
                            className={cn(
                              "flex items-center gap-1.5 text-secondary-copy text-code-foreground",
                              row.provider === "claude" && "-order-1",
                              figureClass(providerLoading),
                            )}
                          >
                            <span
                              aria-hidden
                              className="size-2.5 shrink-0 rounded-usage-swatch"
                              style={{ backgroundColor: PROVIDER_PRESENTATION[row.provider].color }}
                            />
                            {PROVIDER_PRESENTATION[row.provider].label}{" "}
                            {awaitingData ? "—" : formatPercent(share)}
                            <span className="sr-only">
                              {t.tools.usage.sessionCount(
                                totals?.sessions ?? 0,
                                formatCount(totals?.sessions ?? 0),
                              )}{" "}
                              · {formatUsd(totals?.costUsd ?? 0)} ·{" "}
                              {formatTokens(totals?.totalTokens ?? 0)}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  {!hiddenProviders.has("codex") &&
                  [...presentations].some(
                    ([id, presentation]) =>
                      (selectedEnvironmentIds === null || selectedEnvironmentIds.has(id)) &&
                      presentation.serverConfig?.providers.some(usesChatGptSharing),
                  ) ? (
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{t.tools.usage.chatgptSharedUsage}</span>
                      <ChatGptUsageButton size="xs" />
                    </div>
                  ) : null}

                  <UsageProviderChart
                    providers={activeProviders}
                    loadingProviders={chartLoadingProviders}
                    days={days}
                    daily={merged.daily}
                    hours={hours}
                    hourly={merged.hourly}
                    metric={metric}
                    referenceTime={shownWindow.untilTime}
                    resolution={shownHourly ? "hour" : "day"}
                    timeZone={shownWindow.timeZone}
                  />
                </section>

                <section className="flex flex-col gap-2">
                  <h2 className="sr-only">{t.tools.usage.totals}</h2>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                    <Metric
                      loading={loading.partial}
                      label={t.tools.usage.processedTokens}
                      value={formatTokens(merged.totalTokens)}
                    />
                    <Metric
                      loading={loading.partial}
                      label={t.tools.usage.cachedInput}
                      value={formatTokens(merged.cachedInputTokens)}
                    />
                    <Metric
                      loading={loading.partial}
                      label={t.tools.usage.uncachedInput}
                      value={formatTokens(merged.uncachedInputTokens)}
                    />
                    <Metric
                      loading={loading.partial}
                      label={t.tools.usage.output}
                      value={formatTokens(merged.outputTokens)}
                    />
                    <Metric
                      loading={loading.partial}
                      label={t.tools.usage.cacheSavings}
                      value={formatUsd(merged.costQuality.cacheSavingsUsd)}
                    />
                    <Metric
                      loading={loading.partial}
                      label={t.tools.usage.cost}
                      value={formatUsd(merged.costUsd)}
                    />
                  </div>
                </section>

                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-medium text-foreground">{t.tools.usage.breakdown}</h2>
                  <ToggleGroup
                    aria-label={t.tools.usage.usageBreakdown}
                    variant="segmented"
                    value={[breakdown]}
                    onValueChange={(next) => {
                      const value = next[0];
                      if (value === "model" || value === "time") setBreakdown(value);
                    }}
                  >
                    {(
                      [
                        { value: "model", label: t.tools.usage.model },
                        {
                          value: "time",
                          label: shownHourly ? t.tools.usage.hour : t.tools.usage.day,
                        },
                      ] as const
                    ).map((option) => (
                      <Toggle key={option.value} value={option.value}>
                        {option.label}
                      </Toggle>
                    ))}
                  </ToggleGroup>
                </div>
                <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-9">
                  <section className="flex min-w-0 flex-col gap-2.5 lg:col-span-5">
                    {breakdown === "model" ? (
                      <div className="min-w-0 overflow-hidden rounded-card-row bg-usage-table-well shadow-usage-table">
                        <table className="usage-model-table w-full table-fixed text-secondary-copy-large">
                          <colgroup>
                            <col />
                            <col />
                            <col className="w-17.5" />
                          </colgroup>
                          <thead className="bg-usage-table-header">
                            <tr>
                              <th className="px-3.5 py-2.5 text-left font-bold">
                                {t.tools.usage.model}
                              </th>
                              <th className="px-3.5 py-2.5 text-left font-bold">
                                {t.tools.usage.share}
                              </th>
                              <th className="px-3.5 py-2.5 text-right font-bold">
                                {t.tools.usage.sessions}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {breakdownModels.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={3}
                                  className="px-3.5 py-6 text-center text-muted-foreground"
                                >
                                  {t.tools.usage.noActivity}
                                </td>
                              </tr>
                            ) : (
                              breakdownModels.map((model) => {
                                const key = `${model.provider}:${model.model}`;
                                const share = modelShare(
                                  model,
                                  metric === "tokens" ? "tokens" : "cost",
                                );
                                return (
                                  <tr
                                    key={key}
                                    className={cn(
                                      "relative border-t border-usage-row-divider hover:bg-secondary focus-within:bg-secondary",
                                      figureClass(isProviderLoading(model.provider)),
                                    )}
                                  >
                                    <td className="px-3.5 py-2.25">
                                      <button
                                        type="button"
                                        onClick={() => setSelectedModelKey(key)}
                                        className="flex w-full min-w-0 items-center gap-2 text-left outline-none after:absolute after:inset-0"
                                      >
                                        <span
                                          aria-hidden
                                          className="size-2 shrink-0 rounded-usage-model-dot"
                                          style={{
                                            backgroundColor:
                                              PROVIDER_PRESENTATION[model.provider].color,
                                          }}
                                        />
                                        <span className="truncate">{model.model}</span>
                                      </button>
                                    </td>
                                    <td className="px-3.5 py-2.25 font-mono text-secondary-copy tabular-nums">
                                      <span className="flex items-center gap-2">
                                        <span
                                          aria-hidden
                                          className="flex h-1.25 min-w-0 flex-1 overflow-hidden rounded-usage-swatch bg-usage-share-track"
                                        >
                                          <span
                                            className="h-full rounded-usage-swatch bg-code-foreground"
                                            style={{ width: `${(share ?? 0) * 100}%` }}
                                          />
                                        </span>
                                        {share === null
                                          ? t.tools.usage.unpriced
                                          : formatPercent(share)}
                                      </span>
                                    </td>
                                    {/* ModelTotals does not report unique sessions; records are not session counts. */}
                                    <td className="px-3.5 py-2.25 text-right font-mono text-secondary-copy text-muted-foreground">
                                      —
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <table className="w-full table-fixed text-sm">
                        <colgroup>
                          <col className="w-2/5" />
                          {activeProviders.map((provider) => (
                            <col key={provider} style={{ width: timeValueColumnWidth }} />
                          ))}
                          <col style={{ width: timeValueColumnWidth }} />
                          <col style={{ width: timeValueColumnWidth }} />
                        </colgroup>
                        <thead>
                          <tr className="border-b border-border text-left text-xs text-muted-foreground">
                            <th className="py-2 font-normal">
                              {shownHourly ? t.tools.usage.hour : t.tools.usage.day}
                            </th>
                            {activeProviders.map((provider) => (
                              <th key={provider} className="py-2 text-right font-normal">
                                {PROVIDER_PRESENTATION[provider].label}
                              </th>
                            ))}
                            <th className="py-2 text-right font-normal">{t.tools.usage.total}</th>
                            <th className="py-2 text-right font-normal">{t.tools.usage.tokens}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {breakdownPeriods.length === 0 ? (
                            <tr>
                              <td
                                colSpan={activeProviders.length + 3}
                                className="py-6 text-center text-muted-foreground"
                              >
                                {t.tools.usage.noActivity}
                              </td>
                            </tr>
                          ) : (
                            breakdownPeriods.map((period) => (
                              <tr
                                key={"hourStart" in period ? period.hourStart : period.day}
                                className="border-b border-border/50 transition-colors hover:bg-muted/50"
                              >
                                <td className="py-2 text-foreground">
                                  {"hourStart" in period
                                    ? formatHourShort(
                                        period.hourStart,
                                        shownWindow.timeZone,
                                        t.chat.workLog.shared.usage,
                                      )
                                    : formatDayShort(period.day, t.chat.workLog.shared.usage)}
                                </td>
                                {activeProviders.map((provider) => (
                                  <td
                                    key={provider}
                                    className={cn(
                                      "py-2 text-right text-muted-foreground tabular-nums",
                                      figureClass(isProviderLoading(provider)),
                                    )}
                                  >
                                    {formatUsd(period.byProvider.get(provider)?.costUsd ?? 0)}
                                  </td>
                                ))}
                                <td
                                  className={cn(
                                    "py-2 text-right text-foreground tabular-nums",
                                    figureClass(loading.partial),
                                  )}
                                >
                                  {formatUsd(period.costUsd)}
                                </td>
                                <td
                                  className={cn(
                                    "py-2 text-right text-muted-foreground tabular-nums",
                                    figureClass(loading.partial),
                                  )}
                                >
                                  {formatTokens(period.totalTokens)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}
                  </section>
                  <div className="min-w-0 lg:col-span-4">
                    <UsageLimitsSection
                      selectedEnvironmentIds={selectedEnvironmentIds}
                      hiddenProviders={hiddenProviders}
                      now={limitsNow}
                    />
                  </div>
                </div>
                <UsagePriceSummary
                  selectedEnvironmentIds={selectedEnvironmentIds}
                  onEditModel={(model) => setPriceDialog(model === undefined ? {} : { model })}
                />
                {merged.totalTokens > 0 ? (
                  <section
                    className={cn(
                      "grid gap-x-12 gap-y-8 lg:grid-cols-2",
                      figureClass(loading.partial),
                    )}
                  >
                    {metric === "tokens" ? (
                      <UsageShareBar
                        label={t.tools.usage.tokensByType}
                        segments={tokenTypeSegments(merged)}
                        format={formatTokens}
                      />
                    ) : (
                      <>
                        <UsageShareBar
                          label={t.tools.usage.costByType}
                          segments={costTypeSegments(merged.categoryCost)}
                          format={formatUsd}
                        />
                        {merged.speedCost.fast + merged.speedCost.ultrafast > 0 ? (
                          <UsageShareBar
                            label={t.tools.usage.costBySpeed}
                            segments={speedCostSegments(merged.speedCost)}
                            format={formatUsd}
                            aside={<SpeedPremium premiumUsd={merged.speedCost.premium} />}
                          />
                        ) : null}
                      </>
                    )}
                  </section>
                ) : null}
              </div>
            )}
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

const CURSOR_KEYCHAIN_COPY = t.tools.usage.keychainHint;

/** Enables Cursor keychain usage for environmentId on click; label identifies the environment, tooltip selects presentation, and onEnabled refreshes successful changes. */
function CursorEnableButton({
  environmentId,
  label,
  onEnabled,
  tooltip,
  buttonText = t.tools.usage.enable,
}: {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly onEnabled: () => void;
  readonly tooltip: boolean;
  readonly buttonText?: string;
}) {
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: "enable Cursor account usage",
  });
  const [pending, setPending] = useState(false);
  const enable = async () => {
    setPending(true);
    try {
      const result = await updateSettings({
        environmentId,
        input: { patch: { cursorKeychainUsageEnabled: true } },
      });
      if (result._tag === "Success") onEnabled();
    } finally {
      setPending(false);
    }
  };
  const button = tooltip ? (
    <InlineButton
      disabled={pending}
      aria-busy={pending}
      aria-label={t.tools.usage.enableCursorUsage(label)}
      onClick={() => void enable()}
    >
      {buttonText}
    </InlineButton>
  ) : (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      aria-busy={pending}
      aria-label={t.tools.usage.enableCursorUsage(label)}
      onClick={() => void enable()}
    >
      {buttonText}
    </Button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipPopup>{CURSOR_KEYCHAIN_COPY}</TooltipPopup>
    </Tooltip>
  );
}

function CursorEnableRow({
  environmentId,
  label,
  showEnvironment,
  onEnabled,
}: {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly showEnvironment: boolean;
  readonly onEnabled: () => void;
}) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-4 text-sm">
      <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: PROVIDER_PRESENTATION.cursor.color }}
        />
        <ProviderMark provider="cursor" className="size-4" />
        <span className="truncate">Cursor{showEnvironment ? ` · ${label}` : ""}</span>
      </span>
      <CursorEnableButton
        environmentId={environmentId}
        label={label}
        onEnabled={onEnabled}
        tooltip
      />
    </div>
  );
}

/** Renders Cursor usage enable controls for the supplied environments and invokes onEnabled after successful activation. */
function CursorEnableLimits({
  environments,
  onEnabled,
}: {
  readonly environments: readonly EnvironmentUsageStatus[];
  readonly onEnabled: () => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ProviderInstanceIcon
          driverKind={ProviderDriverKind.make("cursor")}
          displayName="Cursor"
          indicatorBackground="var(--background)"
          className="size-5"
          iconClassName="size-4 text-foreground/80"
        />
        Cursor
      </h2>
      <div className="flex flex-col items-start gap-3 rounded-lg border border-border/60 p-4">
        <p className="text-xs text-muted-foreground">{CURSOR_KEYCHAIN_COPY}</p>
        <div className="flex flex-wrap gap-2">
          {environments.map((environment) => (
            <CursorEnableButton
              key={environment.environmentId}
              environmentId={environment.environmentId}
              label={environment.label}
              buttonText={
                environments.length > 1
                  ? t.tools.usage.enableOn(environment.label)
                  : t.tools.usage.enable
              }
              onEnabled={onEnabled}
              tooltip={false}
            />
          ))}
        </div>
      </div>
    </section>
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

/** Mutes a figure that is still coming in. The delay keeps a quick answer from flashing. */
function figureClass(loading: boolean) {
  return cn("transition-opacity", loading && "opacity-40 delay-150");
}

/** Shows one live total in M1's recessed well; loading mutes incoming figures without replacing their value. */
function Metric({
  label,
  value,
  loading,
}: {
  readonly label: string;
  readonly value: string;
  readonly loading: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-usage-total bg-usage-total-well px-3.5 py-3 shadow-usage-total">
      <span className="whitespace-nowrap text-secondary-copy text-secondary-label">{label}</span>
      <span
        className={cn(
          "font-mono text-card-title leading-normal font-medium text-foreground tabular-nums",
          figureClass(loading),
        )}
      >
        {value}
      </span>
    </div>
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

/**
 * Preserves the chart and six total wells while environment results load.
 * Replaced by results as soon as the first environment answers.
 */
function UsageSkeleton() {
  return (
    <>
      <section className="flex flex-col gap-3.5 rounded-card-large bg-surface-raised px-5 pt-4.5 pb-4 shadow-usage-chart">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-50" />
        <Skeleton className="h-4" />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="sr-only">{t.tools.usage.totals}</h2>
        <MetricSkeletons
          labels={[
            t.tools.usage.processedTokens,
            t.tools.usage.cachedInput,
            t.tools.usage.uncachedInput,
            t.tools.usage.output,
            t.tools.usage.cacheSavings,
            t.tools.usage.cost,
          ]}
        />
      </section>

      <section className="grid gap-x-12 gap-y-8 lg:grid-cols-2">
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-2" />
          <Skeleton className="h-4 w-72" />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-foreground">{t.tools.usage.breakdown}</h2>
          <Skeleton shape="card" className="h-7 w-28" />
        </div>
        <Skeleton className="h-44" />
      </section>
    </>
  );
}

/** Holds the same six-well footprint for the supplied localized labels before usage data arrives. */
function MetricSkeletons({ labels }: { readonly labels: readonly string[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      {labels.map((label) => (
        <div
          key={label}
          className="flex min-w-0 flex-col gap-1 rounded-usage-total bg-usage-total-well px-3.5 py-3 shadow-usage-total"
        >
          <span className="whitespace-nowrap text-secondary-copy text-secondary-label">
            {label}
          </span>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}
