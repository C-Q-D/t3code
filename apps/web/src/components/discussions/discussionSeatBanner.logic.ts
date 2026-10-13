/** Selects seat-thread identity and localized notice data without subscriptions or navigation effects. */
import type { DiscussionListItem } from "@t3tools/contracts";
import type { discussions } from "~/i18n/locales/en/discussions";

/** Stored association from a server thread shell; drafts and ordinary threads provide null. */
export type DiscussionSeatAssociation = { discussionId: string; seatId: string };
/** Only the title and matching persona affect the banner; other list changes are ignored. */
export type DiscussionSeatBannerMetadata = { title: string; personaName: string | null };

/**
 * Selects metadata from a current successful list; unavailable lists pass null.
 * @param association Stored server-thread discussion and seat identity.
 * @param list Successful discussion list, null while loading or failed.
 * @returns Matching title/persona, or null when the title cannot be read.
 */
export function discussionSeatBannerMetadata(
  association: DiscussionSeatAssociation,
  list: readonly Pick<DiscussionListItem, "id" | "title" | "seats">[] | null,
): DiscussionSeatBannerMetadata | null {
  const item = list?.find((candidate) => candidate.id === association.discussionId);
  if (!item?.title) return null;
  return {
    title: item.title,
    personaName: item.seats.find((seat) => seat.id === association.seatId)?.personaName ?? null,
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
  metadata: DiscussionSeatBannerMetadata | null,
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
