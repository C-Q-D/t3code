/** Checks the M1 consumed-quota geometry and the actual custom model set without rendering style classes. */
import { EnvironmentId, type ServerProviderUsageWindow } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import { customPriceModels, quotaBarLayout } from "./usageOverview.logic";

const window: ServerProviderUsageWindow = {
  id: "five-hour",
  kind: "session",
  label: "Five hours",
  usedPercent: 80,
  windowDurationMins: 300,
  resetsAt: "2026-09-03T14:00:00.000Z",
};
const now = Date.parse("2026-09-03T12:00:00.000Z");

it("compares consumed quota with elapsed time rather than remaining quota with time left", () => {
  expect(quotaBarLayout(window, now)).toEqual({ fillPercent: 80, referencePercent: 60 });
});

it("omits the reference line when the window duration is unknown", () => {
  expect(
    quotaBarLayout({ ...window, windowDurationMins: undefined }, now).referencePercent,
  ).toBeNull();
});

it("includes mapped models and priced models once in stable model ID order", () => {
  expect(
    customPriceModels([
      {
        environmentId: EnvironmentId.make("a"),
        label: "A",
        prices: { zebra: { inputCostPerMillionTokens: 2, outputCostPerMillionTokens: 8 } },
        aliases: { alpha: "target", zebra: "other" },
        unavailable: null,
      },
      {
        environmentId: EnvironmentId.make("b"),
        label: "B",
        prices: null,
        aliases: { beta: "target" },
        unavailable: null,
      },
    ]),
  ).toEqual(["alpha", "beta", "zebra"]);
});
