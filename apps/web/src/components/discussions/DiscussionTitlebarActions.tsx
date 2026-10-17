/** Keeps a single focusable discussion action surface mounted across titlebar layout changes. */
import { useCallback, useRef } from "react";
import { EllipsisIcon, PauseIcon, PlayIcon, Trash2Icon } from "lucide-react";
import { t } from "~/i18n";
import { useTitlebarPanelLayout } from "../frame/titlebarSlot";
import { Button } from "../ui/button";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../ui/menu";
import type { DiscussionHeaderView } from "./discussionPage.logic";

type Action = DiscussionHeaderView["actions"][number];

/**
 * Uses the same permissions and commands for the menu and full buttons.
 * Base UI restores focus after the portaled menu unmounts; its target is resolved
 * against the replacement controls, not the removed compact trigger.
 */
export function DiscussionTitlebarActions({
  actions,
  enabled,
  onAction,
}: {
  actions: Action[];
  enabled: (action: Action) => boolean;
  onAction: (action: Action) => void;
}) {
  const { compact } = useTitlebarPanelLayout();
  const container = useRef<HTMLDivElement>(null);
  const returnFocus = useCallback(
    () =>
      container.current?.querySelector<HTMLButtonElement>("button:not(:disabled)") ??
      container.current,
    [],
  );
  /** Shares menu item dispatch and permission checks between compact and ended-discussion menus. */
  const menuItem = (action: Action) => (
    <MenuItem
      key={action}
      disabled={!enabled(action)}
      variant={action === "more" ? "destructive" : "default"}
      onClick={() => onAction(action)}
    >
      {action === "stop" ? (
        <PauseIcon />
      ) : action === "resume" ? (
        <PlayIcon />
      ) : action === "more" ? (
        <Trash2Icon />
      ) : null}
      {action === "more" ? t.discussions.page.deleteDiscussion : t.discussions.page[action]}
    </MenuItem>
  );
  return (
    <div ref={container} tabIndex={-1} className="ml-auto flex min-w-0 items-center gap-2">
      {compact ? (
        <Menu key="compact">
          <MenuTrigger
            render={
              <Button
                variant="secondary"
                size="icon-toolbar"
                aria-label={t.discussions.page.more}
              />
            }
          >
            <EllipsisIcon />
          </MenuTrigger>
          <MenuPopup align="end" finalFocus={returnFocus}>
            {actions.map(menuItem)}
          </MenuPopup>
        </Menu>
      ) : (
        actions.map((action) =>
          action === "more" ? (
            <Menu key={action}>
              <MenuTrigger
                render={
                  <Button
                    variant="secondary"
                    size="icon-toolbar"
                    disabled={!enabled(action)}
                    aria-label={t.discussions.page.more}
                  />
                }
              >
                <EllipsisIcon />
              </MenuTrigger>
              <MenuPopup align="end" className="w-45" finalFocus={returnFocus}>
                {menuItem(action)}
              </MenuPopup>
            </Menu>
          ) : (
            <Button
              key={action}
              disabled={!enabled(action)}
              onClick={() => onAction(action)}
              variant={action === "resume" ? "default" : "secondary"}
              size="toolbar"
              aria-label={t.discussions.page[action]}
            >
              {action === "stop" ? <PauseIcon /> : action === "resume" ? <PlayIcon /> : null}
              {t.discussions.page[action]}
            </Button>
          ),
        )
      )}
    </div>
  );
}
