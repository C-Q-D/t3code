/** Hosts local seat drafts on the creation route until the complete creation form is supplied. */
import { useState } from "react";
import type { EnvironmentId } from "@t3tools/contracts";
import { t } from "~/i18n";
import { isElectron } from "~/env";
import { useEnvironments } from "~/state/environments";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { DiscussionSeats } from "./DiscussionSeats";
import type { DiscussionDraftSeat } from "./discussionSeats.logic";

/** Chooses a connected catalog destination without dispatching discussion creation. */
export function DiscussionSeatDraftPage() {
  const { environments } = useEnvironments();
  const environment = environments.find((item) => item.connection.phase === "connected");
  return (
    <SidebarInset>
      <WorkspacePageHeader electron={isElectron}>
        <h1 className="truncate text-sm font-medium">{t.discussions.newTitle}</h1>
      </WorkspacePageHeader>
      <div className="flex flex-1 items-center justify-center px-10 pb-14">
        <div className="w-full max-w-192">
          {environment ? (
            <SeatDraft key={environment.environmentId} environmentId={environment.environmentId} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t.settings.scheduledTasks.disconnected}
            </p>
          )}
        </div>
      </div>
    </SidebarInset>
  );
}

/**
 * Holds only the ordered local array.
 * @param props.environmentId Fixed catalog destination.
 * @returns Seat controls without a start-discussion action.
 */
function SeatDraft({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const [seats, setSeats] = useState<readonly DiscussionDraftSeat[]>([]);
  return <DiscussionSeats environmentId={environmentId} seats={seats} onChange={setSeats} />;
}
