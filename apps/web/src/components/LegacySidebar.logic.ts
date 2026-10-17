/** Maps the shared project-rail scope onto the legacy sidebar's independently grouped project rows. */
import {
  deriveLogicalProjectKeyFromSettings,
  type ProjectGroupingSettings,
} from "../logicalProject";
import { resolveScratchProjectScopeKey } from "@t3tools/client-runtime/state/project-grouping";
import type { SidebarProjectSnapshot } from "../sidebarProjectGrouping";

/**
 * Keep visible legacy project rows for scopeKey from the persisted rail filter.
 * projects is the full legacy catalog in its current order; settings is the shared grouping configuration.
 * A null or unresolved scope retains the catalog, matching the modern sidebar during loading.
 */
export function filterLegacySidebarProjects(
  projects: readonly SidebarProjectSnapshot[],
  scopeKey: string | null,
  settings: ProjectGroupingSettings,
): readonly SidebarProjectSnapshot[] {
  if (scopeKey === null) return projects;
  const resolvedKey = resolveScratchProjectScopeKey(
    scopeKey,
    projects.flatMap((project) => project.memberProjects),
    settings,
  );
  // The rail coalesces scratch homes across environments; legacy rows keep their original grouping.
  const matchingProjects = projects.filter((project) =>
    project.memberProjects.some(
      (member) =>
        deriveLogicalProjectKeyFromSettings(member, settings, { groupScratchProjects: true }) ===
        resolvedKey,
    ),
  );
  return matchingProjects.length > 0 ? matchingProjects : projects;
}
