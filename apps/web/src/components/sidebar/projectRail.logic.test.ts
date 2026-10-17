/** Protects rail selection and persistence through project clicks and incomplete snapshots. */
import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { buildSidebarProjectSnapshots } from "../../sidebarProjectGrouping";
import { deriveProjectRailSelection, toggleProjectRailScope } from "./projectRail.logic";

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
