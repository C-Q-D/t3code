/** Derives the rail selection from the sidebar's persisted project scope; owns no storage. */
import { resolveSidebarProjectScopeKey } from "../../sidebarProjectGrouping";

/**
 * Resolve a saved sidebar scope against the current grouped catalog.
 * input uses the sidebar's readiness gate: missing scopes survive partial snapshots.
 * Returns the persisted key to use and the matching group, or null for all/unloaded projects.
 */
export function deriveProjectRailSelection(
  input: Parameters<typeof resolveSidebarProjectScopeKey>[0],
) {
  const key = resolveSidebarProjectScopeKey(input);
  return { key, project: input.groups.find((group) => group.projectKey === key) ?? null };
}

/** Return the next persisted scope after clicking a project; clicking it twice clears the filter. */
export function toggleProjectRailScope(
  currentKey: string | null,
  clickedKey: string,
): string | null {
  return currentKey === clickedKey ? null : clickedKey;
}
