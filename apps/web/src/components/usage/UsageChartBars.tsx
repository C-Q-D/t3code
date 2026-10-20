/** SVG presentation for usage columns; one shared-clock job owns all imperative bar heights. */
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { UsageProviderKind } from "@t3tools/contracts";
import { usePhysicsMotion } from "~/hooks/usePhysicsMotion";
import { useMotionJob } from "~/lib/motion/react";
import { Spring } from "~/lib/motion/spring";
import { TOKENS } from "~/lib/motion/tokens";
import { observeResize } from "~/lib/observeResize";
import { t } from "~/i18n";
import type { DayColumn } from "./UsageProviderChart";
import { bandShare, summarizeColumns } from "./usageChart.logic";
import { PROVIDER_ORDER, PROVIDER_PRESENTATION } from "./usageProviders";

const BASELINE = 300;
const PLOT_HEIGHT = 250;
const REFLECTION_HEIGHT = 44;

/** Columns and scale are already filtered; labels retain the parent's locale and time zone. */
interface UsageChartBarsProps {
  readonly columns: readonly DayColumn[];
  readonly periods: readonly string[];
  readonly scale: { readonly max: number; readonly labeled: boolean };
  readonly loadingProviders: ReadonlySet<UsageProviderKind>;
  readonly format: (value: number) => string;
  readonly formatPeriod: (period: string) => string;
}

/**
 * Draws gradient stacks, reused glow/reflection and a positive peak label.
 * Same-count updates retain spring positions; changing count restarts from zero.
 * Only resize changes React state. Motion writes SVG attributes and ends when every spring rests.
 */
export function UsageChartBars({
  columns,
  periods,
  scale,
  loadingProviders,
  format,
  formatPeriod,
}: UsageChartBarsProps) {
  const id = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const springsRef = useRef<Spring[]>([]);
  const [width, setWidth] = useState(600);
  const { enabled } = usePhysicsMotion();
  const { start, stop } = useMotionJob();
  const count = columns.length;
  const gap = count > 60 ? 2 : count > 20 ? 4 : count > 8 ? 8 : 14;
  // Clamp the gap on exceptionally narrow hosts so even long windows stay within the plot.
  const actualGap = count > 1 ? Math.min(gap, width / (count * 2)) : 0;
  const barWidth = count === 0 ? 0 : Math.max(0, (width - actualGap * (count - 1)) / count);
  const { peakIndex } = summarizeColumns(columns);
  const peak = peakIndex === null ? undefined : columns[peakIndex];
  const peakPeriod = peakIndex === null ? undefined : periods[peakIndex];
  const peakX = peakIndex === null ? 0 : peakIndex * (barWidth + actualGap) + barWidth / 2;
  const peakY = BASELINE - (scale.max > 0 ? ((peak?.total ?? 0) / scale.max) * PLOT_HEIGHT : 0);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setWidth(host.clientWidth);
    return observeResize(host, () => setWidth(host.clientWidth));
  }, []);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const sameCount = springsRef.current.length === columns.length;
    const springs = sameCount
      ? springsRef.current
      : columns.map(() => new Spring({ token: TOKENS.fling, precision: 0.05 }));
    springsRef.current = springs;
    const groups = [...svg.querySelectorAll<SVGGElement>("[data-usage-column]")];
    const clips = [...svg.querySelectorAll<SVGRectElement>("[data-usage-clip]")];
    const rects = groups.map((group) => [...group.querySelectorAll<SVGRectElement>("[data-band]")]);
    const caps = groups.map((group) => group.querySelector<SVGRectElement>("[data-cap]"));
    const sheens = groups.map((group) => group.querySelector<SVGRectElement>("[data-sheen]"));
    const paint = (index: number, value: number) => {
      const height = Math.max(0, value);
      const top = BASELINE - height;
      const clip = clips[index];
      clip?.setAttribute("y", String(top));
      clip?.setAttribute("height", String(height));
      sheens[index]?.setAttribute("y", String(top));
      sheens[index]?.setAttribute("height", String(height));
      caps[index]?.setAttribute("y", String(top));
      caps[index]?.setAttribute("height", String(Math.min(1.6, height)));
      const column = columns[index];
      if (!column) return;
      let y = top;
      column.bands.forEach((band, bandIndex) => {
        const bandHeight = height * bandShare(band.value, column.total);
        const rect = rects[index]?.[bandIndex];
        rect?.setAttribute("y", String(y));
        rect?.setAttribute("height", String(bandHeight));
        y += bandHeight;
      });
    };
    springs.forEach((spring, index) => {
      spring.target =
        scale.max === 0 ? 0 : ((columns[index]?.total ?? 0) / scale.max) * PLOT_HEIGHT;
      if (!enabled || spring.isSettled) spring.jump(spring.target);
      paint(index, spring.value);
    });
    if (!enabled || springs.every((spring) => spring.isSettled)) return stop;
    let elapsed = 0;
    start((dt) => {
      elapsed += dt;
      let moving = false;
      springs.forEach((spring, index) => {
        if (spring.isSettled) return;
        const delay = Math.min(0.32, index * (sameCount ? 0.002 : 0.006));
        if (elapsed < delay) {
          moving = true;
          return;
        }
        moving = spring.step(dt) || moving;
        paint(index, spring.value);
      });
      // Returning false removes this job, so a settled chart requests no further frames.
      return moving;
    });
    return stop;
  }, [columns, scale.max, enabled, start, stop]);

  return (
    <div ref={hostRef} className="usage-lux-bars">
      <svg ref={svgRef} width="100%" height={BASELINE + REFLECTION_HEIGHT} aria-hidden>
        <defs>
          {PROVIDER_ORDER.map((provider) => {
            const color = PROVIDER_PRESENTATION[provider].color;
            const stops =
              provider === "codex"
                ? ["#ffffff", "#d6d6db", "#a9a9b0"]
                : provider === "claude"
                  ? ["#ffa983", "#dc7a58", "#a54a2c"]
                  : [
                      `color-mix(in oklab, ${color} 65%, white)`,
                      color,
                      `color-mix(in oklab, ${color} 72%, black)`,
                    ];
            return (
              <linearGradient key={provider} id={`${id}-${provider}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={stops[0]} />
                <stop offset=".45" stopColor={stops[1]} />
                <stop offset="1" stopColor={stops[2]} />
              </linearGradient>
            );
          })}
          <filter id={`${id}-glow`} x="-10%" y="-20%" width="120%" height="140%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--usage-lux-light)" stopOpacity=".55" />
            <stop offset="1" stopColor="var(--usage-lux-light)" stopOpacity="0" />
          </linearGradient>
          <mask
            id={`${id}-reflection`}
            maskUnits="userSpaceOnUse"
            x="0"
            y={BASELINE}
            width={width}
            height={REFLECTION_HEIGHT}
          >
            <rect
              x="0"
              y={BASELINE}
              width={width}
              height={REFLECTION_HEIGHT}
              fill={`url(#${id}-fade)`}
            />
          </mask>
          <linearGradient id={`${id}-floor`}>
            <stop offset="0" stopColor="var(--usage-lux-light)" stopOpacity="0" />
            <stop offset=".5" stopColor="var(--usage-lux-light)" stopOpacity=".16" />
            <stop offset="1" stopColor="var(--usage-lux-light)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-sheen`}>
            <stop offset="0" stopColor="var(--usage-lux-light)" stopOpacity=".18" />
            <stop offset=".35" stopColor="var(--usage-lux-light)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--usage-lux-dark)" stopOpacity=".18" />
          </linearGradient>
          {columns.map((_, index) => (
            <clipPath key={periods[index]} id={`${id}-clip-${index}`}>
              <rect
                data-usage-clip
                x={index * (barWidth + actualGap)}
                width={barWidth}
                rx={Math.min(5, barWidth / 2.2)}
              />
            </clipPath>
          ))}
        </defs>
        {[0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = BASELINE - PLOT_HEIGHT * fraction + 0.5;
          return (
            <g key={fraction}>
              <line
                x1="0"
                x2={width}
                y1={y}
                y2={y}
                stroke="var(--usage-lux-dark)"
                strokeOpacity=".55"
              />
              <line
                x1="0"
                x2={width}
                y1={y + 1}
                y2={y + 1}
                stroke="var(--usage-lux-light)"
                strokeOpacity=".035"
              />
              {scale.labeled && (
                <text className="usage-lux-tick" x={width} y={y - 5} textAnchor="end">
                  {format(scale.max * fraction)}
                </text>
              )}
            </g>
          );
        })}
        <use href={`#${id}-bars`} filter={`url(#${id}-glow)`} opacity=".65" />
        <g id={`${id}-bars`}>
          {columns.map((column, index) => {
            const x = index * (barWidth + actualGap);
            return (
              <g key={periods[index]} data-usage-column clipPath={`url(#${id}-clip-${index})`}>
                {column.bands.map((band) => (
                  <rect
                    key={band.provider}
                    data-band
                    x={x}
                    width={barWidth}
                    fill={`url(#${id}-${band.provider})`}
                    opacity={loadingProviders.has(band.provider) ? 0.4 : 1}
                  />
                ))}
                <rect data-sheen x={x} width={barWidth} fill={`url(#${id}-sheen)`} />
                <rect
                  data-cap
                  x={x}
                  width={barWidth}
                  fill="var(--usage-lux-light)"
                  opacity={
                    loadingProviders.has(
                      column.bands.find((band) => band.value > 0)?.provider ?? "codex",
                    )
                      ? 0.28
                      : 0.7
                  }
                />
              </g>
            );
          })}
        </g>
        <g mask={`url(#${id}-reflection)`} opacity=".32">
          <g transform={`translate(0 ${2 * BASELINE}) scale(1 -1)`}>
            <use href={`#${id}-bars`} />
          </g>
        </g>
        <rect x="0" y={BASELINE} width={width} height="1" fill={`url(#${id}-floor)`} />
      </svg>
      {peak && peakPeriod !== undefined && (
        <div
          className="usage-lux-peak"
          style={{
            left: `clamp(90px, ${peakX}px, calc(100% - 90px))`,
            top: Math.max(0, peakY - 38),
          }}
        >
          <span>{t.tools.usage.chartPeak(formatPeriod(peakPeriod), format(peak.total))}</span>
          <i aria-hidden />
        </div>
      )}
    </div>
  );
}
