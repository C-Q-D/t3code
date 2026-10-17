/** Protects project-rail scope filtering without changing legacy project grouping or source data. */
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { buildSidebarProjectSnapshots } from "../sidebarProjectGrouping";
import type { Project } from "../types";
import type { ProjectGroupingSettings } from "../logicalProject";
import { filterLegacySidebarProjects } from "./LegacySidebar.logic";

const local = EnvironmentId.make("local");
const remote = EnvironmentId.make("remote");
const separate: ProjectGroupingSettings = {
  sidebarProjectGroupingMode: "separate",
  sidebarProjectGroupingOverrides: {},
};

/** Build an ordinary project with fixed timestamps; overrides supply the specific grouping risk. */
function makeProject(id: string, overrides: Partial<Project> = {}): Project {
  return {
    environmentId: local,
    id: ProjectId.make(id),
    title: id,
    workspaceRoot: `/${id}`,
    repositoryIdentity: null,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Use the production legacy grouping mode; it intentionally does not coalesce scratch homes. */
function legacyGroups(projects: readonly Project[], settings = separate) {
  return buildSidebarProjectSnapshots({
    projects,
    settings,
    primaryEnvironmentId: local,
    resolveEnvironmentLabel: () => null,
  });
}

describe("legacy sidebar project scope", () => {
  it("filters the selected environment's project and restores the catalog when cleared or unresolved", () => {
    const groups = legacyGroups([
      makeProject("beta"),
      makeProject("alpha"),
      makeProject("alpha", { environmentId: remote, title: "remote alpha" }),
    ]);
    expect(
      filterLegacySidebarProjects(groups, "local:/alpha", separate).map((group) => group.title),
    ).toEqual(["alpha"]);
    expect(filterLegacySidebarProjects(groups, null, separate).map((group) => group.title)).toEqual(
      ["beta", "alpha", "remote alpha"],
    );
    expect(
      filterLegacySidebarProjects(groups, "not-loaded", separate).map((group) => group.title),
    ).toEqual(["beta", "alpha", "remote alpha"]);
    expect(groups.map((group) => group.title)).toEqual(["beta", "alpha", "remote alpha"]);
  });

  it("keeps every physical member of a selected repository group", () => {
    const repositoryIdentity = {
      canonicalKey: "github.com/example/alpha",
      provider: "github",
      owner: "example",
      name: "alpha",
      displayName: "Alpha",
      locator: {
        source: "git-remote" as const,
        remoteName: "origin",
        remoteUrl: "https://github.com/example/alpha.git",
      },
    };
    const settings: ProjectGroupingSettings = {
      ...separate,
      sidebarProjectGroupingMode: "repository",
    };
    const groups = legacyGroups(
      [
        makeProject("alpha", { repositoryIdentity }),
        makeProject("alpha", { environmentId: remote, repositoryIdentity }),
        makeProject("beta"),
      ],
      settings,
    );
    const filtered = filterLegacySidebarProjects(groups, "github.com/example/alpha", settings);
    expect(
      filtered
        .flatMap((group) => group.memberProjectRefs)
        .map((ref) => `${ref.environmentId}:${ref.projectId}`),
    ).toEqual(["local:alpha", "remote:alpha"]);
  });

  it.each(["\0no-project", "local:/scratch-local"])(
    "applies scratch scope %j to all legacy scratch rows without selecting a same-title ordinary project",
    (key) => {
      const groups = legacyGroups([
        makeProject("scratch-local", { isScratch: true }),
        makeProject("scratch-remote", { environmentId: remote, isScratch: true }),
        makeProject("ordinary", { title: "scratch-local" }),
      ]);
      expect(filterLegacySidebarProjects(groups, key, separate).map((group) => group.id)).toEqual([
        "scratch-local",
        "scratch-remote",
      ]);
    },
  );
});
