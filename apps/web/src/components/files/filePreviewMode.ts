/** Localized files presentation and existing interaction behavior. */
import { t } from "~/i18n";
import type { AssetResource, ProjectReadFileError, ScopedThreadRef } from "@t3tools/contracts";
import { isHostPath, workspaceRelativeFilePath } from "@t3tools/shared/path";

export function resolveFilePreviewPath(path: string | null, cwd: string): string | null {
  if (path === null) return null;
  return path === "." || workspaceRelativeFilePath(path, cwd) === "." ? null : path;
}

export const isMarkdownPreviewFile = (path: string): boolean => /\.(?:md|mdx)$/i.test(path);

export function filePreviewReadErrorMessage(error: ProjectReadFileError): string {
  switch (error.failure) {
    case "path_not_file":
      return t.tools.files.notRegularFile;
    case "binary_file":
      return t.tools.files.binaryFile;
    case "workspace_path_outside_root":
      return t.tools.files.outsideWorkspace;
    case "resolved_path_outside_root":
      return t.tools.files.resolvesOutside;
    case "operation_failed":
      return error.operation === "realpath-workspace-root"
        ? t.tools.files.workspaceInaccessible
        : t.tools.files.fileInaccessible;
    default:
      return error.message;
  }
}

export function shouldShowFileExplorer(input: {
  readonly relativePath: string | null;
  readonly explorerOpen: boolean;
  readonly attachmentOpen: boolean;
}): boolean {
  if (input.attachmentOpen || (input.relativePath && isHostPath(input.relativePath))) {
    return false;
  }
  return input.explorerOpen || input.relativePath === null;
}

export function setMarkdownTaskChecked(
  markdown: string,
  markerOffset: number,
  checked: boolean,
): string {
  if (
    markerOffset < 0 ||
    markdown[markerOffset] !== "[" ||
    !/[ xX]/.test(markdown[markerOffset + 1] ?? "") ||
    markdown[markerOffset + 2] !== "]"
  ) {
    return markdown;
  }

  return `${markdown.slice(0, markerOffset + 1)}${checked ? "x" : " "}${markdown.slice(markerOffset + 2)}`;
}

export function workspaceAssetResource(input: {
  readonly kind: "workspace-file" | "media-file";
  readonly threadRef: ScopedThreadRef;
  readonly draft: boolean;
  readonly workspaceRoot: string;
  readonly absolutePath: string;
}): AssetResource {
  if (input.draft) {
    return { _tag: "draft-workspace-file", cwd: input.workspaceRoot, path: input.absolutePath };
  }
  return { _tag: input.kind, threadId: input.threadRef.threadId, path: input.absolutePath };
}
