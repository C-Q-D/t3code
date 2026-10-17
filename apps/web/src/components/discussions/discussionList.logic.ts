/** Derives all-project discussion grouping and row labels; subscriptions and navigation stay in the page. */
import type { DiscussionListItem, EnvironmentId } from "@t3tools/contracts";
import type { discussions } from "~/i18n/locales/en/discussions";
import type { PixelSeatState } from "./PixelSeat.logic";

/**
 * Places K2 seats clockwise on the upper arc without changing snapshot order.
 * @param discussion Snapshot whose cursor identifies the current or failed seat.
 * @returns Seat centers relative to the well's horizontal midpoint, in pixels; empty input stays empty.
 */
export function discussionListSeats(discussion: DiscussionListItem) {
  const count = discussion.seats.length;
  const span = count > 3 ? 150 : count === 2 ? 80 : 120;
  return discussion.seats.map((seat, index) => {
    const angle =
      ((-90 - span / 2 + (count > 1 ? (index * span) / (count - 1) : 0)) * Math.PI) / 180;
    const current = index === discussion.cursor.seatIndex;
    const active = discussion.status === "speaking" || discussion.status === "closing";
    const state: PixelSeatState =
      active && current
        ? "speaking"
        : (discussion.status === "speaking" && index === discussion.cursor.seatIndex + 1) ||
            (discussion.status === "paused" &&
              discussion.pause?.reason === "seat_failed" &&
              current)
          ? "next"
          : "idle";
    return {
      seat,
      index,
      state,
      size: state === "speaking" ? 32 : 26,
      x: Math.cos(angle) * 64,
      y: 92 + Math.sin(angle) * 64,
    };
  });
}

/** Environment identity disambiguates discussions and projects from independent servers. */
export type ScopedDiscussionListItem = DiscussionListItem & {
  readonly environmentId: EnvironmentId;
};
/** Localized list labels passed explicitly so presentation rules remain pure. */
type DiscussionListCopy = typeof discussions;
/** A nonempty, sorted group ready for display. */
type DiscussionListGroup = {
  readonly kind: "ongoing" | "ended";
  readonly label: string;
  readonly count: number;
  readonly items: ReadonlyArray<ScopedDiscussionListItem>;
};

/**
 * Partitions the all-environment list without consulting project scope.
 * @param items Discussion snapshots carrying their destination environment.
 * @param copy Localized group label functions.
 * @returns Nonempty ongoing then ended groups, each sorted by descending updatedAt; input is unchanged.
 */
export function groupDiscussions(
  items: ReadonlyArray<ScopedDiscussionListItem>,
  copy: DiscussionListCopy,
): DiscussionListGroup[] {
  const ongoing: ScopedDiscussionListItem[] = [];
  const ended: ScopedDiscussionListItem[] = [];
  for (const item of items) {
    (item.status === "ended" ? ended : ongoing).push(item);
  }
  return [
    {
      kind: "ongoing" as const,
      label: copy.ongoing(ongoing.length),
      count: ongoing.length,
      items: ongoing,
    },
    {
      kind: "ended" as const,
      label: copy.endedGroup(ended.length),
      count: ended.length,
      items: ended,
    },
  ]
    .filter((group) => group.count > 0)
    .map((group) => ({
      ...group,
      items: group.items.toSorted((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    }));
}

/**
 * Resolves the round and status presentation from a discussion snapshot.
 * @param discussion List snapshot; the cursor selects the speaking seat, and pause identifies failures.
 * @param copy Localized status and round labels.
 * @returns Round text and Badge text/variant; ended rounds are totals and paused failures remain warnings.
 */
export function discussionListRow(
  discussion: DiscussionListItem,
  copy: DiscussionListCopy,
): {
  roundLabel: string;
  statusLabel: string;
  badgeVariant: "info" | "warning" | "secondary";
} {
  const roundLabel =
    discussion.status === "ended"
      ? copy.totalRounds(discussion.cursor.round)
      : copy.round(discussion.cursor.round);
  switch (discussion.status) {
    case "speaking":
      return {
        roundLabel,
        statusLabel: copy.speaking(
          discussion.seats[discussion.cursor.seatIndex]?.personaName ?? "",
        ),
        badgeVariant: "info",
      };
    case "closing":
      return { roundLabel, statusLabel: copy.closing, badgeVariant: "info" };
    case "paused":
      return {
        roundLabel,
        statusLabel: discussion.pause?.reason === "seat_failed" ? copy.seatFailed : copy.paused,
        badgeVariant: "warning",
      };
    case "ended":
      return { roundLabel, statusLabel: copy.ended, badgeVariant: "secondary" };
  }
}
