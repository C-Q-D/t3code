/** Guards the 8a design palette and its one-based speaking-order cycle. */
import { describe, expect, it } from "vite-plus/test";
import { discussionSeatColor } from "./discussionSeatColors";

describe("discussion seat colors", () => {
  it("uses the design's neutral color for unassigned personas", () => {
    expect(discussionSeatColor(0)).toEqual({
      color: "#a9a9b1",
      textClassName: "text-secondary-label",
    });
  });
  it.each([
    [1, "#82abff", "text-discussion-seat-blue"],
    [2, "#b99cff", "text-discussion-seat-purple"],
    [3, "#5fd3c7", "text-discussion-seat-teal"],
    [4, "#b5d86a", "text-discussion-seat-lime"],
    [5, "#ff8fc7", "text-discussion-seat-pink"],
    [6, "#d8c3a5", "text-discussion-seat-sand"],
    [7, "#82abff", "text-discussion-seat-blue"],
    [12, "#d8c3a5", "text-discussion-seat-sand"],
  ])("assigns seat %i to %s in the specified cycle", (seat, color, textClassName) => {
    expect(discussionSeatColor(seat)).toEqual({
      color,
      textClassName,
    });
  });
});
