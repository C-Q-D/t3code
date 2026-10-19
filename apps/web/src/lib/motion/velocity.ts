/** Pointer velocity from a recent window, excluding a stationary release. */

/** Native or React-wrapped viewport samples; timestamps use the performance clock in milliseconds. */
type PointerSample = Pick<PointerEvent, "clientX" | "clientY" | "timeStamp"> & {
  getCoalescedEvents?: () => readonly Pick<PointerEvent, "clientX" | "clientY" | "timeStamp">[];
  nativeEvent?: PointerSample;
};

/** Records CSS pixel coordinates with monotonic millisecond timestamps. */
export class VelocityTracker {
  private samples: { x: number; y: number; time: number }[] = [];
  private lastMovedAt = -Infinity;

  reset() {
    this.samples = [];
    this.lastMovedAt = -Infinity;
  }

  /** Record native coalesced samples (or the event itself), so dispatch delays cannot erase momentum.
   * Accepts React wrappers and mouse/drag events without coalescing. Query release velocity with
   * the release event's timeStamp after adding it; unchanged release points remain stationary.
   */
  addPointerEvent(event: PointerSample) {
    const native = event.nativeEvent ?? event;
    const samples = native.getCoalescedEvents?.();
    for (const sample of samples?.length ? samples : [native]) {
      this.add(sample.clientX, sample.clientY, sample.timeStamp);
    }
  }

  /** Add a point at time (performance.now by default); unchanged points do not count as movement. */
  add(x: number, y: number, time = performance.now()) {
    const previous = this.samples.at(-1);
    if (previous && time < previous.time) this.reset();
    if (!previous || previous.x !== x || previous.y !== y) this.lastMovedAt = time;
    this.samples.push({ x, y, time });
    while (this.samples.length > 2 && time - this.samples[0]!.time > 120) this.samples.shift();
  }

  /** Return px/s over the last 80 ms; stale movement (>50 ms) or windows <8 ms return zero. */
  velocity(now = performance.now()) {
    const last = this.samples.at(-1);
    if (!last || this.samples.length < 2 || now - this.lastMovedAt > 50) return { x: 0, y: 0 };
    const first = this.samples.find((sample) => last.time - sample.time <= 80)!;
    const seconds = (last.time - first.time) / 1000;
    if (seconds < 0.008) return { x: 0, y: 0 };
    return { x: (last.x - first.x) / seconds, y: (last.y - first.y) / seconds };
  }
}
