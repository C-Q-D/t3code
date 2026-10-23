/** Owns the empty-composer suggestion lifecycle; never submits a user message. */
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import {
  COMPOSER_SUGGESTION_MIN_COMPLETED_RUNS,
  composerCacheExpiresAt,
  composerCacheMaybeExpired,
  isComposerAssistSupportedDriver,
  type OrchestrationV2ThreadShell,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { Atom, type AtomRegistry } from "effect/reactivity";
import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { threadKey, parseThreadKey } from "@t3tools/client-runtime/state/entities";
import { useStableCallback } from "../../hooks/useStableCallback";
import { composerAssistEnvironment } from "../../state/composerAssist";
import { useAtomCommand } from "../../state/use-atom-command";
import { environmentThreadDetails } from "../../state/threads";
import * as DateTime from "effect/DateTime";

const emptyMetadata = { completedRuns: 0, lastTurnCompletedAt: null, promptCacheExpiresAt: null };
const emptyMetadataAtom = Atom.make(emptyMetadata);

// Atom.family holds weak values; idle subscriptions are released when the composer leaves.
const suggestionMetadataAtom = Atom.family((key: string) => {
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
 * @param enabled Client suggestion setting; false removes the projection subscription.
 * @param driver Thread session driver; unsupported drivers do not subscribe.
 * @returns Value-stable quota metadata; absent projections use empty metadata.
 */
export function useComposerSuggestionMetadata(
  target: ScopedThreadRef | null,
  enabled: boolean,
  driver: string,
) {
  return useAtomValue(
    target && enabled && isComposerAssistSupportedDriver(driver)
      ? suggestionMetadataAtom(threadKey(target))
      : emptyMetadataAtom,
  );
}
// Registry lifetime matches a client session, including composer remounts. Failures
// remain recorded because retrying the same prediction would spend quota again.
const requestedRuns = new WeakMap<AtomRegistry.AtomRegistry, Set<string>>();

/**
 * Requests at most one prediction per environment/thread/run after local gates pass.
 * @param input Current shell, draft eligibility and completed-turn cache metadata;
 * a null target/shell means no server thread, and a missing cache time is unknown.
 * @returns Visible prediction or null, plus an acceptance callback that retires it.
 * RPC failures are silent, with no retries; the server owns the query deadline.
 * Replies are unary. Stale replies never update the current draft or send messages.
 */
export function useComposerSuggestion(input: {
  readonly target: ScopedThreadRef | null;
  readonly shell: Pick<
    OrchestrationV2ThreadShell,
    | "latestRunId"
    | "status"
    | "activeRunId"
    | "interactionMode"
    | "pendingRuntimeRequest"
    | "lastErrorClass"
    | "usageLimitResetAt"
  > | null;
  readonly driver: string;
  readonly enabled: boolean;
  readonly connected: boolean;
  readonly composerEmpty: boolean;
  readonly completedRuns: number;
  readonly lastTurnCompletedAt: string | null;
  readonly promptCacheExpiresAt: string | null | undefined;
}) {
  const registry = useContext(RegistryContext);
  const request = useAtomCommand(composerAssistEnvironment.suggestNext, {
    reportFailure: false,
    reportDefect: false,
  });
  const suggestNext = useStableCallback(request);
  const key =
    input.target && input.shell?.latestRunId
      ? JSON.stringify([threadKey(input.target), input.shell.latestRunId])
      : null;
  const eligible =
    input.enabled &&
    input.connected &&
    input.composerEmpty &&
    isComposerAssistSupportedDriver(input.driver) &&
    input.shell !== null &&
    input.shell.interactionMode !== "plan" &&
    input.shell.pendingRuntimeRequest === null &&
    input.completedRuns >= COMPOSER_SUGGESTION_MIN_COMPLETED_RUNS &&
    input.shell.lastErrorClass == null &&
    input.shell.status === "idle" &&
    input.shell.activeRunId === null;
  const [suggestion, setSuggestion] = useState<{ key: string; text: string } | null>(null);
  const current = useRef({ key, eligible, generation: 0, mounted: false });
  useLayoutEffect(() => {
    if (current.current.key !== key || !eligible) current.current.generation++;
    current.current.key = key;
    current.current.eligible = eligible;
    current.current.mounted = true;
    return () => {
      current.current.mounted = false;
    };
  }, [key, eligible]);
  // Retire a visible suggestion permanently when the user types or leaves its
  // context; clearing the draft later must not resurrect an old prediction.
  if (suggestion !== null && (!eligible || suggestion.key !== key)) setSuggestion(null);

  const target = input.target;
  const runId = input.shell?.latestRunId;
  const resetAt = input.shell?.usageLimitResetAt;
  const expiresAt = composerCacheExpiresAt({
    driver: input.driver,
    lastTurnCompletedAt: input.lastTurnCompletedAt,
    promptCacheExpiresAt: input.promptCacheExpiresAt,
  });
  useEffect(() => {
    if (!eligible || key === null || target === null || !runId) return;
    const now = Date.now();
    if ((resetAt && Date.parse(resetAt) > now) || composerCacheMaybeExpired(expiresAt, now)) return;
    let requested = requestedRuns.get(registry);
    if (!requested) {
      requested = new Set();
      requestedRuns.set(registry, requested);
    }
    if (requested.has(key)) return;
    requested.add(key);
    const generation = current.current.generation;
    void suggestNext({
      environmentId: target.environmentId,
      input: { threadId: target.threadId, runId },
    }).then((result) => {
      const latest = current.current;
      if (
        !latest.mounted ||
        !latest.eligible ||
        latest.key !== key ||
        latest.generation !== generation
      )
        return;
      if (
        result._tag === "Success" &&
        result.value._tag === "Suggested" &&
        result.value.runId === runId
      ) {
        setSuggestion({ key, text: result.value.text });
      }
    });
  }, [eligible, key, target, runId, resetAt, expiresAt, registry, suggestNext]);

  return {
    suggestion: eligible && suggestion?.key === key ? suggestion.text : null,
    accept: () => setSuggestion(null),
  };
}
