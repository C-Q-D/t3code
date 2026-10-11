/** Localized usage presentation and existing interaction behavior. */
import { t } from "~/i18n";
import type { UsageTokenTotals } from "@t3tools/contracts";
import {
  isModelCostUnknown,
  type CategoryCost,
  type ModelTotals,
  type SpeedCost,
} from "@t3tools/shared/usageMerge";

import type { ShareSegment } from "./UsageShareBar";

export function sortModelsByTokens(models: readonly ModelTotals[]) {
  return models.toSorted(
    (left, right) => right.totalTokens - left.totalTokens || right.costUsd - left.costUsd,
  );
}

/**
 * A model's share of the selected metric, or `null` for a cost share of an
 * unknown cost. An unpriced model still has a real token share.
 */
export function modelShare(model: ModelTotals, metric: "cost" | "tokens"): number | null {
  if (metric === "tokens") return model.tokenShare;
  return isModelCostUnknown(model) ? null : model.costShare;
}

/**
 * Share of a model's input read from cache, or `null` without input. Cache
 * writes count as misses: that input was processed in full.
 */
export function cacheHitRate({ tokens }: ModelTotals): number | null {
  const input = tokens.uncachedInputTokens + tokens.cachedInputTokens + tokens.cacheCreationTokens;
  return input === 0 ? null : tokens.cachedInputTokens / input;
}

/** Effective USD per million priced tokens, or `null` when none were priced. */
export function costPerMillionTokens(model: ModelTotals): number | null {
  const pricedTokens = model.totalTokens - model.unpricedTokens;
  return pricedTokens <= 0 || isModelCostUnknown(model)
    ? null
    : (model.costUsd / pricedTokens) * 1_000_000;
}

/** A neutral step between background and foreground, so mixes never borrow a provider's color. */
const ink = (percent: number) =>
  `color-mix(in oklab, var(--foreground) ${percent}%, var(--background))`;

/** Adjacent segments stay above the 15 ΔE separation floor in both themes. */
const TYPE_COLORS = {
  input: ink(60),
  cacheRead: ink(30),
  cacheWrite: ink(72),
  output: ink(100),
  other: ink(44),
};

/** Converts the supplied category costs into labeled cost-share segments, retaining the existing ordering and treatment of other costs. */
export function costTypeSegments(cost: CategoryCost): readonly ShareSegment[] {
  return [
    { label: t.tools.usage.input, value: cost.input, color: TYPE_COLORS.input },
    { label: t.tools.usage.cacheRead, value: cost.cacheRead, color: TYPE_COLORS.cacheRead },
    { label: t.tools.usage.cacheWrite, value: cost.cacheWrite, color: TYPE_COLORS.cacheWrite },
    { label: t.tools.usage.output, value: cost.output, color: TYPE_COLORS.output },
    // Reported cost with no rates to split it, or from older servers. Below a
    // cent it is rounding, not usage.
    {
      label: t.tools.usage.other,
      value: cost.unsplit >= 0.005 ? cost.unsplit : 0,
      color: TYPE_COLORS.other,
    },
  ];
}

/** Converts the supplied non-reasoning token totals into labeled input/cache/output segments without changing token counts. */
export function tokenTypeSegments(
  tokens: Omit<UsageTokenTotals, "reasoningTokens">,
): readonly ShareSegment[] {
  return [
    { label: t.tools.usage.input, value: tokens.uncachedInputTokens, color: TYPE_COLORS.input },
    {
      label: t.tools.usage.cacheRead,
      value: tokens.cachedInputTokens,
      color: TYPE_COLORS.cacheRead,
    },
    {
      label: t.tools.usage.cacheWrite,
      value: tokens.cacheCreationTokens,
      color: TYPE_COLORS.cacheWrite,
    },
    { label: t.tools.usage.output, value: tokens.outputTokens, color: TYPE_COLORS.output },
  ];
}

/** Speeds are ordered by price, so they brighten from standard to ultrafast. */
export function speedCostSegments(cost: SpeedCost): readonly ShareSegment[] {
  return [
    { label: t.tools.usage.standard, value: cost.standard, color: ink(34) },
    { label: t.tools.usage.fast, value: cost.fast, color: ink(66) },
    { label: t.tools.usage.ultrafast, value: cost.ultrafast, color: ink(100) },
  ];
}
