/** Selects display text without changing canonical messages or provider context. */
import type {
  AssistantCitation,
  EnvironmentId,
  ReplyRewriteRecord,
  ReplyRewriteFailure,
  ReplyRewriteTargetInput,
} from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

export type ReplyReadingPreference = "original" | "rewrite" | null;
export interface ReplyReadingIdentity extends ReplyRewriteTargetInput {
  readonly environmentId: EnvironmentId;
}

const preferences = Atom.family((_key: string) =>
  Atom.make<ReplyReadingPreference>(null).pipe(Atom.setIdleTTL("30 minutes")),
);

/** Client-only choices expire after 30 idle minutes and never enter provider history. */
export function replyReadingPreferenceAtom(identity: ReplyReadingIdentity) {
  return preferences(
    JSON.stringify([identity.environmentId, identity.threadId, identity.messageId]),
  );
}

export interface ReplyReadingInput {
  readonly identity: ReplyReadingIdentity;
  readonly sourceText: string;
  readonly detail: {
    readonly environmentId: EnvironmentId;
    readonly sourceText: string;
    readonly record: ReplyRewriteRecord | null;
  } | null;
  readonly preference: ReplyReadingPreference;
  readonly failure?: ReplyRewriteFailure | null;
}

export interface ReplyReadingResult {
  readonly text: string;
  readonly source: "original" | "rewrite";
  readonly rewriteRequestId?: string;
  readonly successAvailable: boolean;
}

export function resolveReplyReading(input: ReplyReadingInput): ReplyReadingResult {
  const detail = input.detail;
  const record = detail?.record;
  const success = record?.lastSuccess;
  const failure = input.failure ?? record?.currentAttempt?.error;
  const sourceUnavailable =
    failure?.code === "source_changed" ||
    failure?.code === "not_found" ||
    failure?.code === "not_eligible";
  const matchesTarget = (target: ReplyRewriteTargetInput) =>
    target.threadId === input.identity.threadId &&
    target.runId === input.identity.runId &&
    target.messageId === input.identity.messageId;
  if (
    !detail ||
    detail.environmentId !== input.identity.environmentId ||
    detail.sourceText !== input.sourceText ||
    !record ||
    !success ||
    sourceUnavailable ||
    !matchesTarget(record.target) ||
    !matchesTarget(success.target) ||
    success.target.sourceHash !== record.target.sourceHash
  ) {
    return { text: input.sourceText, source: "original", successAvailable: false };
  }
  if (input.preference === "original")
    return { text: input.sourceText, source: "original", successAvailable: true };
  return {
    text: success.text,
    source: "rewrite",
    rewriteRequestId: success.requestId,
    successAvailable: true,
  };
}

/** V1 always means original; V2 must identify the one retained successful rewrite. */
export function resolveReplyCitationSource(
  citation: AssistantCitation,
  reading: ReplyReadingResult,
): "original" | "rewrite" | "unavailable" {
  if (citation.version === 1 || citation.source === "original") return "original";
  return reading.successAvailable && reading.rewriteRequestId === citation.rewriteRequestId
    ? "rewrite"
    : "unavailable";
}
