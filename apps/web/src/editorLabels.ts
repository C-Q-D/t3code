/** Resolves editor action labels while preserving product names and editor identifiers. */
import { t } from "~/i18n";
import { EDITORS, type EditorId } from "@t3tools/contracts";

import { getLocalFileManagerName } from "~/lib/utils";

const editorLabels = new Map<EditorId, string>(EDITORS.map((editor) => [editor.id, editor.label]));

/** Returns the editorId display name for platform, resolving the platform file manager specially and falling back to a generic editor label. */
export function editorLabelForPlatform(editorId: EditorId, platform: string): string {
  if (editorId === "file-manager") {
    return getLocalFileManagerName(platform);
  }

  return editorLabels.get(editorId) ?? t.app.editor.fallback;
}

/** Returns the open action for editorId; null and file-manager use a generic editor action. */
export function openInEditorMenuLabel(editorId: EditorId | null): string {
  return editorId === null || editorId === "file-manager"
    ? t.app.editor.open
    : t.app.editor.openNamed(editorLabels.get(editorId) ?? t.app.editor.fallback);
}
