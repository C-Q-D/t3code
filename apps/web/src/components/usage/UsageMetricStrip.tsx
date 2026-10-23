/** Presents six real usage totals; only tokens and cost have period series. */
import { t } from "~/i18n";
import { useId, type JSX } from "react";
import type { MergedUsage } from "@t3tools/shared/usageMerge";
import type { UsageChartMetric } from "./UsageProviderChart";
import { cn } from "../../lib/utils";
import { formatTokens, formatUsd, formatPercent } from "@t3tools/shared/usageFormat";
import { buildMetricSeries, summarizeColumns } from "./usageChart.logic";
import { UsageAnimatedValue, useUsageEntrance } from "./UsagePresentationMotion";

/** The displayed window and metric remain available for the metric strip presentation. */
export interface UsageMetricStripProps {
  readonly merged: MergedUsage;
  readonly loading: boolean;
  readonly metric: UsageChartMetric;
  readonly days: readonly string[];
  readonly hours: readonly string[];
  readonly resolution: "day" | "hour";
}

/** Renders the already-filtered merged totals; missing periods stay in both sparkline denominators. */
export function UsageMetricStrip({
  merged,
  loading,
  days,
  hours,
  resolution,
}: UsageMetricStripProps): JSX.Element {
  const entranceRef = useUsageEntrance(0.045);
  const hourly = resolution === "hour";
  const series = buildMetricSeries(
    hourly ? hours : days,
    hourly
      ? new Map(merged.hourly.map((entry) => [entry.hourStart, entry]))
      : new Map(merged.daily.map((entry) => [entry.day, entry])),
    merged.providers.map((entry) => entry.provider),
  );
  const averageCost = summarizeColumns(series.cost.map((total) => ({ total }))).average;
  // Cache writes are misses, matching the model detail's input-based cache hit rate.
  const input = merged.cachedInputTokens + merged.uncachedInputTokens + merged.cacheCreationTokens;
  const hitRate = input > 0 ? formatPercent(merged.cachedInputTokens / input) : "-";
  const outputShare =
    merged.totalTokens > 0 ? formatPercent(merged.outputTokens / merged.totalTokens, 2) : "-";
  const savingsRatio =
    merged.costUsd > 0 ? (merged.costQuality.cacheSavingsUsd / merged.costUsd).toFixed(1) : "-";
  return (
    <section ref={entranceRef} className="usage-lux-strip" aria-busy={loading}>
      <h2 className="sr-only">{t.tools.usage.totals}</h2>
      <Metric
        loading={loading}
        label={t.tools.usage.processedTokens}
        value={merged.totalTokens}
        format={formatTokens}
        detail={t.tools.usage.allTokens}
        series={series.tokens}
      />
      <Metric
        loading={loading}
        label={t.tools.usage.cachedInput}
        value={merged.cachedInputTokens}
        format={formatTokens}
        detail={t.tools.usage.cacheHitDetail(hitRate)}
      />
      <Metric
        loading={loading}
        label={t.tools.usage.uncachedInput}
        value={merged.uncachedInputTokens}
        format={formatTokens}
        detail={t.tools.usage.cacheMissDetail}
      />
      <Metric
        loading={loading}
        label={t.tools.usage.output}
        value={merged.outputTokens}
        format={formatTokens}
        detail={t.tools.usage.outputShareDetail(outputShare)}
      />
      <Metric
        loading={loading}
        label={t.tools.usage.cacheSavings}
        value={merged.costQuality.cacheSavingsUsd}
        format={formatUsd}
        detail={t.tools.usage.savingsMultipleDetail(savingsRatio)}
        tone="save"
      />
      <Metric
        loading={loading}
        label={t.tools.usage.cost}
        value={merged.costUsd}
        format={formatUsd}
        detail={`${hourly ? t.tools.usage.averagePerHour : t.tools.usage.averagePerDay} ${formatUsd(averageCost)}`}
        tone="cost"
        series={series.cost}
      />
    </section>
  );
}

/** Reserves the same six-cell recessed strip, without a perpetual loading animation. */
export function UsageMetricStripSkeleton(): JSX.Element {
  const labels = [
    t.tools.usage.processedTokens,
    t.tools.usage.cachedInput,
    t.tools.usage.uncachedInput,
    t.tools.usage.output,
    t.tools.usage.cacheSavings,
    t.tools.usage.cost,
  ];
  return (
    <section className="usage-lux-strip" aria-busy="true">
      <h2 className="sr-only">{t.tools.usage.totals}</h2>
      {labels.map((label) => (
        <div key={label} className="usage-lux-cell">
          <span className="usage-lux-kpi-label">{label}</span>
          <span className="usage-lux-kpi-placeholder" aria-hidden />
          <span className="usage-lux-detail-placeholder" aria-hidden />
        </div>
      ))}
    </section>
  );
}

/** Displays one total with a stable final readout; only the two real period metrics receive series. */
function Metric({
  label,
  value,
  format,
  loading,
  detail,
  series,
  tone,
}: {
  readonly label: string;
  readonly value: number;
  readonly format: (value: number) => string;
  readonly loading: boolean;
  readonly detail: string;
  readonly series?: readonly number[];
  readonly tone?: "save" | "cost";
}) {
  return (
    <div
      className={cn(
        "usage-lux-cell",
        tone === "save" && "usage-lux-saving",
        tone === "cost" && "usage-lux-cost",
      )}
    >
      <span className="usage-lux-kpi-label">{label}</span>
      <div className={cn("usage-lux-kpi-content", loading && "opacity-40")}>
        <UsageAnimatedValue className="usage-lux-kpi-value" value={value} format={format} />
        <span className="usage-lux-kpi-detail">{detail}</span>
        {series && <UsageSparkline values={series} />}
      </div>
    </div>
  );
}

/** Draws nonnegative ordered values on a shared 22px baseline; empty series draw nothing and one value spans the cell. */
function UsageSparkline({ values }: { readonly values: readonly number[] }) {
  const id = useId();
  const max = Math.max(0, ...values);
  const points = values.map((value, index) => {
    const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100;
    const y = max > 0 ? 21 - (value / max) * 19 : 21;
    return `${x},${y}`;
  });
  if (values.length === 1) points.push(`100,${max > 0 ? 2 : 21}`);
  return (
    <svg
      className="usage-lux-sparkline"
      viewBox="0 0 100 22"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity=".28" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {values.length > 0 && (
        <>
          <polygon points={`0,22 ${points.join(" ")} 100,22`} fill={`url(#${id})`} />
          <polyline
            points={points.join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  );
}
