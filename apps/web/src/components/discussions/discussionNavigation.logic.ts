/** Resolves discussion navigation visibility and selection without depending on router or UI state. */

/**
 * Keeps discussion navigation scoped to workspaces that have projects.
 * @param hasProjects Whether the sidebar has at least one project.
 * @param pathname Current route pathname, without query or hash.
 * @returns Visibility and selection for the discussion icon; hidden icons are never selected.
 */
export function discussionNavigationState(hasProjects: boolean, pathname: string) {
  return {
    visible: hasProjects,
    isActive: hasProjects && (pathname === "/discussions" || pathname.startsWith("/discussions/")),
  };
}
