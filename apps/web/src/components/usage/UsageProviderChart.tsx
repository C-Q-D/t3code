/** Localized usage presentation and existing interaction behavior. */
import { usePrimarySettings } from "../../hooks/useSettings";
import { resolveHour12 } from "../../timestampFormat";
import { t } from "~/i18n";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import type { UsageProviderKind } from "@t3tools/contracts";
import { useLayoutEffect, useRef, useState } from "react";

import type { DailyTotals, HourlyTotals } from "@t3tools/shared/usageMerge";
import {
  formatDayShort,
  formatHourShort,
  formatRelativeHourShort,
  formatTokens,
  formatUsd,
} from "@t3tools/shared/usageFormat";
import { cn } from "~/lib/utils";
import { PROVIDER_ORDER, PROVIDER_PRESENTATION } from "./usageProviders";
import { chartScale } from "./usageChart.logic";
import { UsageChartBars } from "./UsageChartBars";
import { observeResize } from "~/lib/observeResize";

const NONE_LOADING: ReadonlySet<UsageProviderKind> = new Set();

/** Supported chart measures; quota limits use their separate page section. */
export type UsageChartMetric = "tokens" | "cost";

/** Selected providers, local time window and merged totals; loading flags only affect presentation. */
interface UsageProviderChartProps {
  readonly providers: readonly UsageProviderKind[];
  /** Providers whose figures are still coming in: their bars are muted. */
  readonly loadingProviders?: ReadonlySet<UsageProviderKind>;
  readonly days: readonly string[];
  readonly daily: readonly DailyTotals[];
  readonly hours: readonly string[];
  readonly hourly: readonly HourlyTotals[];
  readonly metric: UsageChartMetric;
  readonly referenceTime: string | undefined;
  readonly resolution: "day" | "hour";
  readonly timeZone: string;
  readonly hour12?: boolean;
}

/** One period's provider values, shared by stacked bars and the hover readout. */
export interface DayColumn {
  readonly bands: readonly {
    readonly provider: UsageProviderKind;
    readonly value: number;
  }[];
  readonly total: number;
}

/** Reads a provider's selected measure from a period; missing providers and periods contribute zero. */
function valueFor(
  totals: DailyTotals | HourlyTotals | undefined,
  provider: UsageProviderKind,
  metric: UsageChartMetric,
): number {
  const entry = totals?.byProvider.get(provider);
  if (entry === undefined) return 0;
  return metric === "tokens" ? entry.totalTokens : entry.costUsd;
}

/** Builds columns in requested period order, filling absent periods/providers with zero for the selected metric. */
export function buildPeriodColumns(
  periods: readonly string[],
  byPeriod: ReadonlyMap<string, DailyTotals | HourlyTotals>,
  metric: UsageChartMetric,
): readonly DayColumn[] {
  return periods.map((period) => {
    const entry = byPeriod.get(period);
    const bands = PROVIDER_ORDER.map((provider) => ({
      provider,
      value: valueFor(entry, provider, metric),
    }));
    return { bands, total: bands.reduce((sum, band) => sum + band.value, 0) };
  });
}

/** Renders supplied provider totals over the selected time window and metric, with accessible chart labels and hover details; empty data remains a valid chart. */
export function UsageProviderChart({
  providers,
  loadingProviders = NONE_LOADING,
  days,
  daily,
  hours,
  hourly,
  metric,
  referenceTime,
  resolution,
  timeZone,
  hour12: requestedHour12,
}: UsageProviderChartProps) {
  const settingsHour12 = usePrimarySettings((settings) => resolveHour12(settings.timestampFormat));
  const hour12 = requestedHour12 ?? settingsHour12;
  const periods = resolution === "hour" ? hours : days;
  const totals: readonly (DailyTotals | HourlyTotals)[] = resolution === "hour" ? hourly : daily;
  const byPeriod = new Map(
    totals.map((entry) => ["hourStart" in entry ? entry.hourStart : entry.day, entry]),
  );
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const hoverPositionRef = useRef<{ x: number; y: number } | null>(null);

  const columns = buildPeriodColumns(periods, byPeriod, metric).map((column) => {
    const bands = column.bands.filter((band) => providers.includes(band.provider));
    return { bands, total: bands.reduce((sum, band) => sum + band.value, 0) };
  });
  const scale = chartScale(columns, loadingProviders);
  const format = metric === "tokens" ? formatTokens : formatUsd;

  const positionTooltip = () => {
    const plot = plotRef.current;
    const tooltip = tooltipRef.current;
    const hoverPosition = hoverPositionRef.current;
    if (plot === null || tooltip === null || hoverPosition === null) return;

    const gap = 12;
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    const plotWidth = plot.clientWidth;
    const plotHeight = plot.clientHeight;
    const preferredLeft =
      hoverPosition.x + gap + tooltipWidth <= plotWidth
        ? hoverPosition.x + gap
        : hoverPosition.x - gap - tooltipWidth;
    const preferredTop =
      hoverPosition.y + gap + tooltipHeight <= plotHeight
        ? hoverPosition.y + gap
        : hoverPosition.y - gap - tooltipHeight;
    const left = Math.min(Math.max(0, preferredLeft), Math.max(0, plotWidth - tooltipWidth));
    const top = Math.min(Math.max(0, preferredTop), Math.max(0, plotHeight - tooltipHeight));
    plot.style.setProperty("--usage-tooltip-left", `${left}px`);
    plot.style.setProperty("--usage-tooltip-top", `${top}px`);
  };

  useLayoutEffect(() => {
    if (hoverIndex === null) return;
    positionTooltip();

    const plot = plotRef.current;
    const tooltip = tooltipRef.current;
    if (plot === null || tooltip === null) return;

    return observeResize([plot, tooltip], positionTooltip);
  }, [hoverIndex, positionTooltip]);

  const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const plot = plotRef.current;
    if (plot === null || periods.length === 0) return;
    const bounds = plot.getBoundingClientRect();
    if (bounds.width === 0) return;
    const localX = Math.min(bounds.width, Math.max(0, event.clientX - bounds.left));
    const localY = Math.min(bounds.height, Math.max(0, event.clientY - bounds.top));
    const fraction = localX / bounds.width;
    const index = Math.floor(fraction * periods.length);
    hoverPositionRef.current = { x: localX, y: localY };
    positionTooltip();
    setHoverIndex(Math.min(periods.length - 1, Math.max(0, index)));
  };

  const hoveredPeriod = hoverIndex === null ? undefined : periods[hoverIndex];
  const hoveredColumn = hoverIndex === null ? undefined : columns[hoverIndex];
  const partial = providers.some((provider) => loadingProviders.has(provider));
  const formatPeriod = (period: string) =>
    resolution === "hour"
      ? formatHourShort(period, timeZone, t.chat.workLog.shared.usage, hour12)
      : formatDayShort(period, t.chat.workLog.shared.usage);
  const formatTooltipPeriod = (period: string) =>
    resolution === "hour" && referenceTime !== undefined
      ? formatRelativeHourShort(
          period,
          referenceTime,
          timeZone,
          t.chat.workLog.shared.usage,
          hour12,
        )
      : formatPeriod(period);

  return (
    <div className="flex flex-col gap-3.5">
      <div
        ref={plotRef}
        className="relative"
        role="img"
        aria-label={t.tools.usage.chartLabel(resolution === "hour", metric === "tokens")}
        onMouseMove={handleMove}
        onMouseLeave={() => {
          hoverPositionRef.current = null;
          setHoverIndex(null);
        }}
      >
        <UsageChartBars
          columns={columns}
          periods={periods}
          scale={scale}
          loadingProviders={loadingProviders}
          format={format}
          formatPeriod={formatPeriod}
        />
        {hoveredPeriod === undefined ? null : (
          <div
            ref={tooltipRef}
            className="dropdown-glass pointer-events-none absolute z-10 min-w-36 max-w-full rounded-overlay px-2.5 py-2 text-secondary-copy"
            style={{
              left: "var(--usage-tooltip-left, 0px)",
              top: "var(--usage-tooltip-top, 0px)",
            }}
          >
            <div className="mb-1 text-muted-foreground">{formatTooltipPeriod(hoveredPeriod)}</div>
            {providers.map((provider) => {
              const { label, driverKind } = PROVIDER_PRESENTATION[provider];
              return (
                <div key={provider} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <ProviderInstanceIcon
                      driverKind={driverKind}
                      displayName={label}
                      iconClassName="size-3"
                    />
                    {label}
                  </span>
                  <span
                    className={cn(
                      "tabular-nums",
                      loadingProviders.has(provider) ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {format(
                      hoveredColumn?.bands.find((band) => band.provider === provider)?.value ?? 0,
                    )}
                  </span>
                </div>
              );
            })}
            <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-1">
              <span className="text-muted-foreground">{t.tools.usage.total}</span>
              <span
                className={cn(
                  "tabular-nums",
                  partial ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {format(hoveredColumn?.total ?? 0)}
              </span>
            </div>
          </div>
        )}
      </div>
      {periods.length <= 7 ? (
        <div className="flex gap-4.5 px-1.5 font-mono text-meta-large text-muted-foreground">
          {periods.map((period) => (
            <span key={period} className="min-w-0 flex-1 text-center">
              {formatPeriod(period)}
            </span>
          ))}
        </div>
      ) : (
        <div className="flex justify-between px-1.5 font-mono text-meta-large text-muted-foreground">
          {[periods[0], periods[Math.floor(periods.length / 2)], periods.at(-1)].map((period) => (
            <span key={period}>{period === undefined ? "" : formatPeriod(period)}</span>
          ))}
        </div>
      )}
    </div>
  );
}
