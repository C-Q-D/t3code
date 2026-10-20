import { EnvironmentId } from "@t3tools/contracts";
import * as NodeAssert from "node:assert/strict";
import { describe, expect, it } from "vite-plus/test";

import {
  buildFileContextMenuItems,
  resolveFileContextMenuAbsolutePath,
  resolveFileContextMenuRelativePath,
} from "./fileContextMenu";

const BASE_TARGET = {
  environmentId: EnvironmentId.make("environment-local"),
  filePath: "src/index.ts",
  workspaceRoot: "/workspace/project",
};

const EMPTY_CAPABILITIES = {
  revealLabel: undefined,
  canOpenDefault: false,
  editorIds: [],
};

describe("resolveFileContextMenuAbsolutePath", () => {
  it("joins workspace-relative diff paths onto the workspace root", () => {
    expect(resolveFileContextMenuAbsolutePath(BASE_TARGET)).toBe("/workspace/project/src/index.ts");
  });

  it("strips the repository prefix when the repo root is nested in the workspace", () => {
    expect(
      resolveFileContextMenuAbsolutePath({
        ...BASE_TARGET,
        workspaceRoot: "/workspace/project/packages/app",
        repositoryRoot: "/workspace/project",
        filePath: "packages/app/src/index.ts",
      }),
    ).toBe("/workspace/project/packages/app/src/index.ts");
  });

  it("returns null for paths outside the workspace when a repository root is set", () => {
    expect(
      resolveFileContextMenuAbsolutePath({
        ...BASE_TARGET,
        workspaceRoot: "/workspace/project/packages/app",
        repositoryRoot: "/workspace/project",
        filePath: "other/src/index.ts",
      }),
    ).toBeNull();
  });

  it("rejects absolute paths without a workspace root, matching diff path resolution", () => {
    expect(
      resolveFileContextMenuAbsolutePath({
        ...BASE_TARGET,
        workspaceRoot: undefined,
        filePath: "/absolute/src/index.ts",
      }),
    ).toBeNull();
  });
});

describe("resolveFileContextMenuRelativePath", () => {
  it("returns the workspace-relative path for files and folders", () => {
    expect(resolveFileContextMenuRelativePath(BASE_TARGET)).toBe("src/index.ts");
    expect(resolveFileContextMenuRelativePath({ ...BASE_TARGET, filePath: "src" })).toBe("src");
  });

  it("strips the repository prefix when the repo root is nested in the workspace", () => {
    expect(
      resolveFileContextMenuRelativePath({
        ...BASE_TARGET,
        workspaceRoot: "/workspace/project/packages/app",
        repositoryRoot: "/workspace/project",
        filePath: "packages/app/src/index.ts",
      }),
    ).toBe("src/index.ts");
  });

  it("returns null outside the workspace or without a workspace root", () => {
    expect(
      resolveFileContextMenuRelativePath({
        ...BASE_TARGET,
        workspaceRoot: "/workspace/project/packages/app",
        repositoryRoot: "/workspace/project",
        filePath: "other/src/index.ts",
      }),
    ).toBeNull();
    expect(
      resolveFileContextMenuRelativePath({ ...BASE_TARGET, workspaceRoot: undefined }),
    ).toBeNull();
  });
});

describe("buildFileContextMenuItems", () => {
  it("appends both path copies after the open actions, divided from them", () => {
    const items = buildFileContextMenuItems({
      hasAbsolutePath: true,
      hasRelativePath: true,
      capabilities: {
        revealLabel: "Reveal in File Explorer",
        canOpenDefault: false,
        editorIds: [],
      },
    });

    expect(items.map((item) => item.id)).toEqual([
      "reveal-in-folder",
      "copy-absolute-path",
      "copy-relative-path",
    ]);
    expect(items[1]).toMatchObject({ separatorBefore: true });
    expect(items[2]?.separatorBefore).toBeUndefined();
  });

  it("offers path copies without a divider when the host advertises no open actions", () => {
    const items = buildFileContextMenuItems({
      hasAbsolutePath: true,
      hasRelativePath: true,
      capabilities: EMPTY_CAPABILITIES,
    });

    expect(items.map((item) => item.id)).toEqual(["copy-absolute-path", "copy-relative-path"]);
    expect(items[0]).toMatchObject({ separatorBefore: false });
  });

  it("offers open, reveal, and an open-with submenu when all are available", () => {
    const items = buildFileContextMenuItems({
      hasAbsolutePath: true,
      hasRelativePath: false,
      capabilities: {
        revealLabel: "Reveal in Finder",
        canOpenDefault: true,
        editorIds: ["vscode", "cursor", "file-manager"],
      },
    });

    expect(items.map((item) => item.id)).toEqual([
      "open",
      "reveal-in-folder",
      "open-with",
      "copy-absolute-path",
    ]);
    expect(items[0]).toMatchObject({ label: "Open" });
    expect(items[1]).toMatchObject({ label: "Reveal in Finder" });
    const openWith = items[2];
    NodeAssert.ok(openWith);
    expect(openWith.children?.map((child) => child.id)).toEqual(["editor:vscode", "editor:cursor"]);
  });

  it("offers reveal and the absolute path copy when just reveal is enabled", () => {
    const items = buildFileContextMenuItems({
      hasAbsolutePath: true,
      hasRelativePath: false,
      capabilities: {
        revealLabel: "Reveal in File Explorer",
        canOpenDefault: false,
        editorIds: [],
      },
    });

    expect(items.map((item) => item.id)).toEqual(["reveal-in-folder", "copy-absolute-path"]);
    expect(items[0]).toMatchObject({ label: "Reveal in File Explorer" });
  });

  it("offers nothing when the path cannot be resolved", () => {
    expect(
      buildFileContextMenuItems({
        hasAbsolutePath: false,
        hasRelativePath: false,
        capabilities: {
          revealLabel: "Reveal in Finder",
          canOpenDefault: true,
          editorIds: ["vscode"],
        },
      }),
    ).toEqual([]);
  });
});
