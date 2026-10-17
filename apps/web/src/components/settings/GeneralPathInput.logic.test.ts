/** Protects folder-picker cancellation and path normalization without native dialogs or callback mocks. */
import { describe, expect, it } from "vite-plus/test";

import { resolvePickedFolderPath } from "./GeneralPathInput.logic";

describe("folder selection for general settings", () => {
  it.each([null, "", " \t\n"])("leaves the setting unchanged for an empty result: %j", (path) => {
    expect(resolvePickedFolderPath(path)).toBeNull();
  });

  it.each([
    ["  F:\\workspace\\My Projects  ", "F:\\workspace\\My Projects"],
    [" \\ ", "\\"],
    ["  /home/user/my projects/  ", "/home/user/my projects/"],
    ["/", "/"],
    ["\\\\server\\共享\\导出", "\\\\server\\共享\\导出"],
  ])(
    "preserves path syntax while trimming the contract's outer whitespace: %j",
    (path, expected) => {
      expect(resolvePickedFolderPath(path)).toBe(expected);
    },
  );
});
