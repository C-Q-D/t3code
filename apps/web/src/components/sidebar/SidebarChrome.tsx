/** Sidebar undo and update notices; project and utility navigation lives in ProjectRail. */
import { memo } from "react";
import { SidebarFooter, SidebarMenu } from "../ui/sidebar";
import { SidebarThreadUndoNotice } from "./SidebarThreadUndoNotice";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";

/** Collapse empty notice containers while keeping undo, provider, and architecture notices visible. */
export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  return (
    <SidebarFooter className="not-has-[[data-slot=alert],.sidebar-provider-update,.sidebar-update-pill]:hidden">
      <SidebarThreadUndoNotice />
      <div className="sidebar-update-stack not-has-[[data-slot=alert],.sidebar-provider-update,.sidebar-update-pill]:hidden">
        <SidebarProviderUpdatePill />
        <SidebarUpdateArchitectureWarning />
        <SidebarMenu>
          <SidebarUpdatePill />
        </SidebarMenu>
      </div>
    </SidebarFooter>
  );
});
