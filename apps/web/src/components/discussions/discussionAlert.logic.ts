/** Selects one current-state notice; rendering and thread subscriptions remain with the alert component. */
import type { Discussion, ThreadId, ProviderRequestKind } from "@t3tools/contracts";
import {
  DISCUSSION_BRIEF_WARN_CHARS,
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
} from "@t3tools/contracts";
import type { discussions } from "~/i18n/locales/en/discussions";

/** Presentation of the highest-priority notice; thread links exist only for pending requests. */
export type DiscussionAlertView = {
  variant: "warning" | "error" | "info";
  text: string;
  threadId: ThreadId | null;
};

/**
 * Selects the pause reason before any active-seat request or material warning.
 * @param discussion Current snapshot; ended or incomplete pause states have no notice.
 * @param requests Pending requests of the current seat, or null while unavailable.
 * @param copy Active discussion dictionary.
 * @param locale Language used for material character counts.
 * @param providerNames Existing instance display labels indexed by instance ID.
 * @returns One notice, or null when the current state has nothing to report.
 */
export function discussionAlertView(
  discussion: Discussion,
  requests: {
    approvals: ReadonlyArray<{ requestKind: ProviderRequestKind }>;
    userInputs: ReadonlyArray<unknown>;
  } | null,
  copy: typeof discussions,
  locale: string,
  providerNames: ReadonlyMap<string, string>,
): DiscussionAlertView | null {
  if (discussion.status === "ended") return null;
  const seat = discussion.seats[discussion.cursor.seatIndex];
  if (!seat) return null;
  const labels = copy.alerts;
  if (discussion.status === "paused") {
    const pause = discussion.pause;
    if (!pause) return null;
    if (pause.reason === "stopped")
      return { variant: "warning", text: labels.stopped(seat.personaName), threadId: null };
    if (pause.reason === "server_restarted")
      return { variant: "info", text: labels.restarted, threadId: null };
    const failedSeat = discussion.seats.find((candidate) => candidate.id === pause.seatId) ?? seat;
    const provider =
      providerNames.get(failedSeat.modelSelection.instanceId) ??
      failedSeat.modelSelection.instanceId;
    const message = (pause.message ?? "").trim().replace(/[。.]+$/, "");
    const failure =
      pause.failureKind === "usage_limit"
        ? labels.usageLimit(failedSeat.personaName, provider)
        : labels.failed(failedSeat.personaName, message);
    return {
      variant: "error",
      text: failure + labels.retry(discussion.closing === null),
      threadId: null,
    };
  }
  if (requests?.approvals.length || requests?.userInputs.length) {
    const command = requests.approvals.some((request) => request.requestKind === "command");
    const text = requests.approvals.length
      ? command
        ? labels.command(seat.personaName)
        : labels.operation(seat.personaName)
      : labels.questions(seat.personaName);
    return { variant: "info", text, threadId: seat.threadId };
  }
  const { briefChars, briefSentAsFile } = discussion.cursor;
  if (!briefSentAsFile && briefChars <= DISCUSSION_BRIEF_WARN_CHARS) return null;
  const format = new Intl.NumberFormat(locale);
  const text = (briefSentAsFile ? labels.file : labels.long)(
    seat.personaName,
    format.format(briefChars),
    format.format(PROVIDER_SEND_TURN_MAX_INPUT_CHARS),
  );
  return { variant: briefSentAsFile ? "info" : "warning", text, threadId: null };
}
