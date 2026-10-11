/** Displays usage limit recovery scheduling and its existing actions. */
import { t } from "~/i18n";
import {
  type OrchestrationV2LimitRecovery,
  type OrchestrationV2LimitRecoveryUpdate,
  type RunId,
} from "@t3tools/contracts";
import { GaugeIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";

type RecoveryProps = {
  runId: RunId;
  resetAt: string | null;
  stoppedAt: string;
  snoozedUntil: string | null;
  recovery: OrchestrationV2LimitRecovery | null;
  onChange: (recovery: OrchestrationV2LimitRecoveryUpdate) => Promise<void>;
};

/**
 * Builds the composer warning for a run stopped by a usage limit.
 * @param props - Required runId, stoppedAt timestamp, and asynchronous recovery-update callback.
 * resetAt, snoozedUntil, and recovery may be null when unavailable or unset.
 * @returns A warning banner descriptor; actions are null unless resetAt is later than stoppedAt.
 * Never returns null.
 */
export function usageLimitRecoveryBannerItem(props: RecoveryProps): ComposerBannerStackItem {
  const { runId, resetAt, stoppedAt } = props;
  const canSchedule = resetAt !== null && Date.parse(resetAt) > Date.parse(stoppedAt);
  return {
    id: `usage-limit-recovery:${runId}`,
    variant: "warning",
    priority: "urgent",
    icon: <GaugeIcon />,
    title: t.chat.limitRecovery.usageLimitReached,
    description: resetAt
      ? t.chat.limitRecovery.resets(new Date(resetAt).toLocaleString())
      : t.chat.limitRecovery.resetTimeUnavailableRetryManually,
    actions: canSchedule ? <RecoveryActions key={`${runId}:${resetAt}`} {...props} /> : null,
  };
}

/**
 * Renders automatic-resume and snooze controls and reports recovery-update failures inline.
 * @param props - Required runId and onChange callback, plus stoppedAt inherited from RecoveryProps.
 * resetAt, recovery, and snoozedUntil may be null; updates are ignored when resetAt is null.
 * onChange asynchronously persists the requested recovery settings.
 * @returns The recovery actions and any inline error; never null. Disables actions while an update
 * is pending.
 */
function RecoveryActions({ runId, resetAt, recovery, snoozedUntil, onChange }: RecoveryProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const delay = Date.parse(resetAt ?? "") - Math.max(nowMs, Date.now());
    if (!Number.isFinite(delay) || delay <= 0) return;
    const timer = window.setTimeout(() => setNowMs(Date.now()), Math.min(delay + 1, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [resetAt, nowMs]);

  const scheduled =
    recovery?.runId === runId && recovery.resetAt === resetAt && recovery.autoResume;
  const snoozed =
    recovery?.snooze === true &&
    recovery.runId === runId &&
    recovery.resetAt === resetAt &&
    resetAt !== null &&
    snoozedUntil !== null &&
    Date.parse(snoozedUntil) === Date.parse(resetAt);
  async function toggle(action: "resume" | "snooze") {
    if (resetAt === null) return;
    if (action === "snooze" && !snoozed && Date.parse(resetAt) <= Date.now()) {
      setError(t.chat.limitRecovery.theResetTimeHasPassedRetryThe);
      setNowMs(Date.now());
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onChange({
        runId,
        resetAt,
        ...(action === "resume" ? { autoResume: !scheduled } : { snooze: !snoozed }),
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t.chat.limitRecovery.couldNotChangeLimitRecovery,
      );
    }
    setPending(false);
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="xs" variant="ghost" disabled={pending} onClick={() => void toggle("resume")}>
        {pending
          ? t.chat.limitRecovery.saving
          : scheduled
            ? t.chat.limitRecovery.cancelAutoResume
            : t.chat.limitRecovery.resumeAtReset}
      </Button>
      {!snoozed ? (
        <Button
          size="xs"
          variant="ghost"
          disabled={pending || Date.parse(resetAt!) <= nowMs}
          onClick={() => void toggle("snooze")}
        >
          {pending ? t.chat.limitRecovery.saving : t.chat.limitRecovery.snoozeUntilReset}
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="basis-full text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
