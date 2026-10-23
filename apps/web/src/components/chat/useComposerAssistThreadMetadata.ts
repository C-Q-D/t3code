/** Shares value-stable thread quota and cache metadata across composer assistance features. */
import { useAtomValue } from "@effect/atom-react";
import { isComposerAssistSupportedDriver, type ScopedThreadRef } from "@t3tools/contracts";
import { threadKey, parseThreadKey } from "@t3tools/client-runtime/state/entities";
import { Atom } from "effect/reactivity";
import * as DateTime from "effect/DateTime";
import { environmentThreadDetails } from "../../state/threads";

const emptyMetadata = { completedRuns: 0, lastTurnCompletedAt: null, promptCacheExpiresAt: null };
const emptyMetadataAtom = Atom.make(emptyMetadata);

// Atom.family holds weak values; idle subscriptions are released when the composer leaves.
const assistThreadMetadataAtom = Atom.family((key: string) => {
  const { environmentId, threadId } = parseThreadKey(key);
  const atom = Atom.make((get) => {
    const projection = get(
      environmentThreadDetails.threadAtom({ environmentId, threadId }),
    )?.projection;
    const last = projection?.providerTurns.reduce<(typeof projection.providerTurns)[number] | null>(
      (latest, turn) => {
        if (turn.completedAt === null) return latest;
        return latest?.completedAt == null ||
          DateTime.toEpochMillis(turn.completedAt) > DateTime.toEpochMillis(latest.completedAt)
          ? turn
          : latest;
      },
      null,
    );
    return {
      completedRuns: projection?.runs.filter((run) => run.status === "completed").length ?? 0,
      lastTurnCompletedAt: last?.completedAt == null ? null : DateTime.formatIso(last.completedAt),
      promptCacheExpiresAt: last?.tokenUsage?.promptCacheExpiresAt ?? null,
    };
  });
  return Atom.withEquality(
    atom,
    (a, b) =>
      a.completedRuns === b.completedRuns &&
      a.lastTurnCompletedAt === b.lastTurnCompletedAt &&
      a.promptCacheExpiresAt === b.promptCacheExpiresAt,
  ).pipe(Atom.setIdleTTL(0));
});

/**
 * Subscribes only to completed-run and cache values, never to tool or message updates.
 * @param target Existing thread, or null when there is no server thread.
 * @param suggestionsEnabled Whether automatic suggestions are enabled.
 * @param optimizeEnabled Whether explicit prompt improvement is enabled.
 * @param driver Thread session driver; unsupported drivers do not subscribe.
 * @returns Value-stable quota metadata; absent projections use empty metadata.
 */
export function useComposerAssistThreadMetadata(
  target: ScopedThreadRef | null,
  suggestionsEnabled: boolean,
  optimizeEnabled: boolean,
  driver: string,
) {
  return useAtomValue(
    target && (suggestionsEnabled || optimizeEnabled) && isComposerAssistSupportedDriver(driver)
      ? assistThreadMetadataAtom(threadKey(target))
      : emptyMetadataAtom,
  );
}
