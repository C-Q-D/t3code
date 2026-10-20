/** Displays usage limit recovery scheduling and its existing actions. */
import { t } from "~/i18n";
import { SNOOZE_UI_ENABLED } from "~/snoozeUi";
import {
  type OrchestrationV2LimitRecovery,
  type OrchestrationV2LimitRecoveryUpdate,
  type RunId,
} from "@t3tools/contracts";
import { CalendarClockIcon, GaugeIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import type { ComposerBannerStackContent } from "./ComposerBannerStack";

/** Existing run-bound schedule and snooze settings; the caller owns persistence and grants. */
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
 * @returns A warning card in the composer stack; actions are absent unless resetAt follows stoppedAt.
 * Never returns null.
 */
export function usageLimitRecoveryBannerItem(props: RecoveryProps): ComposerBannerStackContent {
  const { runId, resetAt, stoppedAt } = props;
  const canSchedule = resetAt !== null && Date.parse(resetAt) > Date.parse(stoppedAt);
  return {
    id: `usage-limit-recovery:${runId}`,
    variant: "warning",
    priority: "urgent",
    kind: "limit-recovery",
    content: (
      <section
        role="alert"
        className="surface-glass flex min-w-0 flex-col gap-2.5 rounded-card-surface p-3.5 text-secondary-copy-large text-foreground shadow-timeline-request-card"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <GaugeIcon className="size-4 shrink-0" aria-hidden />
          <b className="min-w-0 flex-1">{t.chat.limitRecovery.usageLimitReached}</b>
          <span className="text-secondary-copy text-secondary-label">
            {resetAt
              ? t.chat.limitRecovery.resets(new Date(resetAt).toLocaleString())
              : t.chat.limitRecovery.resetTimeUnavailableRetryManually}
          </span>
        </div>
        {canSchedule ? <RecoveryActions key={`${runId}:${resetAt}`} {...props} /> : null}
      </section>
    ),
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
    <div
      className="timeline-limit-actions flex flex-wrap items-center gap-1.5"
      data-scheduled={scheduled}
    >
      <div className="timeline-limit-resume flex min-w-0 items-center gap-2">
        {scheduled ? <CalendarClockIcon className="size-3.25 shrink-0" aria-hidden /> : null}
        {scheduled ? <span className="flex-1" aria-hidden /> : null}
        <Button
          size={scheduled ? "compact" : "toolbar"}
          variant={scheduled ? "outline" : "default"}
          disabled={pending}
          onClick={() => void toggle("resume")}
        >
          {pending
            ? t.chat.limitRecovery.saving
            : scheduled
              ? t.chat.limitRecovery.cancelAutoResume
              : t.chat.limitRecovery.resumeAtReset}
        </Button>
      </div>
      {SNOOZE_UI_ENABLED && !snoozed ? (
        <div className="flex min-w-0 items-center">
          <Button
            size="toolbar"
            variant="secondary"
            disabled={pending || Date.parse(resetAt!) <= nowMs}
            onClick={() => void toggle("snooze")}
          >
            {pending ? t.chat.limitRecovery.saving : t.chat.limitRecovery.snoozeUntilReset}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="order-3 basis-full text-secondary-copy text-error-foreground">
          {error}
        </p>
      ) : null}
    </div>
  );
}
