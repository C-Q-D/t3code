/** Folds discussion subscription events without owning transport or UI state. */
import type { Discussion, DiscussionEntry, DiscussionSubscriptionEvent } from "@t3tools/contracts";

/** A received snapshot with an explicit tombstone so deletion is not mistaken for loading. */
export interface DiscussionState {
  readonly discussion: Discussion;
  readonly entries: readonly DiscussionEntry[];
  readonly deleted: boolean;
}

/**
 * Applies one event without mutating previous snapshots or wire payloads.
 * @param state Previous snapshot, or null before the first snapshot arrives.
 * @param event Decoded event from one discussion's ordered subscription.
 * @returns Current snapshot with entries in ascending seq order, or null before initialization.
 */
export function applyDiscussionSubscriptionEvent(
  state: DiscussionState | null,
  event: DiscussionSubscriptionEvent,
): DiscussionState | null {
  if (event.type === "snapshot") {
    return {
      discussion: event.discussion,
      entries: [...event.entries].sort((left, right) => left.seq - right.seq),
      deleted: false,
    };
  }
  // The wire sends a snapshot first; do not manufacture partial UI state before it.
  if (state === null || state.deleted) return state;

  switch (event.type) {
    case "discussion.updated":
      return { ...state, discussion: event.discussion };
    case "entry.appended":
      return {
        ...state,
        entries: [...state.entries, event.entry].sort((left, right) => left.seq - right.seq),
      };
    case "entry.updated":
      return {
        ...state,
        entries: state.entries
          .map((entry) => (entry.id === event.entry.id ? event.entry : entry))
          .sort((left, right) => left.seq - right.seq),
      };
    case "discussion.deleted":
      return { ...state, deleted: true };
  }
}
