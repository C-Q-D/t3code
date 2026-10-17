/** Verifies S1 stack geometry independently of DOM measurement and the default toast layout. */
import { expect, it } from "vite-plus/test";
import { getStoneToastLayer } from "./toast.logic";

it.each([
  [0, 0, 0, false],
  [1, 12, -10, false],
  [2, 24, -20, false],
  [3, 36, -30, true],
])("places S1 layer %s at its specified inset and offset", (index, inset, offset, hidden) => {
  expect(getStoneToastLayer(index)).toEqual({ inset, offset, hidden });
});
