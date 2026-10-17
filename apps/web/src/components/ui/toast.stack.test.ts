/** Verifies S1 stack geometry independently of DOM measurement and the default toast layout. */
import { expect, it } from "vite-plus/test";
import { countStoneToastRemaining, getStoneToastLayer } from "./toast.logic";

it.each([
  [0, 0, 0, false, false],
  [1, 12, -10, false, true],
  [2, 24, -20, false, true],
  [3, 36, -30, true, true],
])(
  "places S1 layer %s at its specified inset and offset",
  (index, inset, offset, hidden, countsAsRemaining) => {
    expect(getStoneToastLayer(index)).toEqual({ inset, offset, hidden, countsAsRemaining });
  },
);

it.each([
  [false, false, true, true],
  [true, false, false, false],
  [true, true, true, false],
  [false, true, true, true],
])(
  "derives fourth-layer access and count for expanded=%s limited=%s",
  (expanded, limited, hidden, countsAsRemaining) => {
    expect(getStoneToastLayer(3, { expanded, limited })).toEqual({
      inset: 36,
      offset: -30,
      hidden,
      countsAsRemaining,
    });
  },
);

it("counts pending back cards, including limited ones, but excludes closing cards and the front", () => {
  const items = [
    { visibleIndex: 0, toast: {} },
    { visibleIndex: 1, toast: { transitionStatus: "ending" as const } },
    { visibleIndex: 1, toast: {} },
    { visibleIndex: 2, toast: { limited: true } },
  ];
  expect(countStoneToastRemaining(items, false)).toBe(2);
  expect(countStoneToastRemaining(items, true)).toBe(0);
  expect(countStoneToastRemaining([], false)).toBe(0);
});
