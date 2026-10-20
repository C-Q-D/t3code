/** Sidebar undo and update notices; project and utility navigation lives in ProjectRail. */
import { memo } from "react";
import { createPresenceRegistry } from "../../lib/presenceRegistry";
import { SidebarFooter, SidebarMenu } from "../ui/sidebar";
import { SidebarThreadUndoNotice } from "./SidebarThreadUndoNotice";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";

/** Counts only visible notices within the footer; undo does not add update-tray styling. */
export const sidebarNoticeRegistry = createPresenceRegistry<
  "undo" | "provider" | "warning" | "pill"
>();

/** Collapse empty notice containers while keeping undo, provider, and architecture notices visible. */
export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  const { counts, onChange } = sidebarNoticeRegistry.usePresence();
  const hasPill = (counts.provider ?? 0) + (counts.pill ?? 0) > 0;
  const stackEmpty = !hasPill && (counts.warning ?? 0) === 0;
  const footerEmpty = stackEmpty && (counts.undo ?? 0) === 0;
  return (
    <sidebarNoticeRegistry.Provider onChange={onChange}>
      <SidebarFooter data-empty={footerEmpty} className="data-[empty=true]:hidden">
        <SidebarThreadUndoNotice />
        <div
          data-empty={stackEmpty}
          data-has-pill={hasPill ? "true" : "false"}
          className="sidebar-update-stack data-[empty=true]:hidden"
        >
          <SidebarProviderUpdatePill />
          <SidebarUpdateArchitectureWarning />
          <SidebarMenu>
            <SidebarUpdatePill />
          </SidebarMenu>
        </div>
      </SidebarFooter>
    </sidebarNoticeRegistry.Provider>
  );
});
