/** Provides the workspace frame for discussion routes while their full views are implemented. */
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { isElectron } from "../../env";

/** Renders a title and an explicit availability message without exposing discussion controls. */
export function DiscussionPlaceholderPage({
  title,
  message,
}: {
  readonly title: string;
  readonly message: string;
}) {
  return (
    <SidebarInset>
      <WorkspacePageHeader electron={isElectron}>
        <h1 className="min-w-0 truncate text-sm font-medium">{title}</h1>
      </WorkspacePageHeader>
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </SidebarInset>
  );
}
