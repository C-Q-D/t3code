import { useEffect } from "react";
import {
  resolveReplyCitationSource,
  type ReplyReadingPreference,
  type ReplyReadingResult,
} from "@t3tools/client-runtime/state/reply-reading";
import type { AssistantCitationTarget } from "./AssistantCitationSource";

export function useReplyCitationReading({
  request,
  available,
  preference,
  waiting,
  onSelect,
  onUnavailable,
}: {
  request: AssistantCitationTarget | null;
  available: ReplyReadingResult;
  preference: ReplyReadingPreference;
  waiting: boolean;
  onSelect: (preference: ReplyReadingPreference) => void;
  onUnavailable: () => void;
}) {
  const source =
    request && !request.readingSelection.isSelected()
      ? resolveReplyCitationSource(request.citation, available)
      : null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- citation activation is external navigation that selects its saved display version
  useEffect(() => {
    if (!request || request.readingSelection.isSelected()) return;
    if (source === "unavailable" && !waiting) {
      request.readingSelection.select();
      request.onComplete();
      onUnavailable();
    } else if (source === "original" || source === "rewrite") {
      request.readingSelection.select();
      onSelect(source);
    }
  }, [request, source, waiting, onSelect, onUnavailable]);
  return {
    preference: source === "original" || source === "rewrite" ? source : preference,
    select: (value: ReplyReadingPreference) => {
      request?.readingSelection.release();
      onSelect(value);
    },
  };
}
