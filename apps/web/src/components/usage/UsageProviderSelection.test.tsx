import { act } from "react";
import { create } from "react-test-renderer";
import { expect, it, vi } from "vite-plus/test";
import {
  EnvironmentId,
  UsageDay,
  USAGE_CONTRACT_VERSION,
  type UsageSummaryInput,
  type UsageProviderKind,
} from "@t3tools/contracts";
import { type EnvironmentUsageStatus } from "../../state/usage";

import { UsagePage } from "./UsagePage";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";

const state = vi.hoisted(() => ({
  environments: [] as readonly EnvironmentUsageStatus[],
  presentations: new Map(),
  samples: [] as { hidden: ReadonlySet<UsageProviderKind>; answered: boolean }[],
}));
vi.mock("../../state/usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../state/usage")>();
  return {
    ...actual,
    useUsage: (...args: Parameters<typeof actual.useUsage>) => {
      const result = actual.useUsage(...args);
      state.samples.push({ hidden: args[2]!, answered: result.shown !== null });
      return result;
    },
  };
});
vi.mock("@effect/atom-react", () => ({
  useAtomValue: (atom: unknown) =>
    atom === "keybindings"
      ? DEFAULT_RESOLVED_KEYBINDINGS
      : atom === "presentations"
        ? state.presentations
        : state.environments,
}));
vi.mock("../../rpc/atomRegistry", () => ({ appAtomRegistry: {} }));
vi.mock("../../state/presentation", () => ({
  environmentPresentations: { presentationsAtom: "presentations" },
}));
vi.mock("../../state/server", () => ({
  serverEnvironment: {},
  primaryServerKeybindingsAtom: "keybindings",
}));
vi.mock("../../state/session", () => ({
  environmentSession: {},
  readEnvironmentScope: () => true,
}));

vi.mock("../../hooks/useNavigateBack", () => ({ useEscapeToGoBack: () => {} }));
vi.mock("../../hooks/useSettings", () => ({ usePrimarySettings: () => false }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => async () => {} }));
vi.mock("../../lib/utils", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));
vi.mock("./usagePagePreferences", () => ({
  readUsagePagePreferences: () => ({ metric: "cost", windowDays: 30, hiddenProviders: [] }),
  saveUsagePagePreferences: () => {},
}));
vi.mock("../ui/menu", () => ({
  Menu: "div",
  MenuPopup: "div",
  MenuTrigger: "div",
  MenuCheckboxItem: (props: React.ComponentProps<"div">) => (
    <div {...props} data-testid="provider-checkbox" />
  ),
  MenuItem: "div",
  MenuSeparator: "hr",
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/scroll-area", () => ({ ScrollArea: "div" }));
vi.mock("../ui/sidebar", () => ({ SidebarInset: "div" }));
vi.mock("../ui/toggle-group", () => ({ ToggleGroup: "div", Toggle: "button" }));
vi.mock("../WorkspaceBreadcrumb", () => ({ WorkspaceBreadcrumbText: "span" }));
vi.mock("../WorkspacePageContainer", () => ({ WorkspacePageContainer: "main" }));
vi.mock("../chat/ProviderInstanceIcon", () => ({ ProviderInstanceIcon: () => null }));
vi.mock("./UsageHeroCard", () => ({ UsageHeroCard: () => null }));

vi.mock("./UsageCompositionCard", () => ({ UsageCompositionCard: () => null }));

vi.mock("./UsageResourceCard", () => ({ UsageResourceCard: () => null }));

vi.mock("./UsageCostBreakdownCard", () => ({ UsageCostBreakdownCard: () => null }));

vi.mock("./UsageLimitFaders", () => ({ UsageLimitFaders: () => null }));

vi.mock("./UsageLimitExtras", () => ({ UsageLimitExtras: () => null }));

vi.mock("./UsageMetricStrip", () => ({
  UsageMetricStrip: () => null,
  UsageMetricStripSkeleton: () => null,
}));

vi.mock("./UsagePriceOverrides", () => ({
  UsagePriceOverrides: () => null,
  UsagePriceSummary: () => null,
}));

vi.mock("./UsageModelDialog", () => ({ UsageModelDialog: () => null }));

it("keeps the production page filter stable across answers, pushes and preference changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const input: UsageSummaryInput = {
    sinceDay: UsageDay.make("2026-10-20"),
    untilDay: UsageDay.make("2026-10-21"),
    timeZone: "UTC",
  };
  state.samples = [];
  vi.stubGlobal("window", new EventTarget());
  const environment: EnvironmentUsageStatus = {
    environmentId: EnvironmentId.make("test"),
    label: "Test",
    isPending: true,
    canReadDiagnostics: true,
    isConnected: true,
    error: null,
    summary: null,
    needsCursorKeychainAccess: false,
  };
  state.environments = [environment];
  let renderer!: ReturnType<typeof create>;
  try {
    await act(() => {
      renderer = create(<UsagePage />);
    });
    expect(state.samples.at(-1)?.answered).toBe(false);
    const initialFilter = state.samples.at(-1)!.hidden;
    for (const readAt of ["2026-10-21T00:00:00Z", "2026-10-21T00:01:00Z"]) {
      state.environments = [
        {
          ...environment,
          isPending: false,
          summary: {
            ...input,
            contractVersion: USAGE_CONTRACT_VERSION,
            readAt,
            buckets: [],
            sources: [],
            pricing: { status: "fresh", source: "test", fetchedAt: null, knownModels: 0 },
            scanDurationMs: 0,
          },
        },
      ];
      state.samples = [];
      await act(() => {
        renderer.update(<UsagePage />);
      });
      expect(state.samples.at(-1)?.answered).toBe(true);
      expect(state.samples.every(({ hidden }) => hidden === initialFilter)).toBe(true);
      // React caps render-phase updates at 25; settling must take fewer passes.
      expect(state.samples.length).toBeLessThan(25);
    }
    state.samples = [];
    await act(() => {
      const codex = renderer.root
        .findAll((item) => item.props["data-testid"] === "provider-checkbox")
        .find((item) =>
          item.findAllByType("span").some((span) => span.children.includes("Codex")),
        )!;
      codex.props.onCheckedChange(false);
    });
    const changedFilter = state.samples.at(-1)!.hidden;
    expect(changedFilter).not.toBe(initialFilter);
    expect([...changedFilter]).toEqual(["codex"]);
    expect(state.samples.every(({ hidden }) => hidden === changedFilter)).toBe(true);
    expect(state.samples.length).toBeLessThan(25);
    state.samples = [];
    state.environments = [...state.environments];
    await act(() => {
      renderer.update(<UsagePage />);
    });
    expect(state.samples.every(({ hidden }) => hidden === changedFilter)).toBe(true);
    expect(state.samples.at(-1)?.answered).toBe(true);
    expect(state.samples.length).toBeLessThan(25);
  } finally {
    await act(() => renderer?.unmount());
    vi.unstubAllGlobals();
  }
});
