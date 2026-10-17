/**
 * Protects bulk-action selection across legacy project scope changes without mouse input.
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useThreadSelectionStore } from "../../threadSelectionStore";
import { useUiStateStore } from "../../uiStateStore";
import { useLegacySidebarSelectionReset } from "./useLegacySidebarSelectionReset";

let root: Root;
let container: HTMLDivElement;
let originalScope: string | null;

/** Mounts the production selection lifecycle against the actual persisted scope store. */
function LegacySelection() {
  const scope = useUiStateStore((state) => state.sidebarProjectScopeKey);
  useLegacySidebarSelectionReset(scope);
  return null;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  originalScope = useUiStateStore.getState().sidebarProjectScopeKey;
  useUiStateStore.getState().setSidebarProjectScopeKey(null);
  useThreadSelectionStore.getState().clearSelection();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  useThreadSelectionStore.getState().clearSelection();
  useUiStateStore.getState().setSidebarProjectScopeKey(originalScope);
  container.remove();
  vi.unstubAllGlobals();
});

it("drops hidden threads from the bulk-action selection when the project scope changes without a mousedown", async () => {
  await act(() => root.render(<LegacySelection />));
  useThreadSelectionStore.getState().toggleThread("local:thread-a");
  useThreadSelectionStore.getState().toggleThread("local:thread-b");
  expect([...useThreadSelectionStore.getState().selectedThreadKeys]).toEqual([
    "local:thread-a",
    "local:thread-b",
  ]);

  // Keyboard activation updates the same scope store without firing the outside-mousedown reset.
  await act(() => useUiStateStore.getState().setSidebarProjectScopeKey("local:/project-b"));
  expect([...useThreadSelectionStore.getState().selectedThreadKeys]).toEqual([]);
  expect(useThreadSelectionStore.getState().anchorThreadKey).toBeNull();

  // Bulk menus read this store directly; a fresh selection must contain only the visible B thread.
  useThreadSelectionStore.getState().toggleThread("local:thread-b");
  expect([...useThreadSelectionStore.getState().selectedThreadKeys]).toEqual(["local:thread-b"]);
});
