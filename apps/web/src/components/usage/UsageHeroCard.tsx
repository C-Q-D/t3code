/** Displays the selected usage window; page state owns fetching and filters. */
import { t } from "~/i18n";
import type { JSX } from "react";
import type { UsageProviderKind } from "@t3tools/contracts";
import type { MergedUsage } from "@t3tools/shared/usageMerge";
import type { UsageChartMetric } from "./UsageProviderChart";
import { cn } from "../../lib/utils";
import { useMemo } from "react";
import { formatUsd, formatTokens, formatPercent, formatCount } from "@t3tools/shared/usageFormat";
import { InfoIcon } from "lucide-react";
import { InlineButton } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { UsageProviderChart } from "./UsageProviderChart";
import { PROVIDER_PRESENTATION } from "./usageProviders";

/** Inputs describe the displayed window, which may lag the selected range while loading. */
export interface UsageHeroCardProps {
  readonly metric: UsageChartMetric;
  readonly merged: MergedUsage;
  /** 页面级加载状态，与 UsagePage 现有 loading 对象同形 */
  readonly loading: {
    readonly partial: boolean;
    readonly everyProvider: boolean;
    readonly providers: ReadonlySet<UsageProviderKind>;
  };
  readonly activeProviders: readonly UsageProviderKind[];
  readonly providersWithData: readonly UsageProviderKind[];
  readonly days: readonly string[];
  readonly hours: readonly string[];
  readonly resolution: "day" | "hour";
  readonly timeZone: string;
  readonly referenceTime: string | undefined;
  /** 完整日期范围，供读屏 */
  readonly windowLabel: string;
}
/** Renders totals, provider shares and the chart without triggering requests. */
export function UsageHeroCard({
  metric,
  merged,
  loading,
  activeProviders,
  providersWithData,
  days,
  hours,
  resolution,
  timeZone,
  referenceTime,
  windowLabel,
}: UsageHeroCardProps): JSX.Element {
  const shownHourly = resolution === "hour";
  const isProviderLoading = (provider: UsageProviderKind) =>
    loading.everyProvider || loading.providers.has(provider);
  const chartLoadingProviders = useMemo(
    () =>
      new Set(
        activeProviders.filter(
          (provider) => loading.everyProvider || loading.providers.has(provider),
        ),
      ),
    [activeProviders, loading.everyProvider, loading.providers],
  );
  return (
    <section className="usage-chart-surface flex flex-col gap-3.5 rounded-card-large bg-surface-raised px-5 pt-4.5 pb-4 shadow-usage-chart">
      <div className="flex flex-wrap items-baseline gap-3.5">
        <span
          className={cn(
            "font-serif text-usage-total font-bold tabular-nums",
            figureClass(loading.partial),
          )}
        >
          {metric === "cost" ? formatUsd(merged.costUsd) : formatTokens(merged.totalTokens)}
        </span>
        <span className="text-secondary-copy-large text-secondary-label" aria-label={windowLabel}>
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
              {t.tools.usage.estimateExcludes} {formatPercent(merged.costQuality.unpricedShare)}
              {t.tools.usage.unpricedRecordsSuffix}
            </PopoverPopup>
          </Popover>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-3.5">
          {activeProviders.map((provider) => {
            const totals = merged.providers.find((entry) => entry.provider === provider);
            const share = metric === "cost" ? (totals?.costShare ?? 0) : (totals?.tokenShare ?? 0);
            const providerLoading = isProviderLoading(provider);
            const awaitingData = providerLoading && !providersWithData.includes(provider);
            return (
              <span
                key={provider}
                className={cn(
                  "flex items-center gap-1.5 text-secondary-copy text-code-foreground",
                  provider === "claude" && "-order-1",
                  figureClass(providerLoading),
                )}
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-usage-swatch"
                  style={{ backgroundColor: PROVIDER_PRESENTATION[provider].color }}
                />
                {PROVIDER_PRESENTATION[provider].label} {awaitingData ? "—" : formatPercent(share)}
                <span className="sr-only">
                  {t.tools.usage.sessionCount(
                    totals?.sessions ?? 0,
                    formatCount(totals?.sessions ?? 0),
                  )}{" "}
                  · {formatUsd(totals?.costUsd ?? 0)} · {formatTokens(totals?.totalTokens ?? 0)}
                </span>
              </span>
            );
          })}
        </div>
      </div>
      <UsageProviderChart
        providers={activeProviders}
        loadingProviders={chartLoadingProviders}
        days={days}
        daily={merged.daily}
        hours={hours}
        hourly={merged.hourly}
        metric={metric}
        referenceTime={referenceTime}
        resolution={resolution}
        timeZone={timeZone}
      />
    </section>
  );
}
/** Keeps existing values visible while their provider is refreshing. */
function figureClass(loading: boolean) {
  return cn("transition-opacity", loading && "opacity-40 delay-150");
}
