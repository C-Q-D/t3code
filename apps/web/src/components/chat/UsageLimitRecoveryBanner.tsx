import type { TimestampFormat } from "@t3tools/contracts/settings";
import { deadlineStore } from "@t3tools/client-runtime/clock";
import { useDeadlinePassed } from "../../hooks/useDeadline";
import { formatUpcomingTimestamp } from "../../timestampFormat";
/** Displays usage limit recovery scheduling and its existing actions. */
import { t } from "~/i18n";
import { SNOOZE_UI_ENABLED } from "~/snoozeUi";
import {
  type OrchestrationV2LimitRecovery,
  type OrchestrationV2LimitRecoveryUpdate,
  type RunId,
} from "@t3tools/contracts";
import { CalendarClockIcon, GaugeIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import type { ComposerBannerStackContent } from "./ComposerBannerStack";
import { toastManager } from "../ui/toast";

/** Existing run-bound schedule and snooze settings; the caller owns persistence and grants. */
type RecoveryProps = {
  runId: RunId;
  resetAt: string | null;
  stoppedAt: string;
  snoozedUntil: string | null;
  recovery: OrchestrationV2LimitRecovery | null;
  timestampFormat: TimestampFormat;
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
              ? t.chat.limitRecovery.resets(formatUpcomingTimestamp(resetAt, props.timestampFormat))
              : t.chat.limitRecovery.resetTimeUnavailableRetryManually}
          </span>
        </div>
        {canSchedule ? <RecoveryActions key={`${runId}:${resetAt}`} {...props} /> : null}
      </section>
    ),
  };
}

/**
 * Renders automatic-resume and snooze controls and reports recovery-update failures through toasts.
 * @param props - Required runId and onChange callback, plus stoppedAt inherited from RecoveryProps.
 * resetAt, recovery, and snoozedUntil may be null; updates are ignored when resetAt is null.
 * onChange asynchronously persists the requested recovery settings.
 * @returns The recovery actions; never null. Disables actions while an update
 * is pending.
 */
function RecoveryActions({ runId, resetAt, recovery, snoozedUntil, onChange }: RecoveryProps) {
  const [pending, setPending] = useState(false);

  const scheduled =
    recovery?.runId === runId && recovery.resetAt === resetAt && recovery.autoResume;
  // The server leaves snoozedUntil in place after the timer wakes the thread,
  // so a snooze whose reset has passed is no longer active.
  const resetPassed = useDeadlinePassed(resetAt === null ? null : Date.parse(resetAt));
  const snoozed =
    recovery?.snooze === true &&
    recovery.runId === runId &&
    recovery.resetAt === resetAt &&
    resetAt !== null &&
    snoozedUntil !== null &&
    Date.parse(snoozedUntil) === Date.parse(resetAt) &&
    !resetPassed;
  async function toggle(action: "resume" | "snooze") {
    if (resetAt === null) return;
    if (action === "snooze" && !snoozed && Date.parse(resetAt) <= Date.now()) {
      toastManager.add({
        type: "error",
        title: t.chat.limitRecovery.snoozeError,
        description: t.chat.limitRecovery.theResetTimeHasPassedRetryThe,
      });
      // The deadline timer can lag after a throttled tab or sleep; disable now.
      deadlineStore(Date.parse(resetAt)).refresh();
      return;
    }
    setPending(true);
    try {
      await onChange({
        runId,
        resetAt,
        ...(action === "resume" ? { autoResume: !scheduled } : { snooze: !snoozed }),
      });
    } catch (cause) {
      toastManager.add({
        type: "error",
        title:
          action === "resume"
            ? t.chat.limitRecovery.autoResumeError
            : t.chat.limitRecovery.snoozeError,
        description:
          cause instanceof Error ? cause.message : t.chat.limitRecovery.couldNotChangeLimitRecovery,
      });
    }
    setPending(false);
  }
  // Inline errors would widen the actions column and crush the title.
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
            disabled={pending || resetPassed}
            onClick={() => void toggle("snooze")}
          >
            {pending ? t.chat.limitRecovery.saving : t.chat.limitRecovery.snoozeUntilReset}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
