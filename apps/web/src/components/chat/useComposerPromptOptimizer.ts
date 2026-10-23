/** Owns one composer's explicit prompt improvement, draft snapshot and transient feedback. */
import {
  isComposerAssistSupportedDriver,
  composerCacheExpiresAt,
  composerCacheMaybeExpired,
  type ComposerOptimizeResult,
  type EnvironmentId,
  type ThreadId,
} from "@t3tools/contracts";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { useAtomValue } from "@effect/atom-react";
import { composerAssistEnvironment } from "~/state/composerAssist";
import { useAtomCommand } from "~/state/use-atom-command";
import { t } from "~/i18n";
import type { AtomCommand, AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import type { ComposerPromptEditorHandle } from "../ComposerPromptEditor";

/** One in-flight operation survives editor remounts; entries disappear on every settlement. */
type PendingOptimization = {
  draftKey: string;
  text: string;
  cursor: number;
  runKey: string | null | undefined;
};
type CommandResponse =
  typeof composerAssistEnvironment.optimizePrompt extends AtomCommand<infer _W, infer A, infer E>
    ? AtomCommandResult<A, E>
    : never;
const requests = new Map<string, PendingOptimization>();
const requestListeners = new Set<() => void>();
const resultConsumers = new Map<
  string,
  Set<(request: PendingOptimization, response: CommandResponse) => void>
>();

/** Notifies mounted editors; useSyncExternalStore compares each thread's own entry. */
function notifyRequests() {
  for (const listener of requestListeners) listener();
}

/** Live composer inputs; only the editor text is replaced, never the send configuration. */
export interface ComposerPromptOptimizerInput {
  environmentId: EnvironmentId;
  threadId: ThreadId | null;
  draftKey: string;
  prompt: string;
  driver: string;
  enabled: boolean;
  running: boolean;
  lastTurnCompletedAt?: string | null;
  promptCacheExpiresAt?: string | null;
  runKey?: string | null;
  onReplaced?: () => void;
  editorRef: RefObject<ComposerPromptEditorHandle | null>;
}

/** Captures the current draft when explicitly triggered; never sends a chat message. */
export function useComposerPromptOptimizer(input: ComposerPromptOptimizerInput) {
  const allowed = useAtomValue(
    composerAssistEnvironment.optimizePrompt.permissionAtom(input.environmentId),
  );
  const execute = useAtomCommand(composerAssistEnvironment.optimizePrompt, {
    reportFailure: false,
  });
  const [feedback, setFeedback] = useState<{
    label: string;
    done: boolean;
    draftKey: string;
    text?: string;
  } | null>(null);
  const requestKey = JSON.stringify([input.environmentId, input.threadId]);
  const pendingRequest = useSyncExternalStore(
    (listener) => {
      requestListeners.add(listener);
      return () => {
        requestListeners.delete(listener);
      };
    },
    () => requests.get(requestKey),
    () => undefined,
  );
  const inFlight = pendingRequest !== undefined;
  const [now, setNow] = useState(() => Date.now());
  const expiresAt = composerCacheExpiresAt({
    driver: input.driver,
    lastTurnCompletedAt: input.lastTurnCompletedAt ?? null,
    promptCacheExpiresAt: input.promptCacheExpiresAt,
  });
  const cacheMaybeExpired = composerCacheMaybeExpired(expiresAt, now);
  useEffect(() => {
    if (expiresAt === null) return;
    // Wake only at the cache boundary, without repainting on a clock interval.
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(2147483647, Math.max(0, expiresAt - Date.now() + 1)),
    );
    return () => window.clearTimeout(timer);
  }, [expiresAt]);
  const latest = useRef(input);
  useLayoutEffect(() => {
    latest.current = input;
  });
  const original = useRef<{ draftKey: string; text: string; cursor: number } | null>(null);
  const copy = t.composer.assist.optimize;
  const visible = input.enabled && allowed;
  const [availability] = useState(() => {
    let available = false;
    const listeners = new Set<() => void>();
    return {
      getSnapshot: () => available,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      update: (next: boolean) => {
        if (available === next) return;
        available = next;
        for (const listener of listeners) listener();
      },
    };
  });
  const shown =
    feedback?.draftKey === input.draftKey && (!feedback.done || feedback.text === input.prompt)
      ? feedback
      : null;
  // Editing dismisses the completed operation permanently, even if the user later types it back.
  if (feedback?.done && shown === null) setFeedback(null);
  const disabledReason = inFlight
    ? copy.inFlight
    : !input.prompt.trim()
      ? copy.disabledEmpty
      : !isComposerAssistSupportedDriver(input.driver)
        ? copy.disabledProvider
        : input.running || !input.threadId
          ? copy.disabledRunning
          : null;
  useLayoutEffect(() => {
    availability.update(visible && disabledReason === null);
    return () => availability.update(false);
  }, [availability, visible, disabledReason]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), feedback.done ? 8000 : 3000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useLayoutEffect(() => {
    const consume = (request: PendingOptimization, response: CommandResponse) => {
      const current = latest.current;
      if (current.draftKey !== request.draftKey) return;
      const feedbackForDraft = { draftKey: current.draftKey };
      if (
        current.runKey !== request.runKey ||
        current.editorRef.current?.readSnapshot().value !== request.text ||
        current.running
      ) {
        setFeedback({ ...feedbackForDraft, label: copy.discarded, done: false });
        return;
      }
      if (response._tag === "Failure") {
        setFeedback({
          ...feedbackForDraft,
          label: copy.failed(copy.reason.connection),
          done: false,
        });
        return;
      }
      const result = response.value;
      if (result._tag === "Optimized") {
        // Native undo captures this selection, so the explicit undo must restore the same one.
        original.current = {
          ...request,
          cursor: current.editorRef.current!.readSnapshot().expandedCursor,
        };
        if (current.editorRef.current?.replacePrompt(result.text)) {
          current.onReplaced?.();
          setFeedback({ ...feedbackForDraft, label: copy.done, done: true, text: result.text });
        }
      } else {
        setFeedback({ ...feedbackForDraft, label: optimizeFailureLabel(result), done: false });
      }
    };
    let consumers = resultConsumers.get(requestKey);
    if (!consumers) {
      consumers = new Set();
      resultConsumers.set(requestKey, consumers);
    }
    consumers.add(consume);
    return () => {
      consumers.delete(consume);
      if (consumers.size === 0) resultConsumers.delete(requestKey);
    };
  }, [requestKey, copy]);

  const trigger = async () => {
    if (!visible || disabledReason || !input.threadId || requests.has(requestKey)) return;
    const snapshot = input.editorRef.current?.readSnapshot();
    if (!snapshot?.value.trim()) return;
    const request: PendingOptimization = {
      draftKey: input.draftKey,
      text: snapshot.value,
      cursor: snapshot.expandedCursor,
      runKey: input.runKey,
    };
    requests.set(requestKey, request);
    notifyRequests();
    setNow(Date.now());
    setFeedback(null);
    // The server owns the deadline. Explicit user actions are never retried automatically.
    try {
      const response = await execute({
        environmentId: input.environmentId,
        input: {
          threadId: input.threadId,
          draft: snapshot.value,
          style: "default",
        },
      });
      // Only the currently mounted editor consumes the result, never a stale instance closure.
      const consumer = [...(resultConsumers.get(requestKey) ?? [])].at(-1);
      consumer?.(request, response);
    } finally {
      requests.delete(requestKey);
      notifyRequests();
    }
  };
  const undo = () => {
    const snapshot = original.current;
    if (!snapshot || snapshot.draftKey !== input.draftKey || !shown?.done) return;
    input.editorRef.current?.replacePrompt(snapshot.text, snapshot.cursor);
    input.onReplaced?.();
    original.current = null;
    setFeedback(null);
  };
  return {
    trigger,
    undo,
    label:
      inFlight && pendingRequest.draftKey === input.draftKey
        ? `${copy.inFlight}${cacheMaybeExpired ? ` · ${copy.maybeFullPrice}` : ""}`
        : (shown?.label ?? ""),
    done: shown?.done ?? false,
    inFlight,
    visible,
    disabledReason,
    cacheMaybeExpired,
    availability,
  };
}

/** Maps protocol refusals to the specified UI reasons; never exposes provider diagnostics. */
function optimizeFailureLabel(result: Exclude<ComposerOptimizeResult, { _tag: "Optimized" }>) {
  const copy = t.composer.assist.optimize;
  if (result._tag === "Filtered" && result.reason === "unchanged") return copy.unchanged;
  const reasons = {
    timeout: copy.reason.timeout,
    session_resume_failed: copy.reason.sessionResumeFailed,
    provider_error: copy.reason.providerError,
    interrupted: copy.reason.providerError,
    usage_limit: copy.reason.usageLimit,
    transport_error: copy.reason.connection,
    empty: copy.reason.empty,
    too_long: copy.reason.tooLong,
    references_dropped: copy.reason.referencesDropped,
  };
  const reason =
    result.reason in reasons
      ? reasons[result.reason as keyof typeof reasons]
      : copy.reason.unavailable;
  return copy.failed(reason);
}
