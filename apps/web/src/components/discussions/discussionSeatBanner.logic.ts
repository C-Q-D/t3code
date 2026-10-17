/** Selects seat-thread identity and localized notice data without subscriptions or navigation effects. */
import type { DiscussionListResult, DiscussionPersonaAvatar } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import type { discussions } from "~/i18n/locales/en/discussions";

/** Stored association from a server thread shell; drafts and ordinary threads provide null. */
export type DiscussionSeatAssociation = { discussionId: string; seatId: string };
/** Only the matching identity, seat color position and title affect the banner. */
export type DiscussionSeatBannerMetadata = {
  title: string;
  personaName: string | null;
  avatar: DiscussionPersonaAvatar | null;
  seatIndex: number;
};

/**
 * Selects metadata only from a current success; failures must not reuse a stale title or link.
 * @param association Stored server-thread discussion and seat identity.
 * @param result Shared list subscription result, including initial and failed states.
 * @returns Matching title/persona/avatar and zero-based seat position (-1 when missing), or null when the title cannot be read.
 */
export function discussionSeatBannerMetadata(
  association: DiscussionSeatAssociation,
  result: AsyncResult.AsyncResult<DiscussionListResult, unknown>,
): DiscussionSeatBannerMetadata | null {
  const list = result._tag === "Success" ? result.value.discussions : null;
  const item = list?.find((candidate) => candidate.id === association.discussionId);
  if (!item?.title) return null;
  const seatIndex = item.seats.findIndex((seat) => seat.id === association.seatId);
  const seat = item.seats[seatIndex];
  return {
    title: item.title,
    personaName: seat?.personaName ?? null,
    avatar: seat?.avatar ?? null,
    seatIndex,
  };
}

/**
 * Produces a permanent notice only for an associated server thread.
 * @param association Shell association, null for ordinary or draft threads.
 * @param metadata Current title/persona, null while unavailable or deleted.
 * @param copy Active localized dictionary.
 * @returns Notice data and optional discussion target; never a dismiss control.
 */
export function discussionSeatBannerView(
  association: DiscussionSeatAssociation | null,
  metadata: Pick<DiscussionSeatBannerMetadata, "title" | "personaName"> | null,
  copy: typeof discussions,
) {
  if (!association) return null;
  return {
    id: "discussion-seat-thread",
    variant: "info" as const,
    priority: "notice" as const,
    title: metadata
      ? copy.seatThread.title(metadata.title, metadata.personaName)
      : copy.seatThread.fallback,
    description: copy.seatThread.description,
    openDiscussionId: metadata ? association.discussionId : null,
  };
}
