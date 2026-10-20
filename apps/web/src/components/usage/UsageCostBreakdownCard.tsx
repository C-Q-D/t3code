/** Cost/token composition card; preserves the page's loading and empty-data contract. */
import { useLayoutEffect, useRef, type JSX } from "react";
import type { MergedUsage } from "@t3tools/shared/usageMerge";
import { t } from "~/i18n";
import { usePhysicsMotion } from "~/hooks/usePhysicsMotion";
import { useMotionJob } from "~/lib/motion/react";
import { Spring } from "~/lib/motion/spring";
import { TOKENS } from "~/lib/motion/tokens";
import type { UsageChartMetric } from "./UsageProviderChart";
import { costTypeSegments, tokenTypeSegments } from "./usageBreakdown";
import { ringSegments, speedBreakdown } from "./usageCostBreakdown.logic";
import { UsageCostRing } from "./UsageCostRing";
import { UsageSpeedGauge } from "./UsageSpeedGauge";

/** Category and speed totals follow the page metric and loading state. */
export interface UsageCostBreakdownCardProps {
  readonly metric: UsageChartMetric;
  readonly merged: MergedUsage;
  readonly loading: boolean;
}

/** Returns no card without processed tokens; otherwise mounts one entrance animation. */
export function UsageCostBreakdownCard(props: UsageCostBreakdownCardProps): JSX.Element | null {
  return props.merged.totalTokens === 0 ? null : <CostBreakdownContent {...props} />;
}

/** Owns entrance separately so an initially empty dataset animates on first appearance. */
function CostBreakdownContent({ metric, merged, loading }: UsageCostBreakdownCardProps) {
  const card = useRef<HTMLElement>(null);
  const entrance = useRef<Spring | null>(null);
  const { enabled } = usePhysicsMotion();
  const { start, stop } = useMotionJob();
  useLayoutEffect(() => {
    const spring =
      entrance.current ??
      new Spring({ value: enabled ? 0 : 1, target: 1, token: TOKENS.settle, precision: 0.001 });
    entrance.current = spring;
    const paint = () => {
      if (!card.current) return;
      card.current.style.opacity = String(Math.max(0, Math.min(1, spring.value)));
      card.current.style.transform = `translateY(${18 * (1 - spring.value)}px)`;
    };
    if (!enabled) spring.jump(1);
    paint();
    if (!enabled || spring.isSettled) return stop;
    start((dt) => {
      const moving = spring.step(dt);
      paint();
      return moving;
    });
    return stop;
  }, [enabled, start, stop]);
  const speed = speedBreakdown(merged.speedCost);
  const showSpeed = metric === "cost" && speed.showSpeed;
  const segments = ringSegments(
    metric === "tokens" ? tokenTypeSegments(merged) : costTypeSegments(merged.categoryCost),
  );
  return (
    <section ref={card} className="usage-cost-card" aria-busy={loading}>
      <div className="usage-cost-columns" data-speed={showSpeed} data-loading={loading}>
        <div className="usage-cost-types">
          <div className="usage-cost-heading">
            <h3>{t.tools.usage.splitTitle}</h3>
            <p>{metric === "cost" ? t.tools.usage.splitCostHint : t.tools.usage.splitTokenHint}</p>
          </div>
          <UsageCostRing metric={metric} segments={segments} />
        </div>
        {showSpeed ? <UsageSpeedGauge speed={speed} /> : null}
      </div>
    </section>
  );
}
