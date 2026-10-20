/** Displays usage totals with a matching loading footprint. */
import { t } from "~/i18n";
import type { JSX } from "react";
import type { MergedUsage } from "@t3tools/shared/usageMerge";
import type { UsageChartMetric } from "./UsageProviderChart";
import { cn } from "../../lib/utils";
import { formatTokens, formatUsd } from "@t3tools/shared/usageFormat";
import { Skeleton } from "../ui/skeleton";

/** The displayed window and metric remain available for the metric strip presentation. */
export interface UsageMetricStripProps {
  readonly merged: MergedUsage;
  readonly loading: boolean;
  readonly metric: UsageChartMetric;
  readonly days: readonly string[];
  readonly hours: readonly string[];
  readonly resolution: "day" | "hour";
}
/** Renders existing totals from merged usage; loading keeps stale values visibly muted. */
export function UsageMetricStrip({ merged, loading }: UsageMetricStripProps): JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="sr-only">{t.tools.usage.totals}</h2>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Metric
          loading={loading}
          label={t.tools.usage.processedTokens}
          value={formatTokens(merged.totalTokens)}
        />
        <Metric
          loading={loading}
          label={t.tools.usage.cachedInput}
          value={formatTokens(merged.cachedInputTokens)}
        />
        <Metric
          loading={loading}
          label={t.tools.usage.uncachedInput}
          value={formatTokens(merged.uncachedInputTokens)}
        />
        <Metric
          loading={loading}
          label={t.tools.usage.output}
          value={formatTokens(merged.outputTokens)}
        />
        <Metric
          loading={loading}
          label={t.tools.usage.cacheSavings}
          value={formatUsd(merged.costQuality.cacheSavingsUsd)}
        />
        <Metric loading={loading} label={t.tools.usage.cost} value={formatUsd(merged.costUsd)} />
      </div>
    </section>
  );
}
/** Reserves the totals footprint until the first usage response arrives. */
export function UsageMetricStripSkeleton(): JSX.Element {
  return (
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
  );
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
/** Keeps existing values visible while their provider is refreshing. */
function figureClass(loading: boolean) {
  return cn("transition-opacity", loading && "opacity-40 delay-150");
}
