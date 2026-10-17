/** Protects Q3 progress grouping so verification does not prematurely mark its operation complete. */
import { expect, it } from "vite-plus/test";
import { relayInstallGroup } from "./relayInstallPresentation.logic";

it.each([
  ["checking", 0],
  ["waiting_for_lock", 0],
  ["downloading", 0],
  ["verifying", 0],
  ["installing", 1],
  ["validating", 1],
  ["activating", 2],
] as const)("keeps %s in display group %i", (stage, expectedGroup) => {
  expect(relayInstallGroup(stage)).toBe(expectedGroup);
});
