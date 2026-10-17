/** Protects the handoff's fixed orbit, gaps, actual statement order and static summary appearance. */
import { describe, expect, it } from "vite-plus/test";
import {
  roundTableArc,
  roundTableLayout,
  roundTableSeatLabel,
  roundTableSegments,
  roundTableTagLayout,
  type DiscussionTableSeat,
} from "./discussionRoundTable.logic";

const THREE_SEATS = [
  { id: "a", seatIndex: 0, role: "architect", label: "架构师", state: "done" },
  { id: "b", seatIndex: 1, role: "opponent", label: "反方", state: "speaking" },
  { id: "c", seatIndex: 2, role: "implementer", label: "实现者", state: "next" },
] as const satisfies readonly DiscussionTableSeat[];

describe("8a round-table geometry", () => {
  it("places two seats across 90 degrees and three across 120 degrees", () => {
    expect(
      roundTableLayout(THREE_SEATS.slice(0, 2)).map(({ angle, x, y, size }) => [angle, x, y, size]),
    ).toEqual([
      [-135, 66.9, 86.9, 44],
      [-45, 293.1, 86.9, 48],
    ]);
    expect(
      roundTableLayout(THREE_SEATS).map(({ angle, x, y, size, labelsAbove }) => [
        angle,
        x,
        y,
        size,
        labelsAbove,
      ]),
    ).toEqual([
      [-150, 41.4, 120, 44, false],
      [-90, 180, 40, 48, true],
      [-30, 318.6, 120, 44, false],
    ]);
  });

  it("keeps four seats on the 120-degree normal orbit", () => {
    const layout = roundTableLayout([
      ...THREE_SEATS,
      { id: "d", seatIndex: 3, label: "产品", state: "next" },
    ]);
    expect(layout.map(({ angle }) => angle)).toEqual([-150, -110, -70, -30]);
    expect(layout[3]!.angle - layout[0]!.angle).toBe(120);
  });

  it("expands five seats to the 160-degree dense orbit", () => {
    const layout = roundTableLayout([
      ...THREE_SEATS,
      { id: "d", seatIndex: 3, label: "产品", state: "next" },
      { id: "e", seatIndex: 4, label: "安全", state: "next" },
    ]);
    expect(layout.map(({ angle }) => angle)).toEqual([-170, -130, -90, -50, -10]);
    expect(layout[4]!.angle - layout[0]!.angle).toBe(160);
  });

  it("spreads six seats across 160 degrees, shrinking only nonspeakers", () => {
    const layout = roundTableLayout([
      ...THREE_SEATS,
      { id: "d", seatIndex: 3, label: "产品", state: "next" },
      { id: "e", seatIndex: 4, label: "安全", state: "next" },
      { id: "f", seatIndex: 5, label: "审查", state: "next" },
    ]);
    expect(layout.map(({ angle, size }) => [angle, size])).toEqual([
      [-170, 38],
      [-138, 48],
      [-106, 38],
      [-74, 38],
      [-42, 38],
      [-10, 38],
    ]);
    expect([layout[0]?.x, layout[0]?.y, layout[5]?.x, layout[5]?.y]).toEqual([
      22.4, 172.2, 337.6, 172.2,
    ]);
  });

  it("supports empty/single-seat previews and never starts a second speaker", () => {
    expect(roundTableLayout([])).toEqual([]);
    const singleton = roundTableLayout([THREE_SEATS[0]]);
    expect(singleton.map(({ x, y, size }) => [x, y, size])).toEqual([[180, 40, 44]]);
    expect(roundTableSegments(singleton)).toEqual([]);
    const duplicateSpeaker = roundTableLayout([
      { ...THREE_SEATS[0], state: "speaking" },
      THREE_SEATS[1],
      THREE_SEATS[2],
    ]);
    expect(duplicateSpeaker.map(({ state, size }) => [state, size])).toEqual([
      ["speaking", 48],
      ["idle", 44],
      ["next", 44],
    ]);
  });

  it("leaves 12 degrees at both ends and takes the long clockwise route behind the user", () => {
    expect(roundTableArc(-150, -90)).toEqual({
      start: { x: 61.1, y: 92.9 },
      end: { x: 146.7, y: 43.5 },
      path: "M61.1 92.9 A160 160 0 0 1 146.7 43.5",
    });
    expect(roundTableArc(-30, -150)).toEqual({
      start: { x: 332.2, y: 150.6 },
      end: { x: 27.8, y: 150.6 },
      path: "M332.2 150.6 A160 160 0 1 1 27.8 150.6",
    });
    expect([roundTableArc(-90, -90), roundTableArc(-90, -66), roundTableArc(-90, -67)]).toEqual([
      null,
      null,
      null,
    ]);
    expect(roundTableArc(-90, -65)?.path).toBe("M213.3 43.5 A160 160 0 0 1 216 44.1");
  });

  it("distinguishes completed, immediate next and distant return segments", () => {
    const arcs = roundTableSegments(roundTableLayout(THREE_SEATS));
    expect(
      arcs.map(({ fromId, toId, kind, width, opacity, dash, fromSeatIndex, toSeatIndex }) => [
        fromId,
        toId,
        kind,
        width,
        opacity,
        dash,
        fromSeatIndex,
        toSeatIndex,
      ]),
    ).toEqual([
      ["a", "b", "completed", 2.5, 0.7, undefined, 0, 1],
      ["b", "c", "next", 1.5, 0.3, "4 5", 1, 2],
      ["c", "a", "pending", 1.5, 0.13, "4 5", 2, 0],
    ]);
    const ordinaryCompleted = roundTableLayout([
      { ...THREE_SEATS[0], state: "idle", completed: true },
      THREE_SEATS[1],
      THREE_SEATS[2],
    ]);
    expect(roundTableSegments(ordinaryCompleted)[0]?.kind).toBe("completed");
    expect(ordinaryCompleted[0]?.state).toBe("idle");
  });

  it("connects last statements in actual order without moving seats or changing their colors", () => {
    const seats = roundTableLayout([
      { ...THREE_SEATS[0], state: "speaking" },
      { ...THREE_SEATS[1], state: "next" },
      { ...THREE_SEATS[2], state: "done" },
    ]);
    const arcs = roundTableSegments(seats, { order: ["c", "a", "b"], closeLoop: false });
    expect(
      arcs.map(({ fromId, toId, kind, fromSeatIndex, toSeatIndex }) => [
        fromId,
        toId,
        kind,
        fromSeatIndex,
        toSeatIndex,
      ]),
    ).toEqual([
      ["c", "a", "completed", 2, 0],
      ["a", "b", "next", 0, 1],
    ]);
    expect(arcs[0]?.path).toBe("M332.2 150.6 A160 160 0 1 1 27.8 150.6");
    expect(seats.map(({ id, x, y }) => [id, x, y])).toEqual([
      ["a", 41.4, 120],
      ["b", 180, 40],
      ["c", 318.6, 120],
    ]);
  });

  it("makes summary/ended arcs faint solid without inferring or changing seat state", () => {
    const seats = roundTableLayout(THREE_SEATS);
    expect(
      roundTableSegments(seats, { quiet: true }).map(({ kind, width, opacity, dash }) => [
        kind,
        width,
        opacity,
        dash,
      ]),
    ).toEqual([
      ["quiet", 2.5, 0.13, undefined],
      ["quiet", 2.5, 0.13, undefined],
      ["quiet", 1.5, 0.13, undefined],
    ]);
    expect(seats.map(({ state }) => state)).toEqual(["done", "speaking", "next"]);
  });

  it("rejects ambiguous ids and invalid order references rather than drawing misleading arcs", () => {
    expect(() => roundTableLayout([THREE_SEATS[0], THREE_SEATS[0]])).toThrow(
      new RangeError("Round-table seat ids must be unique"),
    );
    const seats = roundTableLayout(THREE_SEATS);
    expect(() => roundTableSegments(seats, { order: ["missing"] })).toThrow(
      new RangeError("Round-table order must reference unique existing seat ids"),
    );
    expect(() => roundTableSegments(seats, { order: ["a", "a"] })).toThrow(
      new RangeError("Round-table order must reference unique existing seat ids"),
    );
    expect(roundTableSegments(seats, { order: [] })).toEqual([]);
  });

  it("keeps six-character labels intact and truncates longer names without splitting Unicode", () => {
    expect([
      roundTableSeatLabel(""),
      roundTableSeatLabel("一二三四五六"),
      roundTableSeatLabel("一二三四五六七"),
      roundTableSeatLabel("😀二三四五六七"),
    ]).toEqual(["", "一二三四五六", "一二三四五六…", "😀二三四五六…"]);
  });

  it("centers short badges together and wraps beyond the 120px row limit", () => {
    const tags = roundTableTagLayout([
      { label: "梳理人", tone: "neutral" },
      { label: "发言中", tone: "info" },
      { label: "下一位", tone: "outline" },
    ]);
    expect(tags.height).toBe(44);
    expect(tags.badges.map(({ width, x, y }) => [width, x, y])).toEqual([
      [52, -54, 0],
      [52, 2, 0],
      [52, -26, 24],
    ]);
    expect(roundTableTagLayout([])).toEqual({ height: 0, badges: [] });
    const long = roundTableTagLayout([{ label: "一二三四五六七八九十", tone: "warning" }]);
    expect(long.badges.map(({ width, x, y }) => [width, x, y])).toEqual([[120, -60, 0]]);
    const latin = roundTableTagLayout([{ label: "Next", tone: "outline" }]);
    expect(latin.badges.map(({ width, x, y }) => [width, x, y])).toEqual([[40, -20, 0]]);
  });
});
