/** Isolates cache metadata from streaming thread content so the composer stays quiet. */
import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, type ThreadId } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";
import * as DateTime from "effect/DateTime";
import { environmentThreadDetails } from "~/state/threads";

const empty = {
  lastTurnCompletedAt: null as string | null,
  promptCacheExpiresAt: null as string | null,
};
const emptyAtom = Atom.make(empty);
const cacheAtoms = Atom.family((key: string) => {
  const [environmentId, threadId] = JSON.parse(key) as [EnvironmentId, ThreadId];
  let previous = empty;
  return Atom.make((get) => {
    const thread = get(
      environmentThreadDetails.threadAtom(scopeThreadRef(environmentId, threadId)),
    );
    let latest: NonNullable<typeof thread>["projection"]["providerTurns"][number] | undefined;
    for (const turn of thread?.projection.providerTurns ?? []) {
      if (
        turn.completedAt !== null &&
        (!latest ||
          DateTime.toEpochMillis(turn.completedAt) > DateTime.toEpochMillis(latest.completedAt!))
      )
        latest = turn;
    }
    const lastTurnCompletedAt = latest?.completedAt ? DateTime.formatIso(latest.completedAt) : null;
    const promptCacheExpiresAt = latest?.tokenUsage?.promptCacheExpiresAt ?? null;
    if (
      previous.lastTurnCompletedAt !== lastTurnCompletedAt ||
      previous.promptCacheExpiresAt !== promptCacheExpiresAt
    )
      previous = { lastTurnCompletedAt, promptCacheExpiresAt };
    return previous;
  }).pipe(Atom.setIdleTTL(0));
});

/** Subscribes only when enabled for a supported thread; unchanged scalar values retain identity. */
export function useComposerPromptCache(
  environmentId: EnvironmentId,
  threadId: ThreadId | null,
  enabled: boolean,
) {
  return useAtomValue(
    enabled && threadId ? cacheAtoms(JSON.stringify([environmentId, threadId])) : emptyAtom,
  );
}
