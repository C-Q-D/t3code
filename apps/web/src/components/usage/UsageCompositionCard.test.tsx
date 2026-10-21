import { act } from "react";
import { create } from "react-test-renderer";
import { expect, it, vi } from "vite-plus/test";
import { mergeUsage } from "@t3tools/shared/usageMerge";
import { USAGE_CONTRACT_VERSION } from "@t3tools/contracts";
import { t } from "~/i18n";
import { UsageCompositionCard } from "./UsageCompositionCard";

vi.mock("../../lib/utils", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));
vi.mock("./useUsageCardEntrance", () => ({ useUsageCardEntrance: () => undefined }));
vi.mock("./UsageBubbles", () => ({ UsageBubbles: () => null }));
vi.mock("../ui/toggle-group", () => ({ ToggleGroup: "section", Toggle: "button" }));

it("labels the 13:00 hourly bucket in the selected 24-hour format", async () => {
  const merged = mergeUsage([], USAGE_CONTRACT_VERSION);
  const hourly = [
    {
      day: "2026-10-20",
      hourStart: "2026-10-20T13:00:00Z",
      costUsd: 0,
      totalTokens: 0,
      byProvider: new Map(),
    },
  ];
  const props = {
    metric: "cost" as const,
    merged: { ...merged, hourly },
    loadingPartial: false,
    isProviderLoading: () => false,
    activeProviders: [],
    resolution: "hour" as const,
    timeZone: "UTC",
    hour12: false,
    onSelectModel: () => {},
  };
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let renderer!: ReturnType<typeof create>;
  try {
    await act(() => {
      renderer = create(<UsageCompositionCard {...props} />);
    });
    await act(() => {
      renderer.root
        .findAllByProps({ "aria-label": t.tools.usage.compositionView })
        .find((node) => node.type === "section")!
        .props.onValueChange(["list"]);
    });
    await act(() => {
      renderer.root
        .findAllByProps({ "aria-label": t.tools.usage.usageBreakdown })
        .find((node) => node.type === "section")!
        .props.onValueChange(["time"]);
    });
    expect(renderer.root.findAllByType("td").map((cell) => cell.children.join(""))).toContain(
      "13:00",
    );
  } finally {
    await act(() => renderer?.unmount());
    vi.unstubAllGlobals();
  }
});
