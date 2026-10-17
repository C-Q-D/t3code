/** Owns the 8a speaking-order palette; persona and provider do not affect seat colors. */
const NEUTRAL = {
  color: "#a9a9b1",
  textClassName: "text-secondary-label",
};
const SEAT_COLORS = [
  { color: "#82abff", textClassName: "text-discussion-seat-blue" },
  { color: "#b99cff", textClassName: "text-discussion-seat-purple" },
  { color: "#5fd3c7", textClassName: "text-discussion-seat-teal" },
  { color: "#b5d86a", textClassName: "text-discussion-seat-lime" },
  { color: "#ff8fc7", textClassName: "text-discussion-seat-pink" },
  { color: "#d8c3a5", textClassName: "text-discussion-seat-sand" },
] as const;

/**
 * Resolves stable seat colors, independently of the persona and provider.
 * @param seat Zero for neutral previews; positive integer for one-based speaking order.
 * @returns Design hex color and matching text token. Seats seven onward repeat; invalid seats use neutral.
 */
export function discussionSeatColor(seat: number) {
  return Number.isInteger(seat) && seat > 0
    ? (SEAT_COLORS[(seat - 1) % SEAT_COLORS.length] ?? NEUTRAL)
    : NEUTRAL;
}
