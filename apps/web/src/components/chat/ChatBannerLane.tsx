/** Keeps status notices outside timeline layout so their height and clocks cannot move messages. */
import { TimelineStatusBanners } from "./TimelineStatusBanners";
import type { ComposerBannerStackItem, ComposerBannerStackContent } from "./ComposerBannerStack";
import type {
  OrchestrationV2ProviderFailureClass,
  ProviderInstanceId,
  ServerProvider,
  ThreadId,
} from "@t3tools/contracts";
import type { Dispatch, SetStateAction, ReactNode } from "react";
import { ProviderStatusBanner } from "./ProviderStatusBanner";
import { dismissThreadErrorBannerForSession, ThreadErrorBanner } from "./ThreadErrorBanner";

/**
 * The banners pinned above the timeline. The dismiss handlers are built here from plain
 * values, so a ChatView render that changes neither banner leaves both cached.
 */
export function ChatBannerLane(props: {
  timelineItems: readonly (ComposerBannerStackItem | ComposerBannerStackContent)[];
  threadStatusLine: ReactNode;
  providerStatus: ServerProvider | null;
  providerStatusBannerKey: string | null;
  setDismissedProviderStatusBannerKey: Dispatch<SetStateAction<string | null>>;
  onOpenProviderSetup: (instanceId: ProviderInstanceId) => void;
  threadId: ThreadId;
  threadError: string | null;
  threadErrorClass: OrchestrationV2ProviderFailureClass | null;
  threadErrorCode: string | null;
  threadErrorBannerKey: string | null;
  setThreadError: (threadId: ThreadId | null, error: string | null) => void;
  setThreadErrorBannerDismissTick: Dispatch<SetStateAction<number>>;
}) {
  const {
    providerStatus,
    providerStatusBannerKey,
    setDismissedProviderStatusBannerKey,
    onOpenProviderSetup,
    threadId,
    threadError,
    threadErrorClass,
    threadErrorCode,
    threadErrorBannerKey,
    setThreadError,
    setThreadErrorBannerDismissTick,
  } = props;
  return (
    <div className="chat-banner-lane pointer-events-none absolute top-0 z-20 flex flex-col">
      <TimelineStatusBanners items={props.timelineItems}>
        <ProviderStatusBanner
          status={providerStatus}
          onDismiss={() => setDismissedProviderStatusBannerKey(providerStatusBannerKey)}
          onOpenProviderSetup={onOpenProviderSetup}
        />
        <ThreadErrorBanner
          error={threadError}
          errorClass={threadErrorClass}
          errorCode={threadErrorCode}
          onDismiss={() => {
            setThreadError(threadId, null);
            dismissThreadErrorBannerForSession(threadErrorBannerKey);
            setThreadErrorBannerDismissTick((tick) => tick + 1);
          }}
        />
        {props.threadStatusLine}
      </TimelineStatusBanners>
    </div>
  );
}
