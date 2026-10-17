/** Protects the L4 fresh splitter geometry without a browser or persisted panel state. */
import { describe, expect, it } from "vite-plus/test";

import { pullRequestListDetailWidth } from "./pullRequestListLayout.logic";

describe("fresh pull request list split", () => {
  it("leaves the L4 list 400px in a 1040px host", () => {
    expect(pullRequestListDetailWidth(1040, 400)).toBe(640);
  });

  it("keeps the existing 360px panel minimum when the host is narrow", () => {
    expect(pullRequestListDetailWidth(600, 400)).toBe(360);
  });
});
