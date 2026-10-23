/** Owns the empty-composer suggestion lifecycle; never submits a user message. */
import { isComposerThreadGenerating } from "@t3tools/shared/composerAssist/isComposerThreadGenerating";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import {
  COMPOSER_SUGGESTION_MIN_COMPLETED_RUNS,
  composerCacheExpiresAt,
  composerCacheMaybeExpired,
  isComposerAssistSupportedDriver,
  type OrchestrationV2ThreadShell,
  type ScopedThreadRef,
  type RunId,
} from "@t3tools/contracts";
import { type AtomRegistry } from "effect/reactivity";
import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { threadKey } from "@t3tools/client-runtime/state/entities";
import { useStableCallback } from "../../hooks/useStableCallback";
import { composerAssistEnvironment } from "../../state/composerAssist";
import { useAtomCommand } from "../../state/use-atom-command";

// Retain only the latest request per thread, including failures and composer remounts.
// latestRunId advances normally. Edit from here can move it backwards; that permits
// one new request, though the restored draft normally blocks it via composerEmpty.
const requestedRuns = new WeakMap<AtomRegistry.AtomRegistry, Map<string, RunId>>();

/**
 * Requests once for the latest run per thread after local gates pass; rollback may request again.
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
  const allowed = useAtomValue(
    composerAssistEnvironment.suggestNext.permissionAtom(input.target?.environmentId ?? null),
  );
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
    allowed &&
    input.enabled &&
    input.connected &&
    input.composerEmpty &&
    isComposerAssistSupportedDriver(input.driver) &&
    input.shell !== null &&
    input.shell.interactionMode !== "plan" &&
    input.shell.pendingRuntimeRequest === null &&
    input.completedRuns >= COMPOSER_SUGGESTION_MIN_COMPLETED_RUNS &&
    input.shell.lastErrorClass == null &&
    !isComposerThreadGenerating(input.shell);
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
      requested = new Map();
      requestedRuns.set(registry, requested);
    }
    const targetKey = threadKey(target);
    if (requested.get(targetKey) === runId) return;
    requested.set(targetKey, runId);
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
