/** Cost-weighted speed gauge and standard-price comparison; does not infer request counts. */
import { useId, useLayoutEffect, useRef, type CSSProperties } from "react";
import { formatPercent, formatUsd } from "@t3tools/shared/usageFormat";
import { t } from "~/i18n";
import { usePhysicsMotion } from "~/hooks/usePhysicsMotion";
import { useMotionJob } from "~/lib/motion/react";
import { Spring } from "~/lib/motion/spring";
import type { speedBreakdown } from "./usageCostBreakdown.logic";

const ARC = "M 25 124 A 100 100 0 0 1 225 124";
const ARC_LENGTH = Math.PI * 100;
// Unit-mass k=60/c=6.5 matches the approved gauge's gentle overshoot.
const NEEDLE_TOKEN = {
  response: (2 * Math.PI) / Math.sqrt(60),
  damping: 6.5 / (2 * Math.sqrt(60)),
};
const TICKS = Array.from({ length: 21 }, (_, index) => {
  const angle = Math.PI * (1 - index / 20);
  const outer = 113 + (index % 5 === 0 ? 7 : 3);
  return {
    index,
    x1: 125 + Math.cos(angle) * 113,
    y1: 124 - Math.sin(angle) * 113,
    x2: 125 + Math.cos(angle) * outer,
    y2: 124 - Math.sin(angle) * outer,
  };
});

/** Renders USD breakdown results; the caller omits this section when no fast costs exist. */
export function UsageSpeedGauge({ speed }: { readonly speed: ReturnType<typeof speedBreakdown> }) {
  const id = useId();
  const svg = useRef<SVGSVGElement>(null);
  const motion = useRef<{ spring: Spring; delay: number } | null>(null);
  const { enabled } = usePhysicsMotion();
  const { start, stop } = useMotionJob();
  useLayoutEffect(() => {
    const state = motion.current ?? {
      spring: new Spring({
        value: enabled ? 0 : speed.fastF,
        token: NEEDLE_TOKEN,
        precision: 0.0001,
      }),
      delay: enabled ? 0.3 : 0,
    };
    motion.current = state;
    state.spring.target = speed.fastF;
    const arcs = svg.current?.querySelectorAll<SVGPathElement>("[data-gauge-arc]");
    const needle = svg.current?.querySelector<SVGGElement>("[data-gauge-needle]");
    const number = svg.current?.querySelector<SVGTextElement>("[data-gauge-value]");
    const paint = () => {
      const fraction = Math.max(0, Math.min(1, state.spring.value));
      arcs?.forEach((arc) => {
        arc.setAttribute("stroke-dasharray", `${ARC_LENGTH * fraction} ${ARC_LENGTH}`);
        arc.setAttribute("opacity", fraction === 0 ? "0" : "1");
      });
      needle?.setAttribute("transform", `rotate(${state.spring.value * 180} 125 124)`);
      if (number) number.textContent = formatPercent(fraction);
    };
    if (!enabled) {
      state.spring.jump(speed.fastF);
      state.delay = 0;
      paint();
      return stop;
    }
    paint();
    start((dt) => {
      state.delay = Math.max(0, state.delay - dt);
      const moving = state.delay > 0 || state.spring.step(dt);
      paint();
      return moving;
    });
    return stop;
  }, [enabled, speed.fastF, start, stop]);

  const fastCost = speed.fastStandard + speed.premium;
  const premiumBoundary =
    fastCost === 0 ? 1 : Math.max(0, Math.min(1, speed.fastStandard / fastCost));
  const rows = [
    {
      label: t.tools.usage.standard,
      value: speed.standard,
      color: "var(--color-usage-split-cache-read)",
    },
    {
      label: t.tools.usage.splitFastStandard,
      value: speed.fastStandard,
      color: "var(--color-usage-speed-mid)",
    },
    {
      label: t.tools.usage.splitFastPremium,
      value: speed.premium,
      color: "var(--color-usage-split-cache-write)",
    },
  ];
  return (
    <div className="usage-speed-section">
      <div className="usage-cost-heading">
        <h3>{t.tools.usage.splitSpeedMode}</h3>
        <p>{t.tools.usage.splitPremiumHint}</p>
      </div>
      <div className="usage-speed-layout">
        <svg
          ref={svg}
          className="usage-speed-gauge"
          width="250"
          height="176"
          viewBox="0 0 250 176"
          role="img"
          aria-label={`${t.tools.usage.splitFastShare}: ${formatPercent(speed.fastF)}`}
        >
          <defs>
            <linearGradient
              id={`${id}-arc`}
              gradientUnits="userSpaceOnUse"
              x1="25"
              y1="0"
              x2={25 + 200 * speed.fastF}
              y2="0"
            >
              <stop offset="0" stopColor="var(--color-usage-split-cache-read)" />
              <stop offset={premiumBoundary} stopColor="var(--color-usage-speed-mid)" />
              <stop
                offset="1"
                stopColor={
                  speed.premium > 0
                    ? "var(--color-usage-split-cache-write)"
                    : "var(--color-usage-speed-mid)"
                }
              />
            </linearGradient>
            <filter id={`${id}-glow`} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="9" />
            </filter>
            <filter id={`${id}-soft`} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>
          <path
            d={ARC}
            fill="none"
            stroke="currentColor"
            opacity=".05"
            strokeWidth="14"
            strokeLinecap="round"
          />
          {TICKS.map(({ index, ...coordinates }) => (
            <line
              key={index}
              {...coordinates}
              stroke="currentColor"
              opacity={index % 5 === 0 ? 0.32 : 0.14}
              strokeWidth="1.2"
            />
          ))}
          <g opacity=".85">
            <path
              data-gauge-arc
              d={ARC}
              fill="none"
              stroke={`url(#${id}-arc)`}
              strokeWidth="14"
              strokeLinecap="round"
              filter={`url(#${id}-glow)`}
            />
          </g>
          <path
            data-gauge-arc
            d={ARC}
            fill="none"
            stroke={`url(#${id}-arc)`}
            strokeWidth="14"
            strokeLinecap="round"
          />
          <g data-gauge-needle>
            <line
              x1="125"
              y1="124"
              x2="55"
              y2="124"
              stroke="var(--color-usage-split-output)"
              strokeWidth="3"
              strokeLinecap="round"
              filter={`url(#${id}-soft)`}
              opacity=".6"
            />
            <line
              x1="125"
              y1="124"
              x2="55"
              y2="124"
              stroke="var(--color-usage-split-output)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="125" cy="124" r="7" fill="var(--color-usage-split-output)" />
            <circle cx="125" cy="124" r="3" fill="var(--background)" />
          </g>
          <g className="usage-speed-labels" textAnchor="middle">
            <text x="25" y="146">
              {t.tools.usage.splitAllStandard}
            </text>
            <text x="225" y="146">
              {t.tools.usage.splitAllFast}
            </text>
            <text data-gauge-value className="usage-speed-value font-serif" x="125" y="154">
              {formatPercent(speed.fastF)}
            </text>
            <text x="125" y="172">
              {t.tools.usage.splitFastShare}
            </text>
          </g>
        </svg>
        <div className="usage-speed-stats">
          <p>{t.tools.usage.costBySpeed}</p>
          {rows.map((row, index) => (
            <div
              key={row.label}
              className="usage-speed-row"
              data-premium={index === 2}
              style={{ "--split-color": row.color } as CSSProperties}
            >
              <i className="usage-cost-dot" aria-hidden="true" />
              <span>{row.label}</span>
              <b>{formatUsd(row.value)}</b>
            </div>
          ))}
        </div>
      </div>
      <p className="usage-speed-comparison">
        {t.tools.usage.splitStandardEstimate} <b>{formatUsd(speed.allStandard)}</b>
        <span>{t.tools.usage.splitSavings(formatPercent(speed.savingsF))}</span>
      </p>
    </div>
  );
}
