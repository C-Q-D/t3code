/** Adapts shared table semantics to the 8a compact row, without choosing page breakpoints or phases. */
import {
  discussionTableConnections,
  discussionTableOrder,
  type DiscussionTableSeat,
  type DiscussionTableSequenceOptions,
} from "./discussionRoundTable.logic";

/**
 * Places identities in actual statement order while retaining their physical seat colors.
 * @param seats The same physical seat data accepted by DiscussionRoundTable.
 * @param options Shared order, closeLoop and quiet controls; no lifecycle state is inferred.
 * @returns Ordered seats with S3/H1 avatar sizes and lift, plus geometry-independent connections.
 * @throws RangeError for duplicate seat ids or repeated/unknown explicit order ids.
 */
export function longTableLayout(
  seats: readonly DiscussionTableSeat[],
  options: DiscussionTableSequenceOptions = {},
) {
  const ordered = discussionTableOrder(seats, options.order);
  return {
    seats: ordered.map((seat) => ({
      ...seat,
      size: seat.state === "speaking" ? 34 : 28,
      lift: seat.state === "speaking" ? -3 : 0,
    })),
    // S3/H1 show active rounds. Unpictured summary/ended/open sequences retain round-table semantics.
    connections: discussionTableConnections(ordered, {
      ...(options.closeLoop === undefined ? {} : { closeLoop: options.closeLoop }),
      ...(options.quiet === undefined ? {} : { quiet: options.quiet }),
    }),
  };
}
