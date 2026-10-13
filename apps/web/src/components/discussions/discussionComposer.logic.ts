/** Derives interjection availability and local Enter behavior without executing discussion commands. */
import type { Discussion } from "@t3tools/contracts";
import type { discussions } from "~/i18n/locales/en/discussions";
import { discussionSeatStrip } from "./discussionPage.logic";

/** Composer presentation; null hides the input after the discussion ends. */
export type DiscussionComposerView = { disabled: boolean; placeholder: string } | null;

/**
 * Selects the interjection presentation from the server snapshot.
 * @param discussion Current status, closing plan and shared seat assignment.
 * @param copy Localized composer text.
 * @returns Input presentation, or null for an ended discussion.
 */
export function discussionComposerView(
  discussion: Discussion,
  copy: typeof discussions,
): DiscussionComposerView {
  if (discussion.status === "ended") return null;
  if (discussion.closing || discussion.status === "closing")
    return { disabled: true, placeholder: copy.page.composerClosing };
  const next = discussionSeatStrip(discussion).find(
    (item) => item.kind === "seat" && item.tags.includes("next"),
  );
  const nextSeat = next?.kind === "seat" ? discussion.seats[next.index] : undefined;
  const current = discussion.seats[discussion.cursor.seatIndex];
  if (!nextSeat || !current) return { disabled: false, placeholder: copy.page.composerFallback };
  return {
    disabled: false,
    placeholder:
      discussion.status === "paused"
        ? copy.page.composerPaused(nextSeat.personaName)
        : discussion.seats.length === 1
          ? copy.page.composerSingle(current.personaName)
          : copy.page.composerSpeaking(current.personaName, nextSeat.personaName),
  };
}

/**
 * Produces the text allowed to cross the interjection command boundary.
 * @param text Unmodified draft; whitespace is trimmed only for submission.
 * @param view Current composer availability.
 * @param pending Whether an interjection is already submitted.
 * @param permitted Whether the destination grants the interjection command.
 * @returns Trimmed text, or null when sending is blocked.
 */
export function discussionInterjectionText(
  text: string,
  view: DiscussionComposerView,
  pending: boolean,
  permitted: boolean,
): string | null {
  if (!view || view.disabled || pending || !permitted) return null;
  return text.trim() || null;
}

/**
 * Distinguishes sending Enter from native newline and IME completion.
 * @param event Local textarea key fields; keyCode 229 protects IME completion on Chromium.
 * @returns True only for an unshifted, non-composing Enter.
 */
export function discussionEnterSends(event: {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  keyCode: number;
}): boolean {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229;
}
