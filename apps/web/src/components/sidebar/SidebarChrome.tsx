/** Sidebar undo and update notices; project and utility navigation lives in ProjectRail. */
import { memo } from "react";
import { SidebarFooter, SidebarMenu } from "../ui/sidebar";
import { SidebarThreadUndoNotice } from "./SidebarThreadUndoNotice";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  return (
    <SidebarFooter>
      <SidebarThreadUndoNotice />
      <div className="sidebar-update-stack">
        <SidebarProviderUpdatePill />
        <SidebarUpdateArchitectureWarning />
        <SidebarMenu>
          <SidebarUpdatePill />
        </SidebarMenu>
      </div>
    </SidebarFooter>
  );
});
