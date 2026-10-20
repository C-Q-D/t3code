/** Shows the latest reversible thread action and registers its visible footer slot. */
import { t } from "~/i18n";
import { useAtomValue } from "@effect/atom-react";

import { undoLatestThreadAction, useThreadUndoNotice } from "../../hooks/showThreadUndoNotice";
import { shortcutLabelForCommand } from "../../keybindings";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { Alert, AlertDescription } from "../ui/alert";
import { InlineButton } from "../ui/button";
import { sidebarNoticeRegistry } from "./SidebarChrome";

/** Keeps the footer visible while an undo notice is available. */
export function SidebarThreadUndoNotice() {
  const notice = useThreadUndoNotice((state) => state.notice);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  sidebarNoticeRegistry.useRegister("undo", notice !== null);

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
