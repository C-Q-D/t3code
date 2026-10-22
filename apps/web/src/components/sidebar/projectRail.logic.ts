/** Derives the rail selection from the sidebar's persisted project scope; owns no storage. */
import { resolveSidebarProjectScopeKey } from "../../sidebarProjectGrouping";

/** The V3 popup's controlled visibility and search; both survive utility-page navigation. */
export interface ProjectRailPickerState {
  readonly open: boolean;
  readonly query: string;
}

/** User input and close paths which must update the persistent popup as one transition. */
export type ProjectRailPickerAction =
  | { readonly type: "open-changed"; readonly open: boolean }
  | { readonly type: "query-changed"; readonly query: string }
  | { readonly type: "project-settings-opened" };

/** Derive visibility and search after a popup action; state is the currently controlled V3 state. */
export function reduceProjectRailPickerState(
  state: ProjectRailPickerState,
  action: ProjectRailPickerAction,
): ProjectRailPickerState {
  switch (action.type) {
    case "open-changed":
      return { open: action.open, query: action.open ? state.query : "" };
    case "query-changed":
      return { ...state, query: action.query };
    case "project-settings-opened":
      // A controlled close bypasses onOpenChange; the rail stays mounted on the settings route.
      return { open: false, query: "" };
  }
}

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

/** Web-page navigation chooses a destination scope; only the code area toggles the current project off. */
export function toggleProjectRailScope(
  currentKey: string | null,
  clickedKey: string | null,
  fromWebPages = false,
): string | null {
  if (clickedKey === null || fromWebPages) return clickedKey;
  return currentKey === clickedKey ? null : clickedKey;
}
