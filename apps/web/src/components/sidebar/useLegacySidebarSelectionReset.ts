/** Owns legacy sidebar selection resets when the user leaves the current selection context. */
import { useEffect } from "react";
import { useThreadSelectionStore } from "../../threadSelectionStore";
import { shouldClearThreadSelectionOnMouseDown } from "../Sidebar.logic";

/**
 * Clears legacy thread selection on scope changes and outside pointer input.
 * projectScopeKey is the shared project-rail scope, including null for all projects.
 */
export function useLegacySidebarSelectionReset(projectScopeKey: string | null) {
  const clearSelection = useThreadSelectionStore((state) => state.clearSelection);

  // Keyboard scope changes do not fire mousedown; hidden rows must leave the bulk-action set too.
  useEffect(() => {
    clearSelection();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Scope changes invalidate selection even though clearing does not read the scope.
  }, [clearSelection, projectScopeKey]);

  useEffect(() => {
    const onMouseDown = (event: globalThis.MouseEvent) => {
      if (!useThreadSelectionStore.getState().hasSelection()) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!shouldClearThreadSelectionOnMouseDown(target)) return;
      clearSelection();
    };

    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [clearSelection]);
}
