/** Interactive category ring; shared motion jobs paint SVG and settle idle. */
import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { formatPercent, formatTokens, formatUsd } from "@t3tools/shared/usageFormat";
import { t } from "~/i18n";
import { useAnimatedNumber } from "~/hooks/useAnimatedNumber";
import { usePhysicsMotion } from "~/hooks/usePhysicsMotion";
import { useMotionJob } from "~/lib/motion/react";
import { Spring } from "~/lib/motion/spring";
import { TOKENS } from "~/lib/motion/tokens";
import type { ringSegments } from "./usageCostBreakdown.logic";

const CIRCUMFERENCE = 2 * Math.PI * 70;
const SHADES: Record<string, readonly [string, string]> = {
  "var(--color-usage-split-input)": ["#e6fbec", "#86cfa0"],
  "var(--color-usage-split-cache-read)": ["#e4f4ff", "#74b8ea"],
  "var(--color-usage-split-cache-write)": ["#ffe3e9", "#ec8ea0"],
  "var(--color-usage-split-output)": ["#ffffff", "#d8d8de"],
  "var(--color-usage-split-other)": ["#55555c", "#0a0a0b"],
};

/** Converts cents back to USD so numeric motion retains sub-dollar precision. */
function formatCents(value: number) {
  return formatUsd(value / 100);
}

/** Renders normalized USD/token segments with pointer and keyboard highlighting; writes no settings. */
export function UsageCostRing({
  segments,
  metric,
}: {
  readonly segments: ReturnType<typeof ringSegments>;
  readonly metric: "cost" | "tokens";
}) {
  const id = useId();
  const svg = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const active = hovered ?? focused;
  const { enabled } = usePhysicsMotion();
  const { start, stop } = useMotionJob();
  const motion = useRef<{ sweep: Spring; delay: number; offsets: Map<string, Spring> } | null>(
    null,
  );
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const selected = segments.find((segment) => segment.color === active);
  const value = selected?.value ?? total;
  const format = metric === "cost" ? formatUsd : formatTokens;
  useLayoutEffect(() => {
    const state = motion.current ?? {
      sweep: new Spring({
        value: enabled ? 0 : 1,
        target: 1,
        precision: 0.001,
        token: TOKENS.fling,
      }),
      delay: enabled ? 0.2 : 0,
      offsets: new Map<string, Spring>(),
    };
    motion.current = state;
    const arcs = segments.map((segment, index) => {
      const spring =
        state.offsets.get(segment.color) ?? new Spring({ precision: 0.01, token: TOKENS.jolt });
      state.offsets.set(segment.color, spring);
      spring.target = enabled && segment.color === active ? 8 : 0;
      if (!enabled) spring.jump(0);
      return {
        segment,
        spring,
        nodes: svg.current?.querySelectorAll<SVGCircleElement>(`[data-arc="${index}"]`),
      };
    });
    if (!enabled) {
      state.sweep.jump(1);
      state.delay = 0;
    }
    const paint = () => {
      const sweep = Math.max(0, Math.min(1, state.sweep.value));
      for (const { segment, spring, nodes } of arcs) {
        const angle = (segment.start + segment.fraction / 2) * Math.PI * 2 * sweep - Math.PI / 2;
        const transform = `translate(${Math.cos(angle) * spring.value} ${Math.sin(angle) * spring.value}) rotate(${segment.start * 360 * sweep - 90} 92 92)`;
        nodes?.forEach((node) => {
          node.setAttribute(
            "stroke-dasharray",
            `${segment.fraction * CIRCUMFERENCE * sweep} ${CIRCUMFERENCE}`,
          );
          node.setAttribute("transform", transform);
        });
      }
    };
    paint();
    if (!enabled) return stop;
    start((dt) => {
      state.delay = Math.max(0, state.delay - dt);
      let moving = state.delay > 0 || state.sweep.step(dt);
      for (const { spring } of arcs) moving = spring.step(dt) || moving;
      paint();
      // Returning false removes the job from the shared clock; filters remain static.
      return moving;
    });
    return stop;
  }, [segments, active, enabled, start, stop]);

  const maximum = Math.max(0, ...segments.map((segment) => segment.value));
  return (
    <div
      className="usage-cost-ring-layout"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setHovered(null);
          setFocused(null);
        }
      }}
    >
      <div className="usage-cost-ring">
        <svg ref={svg} width="184" height="184" viewBox="0 0 184 184" aria-hidden="true">
          <defs>
            <filter id={`${id}-glow`} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="11" />
            </filter>
            {segments.map((segment, index) => (
              <linearGradient key={segment.color} id={`${id}-${index}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={SHADES[segment.color]?.[0] ?? segment.color} />
                <stop offset=".5" stopColor={segment.color} />
                <stop offset="1" stopColor={SHADES[segment.color]?.[1] ?? segment.color} />
              </linearGradient>
            ))}
          </defs>
          <g opacity=".75" filter={`url(#${id}-glow)`} pointerEvents="none">
            {segments.map((segment, index) => (
              <circle
                key={segment.color}
                data-arc={index}
                cx="92"
                cy="92"
                r="70"
                fill="none"
                stroke={`url(#${id}-${index})`}
                strokeWidth="24"
                strokeDasharray={`${segment.fraction * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                transform={`rotate(${segment.start * 360 - 90} 92 92)`}
              />
            ))}
          </g>
          {segments.map((segment, index) => (
            <circle
              key={segment.color}
              data-arc={index}
              cx="92"
              cy="92"
              r="70"
              fill="none"
              stroke={`url(#${id}-${index})`}
              strokeWidth="24"
              strokeDasharray={`${segment.fraction * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              transform={`rotate(${segment.start * 360 - 90} 92 92)`}
              opacity={active && active !== segment.color ? 0.55 : 1}
              onPointerEnter={() => setHovered(segment.color)}
              onPointerLeave={() => setHovered(null)}
            />
          ))}
        </svg>
        <div className="usage-cost-ring-center" aria-hidden="true">
          <span>{selected?.label ?? t.tools.usage.total}</span>
          <RingValue key={metric} metric={metric} value={value} />
          <span className="usage-cost-ring-caption">
            {selected
              ? formatPercent(selected.fraction)
              : t.tools.usage.splitCategoryCount(segments.length)}
          </span>
        </div>
      </div>
      <div
        className="usage-cost-category-list"
        aria-label={metric === "cost" ? t.tools.usage.costByType : t.tools.usage.tokensByType}
      >
        {segments.map((segment) => (
          <button
            key={segment.color}
            type="button"
            className="usage-cost-category-row"
            data-active={active === segment.color}
            style={{ "--split-color": segment.color } as CSSProperties}
            onPointerEnter={() => setHovered(segment.color)}
            onPointerLeave={() => setHovered(null)}
            onFocus={() => setFocused(segment.color)}
            onBlur={() => setFocused(null)}
          >
            <i className="usage-cost-dot" aria-hidden="true" />
            <span>{segment.label}</span>
            <span className="usage-cost-category-bar" aria-hidden="true">
              <i style={{ width: `${(segment.value / maximum) * 100}%` }} />
            </span>
            <b>{format(segment.value)}</b>
            <span className="usage-cost-category-percent">{formatPercent(segment.fraction)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Owns one metric's numeric spring; remounting on unit changes prevents cents/token carryover. */
function RingValue({
  metric,
  value,
}: {
  readonly metric: "cost" | "tokens";
  readonly value: number;
}) {
  const number = useRef<HTMLSpanElement>(null);
  useAnimatedNumber(
    number,
    metric === "cost" ? value * 100 : value,
    metric === "cost" ? formatCents : formatTokens,
  );
  return (
    <span ref={number} className="usage-cost-ring-value font-serif">
      {metric === "cost" ? formatUsd(value) : formatTokens(value)}
    </span>
  );
}
