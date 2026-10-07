import { t } from "~/i18n";
import { useAtomValue } from "@effect/atom-react";

import { undoLatestThreadAction, useThreadUndoNotice } from "../../hooks/showThreadUndoNotice";
import { shortcutLabelForCommand } from "../../keybindings";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { Alert, AlertDescription } from "../ui/alert";
import { InlineButton } from "../ui/button";

export function SidebarThreadUndoNotice() {
  const notice = useThreadUndoNotice((state) => state.notice);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);

  if (!notice) return null;
  const shortcut = shortcutLabelForCommand(keybindings, "thread.undo");

  return (
    <Alert role="status" variant="sidebar">
      <AlertDescription>
        {t.sidebar.undo.actionNotice(notice.action, notice.count)}{" "}
        <InlineButton onClick={undoLatestThreadAction}>
          {shortcut ? t.sidebar.undo.shortcutHint(shortcut) : t.sidebar.undo.undo}
        </InlineButton>
      </AlertDescription>
    </Alert>
  );
}
