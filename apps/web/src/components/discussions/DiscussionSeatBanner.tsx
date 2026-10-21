/** Reads only seat-thread list metadata and builds a permanent composer banner descriptor. */
import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, DiscussionId, DiscussionSeatId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { Atom } from "effect/reactivity";
import { ArrowUpRightIcon, MessagesSquareIcon } from "lucide-react";
import { t } from "~/i18n";
import { serverEnvironment } from "~/state/server";
import type { ComposerBannerStackItem } from "../chat/ComposerBannerStack";
import { PixelSeat } from "./PixelSeat";
import { Button } from "../ui/button";
import {
  discussionSeatBannerMetadata,
  discussionSeatBannerView,
  type DiscussionSeatBannerMetadata,
} from "./discussionSeatBanner.logic";

const NO_SEAT_METADATA = Atom.make<DiscussionSeatBannerMetadata | null>(null);

/**
 * Subscribes to the shared environment list only for an associated server thread.
 * @param ref Environment and stored shell discussion/seat IDs; null for drafts or ordinary threads.
 * @returns An info/notice descriptor without dismissal, or null for an unassociated thread.
 * Transport reconnection/release belongs to the existing query atom; no additional RPC is created.
 */
export function useDiscussionSeatBanner(
  ref: {
    environmentId: EnvironmentId;
    discussionId: DiscussionId;
    seatId: DiscussionSeatId;
  } | null,
): ComposerBannerStackItem | null {
  const environmentId = ref?.environmentId;
  const discussionId = ref?.discussionId;
  const seatId = ref?.seatId;
  const metadataAtom = (() => {
    if (!environmentId || !discussionId || !seatId) return NO_SEAT_METADATA;
    let previous: DiscussionSeatBannerMetadata | null = null;
    return Atom.make((get) => {
      const result = get(serverEnvironment.discussionsLive({ environmentId, input: {} }));
      const next = discussionSeatBannerMetadata({ discussionId, seatId }, result);
      // The full list is shared, but unrelated titles/seats/status updates must not rerender ChatView.
      if (
        previous?.title === next?.title &&
        previous?.personaName === next?.personaName &&
        previous?.avatar === next?.avatar &&
        previous?.seatIndex === next?.seatIndex
      )
        return previous;
      previous = next;
      return next;
    }).pipe(Atom.setIdleTTL(0));
  })();
  const metadata = useAtomValue(metadataAtom);
  const view = discussionSeatBannerView(ref, metadata, t.discussions);
  if (!view || !environmentId || !discussionId) return null;
  const { openDiscussionId: target, ...notice } = view;
  return {
    ...notice,
    icon: <MessagesSquareIcon />,
    title: (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {notice.title}
        {metadata?.avatar && metadata.personaName ? (
          <PixelSeat
            role={metadata.avatar}
            seatIndex={metadata.seatIndex}
            state="idle"
            size={18}
            label={metadata.personaName}
          />
        ) : null}
      </span>
    ),
    actions: target ? (
      <Button
        size="notice"
        variant="ghost-strong"
        render={
          <Link
            to="/discussions/$environmentId/$discussionId"
            params={{ environmentId, discussionId }}
          />
        }
      >
        {t.discussions.seatThread.open}
        <ArrowUpRightIcon className="size-3.25" aria-hidden />
      </Button>
    ) : null,
  };
}
