/** Owns the shared neutral seat and ordered discussion palette; no provider colors are involved. */
const NEUTRAL = {
  color: "var(--color-zinc-500)",
  textClassName: "text-zinc-600 dark:text-zinc-400",
};
const SEAT_COLORS = [
  { color: "var(--color-blue-500)", textClassName: "text-blue-600 dark:text-blue-400" },
  { color: "var(--color-violet-500)", textClassName: "text-violet-600 dark:text-violet-400" },
  { color: "var(--color-amber-500)", textClassName: "text-amber-600 dark:text-amber-400" },
  { color: "var(--color-emerald-500)", textClassName: "text-emerald-600 dark:text-emerald-400" },
  { color: "var(--color-rose-500)", textClassName: "text-rose-600 dark:text-rose-400" },
  { color: "var(--color-cyan-500)", textClassName: "text-cyan-600 dark:text-cyan-400" },
] as const;

/**
 * Resolves stable seat colors, independently of the persona and provider.
 * @param seat Zero for neutral previews; positive integer for one-based speaking order.
 * @returns Tailwind 500 tile color and 600/400 light/dark text classes. Invalid indices use neutral.
 */
export function discussionSeatColor(seat: number) {
  return Number.isInteger(seat) && seat > 0
    ? (SEAT_COLORS[(seat - 1) % SEAT_COLORS.length] ?? NEUTRAL)
    : NEUTRAL;
}
