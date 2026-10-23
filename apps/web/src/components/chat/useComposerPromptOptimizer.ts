/** Owns one composer's explicit prompt improvement, draft snapshot and transient feedback. */
import {
  isComposerAssistSupportedDriver,
  type ComposerOptimizeResult,
  type EnvironmentId,
  type ThreadId,
} from "@t3tools/contracts";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useAtomValue } from "@effect/atom-react";
import { composerAssistEnvironment } from "~/state/composerAssist";
import { useAtomCommand } from "~/state/use-atom-command";
import { t } from "~/i18n";
import type { ComposerPromptEditorHandle } from "../ComposerPromptEditor";

/** Live composer inputs; only the editor text is replaced, never the send configuration. */
export interface ComposerPromptOptimizerInput {
  environmentId: EnvironmentId;
  threadId: ThreadId | null;
  draftKey: string;
  prompt: string;
  driver: string;
  enabled: boolean;
  running: boolean;
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
  const [inFlight, setInFlight] = useState(false);
  const [pendingDraftKey, setPendingDraftKey] = useState<string | null>(null);
  const pending = useRef(false);
  const latest = useRef(input);
  const epoch = useRef(0);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    if (
      latest.current.draftKey !== input.draftKey ||
      latest.current.environmentId !== input.environmentId
    )
      epoch.current += 1;
    latest.current = input;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current += 1;
    };
  }, []);
  const original = useRef<{ draftKey: string; text: string; cursor: number } | null>(null);
  const copy = t.composer.assist.optimize;
  const visible = input.enabled && allowed;
  const shown =
    feedback?.draftKey === input.draftKey && (!feedback.done || feedback.text === input.prompt)
      ? feedback
      : null;
  const disabledReason = inFlight
    ? copy.inFlight
    : !input.prompt.trim()
      ? copy.disabledEmpty
      : !isComposerAssistSupportedDriver(input.driver)
        ? copy.disabledProvider
        : input.running || !input.threadId
          ? copy.disabledRunning
          : null;

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), feedback.done ? 8000 : 3000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const trigger = async () => {
    if (!visible || disabledReason || !input.threadId || pending.current) return;
    const snapshot = input.editorRef.current?.readSnapshot();
    if (!snapshot?.value.trim()) return;
    original.current = {
      draftKey: input.draftKey,
      text: snapshot.value,
      cursor: snapshot.expandedCursor,
    };
    const requestEpoch = epoch.current;
    pending.current = true;
    setPendingDraftKey(input.draftKey);
    setFeedback(null);
    setInFlight(true);
    // The server owns the deadline. Explicit user actions are never retried automatically.
    const response = await execute({
      environmentId: input.environmentId,
      input: {
        threadId: input.threadId,
        draft: snapshot.value,
        style: "default",
      },
    });
    pending.current = false;
    if (!mounted.current) return;
    setInFlight(false);
    if (requestEpoch !== epoch.current) return;
    const feedbackForDraft = { draftKey: input.draftKey };
    if (
      latest.current.editorRef.current?.readSnapshot().value !== snapshot.value ||
      latest.current.running
    ) {
      setFeedback({ ...feedbackForDraft, label: copy.discarded, done: false });
      return;
    }
    if (response._tag === "Failure") {
      setFeedback({ ...feedbackForDraft, label: copy.failed(copy.reason.connection), done: false });
      return;
    }
    const result = response.value;
    if (result._tag === "Optimized") {
      if (input.editorRef.current?.replacePrompt(result.text))
        setFeedback({ ...feedbackForDraft, label: copy.done, done: true, text: result.text });
    } else {
      setFeedback({ ...feedbackForDraft, label: optimizeFailureLabel(result), done: false });
    }
  };
  const undo = () => {
    const snapshot = original.current;
    if (!snapshot || snapshot.draftKey !== input.draftKey || !shown?.done) return;
    input.editorRef.current?.replacePrompt(snapshot.text, snapshot.cursor);
    original.current = null;
    setFeedback(null);
  };
  return {
    trigger,
    undo,
    label: inFlight && pendingDraftKey === input.draftKey ? copy.inFlight : (shown?.label ?? ""),
    done: shown?.done ?? false,
    inFlight,
    visible,
    disabledReason,
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
