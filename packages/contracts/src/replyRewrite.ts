/** Display-only reply rewrites; source selection, hashing, authorization and persistence belong to the server. */
import * as Effect from "effect/Effect";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as Schema from "effect/Schema";

import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  EnvironmentAuthorizationError,
} from "./auth.ts";
import {
  IsoDateTime,
  MessageId,
  NonNegativeInt,
  PositiveInt,
  RunId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";

export const ReplyRewriteRequestedServiceTier = Schema.Literals(["priority", "default"]);
export type ReplyRewriteRequestedServiceTier = typeof ReplyRewriteRequestedServiceTier.Type;

const ReplyRewriteConfigFields = {
  binaryPath: TrimmedNonEmptyString.pipe(Schema.withDecodingDefault(Effect.succeed("pi"))),
  provider: TrimmedNonEmptyString.pipe(Schema.withDecodingDefault(Effect.succeed("openai-codex"))),
  modelId: TrimmedNonEmptyString.pipe(Schema.withDecodingDefault(Effect.succeed("gpt-6.1-terra"))),
  thinkingLevel: TrimmedNonEmptyString.pipe(Schema.withDecodingDefault(Effect.succeed("max"))),
  requestedServiceTier: ReplyRewriteRequestedServiceTier.pipe(
    Schema.withDecodingDefault(Effect.succeed("priority" as const)),
  ),
  // Empty selects the service's default prompt; custom text is preserved verbatim.
  customPrompt: Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
};

/** Independent of main conversation and global Pi settings; edits affect only future requests. */
export const ReplyRewriteSettings = Schema.Struct({
  auto: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  ...ReplyRewriteConfigFields,
});
export type ReplyRewriteSettings = typeof ReplyRewriteSettings.Type;
export const DEFAULT_REPLY_REWRITE_SETTINGS = Schema.decodeSync(ReplyRewriteSettings)({});

/** Partial edits merge under the settings lock; omitted fields retain their current values. */
export const ReplyRewriteSettingsPatch = Schema.Struct({
  auto: Schema.optionalKey(Schema.Boolean),
  binaryPath: Schema.optionalKey(TrimmedNonEmptyString),
  provider: Schema.optionalKey(TrimmedNonEmptyString),
  modelId: Schema.optionalKey(TrimmedNonEmptyString),
  thinkingLevel: Schema.optionalKey(TrimmedNonEmptyString),
  requestedServiceTier: Schema.optionalKey(ReplyRewriteRequestedServiceTier),
  customPrompt: Schema.optionalKey(Schema.String),
});
export type ReplyRewriteSettingsPatch = typeof ReplyRewriteSettingsPatch.Type;

/** Captured at acceptance; later settings edits cannot change an accepted attempt. */
export const ReplyRewriteConfigSnapshot = Schema.Struct({
  binaryPath: TrimmedNonEmptyString,
  provider: TrimmedNonEmptyString,
  modelId: TrimmedNonEmptyString,
  thinkingLevel: TrimmedNonEmptyString,
  requestedServiceTier: ReplyRewriteRequestedServiceTier,
  customPrompt: Schema.String,
});
export type ReplyRewriteConfigSnapshot = typeof ReplyRewriteConfigSnapshot.Type;

export const ReplyRewriteRequestId = TrimmedNonEmptyString.check(Schema.isMaxLength(512));
export type ReplyRewriteRequestId = typeof ReplyRewriteRequestId.Type;
/** SHA-256 of the exact source text or effective configuration, computed only by the server. */
export const ReplyRewriteHash = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));
export type ReplyRewriteHash = typeof ReplyRewriteHash.Type;

/** IDs are local to the destination environment; requests never supply source text or a trusted hash. */
export const ReplyRewriteTargetInput = Schema.Struct({
  threadId: ThreadId,
  runId: RunId,
  messageId: MessageId,
});
export type ReplyRewriteTargetInput = typeof ReplyRewriteTargetInput.Type;

export const ReplyRewriteTarget = Schema.Struct({
  ...ReplyRewriteTargetInput.fields,
  sourceHash: ReplyRewriteHash,
});
export type ReplyRewriteTarget = typeof ReplyRewriteTarget.Type;

export const ReplyRewriteStatus = Schema.Literals([
  "queued",
  "running",
  "succeeded",
  "failed",
  "interrupted",
  "cancelled",
]);
export type ReplyRewriteStatus = typeof ReplyRewriteStatus.Type;

export const ReplyRewriteErrorCode = Schema.Literals([
  "configuration",
  "protocol",
  "provider",
  "empty_output",
  "truncated",
  "timeout",
  "interrupted",
  "not_found",
  "not_eligible",
  "source_changed",
  "request_conflict",
]);
export type ReplyRewriteErrorCode = typeof ReplyRewriteErrorCode.Type;
export const ReplyRewriteFailure = Schema.Struct({
  code: ReplyRewriteErrorCode,
  message: Schema.String,
});
export type ReplyRewriteFailure = typeof ReplyRewriteFailure.Type;

const ReplyRewriteIdentityFields = {
  requestId: ReplyRewriteRequestId,
  generation: PositiveInt,
  target: ReplyRewriteTarget,
  configHash: ReplyRewriteHash,
  configSnapshot: ReplyRewriteConfigSnapshot,
};

/** The latest request's state; interrupted means its result is unknown, never implicit success. */
export const ReplyRewriteAttempt = Schema.Struct({
  ...ReplyRewriteIdentityFields,
  status: ReplyRewriteStatus,
  requestedAt: IsoDateTime,
  startedAt: Schema.NullOr(IsoDateTime),
  finishedAt: Schema.NullOr(IsoDateTime),
  error: Schema.NullOr(ReplyRewriteFailure),
});
export type ReplyRewriteAttempt = typeof ReplyRewriteAttempt.Type;

export const ReplyRewriteUsage = Schema.Struct({
  inputTokens: Schema.optionalKey(NonNegativeInt),
  outputTokens: Schema.optionalKey(NonNegativeInt),
  totalTokens: Schema.optionalKey(NonNegativeInt),
});
export type ReplyRewriteUsage = typeof ReplyRewriteUsage.Type;

/** The sole retained successful body; its identity is independent of the current attempt. */
export const ReplyRewriteSuccess = Schema.Struct({
  ...ReplyRewriteIdentityFields,
  text: Schema.String.check(Schema.makeFilter((text) => text.trim().length > 0)),
  model: TrimmedNonEmptyString,
  requestedServiceTier: ReplyRewriteRequestedServiceTier,
  actualServiceTier: Schema.NullOr(Schema.String),
  usage: Schema.NullOr(ReplyRewriteUsage),
  completedAt: IsoDateTime,
});
export type ReplyRewriteSuccess = typeof ReplyRewriteSuccess.Type;

export const ReplyRewriteRecord = Schema.Struct({
  target: ReplyRewriteTarget,
  currentAttempt: Schema.NullOr(ReplyRewriteAttempt),
  lastSuccess: Schema.NullOr(ReplyRewriteSuccess),
});
export type ReplyRewriteRecord = typeof ReplyRewriteRecord.Type;

const { text: _successText, ...successSummaryFields } = ReplyRewriteSuccess.fields;
export const ReplyRewriteSummary = Schema.Struct({
  ...ReplyRewriteRecord.fields,
  lastSuccess: Schema.NullOr(Schema.Struct(successSummaryFields)),
});
export type ReplyRewriteSummary = typeof ReplyRewriteSummary.Type;

export const ReplyRewriteListInput = Schema.Struct({
  threadId: ThreadId,
  cursor: Schema.optionalKey(MessageId),
  limit: Schema.optionalKey(PositiveInt.check(Schema.isLessThanOrEqualTo(100))),
});
export type ReplyRewriteListInput = typeof ReplyRewriteListInput.Type;
export const ReplyRewriteListResult = Schema.Struct({
  records: Schema.Array(ReplyRewriteSummary),
  nextCursor: Schema.NullOr(MessageId),
  revision: NonNegativeInt,
});
export type ReplyRewriteListResult = typeof ReplyRewriteListResult.Type;

export const ReplyRewriteSubscribeInput = Schema.Struct({
  threadId: ThreadId,
  afterRevision: NonNegativeInt,
});
export type ReplyRewriteSubscribeInput = typeof ReplyRewriteSubscribeInput.Type;
/** Invalidation only. Bodies are read through getDetail and never enter shell/sidebar streams. */
export const ReplyRewriteChange = Schema.Struct({
  revision: PositiveInt,
  threadId: ThreadId,
  runId: RunId,
  messageId: MessageId,
});
export type ReplyRewriteChange = typeof ReplyRewriteChange.Type;

export const ReplyRewriteGetDetailInput = ReplyRewriteTargetInput;
export type ReplyRewriteGetDetailInput = typeof ReplyRewriteGetDetailInput.Type;
export const ReplyRewriteGetDetailResult = Schema.NullOr(ReplyRewriteRecord);
export type ReplyRewriteGetDetailResult = typeof ReplyRewriteGetDetailResult.Type;

/** Retransmissions reuse requestId; regenerate and retry use a fresh ID and server generation. */
export const ReplyRewriteRequestInput = Schema.Struct({
  ...ReplyRewriteTargetInput.fields,
  requestId: ReplyRewriteRequestId,
});
export type ReplyRewriteRequestInput = typeof ReplyRewriteRequestInput.Type;

/** Cancels only this requestId, so a delayed cancellation cannot stop its replacement. */
export const ReplyRewriteCancelInput = ReplyRewriteRequestInput;
export type ReplyRewriteCancelInput = typeof ReplyRewriteCancelInput.Type;

export class ReplyRewriteError extends Schema.TaggedError<ReplyRewriteError>()(
  "ReplyRewriteError",
  {
    ...ReplyRewriteFailure.fields,
  },
) {}

export const REPLY_REWRITE_WS_METHODS = {
  getDetail: "replyRewrite.getDetail",
  request: "replyRewrite.request",
  cancel: "replyRewrite.cancel",
  list: "replyRewrite.list",
  subscribe: "replyRewrite.subscribe",
} as const;

/** Shared by the active client registry and destination server authorization. */
export const REPLY_REWRITE_RPC_SCOPES = {
  [REPLY_REWRITE_WS_METHODS.getDetail]: AuthOrchestrationReadScope,
  [REPLY_REWRITE_WS_METHODS.request]: AuthOrchestrationOperateScope,
  [REPLY_REWRITE_WS_METHODS.cancel]: AuthOrchestrationOperateScope,
  [REPLY_REWRITE_WS_METHODS.list]: AuthOrchestrationReadScope,
  [REPLY_REWRITE_WS_METHODS.subscribe]: AuthOrchestrationReadScope,
} as const;

export const ReplyRewriteRpcSchemas = {
  getDetail: { input: ReplyRewriteGetDetailInput, output: ReplyRewriteGetDetailResult },
  request: { input: ReplyRewriteRequestInput, output: ReplyRewriteRecord },
  cancel: { input: ReplyRewriteCancelInput, output: ReplyRewriteRecord },
  list: { input: ReplyRewriteListInput, output: ReplyRewriteListResult },
  subscribe: { input: ReplyRewriteSubscribeInput, output: ReplyRewriteChange },
} as const;

const ReplyRewriteRpcError = Schema.Union([ReplyRewriteError, EnvironmentAuthorizationError]);

/** Merged into WsRpcGroup; handlers delegate to the destination's rewrite service. */
export const ReplyRewriteRpcGroup = RpcGroup.make(
  Rpc.make(REPLY_REWRITE_WS_METHODS.list, {
    payload: ReplyRewriteListInput,
    success: ReplyRewriteListResult,
    error: ReplyRewriteRpcError,
  }),
  Rpc.make(REPLY_REWRITE_WS_METHODS.subscribe, {
    payload: ReplyRewriteSubscribeInput,
    success: ReplyRewriteChange,
    error: ReplyRewriteRpcError,
    stream: true,
  }),
  Rpc.make(REPLY_REWRITE_WS_METHODS.getDetail, {
    payload: ReplyRewriteGetDetailInput,
    success: ReplyRewriteGetDetailResult,
    error: ReplyRewriteRpcError,
  }),
  Rpc.make(REPLY_REWRITE_WS_METHODS.request, {
    payload: ReplyRewriteRequestInput,
    success: ReplyRewriteRecord,
    error: ReplyRewriteRpcError,
  }),
  Rpc.make(REPLY_REWRITE_WS_METHODS.cancel, {
    payload: ReplyRewriteCancelInput,
    success: ReplyRewriteRecord,
    error: ReplyRewriteRpcError,
  }),
);
