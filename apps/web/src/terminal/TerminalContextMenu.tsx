/** Pointer-positioned terminal menus; React owns dismissal and settles superseded selection requests. */
import { useStableCallback } from "~/hooks/useStableCallback";
import type { ContextMenuItem } from "@t3tools/contracts";
import { ArrowDown, ClipboardPaste, Copy, MessageSquarePlus, ScanText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Menu, MenuItem, MenuItemLabel, MenuPopup } from "~/components/ui/menu";
import type { SelectionActionPoint } from "~/lib/selectionActions";

/** Existing terminal operations shared by right-click and post-selection menus. */
export type TerminalContextMenuAction =
  | "add-to-chat"
  | "copy"
  | "paste"
  | "select-all"
  | "scroll-to-bottom";

/** One captured menu request; its source selection stays owned by the viewport. */
interface TerminalMenuRequest {
  items: readonly ContextMenuItem<TerminalContextMenuAction>[];
  position: SelectionActionPoint;
}

const actionIcons = {
  "add-to-chat": MessageSquarePlus,
  copy: Copy,
  paste: ClipboardPaste,
  "select-all": ScanText,
  "scroll-to-bottom": ArrowDown,
};

/**
 * Present terminal actions at viewport coordinates and resolve the selected id or null on dismissal.
 * A replacement or unmount cancels the outstanding request. getFocusTarget returns the current
 * visible terminal input, or null when focus must stay with another surface. No native menu is used.
 */
export function useTerminalContextMenu(getFocusTarget: () => HTMLElement | null) {
  const [request, setRequest] = useState<TerminalMenuRequest | null>(null);
  const resolveRef = useRef<((action: TerminalContextMenuAction | null) => void) | null>(null);
  const actionElementRef = useRef<HTMLDivElement>(null);
  const finish = useStableCallback((action: TerminalContextMenuAction | null = null) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setRequest(null);
    resolve?.(action);
  });
  const present = useStableCallback(
    (items: TerminalMenuRequest["items"], position: SelectionActionPoint) => {
      resolveRef.current?.(null);
      return new Promise<TerminalContextMenuAction | null>((resolve) => {
        resolveRef.current = resolve;
        setRequest({ items, position });
      });
    },
  );
  useEffect(
    () => () => {
      const resolve = resolveRef.current;
      resolveRef.current = null;
      resolve?.(null);
    },
    [],
  );
  const anchor = {
    getBoundingClientRect: () =>
      DOMRect.fromRect({
        x: request?.position.x ?? 0,
        y: request?.position.y ?? 0,
      }),
  };

  const menu = (
    <Menu
      open={request !== null}
      modal={false}
      onOpenChange={(open) => {
        if (!open) finish();
      }}
    >
      {request ? (
        <MenuPopup
          ref={actionElementRef}
          anchor={anchor}
          align="start"
          sideOffset={0}
          finalFocus={getFocusTarget}
        >
          {request.items.map((item) => {
            const Icon = actionIcons[item.id];
            return (
              <MenuItem key={item.id} disabled={item.disabled} onClick={() => finish(item.id)}>
                <Icon />
                <MenuItemLabel>{item.label}</MenuItemLabel>
              </MenuItem>
            );
          })}
        </MenuPopup>
      ) : null}
    </Menu>
  );
  return { present, dismiss: finish, actionElementRef, menu };
}
