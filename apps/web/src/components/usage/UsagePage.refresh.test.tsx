import {
  EnvironmentId,
  ProviderInstanceId,
  UsageDay,
  USAGE_CONTRACT_VERSION,
  type UsageSummaryInput,
} from "@t3tools/contracts";
import { mergeUsage } from "@t3tools/shared/usageMerge";
import { StrictMode, act } from "react";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  presentations: new Map(),
  refreshProviders: vi.fn(async () => undefined),
  metric: "cost",
  canReadDiagnostics: true,
  windowDays: 30,
  showUsage: false,
  shownWindow: null as UsageSummaryInput | null,
  refresh: vi.fn(async () => undefined),
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: (atom: unknown) =>
    atom === "keybindings" ? DEFAULT_RESOLVED_KEYBINDINGS : state.presentations,
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useCanGoBack: () => false,
}));
vi.mock("../../state/presentation", () => ({
  environmentPresentations: { presentationsAtom: null },
}));
vi.mock("../../state/server", () => ({
  serverEnvironment: { refreshProviders: null },
  primaryServerKeybindingsAtom: "keybindings",
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.refreshProviders }));
vi.mock("../../env", () => ({ isElectron: false }));
vi.mock("../../hooks/useSettings", () => ({ usePrimarySettings: () => "24h" }));
vi.mock("../../state/usage", () => ({
  useUsage: (input: UsageSummaryInput, selectedIds: ReadonlySet<EnvironmentId> | null) => {
    const environments = [...state.presentations].map(([environmentId, presentation]) => ({
      environmentId,
      label: presentation.entry.target.label,
      isPending: false,
      canReadDiagnostics: state.canReadDiagnostics,
      isConnected: presentation.connection.phase === "connected",
      error: null,
      summary: state.showUsage
        ? {
            ...input,
            contractVersion: USAGE_CONTRACT_VERSION,
            readAt: "2026-09-11T12:00:00Z",
            buckets: [],
            sources: [],
            pricing: { status: "fresh", source: "test", fetchedAt: null, knownModels: 1 },
            scanDurationMs: 1,
          }
        : null,
    }));
    return {
      merged: mergeUsage([], USAGE_CONTRACT_VERSION),
      environments,
      selectedEnvironments: environments.filter(
        (environment) => selectedIds === null || selectedIds.has(environment.environmentId),
      ),
      isPending: false,
      shown: state.showUsage
        ? { window: state.shownWindow ?? input, merged: mergeUsage([], USAGE_CONTRACT_VERSION) }
        : null,
      isPartial: false,
      refresh: state.refresh,
    };
  },
}));
vi.mock("./usagePagePreferences", () => ({
  readUsagePagePreferences: () => ({ metric: state.metric, windowDays: state.windowDays }),
  saveUsagePagePreferences: vi.fn(),
}));
vi.mock("../ui/button", () => ({ Button: "button", InlineButton: "button" }));
vi.mock("../ui/scroll-area", () => ({ ScrollArea: "div" }));
vi.mock("../ui/select", () => ({
  Select: "select",
  SelectItem: "option",
  SelectPopup: "div",
  SelectTrigger: "div",
  SelectValue: "span",
}));
vi.mock("../ui/sidebar", () => ({ SidebarInset: "div" }));
vi.mock("../ui/toggle-group", () => ({ Toggle: "button", ToggleGroup: "div" }));
vi.mock("../ui/tooltip", () => ({ Tooltip: "div", TooltipPopup: "div", TooltipTrigger: "div" }));
vi.mock("../ui/popover", () => ({ Popover: "div", PopoverPopup: "div", PopoverTrigger: "div" }));
vi.mock("../ui/menu", () => ({
  Menu: "div",
  MenuCheckboxItem: "div",
  MenuItem: "div",
  MenuPopup: "div",
  MenuSeparator: "hr",
  MenuTrigger: "div",
}));
vi.mock("../WorkspaceBreadcrumb", () => ({
  WorkspaceBreadcrumb: "div",
  WorkspaceBreadcrumbItem: "div",
  WorkspaceBreadcrumbSeparator: "span",
  WorkspaceBreadcrumbText: "span",
}));
vi.mock("../WorkspacePageContainer", () => ({ WorkspacePageContainer: "main" }));
vi.mock("../WorkspacePageHeader", () => ({ WorkspacePageHeader: "header" }));
vi.mock("./UsageProviderChart", () => ({ UsageProviderChart: "div" }));
vi.mock("./UsagePriceOverrides", () => ({
  UsagePriceOverrides: () => null,
  UsagePriceSummary: () => null,
}));
vi.mock("../chat/ProviderInstanceIcon", () => ({ ProviderInstanceIcon: () => null }));
vi.mock("../settings/RedactedSensitiveText", () => ({ RedactedSensitiveText: "span" }));
vi.mock("../settings/providerDriverMeta", () => ({
  providerClients: { get: () => ({ label: "Codex" }) },
}));

import { UsagePage } from "./UsagePage";
import { UsageHeroCard } from "./UsageHeroCard";
import { UsageMetricStrip } from "./UsageMetricStrip";
import { UsageCompositionCard } from "./UsageCompositionCard";

/** Replaces the DOM HTMLElement constructor in Node tests so window shortcuts can check for focused inputs without a browser. */
class TestHTMLElement extends EventTarget {}

let renderer: ReactTestRenderer;
let environmentNumber = 0;
beforeEach(() => {
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-11T12:00:00Z"));
  environmentNumber += 1;
  state.metric = "cost";
  state.canReadDiagnostics = true;
  state.windowDays = 30;
  state.showUsage = false;
  state.shownWindow = null;
  state.refresh.mockClear();
  state.refreshProviders.mockClear();
  state.presentations = new Map([
    [
      EnvironmentId.make(`test-${environmentNumber}`),
      {
        entry: { target: { label: "Test" } },
        connection: { phase: "connected" },
        serverConfig: {
          providers: [
            {
              instanceId: ProviderInstanceId.make("codex"),
              driver: "codex",
              enabled: true,
              installed: true,
              version: null,
              status: "ready",
              auth: { status: "authenticated" },
              checkedAt: "2026-09-11T12:00:00Z",
              models: [],
              slashCommands: [],
              skills: [],
              usageLimits: {
                checkedAt: "2026-09-11T12:00:00Z",
                windows: [
                  {
                    id: "five_hour",
                    kind: "session",
                    label: "Session",
                    usedPercent: 40,
                    windowDurationMins: 300,
                    resetsAt: "2026-09-11T14:00:00Z",
                  },
                ],
              },
            },
          ],
        },
      },
    ],
  ]);
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([0, 1])(
  "refreshes the visible limits countdown with refresh button %i without switching tabs, even when quota is unchanged",
  async (buttonIndex) => {
    await act(() => {
      renderer = create(<UsagePage />);
    });
    expect(
      JSON.stringify(renderer.toJSON(), (key, value) => (key === "props" ? undefined : value)),
    ).toContain("in 2h 0m");
    vi.mocked(Date.now).mockReturnValue(Date.parse("2026-09-11T12:30:00Z"));
    await act(async () => {
      renderer.root
        .findAllByProps({ "aria-label": "Refresh usage" })
        .filter((node) => node.type === "button")
        .at(buttonIndex)!
        .props.onClick();
    });
    expect(state.refreshProviders).toHaveBeenCalledWith({
      environmentId: `test-${environmentNumber}`,
      input: {},
    });
    expect(
      JSON.stringify(renderer.toJSON(), (key, value) => (key === "props" ? undefined : value)),
    ).toContain("in 1h 30m");
    expect(
      JSON.stringify(renderer.toJSON(), (key, value) => (key === "props" ? undefined : value)),
    ).not.toContain("in 2h 0m");
  },
);

/** Dispatches the actual page shortcut without a focused input or popup. */
function pressUsageKey(key: string, modifiers: { ctrlKey?: boolean; shiftKey?: boolean } = {}) {
  const event = Object.assign(new Event("keydown", { cancelable: true }), {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
  });
  window.dispatchEvent(event);
}

it("L refreshes limits and their countdown without refreshing usage or changing metric", async () => {
  vi.stubGlobal("HTMLElement", TestHTMLElement);
  vi.stubGlobal("navigator", { platform: "Win32" });
  state.metric = "tokens";
  await act(() => {
    renderer = create(<UsagePage />);
  });
  state.refreshProviders.mockClear();
  vi.mocked(Date.now).mockReturnValue(Date.parse("2026-09-11T13:00:00Z"));
  await act(() => pressUsageKey("l"));
  expect(state.refreshProviders).toHaveBeenCalledTimes(1);
  expect(state.refresh).not.toHaveBeenCalled();
  expect(
    JSON.stringify(renderer.toJSON(), (key, value) => (key === "props" ? undefined : value)),
  ).toContain("in 1h 0m");
  expect(
    renderer.root.findAll(
      (node) => node.type === "div" && node.props["aria-label"] === "Usage metric",
    )[0]!.props.value,
  ).toEqual(["tokens"]);
});

it.each([
  { action: "limits", usageLoading: false, status: "Ready", trigger: () => pressUsageKey("l") },
  {
    action: "button",
    usageLoading: true,
    status: "Refreshing…",
    trigger: (onClick: () => void) => onClick(),
  },
])(
  "keeps loaded usage state accurate during a pending $action refresh",
  async ({ usageLoading, status, trigger }) => {
    vi.stubGlobal("HTMLElement", TestHTMLElement);
    vi.stubGlobal("navigator", { platform: "Win32" });
    state.showUsage = true;
    await act(() => {
      renderer = create(<UsagePage />);
    });
    const button = () =>
      renderer.root.findAll(
        (node) => node.type === "button" && node.props["aria-label"] === "Refresh usage",
      )[0]!;
    expect(renderer.root.findByType(UsageHeroCard).props.loading.partial).toBe(false);
    expect(
      renderer.root.findAll((node) => node.type === "span" && node.children.includes("Ready")),
    ).toHaveLength(1);
    let finishRefresh!: () => void;
    const pending = new Promise<undefined>((resolve) => {
      finishRefresh = () => resolve(undefined);
    });
    state.refreshProviders.mockImplementationOnce(() => pending);
    await act(() => trigger(button().props.onClick));
    try {
      expect(button().props["aria-busy"]).toBe(true);
      expect(button().props.disabled).toBe(true);
      expect(state.refreshProviders).toHaveBeenCalledTimes(2);
      expect(renderer.root.findByType(UsageHeroCard).props.loading).toEqual({
        partial: usageLoading,
        everyProvider: usageLoading,
        providers: new Set(),
      });
      expect(renderer.root.findByType(UsageMetricStrip).props.loading).toBe(usageLoading);
      expect(renderer.root.findByType(UsageCompositionCard).props.loadingPartial).toBe(
        usageLoading,
      );
      expect(
        renderer.root.findAll((node) => node.type === "span" && node.children.includes(status)),
      ).toHaveLength(1);
    } finally {
      await act(async () => {
        finishRefresh();
        await pending;
      });
    }
    expect(button().props["aria-busy"]).toBe(false);
    expect(renderer.root.findByType(UsageHeroCard).props.loading.partial).toBe(false);
  },
);

it("keeps period shortcuts active during a limits refresh and blocks duplicate L requests", async () => {
  vi.stubGlobal("HTMLElement", TestHTMLElement);
  vi.stubGlobal("navigator", { platform: "Win32" });
  await act(() => {
    renderer = create(<UsagePage />);
  });
  state.refreshProviders.mockClear();
  let finishRefresh!: () => void;
  const pending = new Promise<undefined>((resolve) => {
    finishRefresh = () => resolve(undefined);
  });
  state.refreshProviders.mockImplementationOnce(() => pending);
  await act(() => pressUsageKey("l"));
  try {
    await act(() => pressUsageKey("l"));
    await act(() => pressUsageKey("2", { ctrlKey: true, shiftKey: true }));
    expect(state.refreshProviders).toHaveBeenCalledTimes(1);
    expect(
      renderer.root.findAll(
        (node) => node.type === "div" && node.props["aria-label"] === "Usage period",
      )[0]!.props.value,
    ).toEqual(["7"]);
  } finally {
    await act(async () => {
      finishRefresh();
      await pending;
    });
  }
});

it("refreshes once on opening the page and suppresses rapid remounts until five minutes", async () => {
  await act(() => {
    renderer = create(
      <StrictMode>
        <UsagePage />
      </StrictMode>,
    );
  });
  expect(state.refreshProviders).toHaveBeenCalledTimes(1);
  await act(() => renderer.unmount());
  await act(() => {
    renderer = create(
      <StrictMode>
        <UsagePage />
      </StrictMode>,
    );
  });
  expect(state.refreshProviders).toHaveBeenCalledTimes(1);
  await act(() => renderer.unmount());
  vi.mocked(Date.now).mockReturnValue(Date.parse("2026-09-11T12:05:00Z"));
  await act(() => {
    renderer = create(<UsagePage />);
  });
  expect(state.refreshProviders).toHaveBeenCalledTimes(2);
});

it("renders and refreshes limits without diagnostics permission or a usage response", async () => {
  state.canReadDiagnostics = false;
  await act(() => {
    renderer = create(<UsagePage />);
  });
  expect(
    JSON.stringify(renderer.toJSON(), (key, value) => (key === "props" ? undefined : value)),
  ).toContain("in 2h 0m");
  expect(state.refreshProviders).toHaveBeenCalledTimes(1);
  const button = renderer.root.findAll(
    (node) => node.type === "button" && node.props["aria-label"] === "Refresh usage",
  )[0]!;
  expect(button.props.disabled).toBe(false);
  await act(() => button.props.onClick());
  expect(state.refreshProviders).toHaveBeenCalledTimes(2);
  expect(state.refresh).not.toHaveBeenCalled();
});

it("waits for connection and refreshes new environments during a slow refresh", async () => {
  const [id, presentation] = [...state.presentations][0]!;
  state.presentations = new Map([[id, { ...presentation, connection: { phase: "disconnected" } }]]);
  await act(() => {
    renderer = create(<UsagePage />);
  });
  expect(state.refreshProviders).not.toHaveBeenCalled();
  let finishRefresh!: () => void;
  state.refreshProviders.mockImplementationOnce(
    () =>
      new Promise<undefined>((resolve) => {
        finishRefresh = () => resolve(undefined);
      }),
  );
  state.presentations = new Map([[id, presentation]]);
  await act(() => renderer.update(<UsagePage />));
  expect(state.refreshProviders).toHaveBeenCalledTimes(1);
  const nextId = EnvironmentId.make(`${id}-next`);
  state.presentations = new Map([...state.presentations, [nextId, presentation]]);
  await act(() => renderer.update(<UsagePage />));
  expect(state.refreshProviders).toHaveBeenCalledTimes(2);
  expect(state.refreshProviders).toHaveBeenLastCalledWith({ environmentId: nextId, input: {} });
  await act(() => finishRefresh());
});

it.each(["cost", "tokens"])(
  "keeps %s refresh busy until the already-running automatic check settles",
  async (metric) => {
    state.metric = metric;
    state.showUsage = true;
    let finishRefresh!: () => void;
    const pending = new Promise<undefined>((resolve) => {
      finishRefresh = () => resolve(undefined);
    });
    state.refreshProviders.mockImplementationOnce(() => pending);
    await act(() => {
      renderer = create(<UsagePage />);
    });
    const button = () =>
      renderer.root.findAll(
        (node) => node.type === "button" && node.props["aria-label"] === "Refresh usage",
      )[0]!;
    expect(state.refreshProviders).toHaveBeenCalledTimes(1);
    await act(() => button().props.onClick());
    try {
      expect(button().props["aria-busy"]).toBe(true);
      expect(state.refreshProviders).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => {
        finishRefresh();
        await pending;
      });
    }
    expect(button().props["aria-busy"]).toBe(false);
  },
);

it.each(["cost", "tokens"])(
  "refreshes visible quotas on entering %s and on manual refresh",
  async (metric) => {
    state.metric = metric;
    state.showUsage = true;
    await act(() => {
      renderer = create(
        <StrictMode>
          <UsagePage />
        </StrictMode>,
      );
    });
    expect(state.refreshProviders).toHaveBeenCalledTimes(1);
    await act(() =>
      renderer.root
        .findAll(
          (node) => node.type === "button" && node.props["aria-label"] === "Refresh usage",
        )[0]!
        .props.onClick(),
    );
    expect(state.refreshProviders).toHaveBeenCalledTimes(2);
    expect(state.refresh).toHaveBeenCalledTimes(1);
  },
);

it.each(["cost", "tokens"])(
  "refreshes newly connected environments while viewing %s",
  async (metric) => {
    state.metric = metric;
    state.showUsage = true;
    await act(() => {
      renderer = create(<UsagePage />);
    });
    expect(state.refreshProviders).toHaveBeenCalledTimes(1);
    const [id, presentation] = [...state.presentations][0]!;
    const nextId = EnvironmentId.make(`${id}-next`);
    state.presentations = new Map([[nextId, presentation]]);
    await act(() => renderer.update(<UsagePage />));
    expect(state.refreshProviders).toHaveBeenCalledTimes(2);
    expect(state.refreshProviders).toHaveBeenLastCalledWith({ environmentId: nextId, input: {} });
  },
);

it("keeps the period label with the displayed window while the new range waits", async () => {
  state.metric = "cost";
  state.showUsage = true;
  state.windowDays = 7;
  state.shownWindow = {
    sinceDay: UsageDay.make("2026-09-05"),
    untilDay: UsageDay.make("2026-09-11"),
    timeZone: "UTC",
    resolution: "day",
  };
  await act(() => {
    renderer = create(<UsagePage />);
  });
  const period = () =>
    renderer.root.findAll(
      (node) =>
        node.type === "span" &&
        typeof node.props["aria-label"] === "string" &&
        typeof node.children[0] === "string" &&
        node.children[0].startsWith("Past "),
    )[0]!;
  expect(period().children).toEqual(["Past 7 days"]);
  const shownAria = period().props["aria-label"];
  await act(() =>
    renderer.root
      .findAll((node) => node.type === "div" && node.props["aria-label"] === "Usage period")[0]!
      .props.onValueChange(["90"]),
  );
  expect(period().children).toEqual(["Past 7 days"]);
  expect(period().props["aria-label"]).toBe(shownAria);
  expect(
    renderer.root.findAll(
      (node) => node.type === "div" && node.props["aria-label"] === "Usage period",
    )[0]!.props.value,
  ).toEqual(["90"]);
  state.shownWindow = {
    sinceDay: UsageDay.make("2026-06-14"),
    untilDay: UsageDay.make("2026-09-11"),
    timeZone: "UTC",
    resolution: "day",
  };
  await act(() => renderer.update(<UsagePage />));
  expect(period().children).toEqual(["Past 90 days"]);
  expect(period().props["aria-label"]).not.toBe(shownAria);
});

it.each(["cost", "tokens"])(
  "refreshes the selected environments on %s without refreshing excluded ones",
  async (metric) => {
    state.metric = metric;
    state.showUsage = true;
    const [id, presentation] = [...state.presentations][0]!;
    const otherId = EnvironmentId.make(`${id}-other`);
    state.presentations.set(otherId, { ...presentation, entry: { target: { label: "Other" } } });
    await act(() => {
      renderer = create(<UsagePage />);
    });
    expect(state.refreshProviders).toHaveBeenCalledTimes(2);
    vi.mocked(Date.now).mockReturnValue(Date.parse("2026-09-11T12:05:00Z"));
    const testEnvironment = () =>
      renderer.root.findAll(
        (node) =>
          node.type === "div" &&
          typeof node.props.onCheckedChange === "function" &&
          node.findAll((child) => child.type === "span" && child.children.includes("Test")).length >
            0,
      )[0]!;
    await act(() => testEnvironment().props.onCheckedChange(false));
    expect(state.refreshProviders).toHaveBeenCalledTimes(3);
    expect(state.refreshProviders).toHaveBeenLastCalledWith({ environmentId: otherId, input: {} });
    await act(() => testEnvironment().props.onCheckedChange(true));
    expect(state.refreshProviders).toHaveBeenCalledTimes(4);
    expect(state.refreshProviders).toHaveBeenLastCalledWith({ environmentId: id, input: {} });
  },
);
