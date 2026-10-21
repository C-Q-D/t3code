/** Localized usage presentation and existing interaction behavior. */
import { t } from "~/i18n";
import {
  AuthProvidersManageScope,
  type EnvironmentId,
  type ProviderConsumeResetCreditOutcome,
  ProviderConsumeResetCreditInput,
  ServerProvider,
  ServerProviderResetCredits,
  ServerProviderUsageWindow,
  UsageProviderKind,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import {
  collectLimitAccounts,
  elapsedShare,
  formatDuration,
  formatResetsIn,
  type LimitPace,
  paceOf,
  remainingPercent,
} from "@t3tools/shared/usageLimits";
import { GaugeIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { Fragment, useState, useRef } from "react";

import { useAnimatedNumber } from "../../hooks/useAnimatedNumber";
import { usePrimarySettings } from "../../hooks/useSettings";
import { environmentPresentations } from "../../state/presentation";
import { useEnvironmentScope, readEnvironmentScope } from "../../state/session";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { formatUpcomingTimestamp } from "../../timestampFormat";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { PROVIDER_PRESENTATION } from "./usageProviders";

const PACE: Record<LimitPace, { readonly label: string; readonly icon: typeof GaugeIcon }> = {
  ahead: { label: t.tools.usage.aheadOfPace, icon: TrendingUpIcon },
  on: { label: t.tools.usage.onPace, icon: GaugeIcon },
  under: { label: t.tools.usage.underPace, icon: TrendingDownIcon },
};

export function barColor(driver: ServerProvider["driver"]): string {
  const presentation = Object.values(PROVIDER_PRESENTATION).find(
    (entry) => entry.driverKind === driver,
  );
  return presentation?.color ?? "var(--foreground)";
}

export function PaceIcon({ pace }: { readonly pace: LimitPace }) {
  const Icon = PACE[pace].icon;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="img"
            aria-label={PACE[pace].label}
            className="inline-flex text-muted-foreground"
          />
        }
      >
        <Icon className="size-3.5" aria-hidden />
      </TooltipTrigger>
      <TooltipPopup side="top">{PACE[pace].label}</TooltipPopup>
    </Tooltip>
  );
}

function WindowBar({
  color,
  window,
  now,
}: {
  readonly color: string;
  readonly window: ServerProviderUsageWindow;
  readonly now: number;
}) {
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const remaining = remainingPercent(window);
  const elapsed = elapsedShare(window, now);
  // The fill is quota left, so the even-spending mark is the time left.
  const timeLeft = elapsed === null ? null : Math.round((1 - elapsed) * 100);
  const resetsIn = formatResetsIn(window, now, t.chat.workLog.shared.usageLimits);
  const resetsAt = window.resetsAt
    ? formatUpcomingTimestamp(window.resetsAt, timestampFormat, now)
    : null;
  const summary = t.tools.usage.windowSummary(window.label, remaining, timeLeft, resetsIn);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            role="img"
            aria-label={summary}
            tabIndex={0}
            className="relative h-6 cursor-default rounded-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        }
      >
        <div className="absolute inset-x-0 inset-y-1.5 rounded-full bg-muted" />
        {remaining > 0 ? (
          <div
            className="absolute inset-y-1.5 left-0 rounded-full"
            style={{ width: `${remaining}%`, backgroundColor: color }}
          />
        ) : null}
        {timeLeft !== null ? (
          <span
            aria-hidden
            className="absolute inset-y-0.5 w-px -translate-x-1/2 bg-foreground/60"
            style={{ left: `${timeLeft}%` }}
          />
        ) : null}
      </TooltipTrigger>
      <TooltipPopup side="top">
        <div className="flex flex-col gap-0.5">
          <span className="text-foreground">
            <RemainingQuota value={remaining} />
            {timeLeft !== null ? t.tools.usage.timeLeftSuffix(timeLeft) : ""}
          </span>
          {timeLeft !== null ? (
            <span className="text-muted-foreground">{t.tools.usage.evenSpending}</span>
          ) : null}
          {resetsAt ? (
            <span className="text-muted-foreground">
              {t.tools.usage.resetsPrefix}
              {resetsAt}
              {resetsIn ? ` · ${resetsIn}` : ""}
            </span>
          ) : null}
        </div>
      </TooltipPopup>
    </Tooltip>
  );
}

/** Animate the visible remaining quota; the accessible label always uses the current quota. */
function RemainingQuota({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useAnimatedNumber(ref, value, (current) => `${Math.round(current)}${t.tools.usage.percentLeft}`);
  return (
    <span role="img" aria-label={`${value}${t.tools.usage.percentLeft}`}>
      <span ref={ref} aria-hidden>
        {value}
        {t.tools.usage.percentLeft}
      </span>
    </span>
  );
}

/**
 * One account's windows as rows: label and percent, bar, pace and countdown.
 * Compact rows fit the composer panel with narrower columns.
 */
export function LimitWindows({
  driver,
  windows,
  now,
  compact = false,
}: {
  readonly driver: ServerProvider["driver"];
  readonly windows: ReadonlyArray<ServerProviderUsageWindow>;
  readonly now: number;
  readonly compact?: boolean;
}) {
  const color = barColor(driver);
  return (
    <div
      className={
        compact
          ? "grid grid-cols-[minmax(0,9rem)_minmax(3rem,1fr)_auto] gap-x-3 gap-y-0.5"
          : "grid grid-cols-[11rem_minmax(0,1fr)_7rem] gap-x-4 gap-y-1"
      }
    >
      {windows.map((window) => {
        const pace = paceOf(window, now);
        const resetsIn = formatResetsIn(window, now, t.chat.workLog.shared.usageLimits);
        return (
          <Fragment key={window.id}>
            <span className="flex min-w-0 items-center gap-2 text-xs">
              <span className="truncate text-muted-foreground">{window.label}</span>
              <span className="ms-auto shrink-0 font-medium text-foreground tabular-nums">
                <RemainingQuota value={remainingPercent(window)} />
              </span>
            </span>
            <WindowBar color={color} window={window} now={now} />
            <span className="flex items-center gap-2 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
              {pace ? <PaceIcon pace={pace} /> : null}
              <span className="ms-auto shrink-0">{resetsIn ?? ""}</span>
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

const OUTCOME_TEXT: Record<ProviderConsumeResetCreditOutcome, string> = {
  reset: t.tools.usage.resetApplied,
  nothingToReset: t.tools.usage.nothingToReset,
  noCredit: t.tools.usage.noCredit,
  alreadyRedeemed: t.tools.usage.alreadyRedeemed,
};

export function useResetCredit(
  environmentId: EnvironmentId,
  input: ProviderConsumeResetCreditInput,
) {
  const canManageProviders = useEnvironmentScope(environmentId, AuthProvidersManageScope);
  const consume = useAtomCommand(serverEnvironment.consumeResetCredit, { reportFailure: false });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const redeem = async () => {
    setConfirming(false);
    if (!readEnvironmentScope(environmentId, AuthProvidersManageScope)) return;
    setBusy(true);
    setStatus(null);
    const result = await consume({ environmentId, input });
    setBusy(false);
    if (result._tag === "Success") {
      setStatus(result.value.warning ?? OUTCOME_TEXT[result.value.outcome]);
      return;
    }
    setStatus(
      "error" in result.cause && result.cause.error instanceof Error
        ? result.cause.error.message
        : t.tools.usage.resetFailed,
    );
  };

  return { canManageProviders, confirming, setConfirming, busy, status, redeem };
}

/**
 * Redeeming spends a credit the provider granted the user, so it never fires on a bare click.
 * Mount it outside any popover that holds the button: dialogs stack under popovers, and closing
 * the popover would unmount a dialog rendered inside it.
 */
export function ResetCreditDialog({
  open,
  onOpenChange,
  onConfirm,
  disabled = false,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.tools.usage.confirmReset}</AlertDialogTitle>
          <AlertDialogDescription>{t.tools.usage.resetHint}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>
            {t.common.confirm.cancel}
          </AlertDialogClose>
          <Button disabled={disabled} onClick={onConfirm}>
            {t.tools.usage.redeemCredit}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function resetCreditsSummary(
  credits: ServerProviderResetCredits,
  now: number,
  compact = false,
): string {
  const expiresIn = credits.nextExpiresAt
    ? formatDuration(Date.parse(credits.nextExpiresAt) - now, t.chat.workLog.shared.usageLimits)
    : null;
  if (credits.availableCount === 0) return t.tools.usage.noResetCredits;
  if (compact) return t.tools.usage.compactCredits(credits.availableCount, expiresIn);
  return t.tools.usage.resetCredits(credits.availableCount, expiresIn);
}

export function ResetCredits({
  environmentId,
  input,
  credits,
  now,
}: {
  readonly environmentId: EnvironmentId;
  readonly input: ProviderConsumeResetCreditInput;
  readonly credits: ServerProviderResetCredits;
  readonly now: number;
}) {
  const { canManageProviders, confirming, setConfirming, busy, status, redeem } = useResetCredit(
    environmentId,
    input,
  );
  if (credits.availableCount === 0 && status === null) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="tabular-nums">{resetCreditsSummary(credits, now)}</span>
      {credits.availableCount > 0 ? (
        <Button
          size="xs"
          variant="outline"
          disabled={busy || !canManageProviders}
          onClick={() => {
            if (readEnvironmentScope(environmentId, AuthProvidersManageScope)) setConfirming(true);
          }}
        >
          {busy ? t.tools.usage.using : t.tools.usage.redeemReset}
        </Button>
      ) : null}
      {status ? <span className="text-foreground">{status}</span> : null}
      <ResetCreditDialog
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={() => void redeem()}
        disabled={!canManageProviders}
      />
    </div>
  );
}

/** Filters selected environments and hidden drivers consistently for pooled limits and extras. */
export function useLimitPresentations(
  selectedEnvironmentIds: ReadonlySet<EnvironmentId> | null,
  hiddenProviders: ReadonlySet<UsageProviderKind>,
): Parameters<typeof collectLimitAccounts>[0] {
  const presentations = useAtomValue(environmentPresentations.presentationsWithProvidersAtom);
  const hiddenDrivers = new Set<ServerProvider["driver"]>(
    [...hiddenProviders].map((provider) => PROVIDER_PRESENTATION[provider].driverKind),
  );
  const isVisible = (driver: ServerProvider["driver"]) => !hiddenDrivers.has(driver);
  const selected = new Map(
    [...presentations].flatMap(([id, presentation]) => {
      if (selectedEnvironmentIds !== null && !selectedEnvironmentIds.has(id)) return [];
      const config = presentation.serverConfig;
      if (hiddenDrivers.size === 0 || config === null) return [[id, presentation] as const];
      return [
        [
          id,
          {
            ...presentation,
            serverConfig: {
              ...config,
              providers: config.providers.filter((provider) => isVisible(provider.driver)),
              usageLimitSources: config.usageLimitSources?.flatMap((source) => {
                const accounts = source.accounts.filter((account) => isVisible(account.driver));
                return accounts.length === 0 && source.accounts.length > 0
                  ? []
                  : [{ ...source, accounts }];
              }),
            },
          },
        ] as const,
      ];
    }),
  );
  return selected;
}
