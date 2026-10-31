/** Verifies sidebar presentation, visibility and user actions with controlled thread fixtures.
 * @vitest-environment jsdom
 */

import {
  completeSidebarRouteReveal,
  pendingSidebarRouteReveal,
  resolveSidebarRouteReveal,
} from "./sidebar/routeReveal"; // Unit tests use jsdom; test/render.tsx depends on the browser runner. The fixture owns cleanup.
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { buildSidebarTabs } from "./sidebar/sidebarTabs.logic";
import { installMessages } from "~/i18n";
import { en } from "~/i18n/locales/en";
import { messages as zhCN } from "~/i18n/locales/zh-CN";
import { presentThreadShell } from "@t3tools/client-runtime/state/models";
import { isThreadWorking as isSidebarThreadWorking } from "@t3tools/client-runtime/state/thread-inbox";
import * as DateTime from "effect/DateTime";
import { deriveActiveWorkStartedAt } from "../session-logic.ts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { defaultAnimateLayoutChanges, type AnimateLayoutChanges } from "@dnd-kit/sortable";
import * as Cause from "effect/Cause";
import { AsyncResult, Atom } from "effect/reactivity";
import type { SnoozePresetSetting } from "@t3tools/contracts/settings";
import { appAtomRegistry } from "../rpc/atomRegistry";
import {
  useThreadJumpHintsVisible,
  sidebarThreadStatusLabel,
  animateSidebarLayoutChanges,
  compactSidebarTimeLabel,
  archiveSelectedThreadEntries,
  buildBulkTitleRegenerationContextMenuItem,
  buildBulkUnpinContextMenuItem,
  deleteSelectedThreadEntries,
  filterSidebarProjectScopeItems,
  filterSidebarV2VisibleThreads,
  formatWorkingDurationLabel,
  getFallbackThreadIdAfterDelete,
  hasUnseenCompletion,
  isTrailingDoubleClick,
  orderItemsByPreferredIds,
  pinOrderKeyBetween,
  resolveAdjacentThreadId,
  resolveSidebarNewThreadDestination,
  resolveSidebarNewThreadTooltip,
  prepareSidebarProjectsForGrouping,
  resolveProjectStatusIndicator,
  resolveSidebarSweepKeys,
  sidebarSweepScopes,
  resolveSidebarThreadSection,
  resolveSidebarRowAccessibility,
  resolveSidebarRowThreadId,
  resolveSidebarThreadStatus,
  resolveSidebarV2TopStatus,
  resolveThreadLastVisitedAt,
  resolveThreadStatusPill,
  resolveWorkingStartedAt,
  pullRequestMatchesSearchQuery,
  searchSidebarThreads,
  sidebarSearchTextSegments,
  shouldRecedeSidebarThread,
  sortLogicalProjectsForSidebar,
  sortInboxThreadsByReturn,
  resolveSidebarDropTarget,
  sidebarMarkerId,
  planSidebarThreadDrop,
  resolveSidebarReorderableThreadKeys,
  sortPinnedThreadsForSidebar,
  sortProjectsForSidebar,
  sortScopedProjectsForSidebar,
  sortSidebarV2ProjectGroups,
  shouldNavigateAfterThreadPark,
  type SidebarListItem,
  type SidebarListMarker,
  type SidebarSection,
  resolveSidebarDropVerb,
} from "./Sidebar.logic";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  sortActiveThreadsByOrderKey,
  sortPinnedThreadsByOrderKey,
} from "@t3tools/client-runtime/state/thread-sort";
import { threadSearchMatchKey } from "@t3tools/client-runtime/state/thread-search";
import {
  DiscussionId,
  DiscussionSeatId,
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  RunId,
  ThreadId,
} from "@t3tools/contracts";

import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  type Project,
  type Thread,
} from "../types";
import { makeThreadFixture, type ThreadFixtureOverrides } from "../test-fixtures";
import {
  buildSidebarProjectSnapshots,
  type SidebarProjectSnapshot,
} from "../sidebarProjectGrouping";
import { getProjectOrderKey } from "@t3tools/client-runtime/state/project-grouping";

const localEnvironmentId = EnvironmentId.make("environment-local");

it("localizes default snooze presets without replacing custom or actual-day labels", async () => {
  const settings = Atom.make<{ snoozePresets: readonly SnoozePresetSetting[] } | undefined>(
    undefined,
  );
  // Only the environment settings source is replaced; preset resolution and localization stay real.
  vi.doMock("../state/server", () => ({
    serverEnvironment: { settingsValueAtom: () => settings },
  }));
  try {
    installMessages("zh-CN", zhCN);
    const { resolveSnoozePresets } = await import("./Sidebar.snooze");
    const defaults = resolveSnoozePresets(new Date(2026, 9, 19, 12), "24-hour", localEnvironmentId);
    expect(defaults.map(({ id, label }) => [id, label])).toEqual([
      ["after:60", "1小时后"],
      ["after:180", "3小时后"],
      ["at:today:18:00", "今晚"],
      ["at:tomorrow:09:00", "明天"],
      ["at:monday:09:00", "下周"],
    ]);
    appAtomRegistry.set(settings, {
      snoozePresets: [
        { kind: "after", minutes: 90 },
        { kind: "at", day: "today", time: "16:00" },
        { kind: "at", day: "monday", time: "09:00" },
      ],
    });
    const custom = resolveSnoozePresets(new Date(2026, 9, 18, 12), "24-hour", localEnvironmentId);
    expect(custom.map(({ id, label }) => [id, label])).toEqual([
      ["after:90", "In 90 minutes"],
      ["at:today:16:00", "This afternoon"],
      ["at:monday:09:00", "明天"],
    ]);
  } finally {
    appAtomRegistry.set(settings, undefined);
    vi.doUnmock("../state/server");
    installMessages("en", en);
  }
});

describe("resolveSidebarNewThreadDestination", () => {
  const remoteEnvironmentId = EnvironmentId.make("environment-remote");
  const first = {
    ...makeProject({ id: ProjectId.make("first") }),
    physicalProjectKey: "first",
    environmentLabel: null,
  };
  const representative = {
    ...first,
    id: ProjectId.make("representative"),
    environmentId: remoteEnvironmentId,
    physicalProjectKey: "representative",
  };
  const preferred = { ...first, id: ProjectId.make("preferred"), physicalProjectKey: "preferred" };
  const group: SidebarProjectSnapshot = {
    ...representative,
    pinned: false,
    archived: false,
    projectKey: "selected",
    displayName: "Selected",
    groupedProjectCount: 3,
    environmentPresence: "mixed",
    allRemoteMembersAreDesktopLocal: false,
    allRemoteMembersAreWsl: false,
    memberProjects: [first, representative, preferred],
    memberProjectRefs: [
      { environmentId: localEnvironmentId, projectId: first.id },
      { environmentId: remoteEnvironmentId, projectId: representative.id },
      { environmentId: localEnvironmentId, projectId: preferred.id },
    ],
    remoteEnvironmentLabels: [],
  };
  const otherGroup = { ...group, projectKey: "other" };
  const input = {
    shiftKey: false,
    groups: [group, otherGroup],
    scopeKey: "selected",
    preferredProjectRef: null,
    scratchEnvironmentId: (environmentId: EnvironmentId) => environmentId,
  };

  it.each([
    {
      name: "ordinary",
      scopedGroup: group,
      available: true,
      expected: "New thread in Selected (Ctrl+N)",
    },
    {
      name: "scratch",
      scopedGroup: { ...group, isScratch: true as const },
      available: true,
      expected: "New thread without a project (Ctrl+N)",
    },
    {
      name: "unavailable scratch",
      scopedGroup: { ...group, isScratch: true as const },
      available: false,
      expected: "New thread (Ctrl+N)",
    },
    {
      name: "empty ordinary",
      scopedGroup: { ...group, memberProjects: [], memberProjectRefs: [] },
      available: true,
      expected: "New thread (Ctrl+N)",
    },
    {
      name: "empty scratch",
      scopedGroup: {
        ...group,
        isScratch: true as const,
        memberProjects: [],
        memberProjectRefs: [],
      },
      available: true,
      expected: "New thread (Ctrl+N)",
    },
  ])(
    "tooltip follows the resolved destination for $name",
    ({ scopedGroup, available, expected }) => {
      installMessages("en", en);
      const destination = resolveSidebarNewThreadDestination({
        ...input,
        groups: [scopedGroup, otherGroup],
        scratchEnvironmentId: (environmentId) => (available ? environmentId : null),
      });
      expect(resolveSidebarNewThreadTooltip(destination, scopedGroup, "Ctrl+N")).toBe(expected);
    },
  );

  it("lets Shift override an active project scope", () => {
    expect(resolveSidebarNewThreadDestination({ ...input, shiftKey: true })).toEqual({
      kind: "context",
    });
  });

  it.each([
    { name: "zero groups", groups: [], scopeKey: null, expected: { kind: "context" } },
    { name: "one group", groups: [group], scopeKey: null, expected: { kind: "context" } },
    {
      name: "two groups",
      groups: [group, otherGroup],
      scopeKey: null,
      expected: { kind: "picker" },
    },
    {
      name: "missing scope",
      groups: [group, otherGroup],
      scopeKey: "missing",
      expected: { kind: "picker" },
    },
  ])("uses the all-projects rule for $name", ({ groups, scopeKey, expected }) => {
    expect(resolveSidebarNewThreadDestination({ ...input, groups, scopeKey })).toEqual(expected);
  });

  it.each([
    {
      name: "exact preferred member before another member on the same machine",
      preferredProjectRef: {
        environmentId: localEnvironmentId,
        projectId: ProjectId.make("preferred"),
      },
      expected: { environmentId: localEnvironmentId, projectId: ProjectId.make("preferred") },
    },
    {
      name: "same-machine member for a different preferred project",
      preferredProjectRef: {
        environmentId: localEnvironmentId,
        projectId: ProjectId.make("outside"),
      },
      expected: { environmentId: localEnvironmentId, projectId: ProjectId.make("first") },
    },
    {
      name: "representative rather than first member without a preference",
      preferredProjectRef: null,
      expected: { environmentId: remoteEnvironmentId, projectId: ProjectId.make("representative") },
    },
  ])("creates in the $name", ({ preferredProjectRef, expected }) => {
    expect(resolveSidebarNewThreadDestination({ ...input, preferredProjectRef })).toEqual({
      kind: "project",
      projectRef: expected,
    });
  });

  it("falls back to the first member when the representative is absent", () => {
    expect(
      resolveSidebarNewThreadDestination({
        ...input,
        groups: [{ ...group, id: ProjectId.make("absent") }, otherGroup],
      }),
    ).toEqual({
      kind: "project",
      projectRef: { environmentId: localEnvironmentId, projectId: ProjectId.make("first") },
    });
  });

  it("creates scratch on the selected member's machine", () => {
    expect(
      resolveSidebarNewThreadDestination({
        ...input,
        groups: [{ ...group, isScratch: true }, otherGroup],
        preferredProjectRef: {
          environmentId: localEnvironmentId,
          projectId: ProjectId.make("preferred"),
        },
        scratchEnvironmentId: (environmentId) =>
          environmentId === localEnvironmentId ? environmentId : null,
      }),
    ).toEqual({ kind: "scratch", environmentId: localEnvironmentId });
  });

  it("opens the picker when the scoped scratch machine is unavailable", () => {
    expect(
      resolveSidebarNewThreadDestination({
        ...input,
        groups: [{ ...group, isScratch: true }, otherGroup],
        scratchEnvironmentId: () => null,
      }),
    ).toEqual({ kind: "picker" });
  });

  it.each([
    { name: "ordinary", scopedGroup: group },
    { name: "scratch", scopedGroup: { ...group, isScratch: true as const } },
  ])("falls back when a scoped $name group has no members", ({ scopedGroup }) => {
    expect(
      resolveSidebarNewThreadDestination({
        ...input,
        groups: [{ ...scopedGroup, memberProjects: [], memberProjectRefs: [] }, otherGroup],
      }),
    ).toEqual({ kind: "picker" });
  });
});

describe("prepareSidebarProjectsForGrouping", () => {
  const repositoryIdentity = {
    canonicalKey: "github.com/example/shared",
    locator: {
      source: "git-remote" as const,
      remoteName: "origin",
      remoteUrl: "https://github.com/example/shared.git",
    },
  };
  const a = makeProject({ id: ProjectId.make("A"), workspaceRoot: "/a", repositoryIdentity });
  const b = makeProject({ id: ProjectId.make("B"), workspaceRoot: "/b", repositoryIdentity });
  const c = makeProject({ id: ProjectId.make("C"), workspaceRoot: "/c" });

  it.each([
    { sortOrder: "manual" as const, expected: "B" },
    { sortOrder: "updated_at" as const, expected: "A" },
    { sortOrder: "created_at" as const, expected: "A" },
  ])("keeps button and shortcut targets consistent for $sortOrder", ({ sortOrder, expected }) => {
    const projects = prepareSidebarProjectsForGrouping([a, b, c], sortOrder, [
      getProjectOrderKey(b),
      getProjectOrderKey(a),
    ]);
    const groups = buildSidebarProjectSnapshots({
      projects,
      groupScratchProjects: true,
      settings: { sidebarProjectGroupingMode: "repository", sidebarProjectGroupingOverrides: {} },
      primaryEnvironmentId: localEnvironmentId,
      resolveEnvironmentLabel: () => null,
    });
    const group = groups.find((candidate) =>
      candidate.memberProjects.some((member) => member.id === a.id),
    );
    expect(
      resolveSidebarNewThreadDestination({
        shiftKey: false,
        groups,
        scopeKey: group!.projectKey,
        preferredProjectRef: { environmentId: localEnvironmentId, projectId: ProjectId.make("C") },
        scratchEnvironmentId: (environmentId) => environmentId,
      }),
    ).toEqual({
      kind: "project",
      projectRef: { environmentId: localEnvironmentId, projectId: expected },
    });
  });
});

describe("sidebarSearchTextSegments", () => {
  it("marks repeated literal hits with ASCII case folding while preserving Chinese text and offsets", () => {
    expect(sidebarSearchTextSegments("修复 A+B，再查 a+b。", " a+b ")).toEqual([
      { text: "修复 ", start: 0, matched: false },
      { text: "A+B", start: 3, matched: true },
      { text: "，再查 ", start: 6, matched: false },
      { text: "a+b", start: 10, matched: true },
      { text: "。", start: 13, matched: false },
    ]);
    expect(sidebarSearchTextSegments("闪烁与闪烁", "闪烁")).toEqual([
      { text: "闪烁", start: 0, matched: true },
      { text: "与", start: 2, matched: false },
      { text: "闪烁", start: 3, matched: true },
    ]);
  });

  it("leaves unmatched and blank queries intact and emits no segment for empty text", () => {
    expect(sidebarSearchTextSegments("保留原文", "absent")).toEqual([
      { text: "保留原文", start: 0, matched: false },
    ]);
    expect(sidebarSearchTextSegments("保留原文", " \t ")).toEqual([
      { text: "保留原文", start: 0, matched: false },
    ]);
    expect(sidebarSearchTextSegments("", "闪烁")).toEqual([]);
  });
});

describe("resolveSidebarRowAccessibility", () => {
  it.each([
    {
      title: "Can you audit the UI?",
      statusLabel: "Working",
      projectDisplayName: "T3 Code",
      isActive: true,
      expected: { label: "Can you audit the UI?, Working, T3 Code", current: "page" },
    },
    {
      title: "The audit is done",
      statusLabel: null,
      projectDisplayName: "T3 Code",
      isActive: false,
      expected: { label: "The audit is done, T3 Code", current: undefined },
    },
    {
      title: "Untitled task",
      statusLabel: null,
      projectDisplayName: null,
      isActive: false,
      expected: { label: "Untitled task", current: undefined },
    },
  ])("leads with the title without folding row actions into its name: %j", (input) => {
    const { expected, ...state } = input;
    expect(resolveSidebarRowAccessibility(state)).toEqual(expected);
  });
});

describe("animateSidebarLayoutChanges", () => {
  const baseArgs: Parameters<AnimateLayoutChanges>[0] = {
    active: null,
    containerId: "pinned-threads",
    isDragging: false,
    isSorting: false,
    id: "thread-a",
    index: 1,
    items: ["thread-b", "thread-a"],
    newIndex: 0,
    previousItems: ["thread-a", "thread-b"],
    previousContainerId: "pinned-threads",
    transition: { duration: 200, easing: "ease" },
    wasDragging: true,
  };

  it("does not replay layout movement after the pointer is released", () => {
    expect(defaultAnimateLayoutChanges(baseArgs)).toBe(true);
    expect(animateSidebarLayoutChanges(baseArgs)).toBe(false);
  });

  it("keeps layout movement while the user is sorting", () => {
    expect(animateSidebarLayoutChanges({ ...baseArgs, isSorting: true })).toBe(true);
  });
});

describe("resolveSidebarThreadSection", () => {
  it("keeps a pinned thread in the pinned shelf", () => {
    expect(resolveSidebarThreadSection({ snoozed: false, settled: false, pinned: true })).toBe(
      "pinned",
    );
  });

  it("ignores snooze while preserving settlement over a stale pin", () => {
    expect(resolveSidebarThreadSection({ snoozed: true, settled: true, pinned: true })).toBe(
      "settled",
    );
    expect(resolveSidebarThreadSection({ snoozed: false, settled: true, pinned: true })).toBe(
      "settled",
    );
    expect(resolveSidebarThreadSection({ snoozed: true, settled: false, pinned: true })).toBe(
      "pinned",
    );
    expect(resolveSidebarThreadSection({ snoozed: true, settled: false, pinned: false })).toBe(
      "active",
    );
  });
});

describe("deleteSelectedThreadEntries", () => {
  const entries = [{ threadKey: "one" }, { threadKey: "two" }, { threadKey: "three" }] as const;
  const success = AsyncResult.success(undefined);
  const failure = AsyncResult.failure(Cause.fail(new Error("Delete failed")));
  const interrupted = AsyncResult.failure(Cause.interrupt());

  it("waits for each delete and excludes only earlier successes from worktree checks", async () => {
    let resolveDelete!: (result: typeof success) => void;
    const pendingDelete = new Promise<typeof success>((resolve) => {
      resolveDelete = resolve;
    });
    const worktreeChecks: { threadKey: string; deletedThreadKeys: string[] }[] = [];
    const deletion = deleteSelectedThreadEntries({
      entries,
      delete: async ({ threadKey }, deletedThreadKeys) => {
        worktreeChecks.push({ threadKey, deletedThreadKeys: [...deletedThreadKeys] });
        return threadKey === "one" ? pendingDelete : success;
      },
    });

    expect(worktreeChecks).toEqual([{ threadKey: "one", deletedThreadKeys: [] }]);
    resolveDelete(success);
    const outcome = await deletion;

    expect(worktreeChecks).toEqual([
      { threadKey: "one", deletedThreadKeys: [] },
      { threadKey: "two", deletedThreadKeys: ["one"] },
      { threadKey: "three", deletedThreadKeys: ["one", "two"] },
    ]);
    expect(outcome).toEqual({
      deletedThreadKeys: new Set(["one", "two", "three"]),
      firstFailure: null,
    });
  });

  it("continues after ordinary failures and keeps the first failure", async () => {
    const laterFailure = AsyncResult.failure(Cause.fail(new Error("Later failure")));
    const deletedKeysAtLastEntry: string[][] = [];
    const outcome = await deleteSelectedThreadEntries({
      entries: [...entries, { threadKey: "four" }],
      delete: async ({ threadKey }, deletedThreadKeys) => {
        if (threadKey === "one") return failure;
        if (threadKey === "three") return laterFailure;
        if (threadKey === "four") deletedKeysAtLastEntry.push([...deletedThreadKeys]);
        return success;
      },
    });

    expect(deletedKeysAtLastEntry).toEqual([["two"]]);
    expect(outcome).toEqual({
      deletedThreadKeys: new Set(["two", "four"]),
      firstFailure: failure,
    });
  });

  it.each([
    { firstResult: success, deletedThreadKeys: new Set(["one"]), firstFailure: null },
    { firstResult: failure, deletedThreadKeys: new Set<string>(), firstFailure: failure },
  ])("stops on interruption and preserves earlier results %#", async (testCase) => {
    const attemptedThreadKeys: string[] = [];
    const outcome = await deleteSelectedThreadEntries({
      entries,
      delete: async ({ threadKey }) => {
        attemptedThreadKeys.push(threadKey);
        return threadKey === "one" ? testCase.firstResult : interrupted;
      },
    });

    expect(attemptedThreadKeys).toEqual(["one", "two"]);
    expect(outcome).toEqual({
      deletedThreadKeys: testCase.deletedThreadKeys,
      firstFailure: testCase.firstFailure,
    });
  });

  it("does not count a skipped entry as deleted", async () => {
    const visibleEntries = new Set(entries.map(({ threadKey }) => threadKey));
    const worktreeChecks: string[][] = [];
    const outcome = await deleteSelectedThreadEntries({
      entries,
      delete: async ({ threadKey }, deletedThreadKeys) => {
        if (!visibleEntries.has(threadKey)) return null;
        worktreeChecks.push([...deletedThreadKeys]);
        visibleEntries.delete("two");
        return success;
      },
    });

    expect(worktreeChecks).toEqual([[], ["one"]]);
    expect(outcome).toEqual({
      deletedThreadKeys: new Set(["one", "three"]),
      firstFailure: null,
    });
  });
});

describe("archiveSelectedThreadEntries", () => {
  const entries = [{ threadKey: "one" }, { threadKey: "two" }, { threadKey: "three" }] as const;
  const success = { _tag: "Success" } as const;
  const failure = { _tag: "Failure" } as const;

  it("records every entry after full success", async () => {
    const outcome = await archiveSelectedThreadEntries({
      entries,
      archive: async (_entry, onArchived) => {
        onArchived();
        return success;
      },
    });

    expect(outcome).toEqual({
      archivedThreadKeys: ["one", "two", "three"],
      mutationFailure: null,
      followupFailures: [],
    });
  });

  it("stops at a mutation failure and retains prior successes", async () => {
    const archive = vi.fn(async (entry: (typeof entries)[number], onArchived: () => void) => {
      if (entry.threadKey === "two") return failure;
      onArchived();
      return success;
    });
    const outcome = await archiveSelectedThreadEntries({ entries, archive });

    expect(archive).toHaveBeenCalledTimes(2);
    expect(outcome).toEqual({
      archivedThreadKeys: ["one"],
      mutationFailure: failure,
      followupFailures: [],
    });
  });

  it("continues after a post-archive failure", async () => {
    const archive = vi.fn(async (entry: (typeof entries)[number], onArchived: () => void) => {
      onArchived();
      return entry.threadKey === "two" ? failure : success;
    });
    const outcome = await archiveSelectedThreadEntries({ entries, archive });

    expect(archive).toHaveBeenCalledTimes(3);
    expect(outcome).toEqual({
      archivedThreadKeys: ["one", "two", "three"],
      mutationFailure: null,
      followupFailures: [failure],
    });
  });
});

describe("buildBulkUnpinContextMenuItem", () => {
  it("counts only the pinned rows of a mixed selection", () => {
    expect(buildBulkUnpinContextMenuItem({ pinnedCount: 2 })).toEqual({
      id: "unpin",
      label: "Unpin (2)",
    });
  });

  it("omits the action when nothing selected is pinned", () => {
    expect(buildBulkUnpinContextMenuItem({ pinnedCount: 0 })).toBeNull();
  });
});

describe("buildBulkTitleRegenerationContextMenuItem", () => {
  it("counts only threads that can start a new regeneration", () => {
    expect(
      buildBulkTitleRegenerationContextMenuItem({
        supportedCount: 4,
        actionableCount: 3,
      }),
    ).toEqual({
      id: "regenerate-title",
      label: "Regenerate titles (3)",
    });
  });

  it("shows a disabled progress item when every supported thread is pending", () => {
    expect(
      buildBulkTitleRegenerationContextMenuItem({
        supportedCount: 2,
        actionableCount: 0,
      }),
    ).toEqual({
      id: "regenerate-title",
      label: "Regenerating… (2)",
      disabled: true,
    });
  });

  it("omits the action when no selected environment supports it", () => {
    expect(
      buildBulkTitleRegenerationContextMenuItem({
        supportedCount: 0,
        actionableCount: 0,
      }),
    ).toBeNull();
  });
});

describe("sidebar thread lineage helpers", () => {
  it("maps an open subagent to its nearest visible ancestor's sidebar row", () => {
    const environmentId = EnvironmentId.make("environment-row");
    const otherEnvironmentId = EnvironmentId.make("environment-other");
    const subagentOf = (id: string, parentId: ThreadId, environment = environmentId) =>
      makeThreadFixture({
        id: ThreadId.make(id),
        environmentId: environment,
        lineage: {
          rootThreadId: parentId,
          parentThreadId: parentId,
          relationshipToParent: "subagent",
        },
      });
    const root = makeThreadFixture({ id: ThreadId.make("thread-root"), environmentId });
    const fork = makeThreadFixture({
      id: ThreadId.make("thread-fork"),
      environmentId,
      lineage: {
        rootThreadId: root.id,
        parentThreadId: root.id,
        relationshipToParent: "fork",
      },
    });
    const child = subagentOf("thread-child", root.id);
    const grandchild = subagentOf("thread-grandchild", child.id);
    const forkChild = subagentOf("thread-fork-child", fork.id);
    const orphan = subagentOf("thread-orphan", ThreadId.make("thread-missing"));
    const elsewhere = subagentOf("thread-elsewhere", root.id, otherEnvironmentId);
    const threads = [root, fork, child, grandchild, forkChild, orphan, elsewhere];

    expect(resolveSidebarRowThreadId(child.id, environmentId, threads)).toBe(root.id);
    expect(resolveSidebarRowThreadId(grandchild.id, environmentId, threads)).toBe(root.id);
    expect(resolveSidebarRowThreadId(forkChild.id, environmentId, threads)).toBe(fork.id);
    expect(resolveSidebarRowThreadId(elsewhere.id, otherEnvironmentId, threads)).toBe(elsewhere.id);
    expect(resolveSidebarRowThreadId(orphan.id, environmentId, threads)).toBe(orphan.id);
    const loopA = subagentOf("thread-loop-a", ThreadId.make("thread-loop-b"));
    const loopB = subagentOf("thread-loop-b", loopA.id);
    expect(resolveSidebarRowThreadId(loopA.id, environmentId, [loopA, loopB])).toBe(loopA.id);
  });

  it("keeps only top-level, unarchived threads in the Sidebar V2 project scope", () => {
    const parentId = ThreadId.make("thread-parent");
    const projectId = ProjectId.make("project-visible");
    const environmentId = EnvironmentId.make("environment-visible");
    const root = makeThreadFixture({
      id: parentId,
      environmentId,
      projectId,
    });
    const subagent = makeThreadFixture({
      id: ThreadId.make("thread-subagent"),
      environmentId,
      projectId,
      lineage: {
        rootThreadId: parentId,
        parentThreadId: parentId,
        relationshipToParent: "subagent",
      },
    });
    const fork = makeThreadFixture({
      id: ThreadId.make("thread-fork"),
      environmentId,
      projectId,
      lineage: {
        rootThreadId: parentId,
        parentThreadId: parentId,
        relationshipToParent: "fork",
      },
    });
    const discussion = presentThreadShell(environmentId, {
      ...root.source,
      id: ThreadId.make("thread-discussion-seat"),
      discussion: {
        discussionId: DiscussionId.make("discussion-1"),
        seatId: DiscussionSeatId.make("seat-1"),
      },
    });
    expect(discussion.discussion).toEqual({ discussionId: "discussion-1", seatId: "seat-1" });
    expect(Object.hasOwn(root, "discussion")).toBe(false);
    const archived = makeThreadFixture({
      id: ThreadId.make("thread-archived"),
      environmentId,
      projectId,
      archivedAt: "2026-01-02T00:00:00.000Z",
    });
    const otherProject = makeThreadFixture({
      id: ThreadId.make("thread-other-project"),
      environmentId,
      projectId: ProjectId.make("project-other"),
    });

    expect(
      filterSidebarV2VisibleThreads(
        [root, subagent, fork, discussion, archived, otherProject],
        new Set([`${environmentId}:${projectId}`]),
      ).map((thread) => thread.id),
    ).toEqual([parentId, fork.id]);
  });
});

function makeLatestRun(overrides?: {
  completedAt?: string | null;
  startedAt?: string | null;
}): NonNullable<Thread["latestRun"]> {
  return {
    runId: "turn-1" as never,
    status: "completed",
    assistantMessageId: null,
    requestedAt: "2026-03-09T10:00:00.000Z",
    startedAt:
      overrides?.startedAt !== undefined ? overrides.startedAt : "2026-03-09T10:00:00.000Z",
    completedAt:
      overrides?.completedAt !== undefined ? overrides.completedAt : "2026-03-09T10:05:00.000Z",
  };
}

describe("hasUnseenCompletion", () => {
  it("returns true when a thread completed after its last visit", () => {
    expect(
      hasUnseenCompletion({
        hasActionableProposedPlan: false,
        hasPendingApprovals: false,
        hasPendingUserInput: false,
        interactionMode: "default",
        latestRun: makeLatestRun(),
        lastVisitedAt: "2026-03-09T10:04:00.000Z",
        runtime: null,
      }),
    ).toBe(true);
  });

  it("treats a missing client visit marker as read", () => {
    expect(
      hasUnseenCompletion({
        hasActionableProposedPlan: false,
        hasPendingApprovals: false,
        hasPendingUserInput: false,
        interactionMode: "default",
        latestRun: makeLatestRun(),
        lastVisitedAt: undefined,
        runtime: null,
      }),
    ).toBe(false);
  });
});

describe("shouldRecedeSidebarThread", () => {
  it.each(["working", "waiting"] as const)(
    "recedes an inactive %s thread even when it is unread and woke",
    (status) => {
      expect(
        shouldRecedeSidebarThread({
          status,
          isUnread: true,
          isWoke: true,
          isActive: false,
          isSelected: false,
        }),
      ).toBe(true);
    },
  );

  it.each(["ready", "approval", "input"] as const)(
    "keeps an unread %s thread prominent",
    (status) => {
      expect(
        shouldRecedeSidebarThread({
          status,
          isUnread: true,
          isWoke: false,
          isActive: false,
          isSelected: false,
        }),
      ).toBe(false);
    },
  );

  it("keeps active and selected working threads prominent", () => {
    const input = {
      status: "working" as const,
      isUnread: true,
      isWoke: true,
      isActive: false,
      isSelected: false,
    };

    expect(shouldRecedeSidebarThread({ ...input, isActive: true })).toBe(false);
    expect(shouldRecedeSidebarThread({ ...input, isSelected: true })).toBe(false);
  });

  it.each([false, true])("keeps input-required threads prominent with unread=%s", (isUnread) => {
    expect(
      shouldRecedeSidebarThread({
        status: "input",
        isUnread,
        isWoke: false,
        isActive: false,
        isSelected: false,
      }),
    ).toBe(false);
  });
});

describe("isTrailingDoubleClick", () => {
  it("treats a single click as a normal activation", () => {
    expect(isTrailingDoubleClick(1)).toBe(false);
  });

  it("treats synthetic/keyboard activations (detail 0) as a normal activation", () => {
    expect(isTrailingDoubleClick(0)).toBe(false);
  });

  it("ignores the second click of a double-click so it does not navigate", () => {
    expect(isTrailingDoubleClick(2)).toBe(true);
  });

  it("ignores further clicks of a triple-click", () => {
    expect(isTrailingDoubleClick(3)).toBe(true);
  });
});

describe("orderItemsByPreferredIds", () => {
  it("keeps preferred ids first, skips stale ids, and preserves the relative order of remaining items", () => {
    const ordered = orderItemsByPreferredIds({
      items: [
        { id: ProjectId.make("project-1"), name: "One" },
        { id: ProjectId.make("project-2"), name: "Two" },
        { id: ProjectId.make("project-3"), name: "Three" },
      ],
      preferredIds: [
        ProjectId.make("project-3"),
        ProjectId.make("project-missing"),
        ProjectId.make("project-1"),
      ],
      getId: (project) => project.id,
    });

    expect(ordered.map((project) => project.id)).toEqual([
      ProjectId.make("project-3"),
      ProjectId.make("project-1"),
      ProjectId.make("project-2"),
    ]);
  });

  it("does not duplicate items when preferred ids repeat", () => {
    const ordered = orderItemsByPreferredIds({
      items: [
        { id: ProjectId.make("project-1"), name: "One" },
        { id: ProjectId.make("project-2"), name: "Two" },
      ],
      preferredIds: [
        ProjectId.make("project-2"),
        ProjectId.make("project-1"),
        ProjectId.make("project-2"),
      ],
      getId: (project) => project.id,
    });

    expect(ordered.map((project) => project.id)).toEqual([
      ProjectId.make("project-2"),
      ProjectId.make("project-1"),
    ]);
  });

  it("honors projectOrder physical keys via getProjectOrderKey", async () => {
    // `projectOrder` is populated with physical keys (envId + cwd-derived)
    // by the store and by drag-end handlers. Readers must identify projects
    // with the same key format, or manual sort silently snaps back.
    const { getProjectOrderKey } = await import("@t3tools/client-runtime/state/project-grouping");
    const projects = [
      {
        environmentId: EnvironmentId.make("environment-local"),
        id: ProjectId.make("id-alpha"),
        workspaceRoot: "/work/alpha",
      },
      {
        environmentId: EnvironmentId.make("environment-local"),
        id: ProjectId.make("id-beta"),
        workspaceRoot: "/work/beta",
      },
      {
        environmentId: EnvironmentId.make("environment-local"),
        id: ProjectId.make("id-gamma"),
        workspaceRoot: "/work/gamma",
      },
    ];
    const ordered = orderItemsByPreferredIds({
      items: projects,
      preferredIds: [getProjectOrderKey(projects[2]!), getProjectOrderKey(projects[0]!)],
      getId: getProjectOrderKey,
    });

    expect(ordered.map((project) => project.workspaceRoot)).toEqual([
      "/work/gamma",
      "/work/alpha",
      "/work/beta",
    ]);
  });

  it("resolves legacy preference aliases without materializing project state", () => {
    const ordered = orderItemsByPreferredIds({
      items: [
        { id: "physical-a", cwd: "/work/a" },
        { id: "physical-b", cwd: "/work/b" },
        { id: "physical-c", cwd: "/work/c" },
      ],
      preferredIds: ["legacy:/work/c", "legacy:/work/a"],
      getId: (project) => project.id,
      getPreferenceIds: (project) => [project.id, `legacy:${project.cwd}`],
    });

    expect(ordered.map((project) => project.id)).toEqual([
      "physical-c",
      "physical-a",
      "physical-b",
    ]);
  });
});

describe("resolveAdjacentThreadId", () => {
  it("resolves adjacent thread ids in ordered sidebar traversal", () => {
    const threads = [
      ThreadId.make("thread-1"),
      ThreadId.make("thread-2"),
      ThreadId.make("thread-3"),
    ];

    expect(
      resolveAdjacentThreadId({
        threadIds: threads,
        currentThreadId: threads[1] ?? null,
        direction: "previous",
      }),
    ).toBe(threads[0]);
    expect(
      resolveAdjacentThreadId({
        threadIds: threads,
        currentThreadId: threads[1] ?? null,
        direction: "next",
      }),
    ).toBe(threads[2]);
    expect(
      resolveAdjacentThreadId({
        threadIds: threads,
        currentThreadId: null,
        direction: "next",
      }),
    ).toBe(threads[0]);
    expect(
      resolveAdjacentThreadId({
        threadIds: threads,
        currentThreadId: null,
        direction: "previous",
      }),
    ).toBe(threads[2]);
    expect(
      resolveAdjacentThreadId({
        threadIds: threads,
        currentThreadId: threads[0] ?? null,
        direction: "previous",
      }),
    ).toBeNull();
  });
});

describe("resolveSidebarThreadStatus", () => {
  const runtime = {
    status: "running" as const,
    activeRunId: null,
    providerInstanceId: ProviderInstanceId.make("codex"),
    providerName: "Codex",
    lastError: null,
    updatedAt: "2026-03-09T10:00:00.000Z",
  };

  const idle = { hasPendingApprovals: false, hasPendingUserInput: false, runtime: null };

  it("prioritizes approval over a running runtime", () => {
    expect(resolveSidebarThreadStatus({ ...idle, hasPendingApprovals: true, runtime })).toBe(
      "approval",
    );
  });

  it("prioritizes awaiting input over a running runtime, below approval", () => {
    expect(resolveSidebarThreadStatus({ ...idle, hasPendingUserInput: true, runtime })).toBe(
      "input",
    );
    expect(
      resolveSidebarThreadStatus({
        ...idle,
        hasPendingApprovals: true,
        hasPendingUserInput: true,
        runtime,
      }),
    ).toBe("approval");
  });

  it("reports working for running and starting runtimes", () => {
    expect(resolveSidebarThreadStatus({ ...idle, runtime })).toBe("working");
    expect(
      resolveSidebarThreadStatus({
        ...idle,
        runtime: { ...runtime, status: "starting" as const },
      }),
    ).toBe("working");
  });

  it("keeps usage-limit stops Limited and visible until the thread recovers", () => {
    const limited = {
      ...runtime,
      status: "failed" as const,
      lastError: "Plan limit reached",
      lastErrorClass: "usage_limit" as const,
    };
    expect(resolveSidebarThreadStatus({ ...idle, runtime: limited })).toBe("limited");
    expect(
      resolveSidebarThreadStatus({ ...idle, runtime: { ...limited, status: "running" } }),
    ).toBe("working");
    expect(
      resolveSidebarThreadStatus({ ...idle, runtime: { ...limited, status: "completed" } }),
    ).toBe("ready");
    expect(
      shouldRecedeSidebarThread({
        status: "limited",
        isUnread: false,
        isWoke: false,
        isActive: false,
        isSelected: false,
      }),
    ).toBe(false);
  });

  it("reports failed only while the latest run failed", () => {
    expect(
      resolveSidebarThreadStatus({
        ...idle,
        runtime: { ...runtime, status: "failed" as const, lastError: "boom" },
      }),
    ).toBe("failed");
    expect(
      resolveSidebarThreadStatus({
        ...idle,
        runtime: { ...runtime, status: "completed" as const, lastError: "persisted" },
      }),
    ).toBe("ready");
    expect(
      resolveSidebarThreadStatus({
        ...idle,
        runtime: { ...runtime, status: "idle" as const, lastError: "persisted" },
      }),
    ).toBe("waiting");
  });

  it("defaults to ready with no runtime", () => {
    expect(resolveSidebarThreadStatus(idle)).toBe("ready");
  });

  it("keeps a waiting runtime visible ahead of unread and woke presentation", () => {
    expect(resolveSidebarV2TopStatus({ status: "waiting", isUnread: true, isWoke: true })).toBe(
      "waiting",
    );
  });
});

describe("pullRequestMatchesSearchQuery", () => {
  const branchPullRequest = {
    projectId: ProjectId.make("project"),
    repository: "pingdotgg/t3code",
    number: 123,
    url: "https://github.com/pingdotgg/t3code/pull/123",
  };

  it("matches when every query token appears in the PR's terms", () => {
    expect(pullRequestMatchesSearchQuery({ branchPullRequest }, "123")).toBe(true);
    expect(pullRequestMatchesSearchQuery({ branchPullRequest }, "pingdotgg/t3code #123")).toBe(
      true,
    );
  });

  it("rejects queries with a token the PR does not carry, and blank queries", () => {
    expect(pullRequestMatchesSearchQuery({ branchPullRequest }, "rebase 123")).toBe(false);
    expect(pullRequestMatchesSearchQuery({ branchPullRequest }, "   ")).toBe(false);
  });
});

describe("searchSidebarThreads", () => {
  const searchThread = (id: string, title: string, latestUserMessageAt: string) => ({
    environmentId: localEnvironmentId,
    id: ThreadId.make(id),
    title,
    branch: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: latestUserMessageAt,
    latestUserMessageAt,
    opens: null,
  });
  const threads = [
    searchThread("thread-1", "Fix workspace search", "2026-10-20T00:00:00.000Z"),
    searchThread("thread-2", "Review providers", "2026-10-22T00:00:00.000Z"),
    searchThread("thread-3", "WORKTREE cleanup", "2026-09-01T00:00:00.000Z"),
    searchThread("thread-4", "Homework notes", "2026-10-22T00:00:00.000Z"),
  ];
  const now = Date.parse("2026-10-23T00:00:00.000Z");
  const contentKeys = (...ids: ReadonlyArray<string>) =>
    new Set(
      ids.map((id) =>
        threadSearchMatchKey({ environmentId: localEnvironmentId, threadId: ThreadId.make(id) }),
      ),
    );

  it("matches thread titles case-insensitively in relevance order", () => {
    expect(searchSidebarThreads(threads, "WORK", new Set(), now)).toEqual({
      titleMatches: [threads[0], threads[2], threads[3]],
      contentMatches: [],
    });
  });

  it("does not match project metadata", () => {
    const withProjects = threads.map((thread) => ({ ...thread, projectTitle: "workspace" }));
    expect(searchSidebarThreads(withProjects, "workspace", new Set(), now)).toEqual({
      titleMatches: [withProjects[0]],
      contentMatches: [],
    });
  });

  it("returns no results for an empty query", () => {
    expect(searchSidebarThreads(threads, "   ", contentKeys("thread-2"), now)).toEqual({
      titleMatches: [],
      contentMatches: [],
    });
  });

  it("appends content-only matches after every title match", () => {
    expect(searchSidebarThreads(threads, "work", contentKeys("thread-2"), now)).toEqual({
      titleMatches: [threads[0], threads[2], threads[3]],
      contentMatches: [threads[1]],
    });
  });

  it("lists a thread matching both title and content once", () => {
    expect(searchSidebarThreads(threads, "work", contentKeys("thread-1"), now)).toEqual({
      titleMatches: [threads[0], threads[2], threads[3]],
      contentMatches: [],
    });
  });

  it("ignores content matches for threads outside the sidebar collection", () => {
    expect(searchSidebarThreads(threads, "work", contentKeys("thread-missing"), now)).toEqual({
      titleMatches: [threads[0], threads[2], threads[3]],
      contentMatches: [],
    });
  });

  it("ranks word matches by recent use, then lists message matches once", () => {
    expect(searchSidebarThreads(threads, "work", contentKeys("thread-1", "thread-2"), now)).toEqual(
      {
        titleMatches: [threads[0], threads[2], threads[3]],
        contentMatches: [threads[1]],
      },
    );
  });
});

describe("filterSidebarProjectScopeItems", () => {
  const items = [
    { value: "all", label: "Today" },
    { value: "alpha", label: "Alpha workspace" },
    { value: "beta", label: "Beta tools" },
  ] as const;
  const filter = (query: string) =>
    filterSidebarProjectScopeItems({
      items,
      query,
      matches: (item, candidate) =>
        item.label.toLocaleLowerCase().includes(candidate.toLocaleLowerCase()),
    });

  it("shows the default row first while the query is empty", () => {
    expect(filter("")).toEqual(items);
    expect(filter("   ")).toEqual(items);
  });

  it("hides the default row while filtering", () => {
    expect(filter("today")).toEqual([]);
  });

  it("returns matching projects in source order and supports no-match results", () => {
    expect(filter("WORK")).toEqual([items[1]]);
    expect(filter("missing")).toEqual([]);
  });
});

describe("resolveWorkingStartedAt", () => {
  const runtime = {
    status: "running" as const,
    providerName: "Codex",
    providerInstanceId: ProviderInstanceId.make("codex"),
    activeRunId: RunId.make("turn-1"),
    lastError: null,
    updatedAt: "2026-03-09T10:02:00.000Z",
  };

  it("uses the running run's start time", () => {
    expect(
      resolveWorkingStartedAt({
        latestRun: makeLatestRun({ completedAt: null }),
        runtime,
      }),
    ).toBe("2026-03-09T10:00:00.000Z");
  });

  it("uses the request time while a run awaits adoption", () => {
    expect(
      resolveWorkingStartedAt({
        latestRun: makeLatestRun({ startedAt: null, completedAt: null }),
        runtime,
      }),
    ).toBe("2026-03-09T10:00:00.000Z");
  });

  it("does not invent a start from activity updates when the newest run completed", () => {
    expect(
      resolveWorkingStartedAt({
        latestRun: makeLatestRun(),
        runtime,
      }),
    ).toBeNull();
  });

  it("skips a malformed startedAt instead of returning it", () => {
    expect(
      resolveWorkingStartedAt({
        latestRun: makeLatestRun({ startedAt: "not-a-date", completedAt: null }),
        runtime,
      }),
    ).toBe("2026-03-09T10:00:00.000Z");
  });

  it.each(["queued", "cancelled"] as const)(
    "shares the detail timer when a newer run is %s",
    (status) => {
      const activityStartedAt = "2026-03-09T10:00:00.000Z";
      const latestRun = {
        ...makeLatestRun(),
        runId: RunId.make("newer-run"),
        status,
        startedAt: null,
        completedAt: status === "queued" ? null : "2026-03-09T10:05:00.000Z",
      };
      for (const updatedAt of ["2026-03-09T10:30:00.000Z", "2026-03-09T10:50:00.000Z"]) {
        const activeRuntime = { ...runtime, updatedAt, activityStartedAt };
        expect(resolveWorkingStartedAt({ latestRun, runtime: activeRuntime })).toBe(
          activityStartedAt,
        );
        expect(deriveActiveWorkStartedAt(latestRun, activeRuntime, updatedAt)).toBe(
          activityStartedAt,
        );
      }
      // A server-owned run without a valid start must not borrow a local dispatch clock.
      expect(
        deriveActiveWorkStartedAt(
          latestRun,
          { ...runtime, activityStartedAt: null },
          "2026-03-09T10:50:00.000Z",
        ),
      ).toBeNull();
    },
  );

  it("returns null with neither a running run nor a runtime", () => {
    expect(resolveWorkingStartedAt({ latestRun: null, runtime: null })).toBeNull();
  });
});

describe("formatWorkingDurationLabel", () => {
  it("formats seconds, minutes, and hours", () => {
    expect(formatWorkingDurationLabel(0)).toBe("0s");
    expect(formatWorkingDurationLabel(42_000)).toBe("42s");
    expect(formatWorkingDurationLabel(5 * 60_000)).toBe("5m");
    expect(formatWorkingDurationLabel(90 * 60_000)).toBe("1h 30m");
  });

  it("clamps negative and non-finite elapsed values to zero", () => {
    expect(formatWorkingDurationLabel(-5_000)).toBe("0s");
    expect(formatWorkingDurationLabel(Number.NaN)).toBe("0s");
  });
});

describe("resolveThreadStatusPill", () => {
  it("drops the failed pill once the failure has been seen", () => {
    expect(
      resolveThreadStatusPill({
        thread: {
          ...baseThread,
          interactionMode: "default",
          latestRun: { ...makeLatestRun(), status: "failed" },
          lastVisitedAt: "2026-03-09T10:06:00.000Z",
          runtime: { ...baseThread.runtime, status: "failed", activeRunId: null },
        },
      }),
    ).toBeNull();
  });

  it("shows failed, not plan ready, when a plan run proposed a plan and then failed", () => {
    expect(
      resolveThreadStatusPill({
        thread: {
          ...baseThread,
          hasActionableProposedPlan: true,
          latestRun: { ...makeLatestRun(), status: "failed" },
          lastVisitedAt: "2026-03-09T10:04:00.000Z",
          runtime: { ...baseThread.runtime, status: "failed", activeRunId: null },
        },
      }),
    ).toMatchObject({ label: "Failed" });
  });

  it("shows failed, not completed, when the unseen run failed", () => {
    expect(
      resolveThreadStatusPill({
        thread: {
          ...baseThread,
          interactionMode: "default",
          latestRun: { ...makeLatestRun(), status: "failed" },
          lastVisitedAt: "2026-03-09T10:04:00.000Z",
          runtime: {
            ...baseThread.runtime,
            status: "failed",
            activeRunId: null,
            lastError: "Provider turn failed.",
          },
        },
      }),
    ).toMatchObject({ label: "Failed", pulse: false });
  });

  it("shows an active thread wait without a pulse and resumes Working when it ends", () => {
    const blocked = { ...baseThread, blockedOnThreadWait: true };
    expect(resolveSidebarThreadStatus(blocked)).toBe("waiting");
    expect(resolveThreadStatusPill({ thread: blocked })).toMatchObject({
      label: "Waiting",
      pulse: false,
    });

    const resumed = { ...blocked, blockedOnThreadWait: false };
    expect(resolveSidebarThreadStatus(resumed)).toBe("working");
    expect(resolveThreadStatusPill({ thread: resumed })).toMatchObject({
      label: "Working",
      pulse: true,
    });
  });

  const baseThread = {
    hasActionableProposedPlan: false,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    interactionMode: "plan" as const,
    latestRun: null,
    lastVisitedAt: undefined,
    runtime: {
      status: "running" as const,
      providerName: "Codex",
      providerInstanceId: ProviderInstanceId.make("codex"),
      activeRunId: "turn-1" as never,
      lastError: null,
      updatedAt: "2026-03-09T10:00:00.000Z",
    },
  };

  it("shows pending approval before all other statuses", () => {
    expect(
      resolveThreadStatusPill({
        thread: {
          ...baseThread,
          hasPendingApprovals: true,
          hasPendingUserInput: true,
        },
      }),
    ).toMatchObject({ label: "Pending Approval", pulse: false });
  });

  it("shows awaiting input when plan mode is blocked on user answers", () => {
    expect(
      resolveThreadStatusPill({
        thread: {
          ...baseThread,
          hasPendingUserInput: true,
        },
      }),
    ).toMatchObject({ label: "Awaiting Input", pulse: false });
  });

  it("falls back to working when the thread is actively running without blockers", () => {
    expect(
      resolveThreadStatusPill({
        thread: baseThread,
      }),
    ).toMatchObject({ label: "Working", pulse: true });
  });

  it("shows waiting for an idle thread with pending background tasks", () => {
    expect(
      resolveThreadStatusPill({
        thread: {
          ...baseThread,
          pendingBackgroundTasks: [
            { taskId: "bg-1", description: "Watch build", kind: "monitor", awaited: true },
          ],
          runtime: {
            ...baseThread.runtime,
            status: "idle",
            activeRunId: null,
          },
        },
      }),
    ).toMatchObject({
      label: "Waiting",
      colorClass: "text-sidebar-muted-foreground",
      dotClass: "bg-sidebar-muted-foreground",
      pulse: false,
    });
  });

  it("keeps an active turn working when background tasks are also present", () => {
    expect(
      resolveThreadStatusPill({
        thread: {
          ...baseThread,
          pendingBackgroundTasks: [{ taskId: "bg-1", description: "sleep 20", kind: "command" }],
        },
      }),
    ).toMatchObject({ label: "Working", pulse: true });
  });

  it("does not show waiting after the background task roster clears", () => {
    expect(
      resolveThreadStatusPill({
        thread: {
          ...baseThread,
          pendingBackgroundTasks: [],
          runtime: {
            ...baseThread.runtime,
            status: "idle",
            activeRunId: null,
          },
        },
      }),
    ).toBeNull();
  });

  it("shows plan ready when a settled plan turn has a proposed plan ready for follow-up", () => {
    expect(
      resolveThreadStatusPill({
        thread: {
          ...baseThread,
          hasActionableProposedPlan: true,
          latestRun: makeLatestRun(),
          runtime: {
            ...baseThread.runtime,
            status: "completed",
            activeRunId: null,
          },
        },
      }),
    ).toMatchObject({ label: "Plan Ready", pulse: false });
  });

  it("does not manufacture completed state without a client visit marker", () => {
    expect(
      resolveThreadStatusPill({
        thread: {
          ...baseThread,
          latestRun: makeLatestRun(),
          runtime: {
            ...baseThread.runtime,
            status: "completed",
            activeRunId: null,
          },
        },
      }),
    ).toBeNull();
  });

  it("shows completed when there is an unseen completion and no active blocker", () => {
    expect(
      resolveThreadStatusPill({
        thread: {
          ...baseThread,
          interactionMode: "default",
          latestRun: makeLatestRun(),
          lastVisitedAt: "2026-03-09T10:04:00.000Z",
          runtime: {
            ...baseThread.runtime,
            status: "completed",
            activeRunId: null,
          },
        },
      }),
    ).toMatchObject({ label: "Completed", pulse: false });
  });
});

describe("resolveProjectStatusIndicator", () => {
  it("returns null when no threads have a notable status", () => {
    expect(resolveProjectStatusIndicator([null, null])).toBeNull();
  });

  it("surfaces the highest-priority actionable state across project threads", () => {
    expect(
      resolveProjectStatusIndicator([
        {
          label: "Completed",
          colorClass: "text-emerald-600",
          dotClass: "bg-emerald-500",
          pulse: false,
        },
        {
          label: "Pending Approval",
          colorClass: "text-amber-600",
          dotClass: "bg-amber-500",
          pulse: false,
        },
        {
          label: "Working",
          colorClass: "text-sky-600",
          dotClass: "bg-sky-500",
          pulse: true,
        },
      ]),
    ).toMatchObject({ label: "Pending Approval", dotClass: "bg-amber-500" });
  });

  it("prefers plan-ready over completed when no stronger action is needed", () => {
    expect(
      resolveProjectStatusIndicator([
        {
          label: "Completed",
          colorClass: "text-emerald-600",
          dotClass: "bg-emerald-500",
          pulse: false,
        },
        {
          label: "Plan Ready",
          colorClass: "text-violet-600",
          dotClass: "bg-violet-500",
          pulse: false,
        },
      ]),
    ).toMatchObject({ label: "Plan Ready", dotClass: "bg-violet-500" });
  });

  it("ranks waiting below active work and above plan-ready", () => {
    const waiting = {
      label: "Waiting" as const,
      colorClass: "text-sidebar-muted-foreground",
      dotClass: "bg-sidebar-muted-foreground",
      pulse: false,
    };

    expect(
      resolveProjectStatusIndicator([
        waiting,
        {
          label: "Working",
          colorClass: "text-sky-600",
          dotClass: "bg-sky-500",
          pulse: true,
        },
      ]),
    ).toMatchObject({ label: "Working" });
    expect(
      resolveProjectStatusIndicator([
        {
          label: "Plan Ready",
          colorClass: "text-violet-600",
          dotClass: "bg-violet-500",
          pulse: false,
        },
        waiting,
      ]),
    ).toMatchObject({ label: "Waiting" });
  });
});

function makeProject(overrides: Partial<Project> = {}): Project {
  const { defaultModelSelection, ...rest } = overrides;
  return {
    id: ProjectId.make("project-1"),
    environmentId: localEnvironmentId,
    title: "Project",
    workspaceRoot: "/tmp/project",
    repositoryIdentity: null,
    defaultModelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.4",
      ...defaultModelSelection,
    },
    createdAt: "2026-03-09T10:00:00.000Z",
    updatedAt: "2026-03-09T10:00:00.000Z",
    scripts: [],
    ...rest,
  };
}

function makeThread(overrides: ThreadFixtureOverrides = {}): Thread {
  return makeThreadFixture({
    id: ThreadId.make("thread-1"),
    environmentId: localEnvironmentId,
    projectId: ProjectId.make("project-1"),
    title: "Thread",
    modelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.4",
      ...overrides?.modelSelection,
    },
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_INTERACTION_MODE,
    runtime: null,
    messages: [],
    proposedPlans: [],
    createdAt: "2026-03-09T10:00:00.000Z",
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    deletedAt: null,
    updatedAt: "2026-03-09T10:00:00.000Z",
    latestRun: null,
    branch: null,
    worktreePath: null,
    ...overrides,
  });
}

describe("getFallbackThreadIdAfterDelete", () => {
  it("returns the top remaining thread in the deleted thread's project sidebar order", () => {
    const fallbackThreadId = getFallbackThreadIdAfterDelete({
      threads: [
        makeThread({
          id: ThreadId.make("thread-oldest"),
          projectId: ProjectId.make("project-1"),
          createdAt: "2026-03-09T10:00:00.000Z",
          messages: [],
        }),
        makeThread({
          id: ThreadId.make("thread-active"),
          projectId: ProjectId.make("project-1"),
          createdAt: "2026-03-09T10:05:00.000Z",
          messages: [],
        }),
        makeThread({
          id: ThreadId.make("thread-newest"),
          projectId: ProjectId.make("project-1"),
          createdAt: "2026-03-09T10:10:00.000Z",
          messages: [],
        }),
        makeThread({
          id: ThreadId.make("thread-other-project"),
          projectId: ProjectId.make("project-2"),
          createdAt: "2026-03-09T10:20:00.000Z",
          messages: [],
        }),
      ],
      deletedThreadId: ThreadId.make("thread-active"),
      sortOrder: "created_at",
    });

    expect(fallbackThreadId).toBe(ThreadId.make("thread-newest"));
  });

  it("skips other threads being deleted in the same action", () => {
    const fallbackThreadId = getFallbackThreadIdAfterDelete({
      threads: [
        makeThread({
          id: ThreadId.make("thread-active"),
          projectId: ProjectId.make("project-1"),
          createdAt: "2026-03-09T10:05:00.000Z",
          messages: [],
        }),
        makeThread({
          id: ThreadId.make("thread-newest"),
          projectId: ProjectId.make("project-1"),
          createdAt: "2026-03-09T10:10:00.000Z",
          messages: [],
        }),
        makeThread({
          id: ThreadId.make("thread-next"),
          projectId: ProjectId.make("project-1"),
          createdAt: "2026-03-09T10:07:00.000Z",
          messages: [],
        }),
      ],
      deletedThreadId: ThreadId.make("thread-active"),
      deletedThreadIds: new Set([ThreadId.make("thread-active"), ThreadId.make("thread-newest")]),
      sortOrder: "created_at",
    });

    expect(fallbackThreadId).toBe(ThreadId.make("thread-next"));
  });
});
describe("sortProjectsForSidebar", () => {
  it("sorts projects by the most recent user message across their threads", () => {
    const projects = [
      makeProject({ id: ProjectId.make("project-1"), title: "Older project" }),
      makeProject({ id: ProjectId.make("project-2"), title: "Newer project" }),
    ];
    const threads = [
      makeThread({
        projectId: ProjectId.make("project-1"),
        updatedAt: "2026-03-09T10:20:00.000Z",
        messages: [
          {
            id: "message-1" as never,
            role: "user",
            text: "older project user message",
            runId: null,
            createdAt: "2026-03-09T10:01:00.000Z",
            updatedAt: "2026-03-09T10:01:00.000Z",
            streaming: false,
          },
        ],
      }),
      makeThread({
        id: ThreadId.make("thread-2"),
        projectId: ProjectId.make("project-2"),
        updatedAt: "2026-03-09T10:05:00.000Z",
        messages: [
          {
            id: "message-2" as never,
            role: "user",
            text: "newer project user message",
            runId: null,
            createdAt: "2026-03-09T10:05:00.000Z",
            updatedAt: "2026-03-09T10:05:00.000Z",
            streaming: false,
          },
        ],
      }),
    ];

    const sorted = sortProjectsForSidebar(projects, threads, "updated_at");

    expect(sorted.map((project) => project.id)).toEqual([
      ProjectId.make("project-2"),
      ProjectId.make("project-1"),
    ]);
  });

  it("falls back to project timestamps when a project has no threads", () => {
    const sorted = sortProjectsForSidebar(
      [
        makeProject({
          id: ProjectId.make("project-1"),
          title: "Older project",
          updatedAt: "2026-03-09T10:01:00.000Z",
        }),
        makeProject({
          id: ProjectId.make("project-2"),
          title: "Newer project",
          updatedAt: "2026-03-09T10:05:00.000Z",
        }),
      ],
      [],
      "updated_at",
    );

    expect(sorted.map((project) => project.id)).toEqual([
      ProjectId.make("project-2"),
      ProjectId.make("project-1"),
    ]);
  });

  it("falls back to name and id ordering when projects have no sortable timestamps", () => {
    const sorted = sortProjectsForSidebar(
      [
        makeProject({
          id: ProjectId.make("project-2"),
          title: "Beta",
          createdAt: "invalid-created-at" as never,
          updatedAt: "invalid-updated-at" as never,
        }),
        makeProject({
          id: ProjectId.make("project-1"),
          title: "Alpha",
          createdAt: "invalid-created-at" as never,
          updatedAt: "invalid-updated-at" as never,
        }),
      ],
      [],
      "updated_at",
    );

    expect(sorted.map((project) => project.id)).toEqual([
      ProjectId.make("project-1"),
      ProjectId.make("project-2"),
    ]);
  });

  it("preserves manual project ordering", () => {
    const projects = [
      makeProject({ id: ProjectId.make("project-2"), title: "Second" }),
      makeProject({ id: ProjectId.make("project-1"), title: "First" }),
    ];

    const sorted = sortProjectsForSidebar(projects, [], "manual");

    expect(sorted.map((project) => project.id)).toEqual([
      ProjectId.make("project-2"),
      ProjectId.make("project-1"),
    ]);
  });

  it("ignores archived threads when sorting projects", () => {
    const sorted = sortProjectsForSidebar(
      [
        makeProject({
          id: ProjectId.make("project-1"),
          title: "Visible project",
          updatedAt: "2026-03-09T10:01:00.000Z",
        }),
        makeProject({
          id: ProjectId.make("project-2"),
          title: "Archived-only project",
          updatedAt: "2026-03-09T10:00:00.000Z",
        }),
      ],
      [
        makeThread({
          id: ThreadId.make("thread-visible"),
          projectId: ProjectId.make("project-1"),
          updatedAt: "2026-03-09T10:02:00.000Z",
          archivedAt: null,
        }),
        makeThread({
          id: ThreadId.make("thread-archived"),
          projectId: ProjectId.make("project-2"),
          updatedAt: "2026-03-09T10:10:00.000Z",
          archivedAt: "2026-03-09T10:11:00.000Z",
        }),
      ].filter((thread) => thread.archivedAt === null),
      "updated_at",
    );

    expect(sorted.map((project) => project.id)).toEqual([
      ProjectId.make("project-1"),
      ProjectId.make("project-2"),
    ]);
  });
});

describe("sortScopedProjectsForSidebar", () => {
  it("keeps identical project ids in different environments separate", () => {
    const remoteEnvironmentId = EnvironmentId.make("environment-remote");
    const sharedProjectId = ProjectId.make("shared-project");
    const projects = [
      makeProject({
        environmentId: localEnvironmentId,
        id: sharedProjectId,
        title: "Local project",
      }),
      makeProject({
        environmentId: remoteEnvironmentId,
        id: sharedProjectId,
        title: "Remote project",
      }),
    ];
    const threads = [
      makeThread({
        environmentId: localEnvironmentId,
        projectId: sharedProjectId,
        updatedAt: "2026-03-09T10:02:00.000Z",
      }),
      makeThread({
        environmentId: remoteEnvironmentId,
        projectId: sharedProjectId,
        updatedAt: "2026-03-09T10:10:00.000Z",
      }),
    ];

    const sorted = sortScopedProjectsForSidebar(projects, threads, "updated_at");

    expect(sorted.map((project) => project.title)).toEqual(["Remote project", "Local project"]);
  });

  it("does not use archived threads as project activity", () => {
    const projects = [
      makeProject({
        id: ProjectId.make("project-visible"),
        title: "Visible project",
        updatedAt: "2026-03-09T10:01:00.000Z",
      }),
      makeProject({
        id: ProjectId.make("project-archived"),
        title: "Archived-only project",
        updatedAt: "2026-03-09T10:00:00.000Z",
      }),
    ];
    const threads = [
      makeThread({
        id: ThreadId.make("thread-visible"),
        projectId: ProjectId.make("project-visible"),
        updatedAt: "2026-03-09T10:02:00.000Z",
      }),
      makeThread({
        id: ThreadId.make("thread-archived"),
        projectId: ProjectId.make("project-archived"),
        updatedAt: "2026-03-09T10:10:00.000Z",
        archivedAt: "2026-03-09T10:11:00.000Z",
      }),
    ];

    const sorted = sortScopedProjectsForSidebar(projects, threads, "updated_at");

    expect(sorted.map((project) => project.title)).toEqual([
      "Visible project",
      "Archived-only project",
    ]);
  });
});

describe("sortLogicalProjectsForSidebar", () => {
  it("uses saved order only in manual mode and activity order otherwise", () => {
    const olderProjectId = ProjectId.make("project-older");
    const newerProjectId = ProjectId.make("project-newer");
    const projects = [
      {
        ...makeProject({ id: olderProjectId, title: "Older project" }),
        projectKey: "logical-older",
        memberProjectRefs: [{ environmentId: localEnvironmentId, projectId: olderProjectId }],
      },
      {
        ...makeProject({ id: newerProjectId, title: "Newer project" }),
        projectKey: "logical-newer",
        memberProjectRefs: [{ environmentId: localEnvironmentId, projectId: newerProjectId }],
      },
    ];
    const threads = [
      makeThread({
        projectId: olderProjectId,
        updatedAt: "2026-03-09T10:01:00.000Z",
      }),
      makeThread({
        id: ThreadId.make("thread-newer"),
        projectId: newerProjectId,
        updatedAt: "2026-03-09T10:05:00.000Z",
      }),
    ];

    expect(sortLogicalProjectsForSidebar(projects, threads, "manual")).toEqual(projects);
    expect(
      sortLogicalProjectsForSidebar(projects, threads, "updated_at").map(
        (project) => project.projectKey,
      ),
    ).toEqual(["logical-newer", "logical-older"]);
  });
});

describe("sortSidebarV2ProjectGroups", () => {
  it("does not let a hidden subagent thread reorder projects", () => {
    const olderProjectId = ProjectId.make("project-older");
    const newerProjectId = ProjectId.make("project-newer");
    const olderRootThreadId = ThreadId.make("thread-older-root");
    const projects = [
      {
        ...makeProject({ id: olderProjectId, title: "A older project" }),
        projectKey: "logical-older",
        memberProjectRefs: [{ environmentId: localEnvironmentId, projectId: olderProjectId }],
      },
      {
        ...makeProject({ id: newerProjectId, title: "Z newer project" }),
        projectKey: "logical-newer",
        memberProjectRefs: [{ environmentId: localEnvironmentId, projectId: newerProjectId }],
      },
    ];
    const threads = [
      makeThread({
        id: olderRootThreadId,
        projectId: olderProjectId,
        updatedAt: "2026-03-09T10:01:00.000Z",
      }),
      makeThread({
        id: ThreadId.make("thread-newer-root"),
        projectId: newerProjectId,
        updatedAt: "2026-03-09T10:05:00.000Z",
      }),
      makeThread({
        id: ThreadId.make("thread-hidden-subagent"),
        projectId: olderProjectId,
        updatedAt: "2026-03-09T10:10:00.000Z",
        lineage: {
          rootThreadId: olderRootThreadId,
          parentThreadId: olderRootThreadId,
          relationshipToParent: "subagent",
        },
      }),
    ];

    expect(
      sortSidebarV2ProjectGroups(projects, threads, "updated_at", new Set()).map(
        (project) => project.projectKey,
      ),
    ).toEqual(["logical-newer", "logical-older"]);
  });
});

describe("resolveThreadLastVisitedAt", () => {
  it("uses the local watermark when the server does not track visits", () => {
    expect(resolveThreadLastVisitedAt(undefined, "2026-07-30T10:00:00.000Z")).toBe(
      "2026-07-30T10:00:00.000Z",
    );
    expect(resolveThreadLastVisitedAt(undefined, undefined)).toBeUndefined();
  });

  it("keeps the server watermark authoritative when visited tracking exists", () => {
    // A rewound server value (mark-unread) must win even over a newer local
    // watermark left behind by earlier viewing on this device.
    expect(resolveThreadLastVisitedAt("2026-07-30T10:00:00.000Z", "2026-07-30T10:00:05.000Z")).toBe(
      "2026-07-30T10:00:00.000Z",
    );
    expect(resolveThreadLastVisitedAt("2026-07-30T10:00:00.000Z", undefined)).toBe(
      "2026-07-30T10:00:00.000Z",
    );
  });

  it("treats an explicit server-side null as never visited", () => {
    expect(resolveThreadLastVisitedAt(null, "2026-07-30T10:00:00.000Z")).toBeUndefined();
  });
});

describe("pinOrderKeyBetween", () => {
  it("produces keys that sort between their bounds", () => {
    const middle = pinOrderKeyBetween(null, null)!;
    const top = pinOrderKeyBetween(null, middle)!;
    const bottom = pinOrderKeyBetween(middle, null)!;
    expect(top < middle).toBe(true);
    expect(middle < bottom).toBe(true);

    const between = pinOrderKeyBetween(top, middle)!;
    expect(top < between && between < middle).toBe(true);
  });

  it("extends into new digits when bounds are adjacent", () => {
    const key = pinOrderKeyBetween("g", "h")!;
    expect("g" < key && key < "h").toBe(true);
  });

  it("stays strictly ordered under repeated top insertion", () => {
    // Every new pin lands at the head of the arranged run; keys must keep
    // sorting before the previous head without ever bottoming out.
    let head: string | null = null;
    const keys: string[] = [];
    for (let i = 0; i < 100; i += 1) {
      const key: string = pinOrderKeyBetween(null, head)!;
      expect(key).not.toBeNull();
      if (head !== null) expect(key < head).toBe(true);
      keys.push(key);
      head = key;
    }
    expect(new Set(keys).size).toBe(100);
  });

  it("stays strictly ordered under repeated middle insertion", () => {
    let low = pinOrderKeyBetween(null, null)!;
    let high = pinOrderKeyBetween(low, null)!;
    for (let i = 0; i < 100; i += 1) {
      const key: string = pinOrderKeyBetween(low, high)!;
      expect(low < key && key < high).toBe(true);
      if (i % 2 === 0) low = key;
      else high = key;
    }
  });

  it("returns null for corrupt or out-of-order bounds instead of throwing", () => {
    expect(pinOrderKeyBetween("z", "a")).toBeNull();
    expect(pinOrderKeyBetween("A!", null)).toBeNull();
    expect(pinOrderKeyBetween(null, "ma")).toBeNull();
    expect(pinOrderKeyBetween("m", "m")).toBeNull();
  });
});

describe("sortPinnedThreadsForSidebar", () => {
  const pinnable = (input: { id: string; createdAt: string; pinOrderKey?: string | null }) => ({
    id: input.id,
    createdAt: input.createdAt,
    pinOrderKey: input.pinOrderKey ?? null,
  });

  it("sorts keyed threads by key ahead of keyless threads in creation order", () => {
    const sorted = sortPinnedThreadsForSidebar([
      pinnable({ id: "keyless-old", createdAt: "2026-03-09T08:00:00.000Z" }),
      pinnable({ id: "second", createdAt: "2026-03-09T09:00:00.000Z", pinOrderKey: "t" }),
      pinnable({ id: "keyless-new", createdAt: "2026-03-09T12:00:00.000Z" }),
      pinnable({ id: "first", createdAt: "2026-03-09T07:00:00.000Z", pinOrderKey: "g" }),
    ]);

    expect(sorted.map((thread) => thread.id)).toEqual([
      "first",
      "second",
      "keyless-new",
      "keyless-old",
    ]);
  });

  it("breaks equal keys by id so raced writes render identically everywhere", () => {
    const sorted = sortPinnedThreadsForSidebar([
      pinnable({ id: "b", createdAt: "2026-03-09T10:00:00.000Z", pinOrderKey: "m" }),
      pinnable({ id: "a", createdAt: "2026-03-09T11:00:00.000Z", pinOrderKey: "m" }),
    ]);

    expect(sorted.map((thread) => thread.id)).toEqual(["a", "b"]);
  });
});

describe("resolveSidebarSweepKeys", () => {
  it.each([
    { origin: "a", expected: ["a", "b", "c"] },
    { origin: "b", expected: ["b", "c"] },
  ])("sweeps mixed ordinary and pinned Today rows from $origin", ({ origin, expected }) => {
    const sections = new Map<string, SidebarSection>([
      ["a", "active"],
      ["b", "pinned"],
      ["c", "active"],
    ]);
    const scopes = sidebarSweepScopes(sections, "waiting", ["a", "b", "c"]);
    const eligible = (key: string) => scopes.get(key) === scopes.get(origin);
    expect(resolveSidebarSweepKeys(["a", "b", "c"], origin, "c", eligible)).toEqual(expected);
  });

  it("keeps project section boundaries and excludes rows leaving the current Today tab", () => {
    const sections = new Map<string, SidebarSection>([
      ["a", "active"],
      ["b", "pinned"],
      ["c", "active"],
    ]);
    const project = sidebarSweepScopes(sections, null, ["a", "b", "c"]);
    expect(
      resolveSidebarSweepKeys(
        ["a", "b", "c"],
        "a",
        "c",
        (key) => project.get(key) === project.get("a"),
      ),
    ).toEqual(["a", "c"]);
    const pickup = sidebarSweepScopes(sections, "waiting", ["a", "b", "c"]).get("a");
    const release = sidebarSweepScopes(sections, "waiting", ["a", "c"]);
    expect(release.get("b")).toBeUndefined();
    const switched = sidebarSweepScopes(sections, "working", ["a", "b", "c"]);
    expect(switched.get("a")).not.toBe(pickup);
  });
  const ordered = ["a", "b", "c", "d", "blocked"];
  const canSettle = (key: string) => key !== "blocked";

  it("covers every row between the pressed row and the pointer, in either direction", () => {
    expect(resolveSidebarSweepKeys(ordered, "b", "b", canSettle)).toEqual(["b"]);
    expect(resolveSidebarSweepKeys(ordered, "b", "d", canSettle)).toEqual(["b", "c", "d"]);
    expect(resolveSidebarSweepKeys(ordered, "d", "a", canSettle)).toEqual(["a", "b", "c", "d"]);
  });

  it("leaves out rows that cannot settle and rows that left the list", () => {
    expect(resolveSidebarSweepKeys(ordered, "c", "blocked", canSettle)).toEqual(["c", "d"]);
    expect(resolveSidebarSweepKeys(ordered, "gone", "a", canSettle)).toEqual([]);
  });
});

describe("navigation after parking a thread", () => {
  it.each([
    ["settle", "settled", null, "thread", true],
    ["settle", "active", null, "thread", false],
    ["settle", "settled", null, "other-thread", false],
    ["snooze", null, "2099-01-01T00:00:00.000Z", "thread", true],
    ["snooze", null, null, "thread", false],
    ["snooze", null, "2026-09-12T09:00:00.000Z", "thread", false],
    ["snooze", null, "2099-01-01T00:00:00.000Z", "thread", false, true],
    ["snooze", null, "2099-01-01T00:00:00.000Z", "other-thread", false],
  ] as const)(
    "%s with state %s / %s on %s navigates: %s",
    (
      action,
      settledOverride,
      snoozedUntil,
      currentThreadKey,
      expected,
      hasPendingApprovals: boolean = false,
    ) => {
      expect(
        shouldNavigateAfterThreadPark({
          threadKey: "thread",
          currentThreadKey,
          action,
          now: "2026-09-12T10:00:00.000Z",
          thread: {
            settledOverride,
            snoozedUntil,
            snoozedAt: null,
            session: null,
            latestTurn: null,
            hasPendingApprovals,
            hasPendingUserInput: false,
          },
        }),
      ).toBe(expected);
    },
  );
});

describe("unseen completion with background work", () => {
  it.each([
    {
      roster: "dev server",
      task: { kind: "command" },
      status: "ready",
      receded: false,
      pill: "Completed",
    },
    {
      roster: "dev server watchdog",
      task: { kind: "monitor" },
      status: "ready",
      receded: false,
      pill: "Completed",
    },
    {
      roster: "awaited command",
      task: { kind: "command", awaited: true },
      status: "waiting",
      receded: true,
      pill: "Waiting",
    },
  ] as const)("presents a completed thread with a $roster roster", (expected) => {
    const thread = presentThreadShell(localEnvironmentId, {
      ...makeThreadFixture().source,
      latestRunId: RunId.make("run-background-completion"),
      status: "completed",
      latestRunCompletedAt: DateTime.makeUnsafe("2026-06-20T01:00:00.000Z"),
      lastVisitedAt: DateTime.makeUnsafe("2026-06-20T00:59:00.000Z"),
      pendingBackgroundTasks: [{ taskId: "background-work", ...expected.task }],
    });
    const status = resolveSidebarThreadStatus(thread);
    const isUnread = hasUnseenCompletion(thread);

    expect(isUnread).toBe(true);
    expect(status).toBe(expected.status);
    expect(
      shouldRecedeSidebarThread({
        status,
        isUnread,
        isWoke: false,
        isActive: false,
        isSelected: false,
      }),
    ).toBe(expected.receded);
    expect(isSidebarThreadWorking(thread)).toBe(expected.receded);
    expect(resolveThreadStatusPill({ thread })).toMatchObject({ label: expected.pill });
  });
});

describe("Working shelf (beta)", () => {
  const runtime = {
    status: "running" as const,
    activeRunId: null,
    providerInstanceId: ProviderInstanceId.make("codex"),
    providerName: "Codex",
    lastError: null,
    updatedAt: "2026-03-09T10:00:00.000Z",
  };
  const backgroundTask = {
    taskId: "bg-1",
    description: "Watch build",
    kind: "monitor" as const,
    awaited: true as const,
  };
  const idle = {
    hasActionableProposedPlan: false,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    interactionMode: "default" as const,
    latestRun: makeLatestRun(),
    runtime: null,
  };
  // Stopped with background tasks still open: V2's "waiting" sidebar status.
  const waiting = {
    ...idle,
    runtime: { ...runtime, status: "idle" as const },
    pendingBackgroundTasks: [backgroundTask],
  };

  it("folds away running threads and threads waiting on background work only", () => {
    expect(isSidebarThreadWorking({ ...idle, runtime })).toBe(true);
    expect(isSidebarThreadWorking(waiting)).toBe(true);
    expect(isSidebarThreadWorking(idle)).toBe(false);
    expect(isSidebarThreadWorking({ ...idle, runtime, hasPendingApprovals: true })).toBe(false);
    expect(isSidebarThreadWorking({ ...idle, runtime, hasPendingUserInput: true })).toBe(false);
    expect(
      isSidebarThreadWorking({
        ...waiting,
        runtime: { ...runtime, status: "failed" as const, lastError: "boom" },
      }),
    ).toBe(false);
  });

  it("keeps a ready plan in the inbox while background work runs", () => {
    expect(
      isSidebarThreadWorking({
        ...waiting,
        interactionMode: "plan",
        hasActionableProposedPlan: true,
      }),
    ).toBe(false);
  });

  describe("sortInboxThreadsByReturn", () => {
    const thread = (
      id: string,
      input: { createdAt: string; completedAt?: string | null; unsettledAt?: string },
    ) => ({
      id: ThreadId.make(id),
      environmentId: localEnvironmentId,
      createdAt: input.createdAt,
      unsettledAt: input.unsettledAt ?? null,
      latestRun:
        input.completedAt === undefined
          ? null
          : { ...makeLatestRun({ completedAt: input.completedAt }), requestedAt: input.createdAt },
    });

    it("puts the thread that finished last on top, whatever its age", () => {
      const sorted = sortInboxThreadsByReturn([
        thread("new", { createdAt: "2026-03-09T11:00:00.000Z" }),
        thread("old-finished-now", {
          createdAt: "2026-03-01T09:00:00.000Z",
          completedAt: "2026-03-09T12:00:00.000Z",
        }),
        thread("reopened", {
          createdAt: "2026-03-02T09:00:00.000Z",
          unsettledAt: "2026-03-09T11:30:00.000Z",
        }),
      ]);
      expect(sorted.map((entry) => entry.id)).toEqual(["old-finished-now", "reopened", "new"]);
    });

    it("counts a return the server does not stamp, like an approval request", () => {
      const waiting = thread("asks-approval", {
        createdAt: "2026-03-09T09:00:00.000Z",
        completedAt: null,
      });
      const finished = thread("finished", {
        createdAt: "2026-03-09T09:30:00.000Z",
        completedAt: "2026-03-09T11:00:00.000Z",
      });
      expect(sortInboxThreadsByReturn([finished, waiting]).map((entry) => entry.id)).toEqual([
        "finished",
        "asks-approval",
      ]);
      expect(
        sortInboxThreadsByReturn([finished, waiting], (entry) =>
          entry === waiting ? Date.parse("2026-03-09T11:05:00.000Z") : undefined,
        ).map((entry) => entry.id),
      ).toEqual(["asks-approval", "finished"]);
    });
  });

  describe("dragging", () => {
    const marker = (name: SidebarListMarker): SidebarListItem => ({ kind: "marker", marker: name });
    const row = (key: string, section: SidebarSection): SidebarListItem => ({
      kind: "thread",
      key,
      section,
    });
    // Pinned p1 | Active a1 a2 | Working w1 | Settled s1
    const items: readonly SidebarListItem[] = [
      marker("pinned-header"),
      row("p1", "pinned"),
      marker("pinned-divider"),
      row("a1", "active"),
      row("a2", "active"),
      marker("working-header"),
      row("w1", "working"),
      marker("settled-header"),
      row("s1", "settled"),
    ];

    it.each([
      ["snoozed-header", "snoozed"],
      ["settled-header", "settled"],
    ] as const)("rejects the hidden %s at the top of a single-shelf list", (header, section) => {
      const shelf = [marker(header), row("first", section), row("source", section)];
      expect(resolveSidebarDropTarget(shelf, "source", sidebarMarkerId(header))).toBeNull();
    });

    it("never drops into the Working shelf, and keeps it out of the inbox order", () => {
      expect(resolveSidebarDropTarget(items, "a1", "w1")).toBeNull();
      expect(resolveSidebarDropTarget(items, "p1", "a2")).toEqual({
        section: "active",
        pinnedOrder: [],
        activeOrder: ["a1", "a2", "p1"],
      });
      expect(resolveSidebarDropVerb("active", "working")).toBeNull();
    });

    it("arranges the rows it can write when another row's server cannot store an order", () => {
      // None of the rows has a key yet, so the drop needs keys for its
      // neighbors too. "offline" sits on a server that cannot take them.
      const plan = planSidebarThreadDrop({
        activeKey: "a2",
        activeSection: "active",
        target: {
          section: "active",
          pinnedOrder: [],
          activeOrder: ["offline", "a2", "a1"],
        },
        pinnedOrder: [],
        pinnedKeysById: new Map(),
        activeOrder: ["offline", "a1", "a2"],
        activeKeysById: new Map([
          ["offline", null],
          ["a1", null],
          ["a2", null],
        ]),
        activeReorderableKeys: new Set(["a1", "a2"]),
      });
      expect(plan.kind).toBe("move-active");
      if (plan.kind !== "move-active") return;
      expect(plan.assignments.map(({ id }) => id)).toEqual(["a2", "a1"]);
      const [a2, a1] = plan.assignments.map(({ orderKey }) => orderKey);
      expect(a2! < a1!).toBe(true);

      // A keyed row on that server still sorts by its key, so it stays a bound.
      const above = planSidebarThreadDrop({
        activeKey: "a2",
        activeSection: "active",
        target: { section: "active", pinnedOrder: [], activeOrder: ["a2", "offline"] },
        pinnedOrder: [],
        pinnedKeysById: new Map(),
        activeOrder: ["offline", "a2"],
        activeKeysById: new Map([
          ["offline", "m"],
          ["a2", "t"],
        ]),
        activeReorderableKeys: new Set(["a2"]),
      });
      expect(above.kind === "move-active" && above.assignments[0]!.orderKey < "m").toBe(true);
    });

    describe("reordering with cached offline configuration", () => {
      const onlineEnvironmentId = EnvironmentId.make("online");
      const offlineEnvironmentId = EnvironmentId.make("offline");
      const capabilities = {
        repositoryIdentity: true,
        threadPinning: true,
        threadPinReorder: true,
        threadActiveReorder: true,
      };
      const config = (environmentId: EnvironmentId) => ({
        environment: {
          environmentId,
          label: environmentId,
          platform: { os: "linux" as const, arch: "x64" as const },
          serverVersion: "0.1.1",
          capabilities,
        },
      });
      const serverConfigs = new Map([
        [onlineEnvironmentId, config(onlineEnvironmentId)],
        [offlineEnvironmentId, config(offlineEnvironmentId)],
      ]);
      const thread = (
        id: string,
        environmentId = onlineEnvironmentId,
        key: string | null = null,
      ) => ({
        id: ThreadId.make(id),
        environmentId,
        createdAt: `2026-03-09T${id === "offline" ? "12" : id === "online" ? "11" : "10"}:00:00.000Z`,
        activeOrderKey: key,
        pinOrderKey: key,
      });
      const keyOf = (entry: ReturnType<typeof thread>) =>
        scopedThreadKey(scopeThreadRef(entry.environmentId, entry.id));
      const online = thread("online");
      const offline = thread("offline", offlineEnvironmentId);
      const membership = (connectedEnvironmentIds = [onlineEnvironmentId]) =>
        resolveSidebarReorderableThreadKeys({
          threads: [online, offline],
          serverConfigs,
          connectedEnvironmentIds,
        });
      const planDrop = (input: {
        section: "active" | "pinned";
        rows: ReturnType<typeof thread>[];
        moved: ReturnType<typeof thread>;
        order: ReturnType<typeof thread>[];
        from?: "active" | "pinned";
        connectedEnvironmentIds?: EnvironmentId[];
      }) => {
        const writable = resolveSidebarReorderableThreadKeys({
          threads: input.rows,
          serverConfigs,
          connectedEnvironmentIds: input.connectedEnvironmentIds ?? [onlineEnvironmentId],
        });
        const sort = (rows: typeof input.rows) =>
          input.section === "active"
            ? sortActiveThreadsByOrderKey(rows)
            : sortPinnedThreadsByOrderKey(rows);
        const originalOrder = sort(input.rows).map(keyOf);
        const targetOrder = input.order.map(keyOf);
        const keysById = new Map(input.rows.map((entry) => [keyOf(entry), entry.activeOrderKey]));
        const plan = planSidebarThreadDrop({
          activeKey: keyOf(input.moved),
          activeSection: input.from ?? input.section,
          target: { section: input.section, pinnedOrder: targetOrder, activeOrder: targetOrder },
          pinnedOrder: originalOrder,
          activeOrder: originalOrder,
          pinnedKeysById: keysById,
          activeKeysById: keysById,
          reorderableKeys: writable.draggableThreadKeys,
          activeReorderableKeys: writable.activeReorderableThreadKeys,
        });
        const assignments =
          plan.kind === "move-active" || plan.kind === "reorder-pinned"
            ? plan.assignments
            : plan.kind === "pin"
              ? [
                  ...plan.extraAssignments,
                  ...(plan.orderKey === undefined
                    ? []
                    : [{ id: keyOf(input.moved), orderKey: plan.orderKey }]),
                ]
              : [];
        const assignedKeys = new Map(assignments.map(({ id, orderKey }) => [id, orderKey]));
        const actualOrder = sort(
          input.rows.map((entry) => ({
            ...entry,
            activeOrderKey: assignedKeys.get(keyOf(entry)) ?? entry.activeOrderKey,
            pinOrderKey: assignedKeys.get(keyOf(entry)) ?? entry.pinOrderKey,
          })),
        ).map(keyOf);

        return { plan, assignments, actualOrder, targetOrder };
      };

      it("excludes cached capable offline rows from both writable sets", () => {
        const writable = membership();

        expect([...writable.draggableThreadKeys]).toEqual([keyOf(online)]);
        expect([...writable.activeReorderableThreadKeys]).toEqual([keyOf(online)]);
        expect(serverConfigs.has(offlineEnvironmentId)).toBe(true);
      });

      it("updates membership through disconnect, reconnect, and missing configuration", () => {
        expect(membership([]).draggableThreadKeys.size).toBe(0);
        const connected = membership([onlineEnvironmentId, offlineEnvironmentId]);
        expect(connected.draggableThreadKeys.size).toBe(2);
        expect(connected.activeReorderableThreadKeys.size).toBe(2);

        const changed = resolveSidebarReorderableThreadKeys({
          threads: [online, offline],
          connectedEnvironmentIds: [onlineEnvironmentId, offlineEnvironmentId],
          serverConfigs: new Map([[onlineEnvironmentId, config(onlineEnvironmentId)]]),
        });
        expect([...changed.draggableThreadKeys]).toEqual([keyOf(online)]);
        expect([...changed.activeReorderableThreadKeys]).toEqual([keyOf(online)]);
      });

      it.each(["active", "pinned"] as const)(
        "replans a disconnected drag source in %s",
        (section) => {
          const bound = thread("offline", offlineEnvironmentId, "m");
          const moved = thread("online", onlineEnvironmentId, "t");
          const input = { section, rows: [bound, moved], moved, order: [moved, bound] };
          expect(planDrop(input).plan.kind).toBe(
            section === "active" ? "move-active" : "reorder-pinned",
          );

          const disconnected = planDrop({ ...input, connectedEnvironmentIds: [] });

          expect(disconnected.plan).toEqual({ kind: "none" });
          expect(disconnected.assignments).toEqual([]);
        },
      );

      it.each(["active", "pinned"] as const)("preserves a keyed offline bound in %s", (section) => {
        const bound = thread("offline", offlineEnvironmentId, "m");
        const moved = thread("online", onlineEnvironmentId, "t");
        const result = planDrop({ section, rows: [bound, moved], moved, order: [moved, bound] });

        expect(result.plan.kind).toBe(section === "active" ? "move-active" : "reorder-pinned");
        expect(result.assignments.map(({ id }) => id)).toEqual([keyOf(moved)]);
        expect(result.actualOrder).toEqual(result.targetOrder);
      });

      it.each(["active", "pinned"] as const)(
        "rejects rebalancing a keyed offline bound in %s",
        (section) => {
          const bound = thread("offline", offlineEnvironmentId, "m");
          const neighbor = thread("neighbor");
          const result = planDrop({
            section,
            rows: [bound, online, neighbor],
            moved: online,
            order: [bound, neighbor, online],
          });

          expect(result.plan).toEqual({ kind: "none" });
          expect(result.assignments).toEqual([]);
        },
      );

      it.each(["active", "pinned"] as const)(
        "rejects crossing the frozen keyless boundary in %s",
        (section) => {
          const bound = {
            ...offline,
            createdAt:
              section === "active" ? "2026-03-09T12:00:00.000Z" : "2026-03-09T10:00:00.000Z",
          };
          const order = section === "active" ? [online, bound] : [bound, online];
          const result = planDrop({ section, rows: [bound, online], moved: online, order });

          expect(result.plan).toEqual({ kind: "none" });
          expect(result.assignments).toEqual([]);
        },
      );

      it.each(["active", "pinned"] as const)(
        "allows realizable moves beside a frozen keyless row in %s",
        (section) => {
          const neighbor = thread("neighbor");
          const order =
            section === "active" ? [offline, neighbor, online] : [online, neighbor, offline];
          const result = planDrop({
            section,
            rows: [offline, online, neighbor],
            moved: online,
            order,
          });

          expect(result.plan.kind).toBe(section === "active" ? "move-active" : "reorder-pinned");
          expect(result.assignments.length).toBeGreaterThan(0);
          expect(result.assignments.every(({ id }) => id !== keyOf(offline))).toBe(true);
          expect(result.actualOrder).toEqual(result.targetOrder);
        },
      );

      it.each(["active", "pinned"] as const)(
        "checks fallback assignments to other rows at the %s boundary",
        (section) => {
          const neighbor = thread("neighbor");
          const order =
            section === "active" ? [neighbor, offline, online] : [online, offline, neighbor];
          const result = planDrop({
            section,
            rows: [offline, online, neighbor],
            moved: online,
            order,
          });

          expect(result.plan).toEqual({ kind: "none" });
        },
      );

      it.each(["active", "pinned"] as const)(
        "rejects impossible pin/unpin placement across the %s boundary",
        (section) => {
          const order = section === "active" ? [online, offline] : [offline, online];
          const result = planDrop({
            section,
            rows: [offline, online],
            moved: online,
            order,
            from: section === "active" ? "pinned" : "active",
          });

          expect(result.plan).toEqual({ kind: "none" });
        },
      );
    });

    it("only changes lifecycle when the inbox is time-ordered", () => {
      const base = {
        pinnedOrder: ["p1"],
        pinnedKeysById: new Map([["p1", "m"]]),
        activeOrder: ["a1", "a2"],
        activeKeysById: new Map([
          ["a1", "f"],
          ["a2", "t"],
        ]),
        activeTimeOrdered: true,
      };
      expect(
        planSidebarThreadDrop({
          ...base,
          activeKey: "a1",
          activeSection: "active",
          target: { section: "active", pinnedOrder: ["p1"], activeOrder: ["a2", "a1"] },
        }),
      ).toEqual({ kind: "none" });
      expect(
        planSidebarThreadDrop({
          ...base,
          activeKey: "p1",
          activeSection: "pinned",
          target: { section: "active", pinnedOrder: [], activeOrder: ["a1", "p1", "a2"] },
        }),
      ).toEqual({
        kind: "move-active",
        order: null,
        assignments: [],
        unpin: true,
        unsettle: false,
        unsnooze: false,
      });
    });
  });
});

describe("compactSidebarTimeLabel localization", () => {
  afterEach(() => installMessages("en", en));
  it("removes the localized ago suffix while keeping compact ages", () => {
    installMessages("zh-CN", zhCN);
    expect(compactSidebarTimeLabel("3分钟 前")).toBe("3分钟");
    expect(compactSidebarTimeLabel("刚刚")).toBe("刚刚");
  });
});

describe("sidebar failure localization", () => {
  it("shows Failed in Chinese after installing Chinese messages", () => {
    installMessages("zh-CN", zhCN);
    try {
      expect(sidebarThreadStatusLabel("Failed")).toBe("失败");
    } finally {
      installMessages("en", en);
    }
  });
});

describe("settled subagent navigation", () => {
  it("retains an off-page parent when its subagent is open", () => {
    const parents = Array.from({ length: 11 }, (_, index) =>
      makeThreadFixture({
        id: ThreadId.make(`parent-${index + 1}`),
        environmentId: localEnvironmentId,
        settledAt: "2026-03-09T10:05:00.000Z",
      }),
    );
    const parent = parents[10]!;
    const child = makeThreadFixture({
      id: ThreadId.make("open-subagent"),
      environmentId: localEnvironmentId,
      lineage: {
        rootThreadId: parent.id,
        parentThreadId: parent.id,
        relationshipToParent: "subagent",
      },
    });
    const threads = [...parents, child];
    const visible = filterSidebarV2VisibleThreads(threads, null);
    const rowId = resolveSidebarRowThreadId(child.id, localEnvironmentId, threads);
    const tabs = buildSidebarTabs(
      {
        pinnedThreads: [],
        activeThreads: [],
        workingThreads: [],
        snoozedThreads: [],
        settledThreads: visible,
      },
      {
        getThreadKey: (thread) => `${thread.environmentId}:${thread.id}`,
        routeThreadKey: `${localEnvironmentId}:${rowId}`,
      },
    );
    expect(tabs.rowsByTab.settled.map((thread) => thread.id)).toEqual([
      "parent-1",
      "parent-2",
      "parent-3",
      "parent-4",
      "parent-5",
      "parent-6",
      "parent-7",
      "parent-8",
      "parent-9",
      "parent-10",
      "parent-11",
    ]);
    expect(tabs.hiddenSettledCount).toBe(0);
  });
});

/** Owns fixture resources during setup; transfers cleanup only after mounting succeeds, including when render or unmount throws. */
async function mountJumpHints() {
  await using cleanup = new AsyncDisposableStack();
  const container = document.createElement("div");
  let root: ReturnType<typeof createRoot> | undefined;
  cleanup.defer(async () => {
    try {
      await act(async () => root?.unmount());
    } finally {
      try {
        container.remove();
      } finally {
        try {
          vi.useRealTimers();
        } finally {
          vi.unstubAllGlobals();
        }
      }
    }
  });
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.body.append(container);
  root = createRoot(container);
  /** Exposes the public hint state as visible text; modifier events exercise the hook without exporting its private controller. */
  function HintProbe() {
    const [pressed, updateThreadJumpHintsVisibility] = useState(false);
    const showThreadJumpHints = useThreadJumpHintsVisible(pressed);
    return createElement(
      "button",
      {
        onMouseDown: () => updateThreadJumpHintsVisibility(true),
        onMouseUp: () => updateThreadJumpHintsVisibility(false),
      },
      showThreadJumpHints ? "Jump to thread 1" : "",
    );
  }
  await act(async () => root?.render(createElement(HintProbe)));
  const mountedCleanup = cleanup.move();
  return {
    container,
    async press() {
      await act(async () => {
        container
          .querySelector("button")!
          .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });
    },
    async release() {
      await act(async () => {
        container
          .querySelector("button")!
          .dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      });
    },
    async advance(ms: number) {
      await act(async () => {
        vi.advanceTimersByTime(ms);
      });
    },
    async [Symbol.asyncDispose]() {
      await mountedCleanup.disposeAsync();
    },
  };
}

describe("useThreadJumpHintVisibility", () => {
  it("shows shortcut hints only after holding the modifier for 200 ms", async () => {
    await using hints = await mountJumpHints();
    await hints.press();
    expect(hints.container.textContent).toBe("");
    await hints.advance(199);
    expect(hints.container.textContent).toBe("");
    await hints.advance(1);
    expect(hints.container.textContent).toBe("Jump to thread 1");
  });
  it("hides visible shortcut hints immediately on modifier release", async () => {
    await using hints = await mountJumpHints();
    await hints.press();
    await hints.advance(200);
    expect(hints.container.textContent).toBe("Jump to thread 1");
    await hints.release();
    expect(hints.container.textContent).toBe("");
  });
  it("cancels pending hints when the modifier is released early", async () => {
    await using hints = await mountJumpHints();
    await hints.press();
    await hints.advance(199);
    await hints.release();
    await hints.advance(201);
    expect(hints.container.textContent).toBe("");
  });
});

describe("pendingSidebarRouteReveal", () => {
  it("keeps a revealed thread settled across a mount that reads no route params", () => {
    const reveal = { observedKey: null, pendingKey: null };
    expect(pendingSidebarRouteReveal(reveal, "env:a1")).toBe("env:a1");
    completeSidebarRouteReveal(reveal);

    // Back from Settings: location commits before the thread match does.
    expect(pendingSidebarRouteReveal(reveal, null)).toBeNull();
    expect(pendingSidebarRouteReveal(reveal, "env:a1")).toBeNull();

    expect(pendingSidebarRouteReveal(reveal, "env:b1")).toBe("env:b1");
  });

  it("keeps a pending reveal through a render without route params", () => {
    const reveal = { observedKey: null, pendingKey: null };
    pendingSidebarRouteReveal(reveal, "env:a1");
    expect(pendingSidebarRouteReveal(reveal, null)).toBeNull();
    expect(pendingSidebarRouteReveal(reveal, "env:a1")).toBe("env:a1");
  });
});

describe("resolveSidebarRouteReveal", () => {
  const scopedProjectKeys = new Set(["environment-test:project-scoped"]);
  const hidden = makeThreadFixture({ projectId: ProjectId.make("project-other") });
  const hiddenKey = "environment-test:thread-test";
  const findThread = (key: string) => (key === hiddenKey ? hidden : undefined);

  it("widens the scope for a newly opened thread the scope hides", () => {
    expect(
      resolveSidebarRouteReveal({
        reveal: { observedKey: "environment-test:other", pendingKey: null },
        routeKey: hiddenKey,
        isSearching: false,
        scopedProjectKeys,
        delegatedUnderParent: new Set(),
        findThread,
      }),
    ).toEqual({ pendingKey: hiddenKey, widensScope: true });
  });

  it("never widens for a thread whose reveal already completed", () => {
    // A remount's once-per-mount scroll must keep the scope the user chose.
    expect(
      resolveSidebarRouteReveal({
        reveal: { observedKey: hiddenKey, pendingKey: null },
        routeKey: hiddenKey,
        isSearching: false,
        scopedProjectKeys,
        delegatedUnderParent: new Set(),
        findThread,
      }),
    ).toEqual({ pendingKey: null, widensScope: false });
  });

  it("widens again for a thread reopened before the thread between them listed its row", () => {
    // The user scoped away from the open thread, then went to a thread whose row
    // never mounted, then came back.
    const reveal = { observedKey: hiddenKey, pendingKey: null };
    const resolve = (routeKey: string) =>
      resolveSidebarRouteReveal({
        reveal,
        routeKey,
        isSearching: false,
        scopedProjectKeys,
        delegatedUnderParent: new Set(),
        findThread,
      });
    resolve("environment-test:unlisted");
    expect(resolve(hiddenKey)).toEqual({ pendingKey: hiddenKey, widensScope: true });
  });

  it("holds a pending reveal without widening while searching", () => {
    expect(
      resolveSidebarRouteReveal({
        reveal: { observedKey: hiddenKey, pendingKey: hiddenKey },
        routeKey: hiddenKey,
        isSearching: true,
        scopedProjectKeys,
        delegatedUnderParent: new Set(),
        findThread,
      }),
    ).toEqual({ pendingKey: hiddenKey, widensScope: false });
  });
});
