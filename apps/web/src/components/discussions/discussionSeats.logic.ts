/** Immutable seat editing rules; transport calls and editor identity stay in the UI. */
import type {
  DiscussionTemplate,
  DiscussionPromptId,
  ModelSelection,
  DiscussionProviderSupportResult,
  ProviderInstanceId,
} from "@t3tools/contracts";

/** Template-shaped seats; their array order is the speaking order. */
export type DiscussionDraftSeat = DiscussionTemplate["seats"][number];

/**
 * Derives a seat's displayed position during a pending drag without committing draft data.
 * @param index Original zero-based position of this seat.
 * @param from Drag source, or -1 when no drag is active.
 * @param to Collision target, or -1 when the pointer has no target.
 * @param count Number of actual seats; the add button is not a drop target.
 * @returns Preview position; invalid or inactive drags retain the original position.
 */
export function discussionSeatPreviewIndex(index: number, from: number, to: number, count: number) {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= count ||
    to >= count
  )
    return index;
  if (index === from) return to;
  if (from < to && index > from && index <= to) return index - 1;
  if (from > to && index >= to && index < from) return index + 1;
  return index;
}

/**
 * Appends a complete default seat without changing earlier seats.
 * @param seats Current speaking order.
 * @param seat Persona and user-default model to append.
 * @returns New ordered array.
 */
export function addDiscussionSeat(
  seats: readonly DiscussionDraftSeat[],
  seat: DiscussionDraftSeat,
) {
  return [...seats, seat];
}
/**
 * Removes one position.
 * @param seats Current order.
 * @param index Zero-based position; invalid positions are ignored.
 * @returns Remaining seats in their existing order.
 */
export function removeDiscussionSeat(seats: readonly DiscussionDraftSeat[], index: number) {
  return seats.filter((_, position) => position !== index);
}
/**
 * Moves one seat to a final position.
 * @param seats Current order.
 * @param from Source index.
 * @param to Final index.
 * @returns New speaking order; invalid indices leave it unchanged.
 */
export function moveDiscussionSeat(
  seats: readonly DiscussionDraftSeat[],
  from: number,
  to: number,
) {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= seats.length ||
    to >= seats.length
  )
    return seats;
  const next = [...seats];
  const [seat] = next.splice(from, 1);
  if (seat) next.splice(to, 0, seat);
  return next;
}
/**
 * Changes only a seat's persona.
 * @param seats Current order.
 * @param index Target position.
 * @param personaPromptId Selected persona template identity.
 * @returns New array retaining all model selections.
 */
export function changeDiscussionSeatPersona(
  seats: readonly DiscussionDraftSeat[],
  index: number,
  personaPromptId: DiscussionPromptId,
) {
  return seats.map((seat, position) => (position === index ? { ...seat, personaPromptId } : seat));
}
/**
 * Changes only a seat's model.
 * @param seats Current order.
 * @param index Target position.
 * @param modelSelection Complete selection including provider options.
 * @returns New array retaining all persona references.
 */
export function changeDiscussionSeatModel(
  seats: readonly DiscussionDraftSeat[],
  index: number,
  modelSelection: ModelSelection,
) {
  return seats.map((seat, position) => (position === index ? { ...seat, modelSelection } : seat));
}
/**
 * Checks a catalog option at the selection boundary.
 * @param instanceId Exact environment-local instance identity.
 * @param support Capability response; absent or unknown instances fail closed.
 * @param available Whether this enabled instance and model can currently run.
 * @returns True only when the service supports this instance and its option is available.
 */
export function canSelectDiscussionModel(
  instanceId: ProviderInstanceId,
  support: DiscussionProviderSupportResult | null,
  available: boolean,
) {
  return (
    available &&
    support?.instances.some(
      (instance) => instance.instanceId === instanceId && instance.supported,
    ) === true
  );
}
