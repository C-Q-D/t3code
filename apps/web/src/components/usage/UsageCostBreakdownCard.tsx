/** Displays token categories and speed cost from the selected usage window. */
import { t } from "~/i18n";
import type { JSX } from "react";
import type { MergedUsage } from "@t3tools/shared/usageMerge";
import type { UsageChartMetric } from "./UsageProviderChart";
import { cn } from "../../lib/utils";
import { formatUsd } from "@t3tools/shared/usageFormat";
import { UsageShareBar } from "./UsageShareBar";
import { SpeedPremium } from "./UsageModelDialog";
import { costTypeSegments, tokenTypeSegments, speedCostSegments } from "./usageBreakdown";
import { UsageCostRing } from "./UsageCostRing";
import { ringSegments } from "./usageCostBreakdown.logic";

/** Category and speed totals follow the page metric and loading state. */
export interface UsageCostBreakdownCardProps {
  readonly metric: UsageChartMetric;
  readonly merged: MergedUsage;
  readonly loading: boolean;
}
/** Returns no section when there are no processed tokens. */
export function UsageCostBreakdownCard({
  metric,
  merged,
  loading,
}: UsageCostBreakdownCardProps): JSX.Element | null {
  if (merged.totalTokens === 0) return null;
  return (
    <section className={cn("grid gap-x-12 gap-y-8 lg:grid-cols-2", figureClass(loading))}>
      {metric === "tokens" ? (
        <UsageCostRing metric={metric} segments={ringSegments(tokenTypeSegments(merged))} />
      ) : (
        <>
          <UsageCostRing
            metric={metric}
            segments={ringSegments(costTypeSegments(merged.categoryCost))}
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
  );
}
/** Keeps existing values visible while their provider is refreshing. */
function figureClass(loading: boolean) {
  return cn("transition-opacity", loading && "opacity-40 delay-150");
}
