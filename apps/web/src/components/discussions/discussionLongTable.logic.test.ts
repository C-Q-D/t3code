/** Protects compact-table ordering, state parity and speaker sizing independently of rendered classes. */
import { describe, expect, it } from "vite-plus/test";
import { longTableLayout } from "./discussionLongTable.logic";
import type { DiscussionTableSeat } from "./discussionRoundTable.logic";

const SEATS = [
  { id: "a", seatIndex: 0, role: "architect", label: "架构师", state: "speaking" },
  { id: "b", seatIndex: 1, role: "opponent", label: "反方", state: "next" },
  { id: "c", seatIndex: 2, role: "implementer", label: "实现者", state: "idle", completed: true },
] as const satisfies readonly DiscussionTableSeat[];

describe("8a long-table presentation", () => {
  it("follows actual last-statement order, retaining roles and color indices with an open end", () => {
    const layout = longTableLayout(SEATS, { order: ["c", "a", "b"], closeLoop: false });
    expect(
      layout.seats.map(({ id, role, seatIndex, size, lift }) => [id, role, seatIndex, size, lift]),
    ).toEqual([
      ["c", "implementer", 2, 28, 0],
      ["a", "architect", 0, 34, -3],
      ["b", "opponent", 1, 28, 0],
    ]);
    expect(layout.connections).toEqual([
      {
        fromId: "c",
        toId: "a",
        fromSeatIndex: 2,
        toSeatIndex: 0,
        closing: false,
        kind: "completed",
        width: 2.5,
        opacity: 0.7,
        dash: undefined,
      },
      {
        fromId: "a",
        toId: "b",
        fromSeatIndex: 0,
        toSeatIndex: 1,
        closing: false,
        kind: "next",
        width: 1.5,
        opacity: 0.3,
        dash: "4 5",
      },
    ]);
    expect(SEATS.map(({ id, state }) => [id, state])).toEqual([
      ["a", "speaking"],
      ["b", "next"],
      ["c", "idle"],
    ]);
  });

  it("keeps the default return pending even after a completed seat", () => {
    expect(
      longTableLayout(SEATS).connections.map(({ fromId, toId, kind, closing }) => [
        fromId,
        toId,
        kind,
        closing,
      ]),
    ).toEqual([
      ["a", "b", "next", false],
      ["b", "c", "pending", false],
      ["c", "a", "pending", true],
    ]);
  });

  it("honors explicit completed=false independently of a done/check avatar", () => {
    const seats: readonly DiscussionTableSeat[] = [
      { ...SEATS[2], state: "done", completed: false },
      SEATS[0],
      SEATS[1],
    ];
    expect(longTableLayout(seats, { closeLoop: false }).connections[0]?.kind).toBe("pending");
    expect(
      longTableLayout([{ ...SEATS[0], state: "done" }, SEATS[1]], { closeLoop: false })
        .connections[0]?.kind,
    ).toBe("completed");
  });

  it("uses quiet solid lines without changing the supplied seat states or annotations", () => {
    const seats: readonly DiscussionTableSeat[] = [
      { ...SEATS[0], tags: [{ label: "梳理人", tone: "neutral" }] },
      { ...SEATS[1], interjection: { count: 2, label: "开口时读到上面 2 条插话" } },
      { ...SEATS[2], state: "done" },
    ];
    const layout = longTableLayout(seats, { quiet: true });
    expect(
      layout.connections.map(({ kind, width, opacity, dash }) => [kind, width, opacity, dash]),
    ).toEqual([
      ["quiet", 2.5, 0.13, undefined],
      ["quiet", 2.5, 0.13, undefined],
      ["quiet", 1.5, 0.13, undefined],
    ]);
    expect(layout.seats.map(({ state, size }) => [state, size])).toEqual([
      ["speaking", 34],
      ["next", 28],
      ["done", 28],
    ]);
    expect(layout.seats[0]?.tags).toEqual([{ label: "梳理人", tone: "neutral" }]);
    expect(layout.seats[1]?.interjection).toEqual({ count: 2, label: "开口时读到上面 2 条插话" });
  });

  it("keeps only the first physical speaker active after reordering", () => {
    const layout = longTableLayout([SEATS[0], { ...SEATS[1], state: "speaking" }, SEATS[2]], {
      order: ["b", "a", "c"],
    });
    expect(layout.seats.map(({ id, state, size, lift }) => [id, state, size, lift])).toEqual([
      ["b", "idle", 28, 0],
      ["a", "speaking", 34, -3],
      ["c", "idle", 28, 0],
    ]);
  });

  it("supports empty, single-seat and deliberately filtered sequences without phantom returns", () => {
    expect(longTableLayout([])).toEqual({ seats: [], connections: [] });
    expect(longTableLayout(SEATS, { order: [] })).toEqual({ seats: [], connections: [] });
    const singleton = longTableLayout(SEATS, { order: ["a"] });
    expect(singleton.seats.map(({ id, size, lift }) => [id, size, lift])).toEqual([["a", 34, -3]]);
    expect(singleton.connections).toEqual([]);
    const subset = longTableLayout(SEATS, { order: ["c", "b"], closeLoop: false });
    expect(subset.seats.map(({ id }) => id)).toEqual(["c", "b"]);
    expect(subset.connections.map(({ fromId, toId, kind }) => [fromId, toId, kind])).toEqual([
      ["c", "b", "completed"],
    ]);
  });

  it("retains every connection in a dense row without circular gap clipping", () => {
    const seats: readonly DiscussionTableSeat[] = Array.from({ length: 8 }, (_, index) => ({
      id: `s${index}`,
      seatIndex: index,
      label: `座位 ${index}`,
      state: "idle",
      completed: true,
    }));
    const layout = longTableLayout(seats, { closeLoop: false });
    expect(layout.seats.map(({ size }) => size)).toEqual([28, 28, 28, 28, 28, 28, 28, 28]);
    expect(
      layout.connections.map(({ fromSeatIndex, toSeatIndex }) => [fromSeatIndex, toSeatIndex]),
    ).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
    ]);
  });

  it("rejects ambiguous physical ids and repeated or unknown statement references", () => {
    expect(() => longTableLayout([SEATS[0], SEATS[0]])).toThrow(RangeError);
    expect(() => longTableLayout(SEATS, { order: ["missing"] })).toThrow(RangeError);
    expect(() => longTableLayout(SEATS, { order: ["a", "a"] })).toThrow(RangeError);
  });
});
