/** Displays thread synchronization without taking ownership of composer submission state. */
import { Spinner } from "~/components/ui/spinner";

import { threadSyncLabel, type ThreadSyncPhase } from "../../threadSync";
import { ComposerBanner } from "./ComposerBanner";

/** Shows synchronization separately from send progress so reconnecting does not imply a new turn. */
export function ComposerActivityRow({ phase }: { readonly phase: ThreadSyncPhase }) {
  return (
    <ComposerBanner.Row>
      <ComposerBanner.Icon>
        <Spinner />
      </ComposerBanner.Icon>
      <ComposerBanner.Content>
        <span
          className="shrink-0 whitespace-nowrap text-muted-foreground"
          data-composer-sync-status={phase}
          role="status"
        >
          {threadSyncLabel(phase)}
        </span>
      </ComposerBanner.Content>
    </ComposerBanner.Row>
  );
}
