/** Owns one composer's explicit prompt improvement, draft snapshot and transient feedback. */
import {
  isComposerAssistSupportedDriver,
  type ComposerOptimizeResult,
  type EnvironmentId,
  type ThreadId,
} from "@t3tools/contracts";
import { useEffect, useRef, useState, type RefObject } from "react";
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
  const [feedback, setFeedback] = useState<{ label: string; done: boolean } | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const original = useRef<{ draftKey: string; text: string; cursor: number } | null>(null);
  const copy = t.composer.assist.optimize;
  const visible = input.enabled && allowed;
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
    if (!visible || disabledReason || !input.threadId) return;
    const snapshot = input.editorRef.current?.readSnapshot();
    if (!snapshot?.value.trim()) return;
    original.current = {
      draftKey: input.draftKey,
      text: snapshot.value,
      cursor: snapshot.expandedCursor,
    };
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
    setInFlight(false);
    if (response._tag === "Failure") {
      setFeedback({ label: copy.failed(copy.reason.connection), done: false });
      return;
    }
    const result = response.value;
    if (result._tag === "Optimized") {
      if (input.editorRef.current?.replacePrompt(result.text))
        setFeedback({ label: copy.done, done: true });
    } else {
      setFeedback({ label: optimizeFailureLabel(result), done: false });
    }
  };
  const undo = () => {
    const snapshot = original.current;
    if (!snapshot || snapshot.draftKey !== input.draftKey || !feedback?.done) return;
    input.editorRef.current?.replacePrompt(snapshot.text, snapshot.cursor);
    original.current = null;
    setFeedback(null);
  };
  return {
    trigger,
    undo,
    label: inFlight ? copy.inFlight : (feedback?.label ?? ""),
    done: feedback?.done ?? false,
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
