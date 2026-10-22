/** Protects rail selection and persistence through project clicks and incomplete snapshots. */
import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { buildSidebarProjectSnapshots } from "../../sidebarProjectGrouping";
import {
  deriveProjectRailSelection,
  reduceProjectRailPickerState,
  toggleProjectRailScope,
} from "./projectRail.logic";
import { filterSidebarProjectScopeItems } from "../Sidebar.logic";

const environmentId = EnvironmentId.make("local");
const groups = buildSidebarProjectSnapshots({
  projects: [
    {
      id: ProjectId.make("alpha"),
      environmentId,
      title: "Alpha",
      workspaceRoot: "/alpha",
      repositoryIdentity: null,
      scripts: [],
      defaultModelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
  ],
  settings: { sidebarProjectGroupingMode: "separate", sidebarProjectGroupingOverrides: {} },
  primaryEnvironmentId: environmentId,
  resolveEnvironmentLabel: () => null,
});

describe("project rail scope", () => {
  it("selects projects directly from web pages and clears only for All projects", () => {
    expect(toggleProjectRailScope("alpha", "alpha", true)).toBe("alpha");
    expect(toggleProjectRailScope("alpha", "beta", true)).toBe("beta");
    expect(toggleProjectRailScope("alpha", null, true)).toBeNull();
    expect(toggleProjectRailScope(null, "alpha", true)).toBe("alpha");
  });

  it("retains toggle behavior in the code area and lets All projects clear it", () => {
    expect(toggleProjectRailScope("alpha", "alpha", false)).toBeNull();
    expect(toggleProjectRailScope("alpha", "beta", false)).toBe("beta");
    expect(toggleProjectRailScope("alpha", null, false)).toBeNull();
  });
  it("reopens all project choices after leaving a searched popup for project settings", () => {
    const items = [
      { value: "all", label: "Today" },
      { value: "alpha", label: "Alpha" },
      { value: "beta", label: "Beta" },
    ];
    const searched = reduceProjectRailPickerState(
      { open: true, query: "" },
      { type: "query-changed", query: "Alpha" },
    );
    const closed = reduceProjectRailPickerState(searched, { type: "project-settings-opened" });
    expect(closed.open).toBe(false);
    const reopened = reduceProjectRailPickerState(closed, { type: "open-changed", open: true });
    expect(reopened).toEqual({ open: true, query: "" });
    expect(
      filterSidebarProjectScopeItems({
        items,
        query: reopened.query,
        matches: (item, query) => item.label.includes(query),
      }).map((item) => item.value),
    ).toEqual(["all", "alpha", "beta"]);
  });

  it("selects, switches and cancels the same project filter on a second click", () => {
    expect(toggleProjectRailScope(null, "alpha")).toBe("alpha");
    expect(toggleProjectRailScope("alpha", "beta")).toBe("beta");
    expect(toggleProjectRailScope("alpha", "alpha")).toBeNull();
  });

  it("derives the selected project from the sidebar key and leaves all projects unselected", () => {
    const project = groups[0]!;
    expect(deriveProjectRailSelection({ groups, key: project.projectKey })).toEqual({
      key: project.projectKey,
      project,
    });
    expect(deriveProjectRailSelection({ groups, key: null })).toEqual({ key: null, project: null });
  });

  it("keeps a saved filter during loading and clears a missing project only after readiness", () => {
    expect(
      deriveProjectRailSelection({ groups: [], key: "removed", canClearMissingScope: false }),
    ).toEqual({ key: "removed", project: null });
    expect(
      deriveProjectRailSelection({ groups, key: "removed", canClearMissingScope: true }),
    ).toEqual({ key: null, project: null });
  });
});
