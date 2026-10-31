/** Separates user navigation from wheel momentum when deciding whether the composer may collapse. */
/** Mutable state for one wheel gesture; timestamps use the caller clock and suppression ends at reset. */
export type ComposerScrollGestureState = {
  accumulatedDeltaPx: number;
  collapseSuppressed: boolean;
  lastEventAt: number;
};

/** Only navigation that can move the timeline may collapse the composer; boundary key presses leave it open. */
export function shouldCollapseComposerForScrollKey(input: {
  key: string;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  isAtLogicalEnd: boolean;
}): boolean {
  switch (input.key) {
    case "PageUp":
    case "Home":
      return input.scrollTop > 1;
    case "PageDown":
    case "End":
      return !input.isAtLogicalEnd && input.scrollTop < input.scrollHeight - input.clientHeight - 1;
    default:
      return false;
  }
}

/** Starts with no active gesture so focus cannot suppress the first later scroll. */
export function createComposerScrollGestureState(): ComposerScrollGestureState {
  return {
    accumulatedDeltaPx: 0,
    collapseSuppressed: false,
    lastEventAt: Number.NEGATIVE_INFINITY,
  };
}

/** Clears accumulated movement and suppression when a wheel gesture expires; mutates the caller-owned state. */
export function resetComposerScrollGesture(state: ComposerScrollGestureState): void {
  state.accumulatedDeltaPx = 0;
  state.collapseSuppressed = false;
  state.lastEventAt = Number.NEGATIVE_INFINITY;
}

/** Focus suppresses only the still-active gesture, preventing momentum from immediately hiding the editor. */
export function suppressActiveComposerScrollGesture(
  state: ComposerScrollGestureState,
  now: number,
  gestureResetMs: number,
): void {
  if (now - state.lastEventAt <= gestureResetMs) {
    state.collapseSuppressed = true;
  }
}

/** Accumulates eligible movement away from the logical end and consumes the threshold once reached.
 * Updates caller-owned state using the supplied clock and returns whether the composer should collapse. */
export function recordComposerScrollGestureEvent(
  state: ComposerScrollGestureState,
  input: {
    now: number;
    deltaPx: number;
    collapseThresholdPx: number;
    collapseEligible: boolean;
    canScrollInGestureDirection: boolean;
    scrollsTowardLogicalEnd: boolean;
  },
): boolean {
  state.lastEventAt = input.now;
  if (
    state.collapseSuppressed ||
    !input.collapseEligible ||
    !input.canScrollInGestureDirection ||
    input.scrollsTowardLogicalEnd
  ) {
    state.accumulatedDeltaPx = 0;
    return false;
  }

  state.accumulatedDeltaPx += input.deltaPx;
  if (state.accumulatedDeltaPx < input.collapseThresholdPx) {
    return false;
  }

  state.accumulatedDeltaPx = 0;
  return true;
}
