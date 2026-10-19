/** Presents compact context usage while retaining detailed usage and compaction in a popover. */
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber";
import { t } from "~/i18n";
import { Button } from "../ui/button";
import { type ContextWindowSnapshot, formatContextWindowTokens } from "~/lib/contextWindow";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import {
  formatContextWindowCompactionMessage,
  formatContextWindowCost,
} from "./ContextWindowMeter.logic";
import { Minimize2Icon } from "lucide-react";
import { composerFloatingLayerProps } from "./composerEventScope";
import { cn } from "~/lib/utils";
import { memo, useMemo, useRef } from "react";
import type { UsageLimitsReport } from "@t3tools/contracts";
import { contextWindowUsageAccounts } from "./ContextWindowUsage.logic";
import { ensureLocalApi } from "../../localApi";
import { RedactedSensitiveText } from "../settings/RedactedSensitiveText";

/** Formats snapshot percentages, preserving one decimal below 10%; missing or nonfinite usage has no label. */
function formatPercentage(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  if (value < 10) {
    return `${value.toFixed(1).replace(/\.0$/, "")}%`;
  }
  return `${Math.round(value)}%`;
}

/**
 * Shows context usage as a compact meter with the existing details and compaction popover.
 * @param props Current usage snapshot; optional model name labels details. onCompact enables
 * compaction when supplied; compactDisabled and its nullable reason describe host restrictions.
 * usageLimitsReport supplies live quota windows and optional provider management links.
 * @returns The usage trigger and its details; unavailable usage retains the snapshot's empty state.
 */
export function ContextWindowMeter(props: {
  usage: ContextWindowSnapshot;
  usageLimitsReport?: UsageLimitsReport | null | undefined;
  modelDisplayName?: string | null;
  onCompact?: (() => void) | undefined;
  compactDisabled?: boolean | undefined;
  compactDisabledReason?: string | null | undefined;
}) {
  const {
    usage,
    modelDisplayName,
    onCompact,
    compactDisabled,
    compactDisabledReason,
    usageLimitsReport,
  } = props;
  const usedPercentage = formatPercentage(usage.usedPercentage);
  const normalizedPercentage = Math.max(0, Math.min(100, usage.usedPercentage ?? 0));
  const numberRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  useAnimatedNumber(
    numberRef,
    usage.usedPercentage,
    (value) => formatPercentage(value) ?? "—",
    fillRef,
  );
  const totalProcessedTokens = usage.totalProcessedTokens ?? null;
  const showTotalProcessed = totalProcessedTokens !== null && totalProcessedTokens > 0;
  const isOverloaded = normalizedPercentage > 90;

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={onCompact ? 150 : 0}
        render={
          <button
            type="button"
            className="inline-flex h-8.5 shrink-0 cursor-pointer items-center gap-2 rounded-full border-0 bg-transparent px-2 font-mono text-secondary-copy text-secondary-label outline-none hover:text-foreground focus-visible:inset-shadow-focus"
            aria-label={
              usage.maxTokens !== null && usedPercentage
                ? t.composer.contextWindow.usedPercentageAriaLabel(usedPercentage)
                : t.composer.contextWindow.usedTokensAriaLabel(
                    formatContextWindowTokens(usage.usedTokens),
                  )
            }
          >
            <span
              aria-hidden="true"
              className="flex h-1.5 w-13 shrink-0 overflow-hidden rounded-full bg-composer-context-track shadow-well-progress"
            >
              <span
                ref={fillRef}
                className={cn(
                  "h-full w-full origin-left rounded-full",
                  isOverloaded ? "bg-error" : "bg-composer-context-fill",
                )}
                style={{ transform: `scaleX(${normalizedPercentage / 100})` }}
              />
            </span>
            <span ref={numberRef} aria-hidden="true" className="tabular-nums">
              {usedPercentage ?? "—"}
            </span>
          </button>
        }
      />
      <PopoverPopup
        {...composerFloatingLayerProps}
        side="top"
        align="end"
        padding="none"
        width="md"
      >
        <div className="flex flex-col gap-2.5 p-3.5 text-left whitespace-normal">
          <h3 className="font-serif text-card-title font-bold text-foreground">
            {t.composer.contextWindow.title}
          </h3>
          {usage.maxTokens !== null ? (
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-input"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(normalizedPercentage)}
              aria-label={t.composer.contextWindow.usageAriaLabel}
            >
              <div
                className={cn(
                  "h-full rounded-full",
                  isOverloaded ? "bg-error" : "bg-composer-context-fill",
                )}
                style={{ width: `${normalizedPercentage}%` }}
              />
            </div>
          ) : null}
          <dl className="composer-context-stats grid gap-x-2.5 gap-y-1 text-secondary-copy-medium">
            <dt className="text-secondary-label">{t.composer.contextWindow.used}</dt>
            <dd className="text-right font-mono text-foreground tabular-nums">
              {usage.maxTokens !== null && usedPercentage ? (
                <>
                  {usedPercentage} · {formatContextWindowTokens(usage.usedTokens)} /{" "}
                  {formatContextWindowTokens(usage.maxTokens ?? null)}
                </>
              ) : (
                formatContextWindowTokens(usage.usedTokens)
              )}
            </dd>
            {showTotalProcessed ? (
              <>
                <dt className="text-secondary-label">{t.composer.contextWindow.totalProcessed}</dt>
                <dd className="text-right font-mono text-foreground tabular-nums">
                  {t.composer.contextWindow.processedTokens(
                    formatContextWindowTokens(totalProcessedTokens),
                  )}
                </dd>
              </>
            ) : null}
            {usage.cost != null ? (
              <>
                <dt className="text-secondary-label">{t.composer.contextWindow.cost}</dt>
                <dd className="text-right font-mono text-foreground tabular-nums">
                  {formatContextWindowCost(usage.cost)}
                </dd>
              </>
            ) : null}
          </dl>
          {usage.compactsAutomatically ? (
            <div className="text-pretty text-secondary-label text-secondary-copy">
              {formatContextWindowCompactionMessage(modelDisplayName, usage.autoCompactThreshold)}
            </div>
          ) : null}
          {onCompact ? (
            <>
              <Button
                size="toolbar"
                variant="secondary"
                className="w-full"
                disabled={compactDisabled}
                onClick={onCompact}
              >
                <Minimize2Icon aria-hidden="true" />
                {t.composer.contextWindow.compact}
              </Button>
              {compactDisabled && compactDisabledReason ? (
                <div className="text-pretty text-secondary-label text-secondary-copy">
                  {compactDisabledReason}
                </div>
              ) : null}
            </>
          ) : null}
          <ContextWindowUsageLimits report={usageLimitsReport} />
        </div>
      </PopoverPopup>
    </Popover>
  );
}

/** Renders real quota windows only inside the open popup; management uses the banner's external-link path. */
const ContextWindowUsageLimits = memo(function ContextWindowUsageLimits({
  report,
}: {
  report: UsageLimitsReport | null | undefined;
}) {
  const accounts = useMemo(() => contextWindowUsageAccounts(report), [report]);
  if (accounts.length === 0) return null;
  return (
    <>
      <div className="h-px bg-black/60 shadow-composer-usage-divider" />
      {accounts.map((account) => (
        <section key={account.id} className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2 text-secondary-copy-medium">
            <h4 className="min-w-0 font-bold">
              {t.composer.usageLimits.title}
              {accounts.length > 1 ? (
                <>
                  {" · "}
                  {account.label.includes("@") ? (
                    <RedactedSensitiveText
                      value={account.label}
                      ariaLabel={t.composer.usageLimits.toggleAccount}
                      revealTooltip={t.composer.usageLimits.revealAccount}
                      hideTooltip={t.composer.usageLimits.hideAccount}
                    />
                  ) : (
                    account.label
                  )}
                </>
              ) : null}
            </h4>
            <button
              type="button"
              className="composer-usage-manage"
              disabled={account.managementUrl === null}
              onClick={
                account.managementUrl === null
                  ? undefined
                  : () => void ensureLocalApi().shell.openExternal(account.managementUrl!)
              }
            >
              {t.composer.usageLimits.manage}
            </button>
          </div>
          {account.windows.map((window) => (
            <div key={window.id} className="flex flex-col gap-1">
              {account.windows.length > 1 ? (
                <span className="text-meta-large text-secondary-label">{window.label}</span>
              ) : null}
              <div className="flex items-center gap-2 text-secondary-copy text-secondary-label">
                <div
                  role="progressbar"
                  aria-label={`${window.label}: ${t.composer.contextWindow.used}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={window.usedPercent}
                  className="h-1.25 min-w-0 flex-1 overflow-hidden rounded-full bg-input"
                >
                  <div
                    className="h-full rounded-full bg-success"
                    style={{ width: `${window.usedPercent}%` }}
                  />
                </div>
                <span className="shrink-0 tabular-nums">
                  {t.composer.contextWindow.remaining(window.remainingPercent)}
                </span>
              </div>
            </div>
          ))}
        </section>
      ))}
    </>
  );
});

/** Holds the meter's footprint while a thread's activities are still loading. */
export function ContextWindowMeterPlaceholder() {
  return <span aria-hidden="true" className="h-8.5 w-24.5 shrink-0" />;
}
