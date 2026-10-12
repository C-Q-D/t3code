/** Guards the neutral seat and six-color cycle required across discussion surfaces. */
import { describe, expect, it } from "vite-plus/test";
import { discussionSeatColor } from "./discussionSeatColors";

describe("discussion seat colors", () => {
  it("uses neutral zinc for unassigned personas", () => {
    expect(discussionSeatColor(0)).toEqual({
      color: "var(--color-zinc-500)",
      textClassName: "text-zinc-600 dark:text-zinc-400",
    });
  });
  it.each([
    [1, "blue"],
    [2, "violet"],
    [3, "amber"],
    [4, "emerald"],
    [5, "rose"],
    [6, "cyan"],
    [7, "blue"],
    [12, "cyan"],
  ])("assigns seat %i to %s in the specified cycle", (seat, color) => {
    expect(discussionSeatColor(seat)).toEqual({
      color: `var(--color-${color}-500)`,
      textClassName: `text-${color}-600 dark:text-${color}-400`,
    });
  });
});
