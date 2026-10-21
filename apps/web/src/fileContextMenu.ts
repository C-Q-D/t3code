/** Localized files presentation and existing interaction behavior. */
import { t } from "~/i18n";
/**
 * Right-click actions for a workspace file: reveal it in the environment's
 * file manager and open it in an editor. Reuse the chat file-chip menu's
 * machinery: reveal rides `shell.openInEditor` with `reveal: true`, which the
 * server only honors when its `shellRevealInFileManager` config flag is set,
 * so both actions work for every client and connection mode.
 */
import {
  EDITORS,
  type ContextMenuItem,
  type EditorId,
  type EnvironmentId,
} from "@t3tools/contracts";

import { resolveDiffPathForWorkspace } from "./diffFileActions";
import {
  revealInFileExplorerLabelForKind,
  revealInFileExplorerLabelForOs,
} from "~/components/preview/fileExplorerLabel";
import { readLocalApi } from "./localApi";
import { serverEnvironment } from "./state/server";
import { shellEnvironment } from "./state/shell";
import { useAtomCommand } from "./state/use-atom-command";
import { resolvePathLinkTarget } from "@t3tools/shared/fileLinks";
import { toastManager } from "./components/ui/toast";
import { writeTextToClipboard } from "./hooks/useCopyToClipboard";
import { useAtomValue } from "@effect/atom-react";

export type FileContextMenuAction =
  | "reveal-in-folder"
  | "open"
  /** Submenu parent; never the activated id. */
  | "open-with"
  | `editor:${EditorId}`
  | "copy-absolute-path"
  | "copy-relative-path";

export interface FileContextMenuTarget {
  readonly environmentId: EnvironmentId | null;
  /** Repo- or workspace-relative file path, as shown in diffs. */
  readonly filePath: string;
  readonly workspaceRoot: string | undefined;
  readonly repositoryRoot?: string | undefined;
}

export function resolveFileContextMenuAbsolutePath(target: FileContextMenuTarget): string | null {
  const workspaceFilePath = resolveDiffPathForWorkspace({
    filePath: target.filePath,
    workspaceRoot: target.workspaceRoot,
    repositoryRoot: target.repositoryRoot,
  });
  if (workspaceFilePath === null) return null;
  if (target.workspaceRoot === undefined) {
    return workspaceFilePath.startsWith("/") || /^[a-zA-Z]:/.test(workspaceFilePath)
      ? workspaceFilePath
      : null;
  }
  return resolvePathLinkTarget(workspaceFilePath, target.workspaceRoot);
}

/**
 * Workspace-relative path with `/` separators, matching file mentions on every
 * host. Null without a workspace root or when the target lies outside it.
 */
export function resolveFileContextMenuRelativePath(target: FileContextMenuTarget): string | null {
  if (target.workspaceRoot === undefined) return null;
  return resolveDiffPathForWorkspace({
    filePath: target.filePath,
    workspaceRoot: target.workspaceRoot,
    repositoryRoot: target.repositoryRoot,
  });
}

const EDITOR_LABEL_BY_ID = new Map(EDITORS.map((editor) => [editor.id, editor.label]));

export interface FileContextMenuCapabilities {
  readonly revealLabel: string | undefined;
  readonly canOpenDefault: boolean;
  readonly editorIds: ReadonlyArray<EditorId>;
}

/**
 * Menu items for a resolved file or folder, offering only what the environment's
 * config advertises: default-app open, reveal (with server-provided wording), an
 * "Open with" submenu of detected editors, then path copies for each path that
 * resolves. Copying needs only the client clipboard, so it shows for remote hosts too.
 * Empty when nothing can act.
 */
export function buildFileContextMenuItems(input: {
  readonly hasAbsolutePath: boolean;
  readonly hasRelativePath: boolean;
  readonly capabilities: FileContextMenuCapabilities;
}): readonly ContextMenuItem<FileContextMenuAction>[] {
  const items = input.hasAbsolutePath ? buildFileOpenItems(input.capabilities) : [];
  const copyItems: ContextMenuItem<FileContextMenuAction>[] = [];
  if (input.hasAbsolutePath) {
    copyItems.push({
      id: "copy-absolute-path",
      label: t.tools.files.copyAbsolutePath,
      icon: "copy",
    });
  }
  if (input.hasRelativePath) {
    copyItems.push({ id: "copy-relative-path", label: t.tools.files.copyRelativePath });
  }
  const [firstCopy, ...restCopies] = copyItems;
  if (firstCopy) items.push({ ...firstCopy, separatorBefore: items.length > 0 }, ...restCopies);
  return items;
}

/** Open, reveal and "Open with" items for a target whose absolute path resolves. */
function buildFileOpenItems(
  capabilities: FileContextMenuCapabilities,
): ContextMenuItem<FileContextMenuAction>[] {
  const items: ContextMenuItem<FileContextMenuAction>[] = [];
  if (capabilities.canOpenDefault) {
    items.push({ id: "open", label: t.tools.files.open, icon: "pencil" });
  }
  if (capabilities.revealLabel !== undefined) {
    items.push({
      id: "reveal-in-folder",
      label: capabilities.revealLabel,
      icon: "folder-tree",
    });
  }
  const editorIds = capabilities.editorIds.filter((id) => id !== "file-manager");
  if (editorIds.length > 0) {
    items.push({
      id: "open-with",
      label: t.tools.files.openWith,
      children: editorIds.map((editorId) => ({
        id: `editor:${editorId}` as FileContextMenuAction,
        label: EDITOR_LABEL_BY_ID.get(editorId) ?? editorId,
      })),
    });
  }
  return items;
}

/**
 * Write the target's absolute or workspace-relative path to the client clipboard
 * and report the outcome as a toast. Does nothing when that path cannot be resolved.
 */
async function copyTargetPath(
  action: "copy-absolute-path" | "copy-relative-path",
  target: FileContextMenuTarget,
): Promise<void> {
  const path =
    action === "copy-absolute-path"
      ? resolveFileContextMenuAbsolutePath(target)
      : resolveFileContextMenuRelativePath(target);
  if (path === null) return;
  try {
    await writeTextToClipboard(path);
    toastManager.add({ type: "success", title: t.tools.files.pathCopied, description: path });
  } catch (error) {
    toastManager.add({
      type: "error",
      title: t.tools.files.copyPathFailed,
      description: error instanceof Error ? error.message : path,
    });
  }
}

/**
 * Context-menu actions for files. The environment id is fixed per component
 * (a thread's environment, a file browser's environment), so capabilities
 * resolve once per hook call.
 */
/** Builds and dispatches the file context menu for one environment's files. */
export function useFileContextMenu(environmentId: EnvironmentId | null) {
  const openInEditor = useAtomCommand(shellEnvironment.openInEditor, { reportFailure: false });
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(environmentId));

  const availableEditors = serverConfig?.availableEditors ?? [];
  const capabilities: FileContextMenuCapabilities = {
    // The reveal wording comes from the server because on WSL the reveal can
    // run through Windows File Explorer even though the host reports Linux.
    revealLabel:
      environmentId !== null &&
      serverConfig?.shellRevealInFileManager === true &&
      serverConfig.availableEditors.includes("file-manager")
        ? serverConfig.shellRevealInFileManagerKind === undefined
          ? revealInFileExplorerLabelForOs(serverConfig.environment.platform.os)
          : revealInFileExplorerLabelForKind(serverConfig.shellRevealInFileManagerKind)
        : undefined,
    canOpenDefault: availableEditors.includes("file-manager"),
    editorIds: availableEditors,
  };

  const activate = async (
    action: FileContextMenuAction,
    target: FileContextMenuTarget,
  ): Promise<void> => {
    if (action === "copy-absolute-path" || action === "copy-relative-path") {
      await copyTargetPath(action, target);
      return;
    }
    const absolutePath = resolveFileContextMenuAbsolutePath(target);
    if (absolutePath === null || environmentId === null) return;

    const reveal = action === "reveal-in-folder";
    const editor =
      action === "open" || reveal
        ? ("file-manager" as const)
        : (action.slice("editor:".length) as EditorId);
    if (action !== "open" && !reveal && !capabilities.editorIds.includes(editor)) return;

    const result = await openInEditor({
      environmentId,
      input: { cwd: absolutePath, editor, ...(reveal ? { reveal: true } : {}) },
    });
    if (result._tag !== "Failure") return;
    toastManager.add({
      type: "error",
      title:
        action === "open"
          ? t.tools.files.openFailed
          : reveal
            ? t.tools.files.revealFailed
            : t.tools.files.openEditorFailed(EDITOR_LABEL_BY_ID.get(editor) ?? editor),
      description: absolutePath,
    });
  };

  const buildItems = (target: FileContextMenuTarget) =>
    buildFileContextMenuItems({
      hasAbsolutePath: resolveFileContextMenuAbsolutePath(target) !== null,
      hasRelativePath: resolveFileContextMenuRelativePath(target) !== null,
      capabilities,
    });

  const show = async (
    target: FileContextMenuTarget,
    position?: { x: number; y: number },
  ): Promise<void> => {
    const api = readLocalApi();
    const items = buildItems(target);
    if (items.length === 0 || api === undefined) return;
    const clicked = await api.contextMenu.show(items, position);
    if (clicked === null) return;
    await activate(clicked as FileContextMenuAction, target);
  };

  return {
    buildItems,
    capabilities,
    activate,
    show,
  };
}

export function useFileContextMenuHandler(environmentId: EnvironmentId | null) {
  const contextMenu = useFileContextMenu(environmentId);
  return (target: FileContextMenuTarget, event?: { clientX: number; clientY: number }) => {
    void contextMenu.show(target, event ? { x: event.clientX, y: event.clientY } : undefined);
  };
}
