/** Checks custom price model selection across environments. */
import { EnvironmentId } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import { customPriceModels } from "./usageOverview.logic";
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
