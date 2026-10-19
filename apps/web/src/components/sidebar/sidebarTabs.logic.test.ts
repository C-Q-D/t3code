/** Tests the 8a tab contracts with ordered shelf fixtures, without React or browser storage. */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  buildSidebarTabs,
  visibleSidebarTabs,
  nextSidebarSettledVisibleCount,
  readSidebarTab,
  resolveSidebarSearchResultTab,
  resolveSidebarTabDropIntent,
  resolveSidebarTabView,
  sidebarTabJumpNumbers,
  writeSidebarTab,
  type SidebarTab,
  type SidebarTabShelves,
} from "./sidebarTabs.logic";

const snoozeFlag = vi.hoisted(() => ({ SNOOZE_UI_ENABLED: true }));
vi.mock("../../snoozeUi", () => snoozeFlag);
beforeEach(() => {
  snoozeFlag.SNOOZE_UI_ENABLED = true;
});

describe("fork without snooze UI", () => {
  beforeEach(() => {
    snoozeFlag.SNOOZE_UI_ENABLED = false;
  });
  it("migrates a stored Later selection to Active and exposes only Active and Settled", async () => {
    const actual = await vi.importActual<typeof import("../../snoozeUi")>("../../snoozeUi");
    expect(actual.SNOOZE_UI_ENABLED).toBe(false);
    expect(readSidebarTab("later")).toBe("active");
    expect(visibleSidebarTabs()).toEqual(["active", "settled"]);
  });
  it("rejects Later drops and reveals externally snoozed search results in Active", () => {
    expect(resolveSidebarTabDropIntent("active", "later")).toBeNull();
    expect(
      resolveSidebarSearchResultTab({
        threadKey: "external",
        snoozedThreadKeys: new Set(["external"]),
        settledThreadKeys: new Set(),
      }),
    ).toBe("active");
  });
});

/** Supply disjoint ordered shelves; overrides expose only fields relevant to each contract. */
function shelves(overrides: Partial<SidebarTabShelves<string>> = {}): SidebarTabShelves<string> {
  return {
    pinnedThreads: [],
    activeThreads: [],
    workingThreads: [],
    snoozedThreads: [],
    settledThreads: [],
    ...overrides,
  };
}

/** Return each string fixture's existing key unchanged for tab and shortcut projections. */
const getThreadKey = (key: string) => key;
const settledThreads = Array.from({ length: 37 }, (_, index) => `settled-${index + 1}`);

describe("opening a search result", () => {
  const rows = shelves({
    pinnedThreads: ["env:pin"],
    activeThreads: ["env:ordinary"],
    workingThreads: ["env:working"],
    snoozedThreads: ["env:later"],
    settledThreads: ["env:settled", ...settledThreads],
  });
  const snoozedThreadKeys = new Set(rows.snoozedThreads);
  const settledThreadKeys = new Set(rows.settledThreads);

  it.each([
    { threadKey: "env:later", previousTab: "active", expectedTab: "later" },
    { threadKey: "env:settled", previousTab: "active", expectedTab: "settled" },
    { threadKey: "settled-36", previousTab: "active", expectedTab: "settled" },
    { threadKey: "env:pin", previousTab: "later", expectedTab: "active" },
  ] as const)(
    "reveals $threadKey in $expectedTab after clearing search",
    ({ threadKey, previousTab, expectedTab }) => {
      const searching = resolveSidebarTabView({
        tabs: buildSidebarTabs(rows, { getThreadKey }),
        currentTab: previousTab,
        searchQuery: "needle",
        searchResults: [threadKey],
      });
      expect(searching.rows).toContain(threadKey);
      const tab = resolveSidebarSearchResultTab({
        threadKey,
        snoozedThreadKeys,
        settledThreadKeys,
      });
      const tabs = buildSidebarTabs(rows, { getThreadKey, routeThreadKey: threadKey });
      const view = resolveSidebarTabView({
        tabs,
        currentTab: tab,
        searchQuery: "",
        searchResults: [],
      });
      expect(view.mode).toBe("tab");
      expect(tab).toBe(expectedTab);
      expect(view.rows).toContain(threadKey);
      expect(writeSidebarTab(tab)).toEqual({ key: "t3code:sidebar-tab", value: expectedTab });
    },
  );
});

describe("sidebar tab membership and counts", () => {
  it("combines pins, ordinary and beta working rows in existing sidebar order", () => {
    const result = buildSidebarTabs(
      shelves({
        pinnedThreads: ["pin-b", "pin-a"],
        activeThreads: ["active-b", "active-a"],
        workingThreads: ["working"],
        snoozedThreads: ["wake-soon", "wake-later"],
        settledThreads: ["settled"],
      }),
      { getThreadKey },
    );
    expect(result).toEqual({
      rowsByTab: {
        active: ["pin-b", "pin-a", "active-b", "active-a", "working"],
        later: ["wake-soon", "wake-later"],
        settled: ["settled"],
      },
      counts: { active: 5, later: 2, settled: 1 },
      hiddenSettledCount: 0,
    });
  });

  it("keeps working threads supplied as ordinary rows when the beta is off", () => {
    const result = buildSidebarTabs(
      shelves({ activeThreads: ["ordinary", "running-with-beta-off"] }),
      { getThreadKey },
    );
    expect(result.rowsByTab.active).toEqual(["ordinary", "running-with-beta-off"]);
    expect(result.counts).toEqual({ active: 2, later: 0, settled: 0 });
  });

  it("returns empty tabs and zero counts for an empty project scope", () => {
    expect(buildSidebarTabs(shelves(), { getThreadKey })).toEqual({
      rowsByTab: { active: [], later: [], settled: [] },
      counts: { active: 0, later: 0, settled: 0 },
      hiddenSettledCount: 0,
    });
  });
});

describe("settled pagination", () => {
  it("starts with ten visible rows while the badge includes all settled threads", () => {
    const result = buildSidebarTabs(shelves({ settledThreads }), { getThreadKey });
    expect(result.rowsByTab.settled).toEqual([
      "settled-1",
      "settled-2",
      "settled-3",
      "settled-4",
      "settled-5",
      "settled-6",
      "settled-7",
      "settled-8",
      "settled-9",
      "settled-10",
    ]);
    expect(result.counts.settled).toBe(37);
    expect(result.hiddenSettledCount).toBe(27);
  });

  it("shows 25 more per action and exhausts the last partial page", () => {
    expect(nextSidebarSettledVisibleCount(10)).toBe(35);
    expect(nextSidebarSettledVisibleCount(35)).toBe(60);
    const secondPage = buildSidebarTabs(shelves({ settledThreads }), {
      getThreadKey,
      settledVisibleCount: 35,
    });
    expect(secondPage.rowsByTab.settled).toHaveLength(35);
    expect(secondPage.rowsByTab.settled.at(-1)).toBe("settled-35");
    expect(secondPage.hiddenSettledCount).toBe(2);
    const lastPage = buildSidebarTabs(shelves({ settledThreads }), {
      getThreadKey,
      settledVisibleCount: 60,
    });
    expect(lastPage.rowsByTab.settled).toEqual(settledThreads);
    expect(lastPage.hiddenSettledCount).toBe(0);
    expect(lastPage.counts.settled).toBe(37);
  });

  it.each([
    { routeThreadKey: "settled-36", length: 11, last: "settled-36", hidden: 26 },
    { routeThreadKey: "settled-3", length: 10, last: "settled-10", hidden: 27 },
    { routeThreadKey: "other-env:settled-36", length: 10, last: "settled-10", hidden: 27 },
  ])("retains only a matching open row beyond the page: $routeThreadKey", (testCase) => {
    const result = buildSidebarTabs(shelves({ settledThreads }), {
      getThreadKey,
      routeThreadKey: testCase.routeThreadKey,
    });
    expect(result.rowsByTab.settled).toHaveLength(testCase.length);
    expect(result.rowsByTab.settled.at(-1)).toBe(testCase.last);
    expect(result.hiddenSettledCount).toBe(testCase.hidden);
    expect(result.counts.settled).toBe(37);
  });
});

describe("remembered sidebar tab", () => {
  it.each<SidebarTab>(["active", "later", "settled"])(
    "round-trips %s using the agreed storage key",
    (tab) => {
      const entry = writeSidebarTab(tab);
      expect(entry).toEqual({ key: "t3code:sidebar-tab", value: tab });
      expect(readSidebarTab(entry.value)).toBe(tab);
    },
  );

  it.each([null, undefined, "", "snoozed", "ACTIVE", " later ", "{}", '"settled"'])(
    "falls back to Active for missing or invalid raw storage value %j",
    (storedValue) => {
      expect(readSidebarTab(storedValue)).toBe("active");
    },
  );
});

describe("visible view and jump numbering", () => {
  const tabs = buildSidebarTabs(
    shelves({
      pinnedThreads: ["pin"],
      activeThreads: ["ordinary"],
      workingThreads: ["working"],
      snoozedThreads: ["later-a", "later-b"],
      settledThreads,
    }),
    { getThreadKey },
  );

  it.each([
    {
      tab: "active",
      expected: [
        ["pin", 1],
        ["ordinary", 2],
        ["working", 3],
      ],
    },
    {
      tab: "later",
      expected: [
        ["later-a", 1],
        ["later-b", 2],
      ],
    },
  ] as const)("numbers only the current $tab tab, starting at one", ({ tab, expected }) => {
    const view = resolveSidebarTabView({
      tabs,
      currentTab: tab,
      searchQuery: "  ",
      searchResults: ["stale"],
    });
    expect(view.mode).toBe("tab");
    expect([...sidebarTabJumpNumbers(view, getThreadKey)]).toEqual(expected);
  });

  it("caps numbering at nine and excludes paginated or inactive rows", () => {
    const view = resolveSidebarTabView({
      tabs,
      currentTab: "settled",
      searchQuery: "",
      searchResults: [],
    });
    expect([...sidebarTabJumpNumbers(view, getThreadKey)]).toEqual([
      ["settled-1", 1],
      ["settled-2", 2],
      ["settled-3", 3],
      ["settled-4", 4],
      ["settled-5", 5],
      ["settled-6", 6],
      ["settled-7", 7],
      ["settled-8", 8],
      ["settled-9", 9],
    ]);
  });

  it("replaces tabs with flat search matches, including deep settled rows", () => {
    const view = resolveSidebarTabView({
      tabs,
      currentTab: "later",
      searchQuery: " match ",
      searchResults: ["pin", "settled-37", "later-a"],
    });
    expect(view).toEqual({ mode: "search", rows: ["pin", "settled-37", "later-a"], matchCount: 3 });
    expect([...sidebarTabJumpNumbers(view, getThreadKey)]).toEqual([
      ["pin", 1],
      ["settled-37", 2],
      ["later-a", 3],
    ]);
  });

  it("keeps an unmatched search empty instead of falling back to the selected tab", () => {
    const view = resolveSidebarTabView({
      tabs,
      currentTab: "active",
      searchQuery: "missing",
      searchResults: [],
    });
    expect(view).toEqual({ mode: "search", rows: [], matchCount: 0 });
    expect([...sidebarTabJumpNumbers(view, getThreadKey)]).toEqual([]);
  });
});

describe("drop onto tab intents", () => {
  it.each([
    ["pinned", "settled", "settle"],
    ["active", "settled", "settle"],
    ["working", "settled", "settle"],
    ["snoozed", "settled", "settle"],
    ["settled", "settled", null],
    ["active", "later", "open-snooze-menu"],
    ["settled", "later", "open-snooze-menu"],
    ["snoozed", "later", "open-snooze-menu"],
    ["snoozed", "active", "unsnooze"],
    ["settled", "active", "unsettle"],
    ["pinned", "active", null],
    ["working", "active", null],
    ["active", "active", null],
  ] as const)("dropping %s onto %s requests %s", (sourceSection, targetTab, expected) => {
    expect(resolveSidebarTabDropIntent(sourceSection, targetTab)).toBe(expected);
  });
});
