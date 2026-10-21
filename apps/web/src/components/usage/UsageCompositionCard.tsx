/** Owns the model/time breakdown view; delegates model selection to the page. */
import { t } from "~/i18n";
import type { JSX } from "react";
import type { UsageProviderKind } from "@t3tools/contracts";
import type { MergedUsage } from "@t3tools/shared/usageMerge";
import type { UsageChartMetric } from "./UsageProviderChart";
import { cn } from "../../lib/utils";
import { useMemo, useState } from "react";
import type { DailyTotals, HourlyTotals } from "@t3tools/shared/usageMerge";
import {
  formatUsd,
  formatTokens,
  formatPercent,
  formatHourShort,
  formatDayShort,
} from "@t3tools/shared/usageFormat";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { PROVIDER_PRESENTATION } from "./usageProviders";
import { modelShare, sortModelsByTokens } from "./usageBreakdown";
import { UsageBubbles } from "./UsageBubbles";
import { useUsageCardEntrance } from "./useUsageCardEntrance";

/** Breakdown data and the callback that opens the page-owned model dialog. */
export interface UsageCompositionCardProps {
  readonly metric: UsageChartMetric;
  readonly merged: MergedUsage;
  readonly loadingPartial: boolean;
  readonly isProviderLoading: (provider: UsageProviderKind) => boolean;
  readonly activeProviders: readonly UsageProviderKind[];
  readonly resolution: "day" | "hour";
  readonly timeZone: string;
  /** key 为 `${provider}:${model}`，打开现有模型详情弹窗 */
  readonly onSelectModel: (key: string) => void;
}
/** Keeps the breakdown switch local and reports selected provider/model keys to the caller. */
export function UsageCompositionCard({
  metric,
  merged,
  loadingPartial,
  isProviderLoading,
  activeProviders,
  resolution,
  timeZone,
  onSelectModel,
}: UsageCompositionCardProps): JSX.Element {
  const [breakdown, setBreakdown] = useState<"model" | "time">("model");
  const [view, setView] = useState<"bubbles" | "list">("bubbles");
  const entranceRef = useUsageCardEntrance(0);
  const shownHourly = resolution === "hour";
  // Put the newest period first because ranges can contain ninety days.
  const breakdownPeriods = useMemo<readonly (DailyTotals | HourlyTotals)[]>(
    () => (shownHourly ? merged.hourly : merged.daily).toReversed(),
    [shownHourly, merged.daily, merged.hourly],
  );
  const breakdownModels = useMemo(
    () =>
      breakdown === "model" && metric === "tokens"
        ? sortModelsByTokens(merged.models)
        : merged.models,
    [breakdown, merged.models, metric],
  );
  const timeValueColumnWidth = `${60 / (activeProviders.length + 2)}%`;
  return (
    <div ref={entranceRef} className="usage-composition-card">
      <div className="usage-l4-card-header">
        <div>
          <h2>{t.tools.usage.compositionTitle}</h2>
          <p>
            {metric === "cost"
              ? t.tools.usage.compositionByCost
              : t.tools.usage.compositionByTokens}
          </p>
        </div>
        <div className="usage-l4-switches">
          {view === "list" && (
            <ToggleGroup
              aria-label={t.tools.usage.usageBreakdown}
              variant="segmented"
              value={[breakdown]}
              onValueChange={(next) => {
                const value = next[0];
                if (value === "model" || value === "time") setBreakdown(value);
              }}
            >
              {(
                [
                  { value: "model", label: t.tools.usage.model },
                  {
                    value: "time",
                    label: shownHourly ? t.tools.usage.hour : t.tools.usage.day,
                  },
                ] as const
              ).map((option) => (
                <Toggle key={option.value} value={option.value}>
                  {option.label}
                </Toggle>
              ))}
            </ToggleGroup>
          )}
          <ToggleGroup
            aria-label={t.tools.usage.compositionView}
            variant="segmented"
            value={[view]}
            onValueChange={(next) => {
              const value = next[0];
              if (value === "bubbles" || value === "list") setView(value);
            }}
          >
            <Toggle value="bubbles">{t.tools.usage.bubblesView}</Toggle>
            <Toggle value="list">{t.tools.usage.bubblesList}</Toggle>
          </ToggleGroup>
        </div>
      </div>
      <section className="flex min-w-0 flex-col gap-2.5">
        {view === "bubbles" ? (
          <UsageBubbles models={merged.models} metric={metric} onSelectModel={onSelectModel} />
        ) : breakdown === "model" ? (
          <div className="min-w-0 overflow-hidden rounded-card-row bg-usage-table-well shadow-usage-table">
            <table className="usage-model-table w-full table-fixed text-secondary-copy-large">
              <colgroup>
                <col />
                <col />
                <col className="w-17.5" />
              </colgroup>
              <thead className="bg-usage-table-header">
                <tr>
                  <th className="px-3.5 py-2.5 text-left font-bold">{t.tools.usage.model}</th>
                  <th className="px-3.5 py-2.5 text-left font-bold">{t.tools.usage.share}</th>
                  <th className="px-3.5 py-2.5 text-right font-bold">{t.tools.usage.sessions}</th>
                </tr>
              </thead>
              <tbody>
                {breakdownModels.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3.5 py-6 text-center text-muted-foreground">
                      {t.tools.usage.noActivity}
                    </td>
                  </tr>
                ) : (
                  breakdownModels.map((model) => {
                    const key = `${model.provider}:${model.model}`;
                    const share = modelShare(model, metric === "tokens" ? "tokens" : "cost");
                    return (
                      <tr
                        key={key}
                        className={cn(
                          "relative border-t border-usage-row-divider hover:bg-secondary focus-within:bg-secondary",
                          figureClass(isProviderLoading(model.provider)),
                        )}
                      >
                        <td className="px-3.5 py-2.25">
                          <button
                            type="button"
                            onClick={() => onSelectModel(key)}
                            className="flex w-full min-w-0 items-center gap-2 text-left outline-none after:absolute after:inset-0"
                          >
                            <span
                              aria-hidden
                              className="size-2 shrink-0 rounded-usage-model-dot"
                              style={{
                                backgroundColor: PROVIDER_PRESENTATION[model.provider].color,
                              }}
                            />
                            <span className="truncate">{model.model}</span>
                          </button>
                        </td>
                        <td className="px-3.5 py-2.25 font-mono text-secondary-copy tabular-nums">
                          <span className="flex items-center gap-2">
                            <span
                              aria-hidden
                              className="flex h-1.25 min-w-0 flex-1 overflow-hidden rounded-usage-swatch bg-usage-share-track"
                            >
                              <span
                                className="h-full rounded-usage-swatch bg-code-foreground"
                                style={{ width: `${(share ?? 0) * 100}%` }}
                              />
                            </span>
                            {share === null ? t.tools.usage.unpriced : formatPercent(share)}
                          </span>
                        </td>
                        {/* ModelTotals does not report unique sessions; records are not session counts. */}
                        <td className="px-3.5 py-2.25 text-right font-mono text-secondary-copy text-muted-foreground">
                          —
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-2/5" />
              {activeProviders.map((provider) => (
                <col key={provider} style={{ width: timeValueColumnWidth }} />
              ))}
              <col style={{ width: timeValueColumnWidth }} />
              <col style={{ width: timeValueColumnWidth }} />
            </colgroup>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 font-normal">
                  {shownHourly ? t.tools.usage.hour : t.tools.usage.day}
                </th>
                {activeProviders.map((provider) => (
                  <th key={provider} className="py-2 text-right font-normal">
                    {PROVIDER_PRESENTATION[provider].label}
                  </th>
                ))}
                <th className="py-2 text-right font-normal">{t.tools.usage.total}</th>
                <th className="py-2 text-right font-normal">{t.tools.usage.tokens}</th>
              </tr>
            </thead>
            <tbody>
              {breakdownPeriods.length === 0 ? (
                <tr>
                  <td
                    colSpan={activeProviders.length + 3}
                    className="py-6 text-center text-muted-foreground"
                  >
                    {t.tools.usage.noActivity}
                  </td>
                </tr>
              ) : (
                breakdownPeriods.map((period) => (
                  <tr
                    key={"hourStart" in period ? period.hourStart : period.day}
                    className="border-b border-border/50 transition-colors hover:bg-muted/50"
                  >
                    <td className="py-2 text-foreground">
                      {"hourStart" in period
                        ? formatHourShort(period.hourStart, timeZone, t.chat.workLog.shared.usage)
                        : formatDayShort(period.day, t.chat.workLog.shared.usage)}
                    </td>
                    {activeProviders.map((provider) => (
                      <td
                        key={provider}
                        className={cn(
                          "py-2 text-right text-muted-foreground tabular-nums",
                          figureClass(isProviderLoading(provider)),
                        )}
                      >
                        {formatUsd(period.byProvider.get(provider)?.costUsd ?? 0)}
                      </td>
                    ))}
                    <td
                      className={cn(
                        "py-2 text-right text-foreground tabular-nums",
                        figureClass(loadingPartial),
                      )}
                    >
                      {formatUsd(period.costUsd)}
                    </td>
                    <td
                      className={cn(
                        "py-2 text-right text-muted-foreground tabular-nums",
                        figureClass(loadingPartial),
                      )}
                    >
                      {formatTokens(period.totalTokens)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </section>
      {view === "bubbles" && (
        <p className="usage-l4-note">
          {t.tools.usage.bubblesHelp}
          {metric === "cost" && merged.models.some((model) => modelShare(model, "cost") === null)
            ? ` ${t.tools.usage.bubblesUnpriced}`
            : ""}
        </p>
      )}
    </div>
  );
}
/** Keeps existing values visible while their provider is refreshing. */
function figureClass(loading: boolean) {
  return cn("transition-opacity", loading && "opacity-40 delay-150");
}
