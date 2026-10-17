/** Routes T2 state notices away from the composer without changing their actions or identity. */

/**
 * Separates timeline state from composer notices, preserving each original item.
 * @param items - Caller-owned notices in their existing source order.
 * @returns Disjoint arrays; composer counts derive only from composer entries.
 */
export function partitionTimelineBanners<
  T extends {
    readonly id: string;
    readonly variant: string;
    readonly priority?: string;
  },
>(items: readonly T[]) {
  const timeline: T[] = [];
  const composer: T[] = [];
  for (const item of items) {
    const destination =
      item.id.startsWith("branch-mismatch:") ||
      item.id.startsWith("environment-unavailable:") ||
      item.id.startsWith("project-clone:")
        ? timeline
        : composer;
    destination.push(item);
  }
  // Match the existing composer priority: activity, urgent/severe, then ordinary notices.
  const priority = (item: T) =>
    item.priority === "activity"
      ? 0
      : item.priority === "urgent" || item.variant === "error" || item.variant === "warning"
        ? 1
        : 2;
  return { timeline: timeline.toSorted((a, b) => priority(a) - priority(b)), composer };
}
