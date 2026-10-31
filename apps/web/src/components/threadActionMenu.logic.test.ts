/** Verifies shared thread menu order, capabilities and permission availability without rendering UI. */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const snoozeUi = vi.hoisted(() => ({ enabled: true }));
vi.mock("../snoozeUi", () => ({
  get SNOOZE_UI_ENABLED() {
    return snoozeUi.enabled;
  },
}));
beforeEach(() => {
  snoozeUi.enabled = true;
});

import {
  buildDraftActionMenuItems,
  buildSidebarThreadActionMenuItems,
  buildThreadActionMenuItems,
  threadActionRequiresOperate,
  type ThreadActionMenuState,
} from "./threadActionMenu.logic";

const baseState: ThreadActionMenuState = {
  canOperate: true,
  branch: null,
  projectFilter: null,
  isPinned: false,
  isSettled: false,
  autoSettleEnabled: true,
  isSnoozed: false,
  canSnoozeNow: true,
  isRegeneratingTitle: false,
  isRunning: false,
  supports: {
    settlement: true,
    autoSettleOptOut: true,
    snooze: true,
    pinning: true,
    titleRegeneration: true,
  },
  snoozePresets: [
    { id: "hour", label: "In 1 hour", whenLabel: "3:00 PM", snoozedUntil: "2026-08-07T15:00:00Z" },
  ],
};

function ids(state: ThreadActionMenuState): string[] {
  return buildThreadActionMenuItems(state).map((item) => item.id);
}

function allIds(state: ThreadActionMenuState): string[] {
  const flatten = (items: ReturnType<typeof buildThreadActionMenuItems>): string[] =>
    items.flatMap((item) => [item.id, ...(item.children ? flatten(item.children) : [])]);
  return flatten(buildThreadActionMenuItems(state));
}

describe("buildSidebarThreadActionMenuItems", () => {
  it.each([false, true])(
    "omits snooze and wake with the UI disabled (snoozed: %s)",
    (isSnoozed) => {
      snoozeUi.enabled = false;
      const state = { ...baseState, isSnoozed, hasDraft: false };
      expect(buildSidebarThreadActionMenuItems(state).map((item) => item.id)).not.toEqual(
        expect.arrayContaining(["snooze"]),
      );
      expect(buildSidebarThreadActionMenuItems(state).map((item) => item.id)).not.toContain(
        "unsnooze",
      );
      expect(allIds(state)).not.toContain("snooze");
      expect(allIds(state)).not.toContain("unsnooze");
      expect(allIds(state)).not.toContain("snooze:custom");
    },
  );
  it.each([false, true])("shows discard only with user draft content (%s)", (hasDraft) => {
    const items = buildSidebarThreadActionMenuItems({ ...baseState, hasDraft });
    expect(items.some((item) => item.id === "discard-draft")).toBe(hasDraft);
  });

  it.each([false, true])("keeps wake visible and gates it by snooze state (%s)", (isSnoozed) => {
    const items = buildSidebarThreadActionMenuItems({ ...baseState, hasDraft: false, isSnoozed });
    const wake = items.find((item) => item.id === "unsnooze");
    const snooze = items.find((item) => item.id === "snooze");
    expect(wake).toBeDefined();
    expect(wake?.disabled === true).toBe(!isSnoozed);
    expect(snooze).toBeDefined();
    expect(snooze?.disabled === true).toBe(isSnoozed);
  });

  it("follows V2 groups, flattens copy actions and retains project filtering", () => {
    const items = buildSidebarThreadActionMenuItems({
      ...baseState,
      branch: "main",
      hasDraft: true,
      canTurnIntoProject: true,
      projectFilter: { label: "Project", isActive: false },
    });
    expect(items.map((item) => item.id)).toEqual([
      "rename",
      "regenerate-title",
      "mark-unread",
      "pin",
      "settle",
      "unsnooze",
      "snooze",
      "copy-path",
      "copy-branch",
      "copy-thread-id",
      "copy-thread",
      "export-transcript",
      "new-thread-on-branch",
      "project-settings",
      "turn-into-project",
      "filter-by-project",
      "auto-settle",
      "discard-draft",
      "archive",
      "delete",
    ]);
    expect(items.filter((item) => item.separatorBefore).map((item) => item.id)).toEqual([
      "pin",
      "copy-path",
      "new-thread-on-branch",
      "discard-draft",
    ]);
    expect(items.find((item) => item.id === "auto-settle")?.children).toEqual([
      { id: "auto-settle:enabled", label: "Enabled", checked: true },
      { id: "auto-settle:disabled", label: "Disabled", checked: false },
    ]);
    expect(items.find((item) => item.id === "copy-thread")).toMatchObject({ disabled: false });
    expect(items.find((item) => item.id === "turn-into-project")).toMatchObject({
      disabled: false,
    });
    expect(items.at(-1)).toMatchObject({ id: "delete", destructive: true });
  });

  it.each([
    { name: "running", isRunning: true, canOperate: true, canTurnIntoProject: true },
    { name: "without permission", isRunning: false, canOperate: false, canTurnIntoProject: true },
    { name: "ineligible", isRunning: false, canOperate: true, canTurnIntoProject: false },
  ])("omits project conversion but keeps the read-only reference for $name threads", (state) => {
    const items = buildSidebarThreadActionMenuItems({ ...baseState, ...state, hasDraft: false });
    expect(items.map((item) => item.id)).not.toContain("turn-into-project");
    expect(items.find((item) => item.id === "copy-thread")).toMatchObject({ disabled: false });
  });

  it("keeps unsupported and missing-branch V2 actions visible but unavailable", () => {
    const items = buildSidebarThreadActionMenuItems({
      ...baseState,
      hasDraft: false,
      supports: {
        settlement: false,
        autoSettleOptOut: false,
        snooze: false,
        pinning: false,
        titleRegeneration: false,
      },
    });
    for (const id of [
      "pin",
      "settle",
      "unsnooze",
      "snooze",
      "regenerate-title",
      "auto-settle",
      "copy-branch",
      "new-thread-on-branch",
    ]) {
      expect(
        items.find((item) => item.id === id),
        id,
      ).toMatchObject({ disabled: true });
    }
  });

  it("preserves operate gating and running-state archive restrictions", () => {
    const items = buildSidebarThreadActionMenuItems({
      ...baseState,
      hasDraft: true,
      canOperate: false,
      isSnoozed: true,
      isRunning: true,
    });
    for (const id of [
      "rename",
      "regenerate-title",
      "pin",
      "settle",
      "unsnooze",
      "auto-settle",
      "export-transcript",
      "archive",
      "delete",
    ]) {
      expect(
        items.find((item) => item.id === id),
        id,
      ).toMatchObject({ disabled: true });
    }
    for (const id of [
      "mark-unread",
      "copy-path",
      "copy-thread-id",
      "project-settings",
      "discard-draft",
    ]) {
      expect(items.find((item) => item.id === id)?.disabled, id).not.toBe(true);
    }
    expect(threadActionRequiresOperate("discard-draft")).toBe(false);
    expect(
      buildSidebarThreadActionMenuItems({ ...baseState, hasDraft: false, isRunning: true }).find(
        (item) => item.id === "archive",
      )?.disabled,
    ).toBe(true);
  });

  it("leaves titlebar ordering, copy submenu and snooze visibility unchanged", () => {
    buildSidebarThreadActionMenuItems({ ...baseState, hasDraft: true });
    expect(ids(baseState)).toEqual([
      "pin",
      "settle",
      "snooze",
      "rename",
      "regenerate-title",
      "mark-unread",
      "auto-settle",
      "copy",
      "export-transcript",
      "project-settings",
      "archive",
      "delete",
    ]);
    expect(
      buildThreadActionMenuItems(baseState)
        .find((item) => item.id === "copy")
        ?.children?.map((item) => item.id),
    ).toEqual(["copy-path", "copy-thread-id", "copy-thread"]);
    expect(ids({ ...baseState, isSnoozed: true })).toContain("unsnooze");
    expect(ids({ ...baseState, isSnoozed: true })).not.toContain("snooze");
  });
});

describe("buildThreadActionMenuItems", () => {
  it.each([false, true])(
    "disables both lifecycle directions without permission (reversed: %s)",
    (reversed) => {
      const items = buildThreadActionMenuItems({
        ...baseState,
        canOperate: false,
        isPinned: reversed,
        isSettled: reversed,
        isSnoozed: reversed,
      });
      const expected = reversed
        ? [
            "unpin",
            "unsettle",
            "unsnooze",
            "rename",
            "regenerate-title",
            "auto-settle",
            "export-transcript",
            "archive",
            "delete",
          ]
        : [
            "pin",
            "settle",
            "snooze",
            "rename",
            "regenerate-title",
            "auto-settle",
            "export-transcript",
            "archive",
            "delete",
          ];
      expect(items.filter((item) => item.disabled).map((item) => item.id)).toEqual(expected);
      expect(
        items.find((item) => item.id === "snooze")?.children?.every((child) => child.disabled) ??
          true,
      ).toBe(true);
    },
  );

  it("preserves local actions and restores mutations after a grant", () => {
    const denied = buildThreadActionMenuItems({ ...baseState, canOperate: false, branch: "main" });
    expect(denied.filter((item) => !item.disabled).map((item) => item.id)).toEqual([
      "new-thread-on-branch",
      "mark-unread",
      "copy",
      "project-settings",
    ]);
    const allowed = buildThreadActionMenuItems({ ...baseState, canOperate: true });
    expect(allowed.every((item) => !item.disabled)).toBe(true);
  });

  it("hides lifecycle items when the environment lacks the capabilities", () => {
    expect(
      ids({
        ...baseState,
        supports: {
          settlement: false,
          autoSettleOptOut: false,
          snooze: false,
          pinning: false,
          titleRegeneration: false,
        },
      }),
    ).toEqual([
      "rename",
      "mark-unread",
      "copy",
      "export-transcript",
      "project-settings",
      "archive",
      "delete",
    ]);
  });

  it("groups project settings with utility actions before archive", () => {
    const items = buildThreadActionMenuItems(baseState);
    const copyIndex = items.findIndex((item) => item.id === "copy");
    expect(items[copyIndex + 1]).toMatchObject({
      id: "export-transcript",
      label: "Export conversation",
    });
    expect(items[copyIndex + 2]).toMatchObject({
      id: "project-settings",
      label: "Project settings",
      icon: "settings",
    });
    expect(items[copyIndex + 3]?.id).toBe("archive");
  });

  it("offers project filtering only for surfaces with a scoped thread list", () => {
    expect(ids(baseState)).not.toContain("filter-by-project");
    expect(
      buildThreadActionMenuItems({
        ...baseState,
        projectFilter: { label: "Beta Project", isActive: false },
      }).find((item) => item.id === "filter-by-project"),
    ).toMatchObject({ label: "Filter by Beta Project", icon: "folder-tree" });
  });

  it("offers the way back to Today once the list is scoped", () => {
    const items = buildThreadActionMenuItems({
      ...baseState,
      projectFilter: { label: "Beta Project", isActive: true },
    });
    const filterIndex = items.findIndex((candidate) => candidate.id === "filter-by-project");
    expect(items[filterIndex]).toMatchObject({ label: "Show Today", icon: "folder-tree" });
    expect(items[filterIndex - 1]?.id).toBe("mark-unread");
    expect(items[filterIndex + 1]?.id).toBe("auto-settle");
  });

  it("includes branch items only for threads with a branch", () => {
    const withBranch = allIds({ ...baseState, branch: "feat/menu" });
    expect(withBranch).toContain("new-thread-on-branch");
    expect(withBranch).toContain("copy-branch");
    expect(allIds(baseState)).not.toContain("new-thread-on-branch");
    expect(allIds(baseState)).not.toContain("copy-branch");
  });

  it("flips lifecycle labels with thread state", () => {
    expect(ids({ ...baseState, isPinned: true, isSettled: true, isSnoozed: true })).toEqual(
      expect.arrayContaining(["unpin", "unsettle", "unsnooze"]),
    );
    expect(ids(baseState)).toEqual(expect.arrayContaining(["pin", "settle", "snooze"]));
  });

  it("offers auto-settle as a submenu with the current option checked", () => {
    const find = (state: ThreadActionMenuState) =>
      buildThreadActionMenuItems(state).find((item) => item.id === "auto-settle");
    const on = find(baseState);
    expect(on?.label).toBe("Auto-settle behavior");
    expect(on?.children?.map((child) => [child.id, child.checked])).toEqual([
      ["auto-settle:enabled", true],
      ["auto-settle:disabled", false],
    ]);
    const off = find({ ...baseState, autoSettleEnabled: false });
    expect(off?.children?.map((child) => child.checked)).toEqual([false, true]);
    // Sits with the per-thread settings after Mark unread, not the lifecycle verbs.
    const items = buildThreadActionMenuItems(baseState);
    expect(items[items.findIndex((item) => item.id === "mark-unread") + 1]?.id).toBe("auto-settle");
    expect(
      ids({ ...baseState, supports: { ...baseState.supports, autoSettleOptOut: false } }),
    ).not.toContain("auto-settle");
  });

  it("disables snooze when the thread cannot snooze, keeping presets visible", () => {
    const snooze = buildThreadActionMenuItems({ ...baseState, canSnoozeNow: false }).find(
      (item) => item.id === "snooze",
    );
    expect(snooze?.disabled).toBe(true);
    expect(snooze?.children?.map((child) => child.id)).toEqual(["snooze:hour", "snooze:custom"]);
  });

  it("disables title regeneration while one is in flight", () => {
    const item = buildThreadActionMenuItems({ ...baseState, isRegeneratingTitle: true }).find(
      (candidate) => candidate.id === "regenerate-title",
    );
    expect(item).toMatchObject({ label: "Regenerating…", disabled: true });
  });

  it("marks delete as destructive and keeps it last", () => {
    const items = buildThreadActionMenuItems({ ...baseState, branch: "main" });
    expect(items.at(-1)).toMatchObject({ id: "delete", destructive: true });
  });
  it("offers archive as a non-destructive action right before delete", () => {
    const items = buildThreadActionMenuItems(baseState);
    const archiveItem = items.at(-2);
    expect(archiveItem?.id).toBe("archive");
    expect(archiveItem?.icon).toBe("archive");
    expect(archiveItem?.separatorBefore).toBe(true);
    expect(archiveItem?.destructive).toBeFalsy();
    expect(items.at(-1)?.id).toBe("delete");
  });

  it("keeps archive available even when the environment lacks every other capability", () => {
    expect(
      ids({
        ...baseState,
        supports: {
          settlement: false,
          autoSettleOptOut: false,
          snooze: false,
          pinning: false,
          titleRegeneration: false,
        },
      }),
    ).toContain("archive");
  });

  it("disables archive and turning into a project while the thread is running", () => {
    const items = buildThreadActionMenuItems({
      ...baseState,
      isRunning: true,
      canTurnIntoProject: true,
    });
    expect(items.find((item) => item.id === "archive")?.disabled).toBe(true);
    expect(items.find((item) => item.id === "turn-into-project")?.disabled).toBe(true);
  });
});

describe("buildDraftActionMenuItems", () => {
  it("offers only the copy values the draft has", () => {
    const items = buildDraftActionMenuItems({ hasPath: false, hasBranch: true, hasProject: true });
    expect(items[0]).toMatchObject({ id: "copy", disabled: false });
    expect(items[0]?.children?.map((item) => item.id)).toEqual(["copy-branch"]);

    const noCopy = buildDraftActionMenuItems({
      hasPath: false,
      hasBranch: false,
      hasProject: true,
    });
    expect(noCopy[0]).toMatchObject({ id: "copy", disabled: true, children: [] });
  });

  it("drops project settings without a project and keeps discard last", () => {
    const items = buildDraftActionMenuItems({ hasPath: true, hasBranch: false, hasProject: false });
    expect(items.map((item) => item.id)).toEqual(["copy", "discard"]);
    expect(items.at(-1)).toMatchObject({ label: "Discard draft", destructive: true });
  });
});
