/** Hosts right-panel dismissal; chat overlays sit below the titlebar while other hosts keep their sheet layout. */
import { type ReactNode } from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { t } from "~/i18n";

import { Sheet, SheetPopup, SheetPortal } from "./ui/sheet";

/** Keeps dismissal and focus in Base UI; discussion selects H2 without changing A4 or legacy hosts. */
export function RightPanelSheet(props: {
  animationDurationMs: number;
  children: ReactNode;
  open: boolean;
  onClose: () => void;
  standalone?: boolean;
  discussion?: boolean;
}) {
  const transitionStyle = { transitionDuration: `${props.animationDurationMs}ms` };
  return (
    <Sheet
      open={props.open}
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
        }
      }}
    >
      {props.discussion ? (
        <SheetPortal keepMounted>
          <SheetPrimitive.Backdrop className="discussion-diff-backdrop fixed inset-0" />
          <SheetPrimitive.Viewport className="discussion-diff-viewport pointer-events-none fixed inset-0 flex justify-end p-2.5">
            <SheetPrimitive.Popup
              aria-label={t.discussions.diff.panelTitle}
              className="pointer-events-auto flex min-h-0 w-140 max-w-full flex-col outline-none"
            >
              {props.children}
            </SheetPrimitive.Popup>
          </SheetPrimitive.Viewport>
        </SheetPortal>
      ) : props.standalone ? (
        <SheetPortal keepMounted>
          <SheetPrimitive.Backdrop
            className="right-panel-overlay-region dialog-backdrop motion-safe:transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0"
            style={transitionStyle}
          />
          <SheetPrimitive.Viewport className="right-panel-overlay-region right-panel-overlay-viewport pointer-events-none flex justify-end">
            <SheetPrimitive.Popup
              aria-label={t.chat.rightPanel.panelTitle}
              className="pointer-events-auto flex min-h-0 w-150 max-w-full flex-col outline-none motion-safe:transition-panel-overlay data-ending-style:translate-x-full data-ending-style:opacity-0 data-starting-style:translate-x-full data-starting-style:opacity-0"
              style={transitionStyle}
            >
              {props.children}
            </SheetPrimitive.Popup>
          </SheetPrimitive.Viewport>
        </SheetPortal>
      ) : (
        <SheetPopup
          transitionDurationMs={props.animationDurationMs}
          side="right"
          showCloseButton={false}
          keepMounted
          className="w-[min(42vw,28rem)] min-w-80 max-w-[28rem] max-[760px]:w-[min(88vw,24rem)] max-[760px]:min-w-0 wco:mt-(--workspace-topbar-height) wco:h-[calc(100%-var(--workspace-topbar-height))] wco:max-h-[calc(100%-var(--workspace-topbar-height))]"
        >
          {props.children}
        </SheetPopup>
      )}
    </Sheet>
  );
}
