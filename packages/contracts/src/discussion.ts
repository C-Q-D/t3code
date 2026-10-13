/** Discussion snapshots and template RPC contracts; turn execution belongs to server services. */
import * as Schema from "effect/Schema";
import {
  CheckpointRef,
  DiscussionId,
  DiscussionSeatId,
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  ProjectId,
  RunId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { ModelSelection } from "./modelSelection.ts";
import { ProviderInstanceId } from "./providerInstance.ts";
import { OrchestrationV2Actor, OrchestrationV2CreationSource } from "./orchestrationV2.ts";

/** Clients warn before the transport's hard limit; material remains complete. */
export const DISCUSSION_BRIEF_WARN_CHARS = 60_000;

export const DiscussionEntryId = TrimmedNonEmptyString.pipe(Schema.brand("DiscussionEntryId"));
/** Stable identity for one transcript entry. */
export type DiscussionEntryId = typeof DiscussionEntryId.Type;
export const DiscussionPromptId = TrimmedNonEmptyString.pipe(Schema.brand("DiscussionPromptId"));
/** Identity of a reusable persona or summary prompt. */
export type DiscussionPromptId = typeof DiscussionPromptId.Type;
export const DiscussionTemplateId = TrimmedNonEmptyString.pipe(
  Schema.brand("DiscussionTemplateId"),
);
/** Identity of a reusable ordered seat configuration. */
export type DiscussionTemplateId = typeof DiscussionTemplateId.Type;

export const DiscussionPersonaAvatar = Schema.Literals([
  "architect",
  "opponent",
  "implementer",
  "reviewer",
  "product",
]);
/** Persona-only avatars in picker order; the user's own avatar is not assignable. */
export type DiscussionPersonaAvatar = typeof DiscussionPersonaAvatar.Type;

export const DiscussionPrompt = Schema.Struct({
  id: DiscussionPromptId,
  kind: Schema.Literals(["persona", "summary"]),
  name: TrimmedNonEmptyString,
  prompt: TrimmedNonEmptyString,
  avatar: Schema.NullOr(DiscussionPersonaAvatar),
  description: Schema.String,
  builtin: Schema.Boolean,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
/** Editable prompt with an untrimmed, possibly empty description; summary avatars are null. Builtin identity remains fixed for restoration. */
export type DiscussionPrompt = typeof DiscussionPrompt.Type;

export const DiscussionTemplate = Schema.Struct({
  id: DiscussionTemplateId,
  name: TrimmedNonEmptyString,
  seats: Schema.Array(
    Schema.Struct({ personaPromptId: DiscussionPromptId, modelSelection: ModelSelection }),
  ).check(Schema.isMinLength(1)),
  summaryPromptId: Schema.NullOr(DiscussionPromptId),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
/** Seat array order defines speaking order; prompt references are validated by the service. */
export type DiscussionTemplate = typeof DiscussionTemplate.Type;

export const DiscussionSeat = Schema.Struct({
  id: DiscussionSeatId,
  personaName: TrimmedNonEmptyString,
  personaPrompt: Schema.String,
  avatar: DiscussionPersonaAvatar,
  modelSelection: ModelSelection,
  threadId: ThreadId,
});
/** A seat freezes persona name, prompt and avatar at discussion start; later persona edits do not change it. */
export type DiscussionSeat = typeof DiscussionSeat.Type;

export const Discussion = Schema.Struct({
  id: DiscussionId,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  topic: Schema.String,
  seats: Schema.Array(DiscussionSeat).check(Schema.isMinLength(1)),
  status: Schema.Literals(["speaking", "paused", "closing", "ended"]),
  cursor: Schema.Struct({
    /** Current dispatch assignment; absent only on snapshots written before phase publication. */
    phase: Schema.optionalKey(Schema.Literals(["regular", "final_round", "summarizing"])),
    seatIndex: NonNegativeInt,
    round: PositiveInt,
    dispatchNo: NonNegativeInt,
    runId: Schema.NullOr(RunId),
    dispatchedEntrySeq: NonNegativeInt,
    briefChars: NonNegativeInt,
    briefSentAsFile: Schema.Boolean,
  }),
  pause: Schema.NullOr(
    Schema.Struct({
      reason: Schema.Literals(["stopped", "seat_failed", "server_restarted"]),
      seatId: Schema.optionalKey(DiscussionSeatId),
      message: Schema.optionalKey(Schema.String),
      failureKind: Schema.optionalKey(Schema.Literals(["usage_limit", "error"])),
      resetAt: Schema.optionalKey(IsoDateTime),
    }),
  ),
  closing: Schema.NullOr(
    Schema.Struct({
      summarizerSeatId: DiscussionSeatId,
      summaryPrompt: Schema.String,
      remainingFinalSeatIds: Schema.Array(DiscussionSeatId),
      phase: Schema.Literals(["final_round", "summarizing"]),
    }),
  ),
  createdBy: OrchestrationV2Actor,
  creationSource: OrchestrationV2CreationSource,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  endedAt: Schema.NullOr(IsoDateTime),
});
/** Durable discussion state; no provider calls or scheduling are represented by this contract. */
export type Discussion = typeof Discussion.Type;

export const DiscussionEntry = Schema.Struct({
  id: DiscussionEntryId,
  discussionId: DiscussionId,
  seq: PositiveInt,
  kind: Schema.Literals(["user", "statement", "system", "summary"]),
  seatId: Schema.optionalKey(DiscussionSeatId),
  threadId: Schema.optionalKey(ThreadId),
  runId: Schema.optionalKey(RunId),
  round: Schema.optionalKey(PositiveInt),
  readBySeatId: Schema.optionalKey(DiscussionSeatId),
  /** Dispatch-time final statement attribution, independent of later cursor movement. */
  finalStatement: Schema.optionalKey(Schema.Literal(true)),
  text: Schema.String,
  files: Schema.NullOr(
    Schema.Array(
      Schema.Struct({ path: Schema.String, additions: NonNegativeInt, deletions: NonNegativeInt }),
    ),
  ),
  status: Schema.Literals(["completed", "interrupted", "failed"]),
  checkpointRef: Schema.NullOr(CheckpointRef),
  createdAt: IsoDateTime,
});
/** Ordered transcript entry; a provider run may produce at most one persisted entry. */
export type DiscussionEntry = typeof DiscussionEntry.Type;

export const DiscussionListItem = Schema.Struct({
  id: DiscussionId,
  projectId: ProjectId,
  title: Discussion.fields.title,
  status: Discussion.fields.status,
  seats: Schema.Array(
    Schema.Struct({
      id: DiscussionSeatId,
      personaName: DiscussionSeat.fields.personaName,
      avatar: DiscussionPersonaAvatar,
      modelSelection: ModelSelection,
    }),
  ),
  cursor: Schema.Struct({ seatIndex: NonNegativeInt, round: PositiveInt }),
  pause: Schema.NullOr(
    Schema.Struct({ reason: Schema.Literals(["stopped", "seat_failed", "server_restarted"]) }),
  ),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  endedAt: Schema.NullOr(IsoDateTime),
});
/** Small all-project list snapshot; excludes topic and trusted persona text. */
export type DiscussionListItem = typeof DiscussionListItem.Type;
export const DiscussionListInput = Schema.Struct({});
export const DiscussionListResult = Schema.Struct({
  discussions: Schema.Array(DiscussionListItem),
});
/** All discussions ordered by descending updatedAt. */
export type DiscussionListResult = typeof DiscussionListResult.Type;
export const DiscussionIdInput = Schema.Struct({ discussionId: DiscussionId });
/** Selects one durable discussion. */
export type DiscussionIdInput = typeof DiscussionIdInput.Type;
export const DiscussionMutationResult = Schema.Struct({ discussion: Discussion });
/** Snapshot after a successful lifecycle command. */
export type DiscussionMutationResult = typeof DiscussionMutationResult.Type;
export const DiscussionCreateInput = Schema.Struct({
  projectId: ProjectId,
  topic: Schema.String.check(Schema.isPattern(/\S/)),
  seats: DiscussionTemplate.fields.seats,
});
/** Ordered seats reference persona templates, copied at creation. */
export type DiscussionCreateInput = typeof DiscussionCreateInput.Type;
export const DiscussionInterjectInput = Schema.Struct({
  discussionId: DiscussionId,
  text: Schema.String.check(Schema.isPattern(/\S/)),
});
/** Adds user material without steering the active provider run. */
export type DiscussionInterjectInput = typeof DiscussionInterjectInput.Type;
export const DiscussionInterjectResult = Schema.Struct({ entry: DiscussionEntry });
/** Newly persisted user transcript entry. */
export type DiscussionInterjectResult = typeof DiscussionInterjectResult.Type;
export const DiscussionEndInput = Schema.Struct({
  discussionId: DiscussionId,
  summarizerSeatId: DiscussionSeatId,
  summaryPromptId: Schema.optionalKey(DiscussionPromptId),
});
/** Locks the summarizer and a summary prompt snapshot; omission selects the builtin default. */
export type DiscussionEndInput = typeof DiscussionEndInput.Type;
export const DiscussionProviderSupportResult = Schema.Struct({
  instances: Schema.Array(
    Schema.Struct({ instanceId: ProviderInstanceId, supported: Schema.Boolean }),
  ),
});
/** Capability support for every configured provider instance. */
export type DiscussionProviderSupportResult = typeof DiscussionProviderSupportResult.Type;
export const DiscussionEntryDiffInput = Schema.Struct({
  discussionId: DiscussionId,
  entryId: DiscussionEntryId,
});
/** Selects the statement whose workspace delta is requested. */
export type DiscussionEntryDiffInput = typeof DiscussionEntryDiffInput.Type;
export const DiscussionEntryDiffResult = Schema.Struct({
  discussionId: DiscussionId,
  entryId: DiscussionEntryId,
  diff: Schema.String,
});
/** Unified patch using the same checkpoint pair as transcript file statistics. */
export type DiscussionEntryDiffResult = typeof DiscussionEntryDiffResult.Type;
export const DiscussionSubscriptionEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("snapshot"),
    discussion: Discussion,
    entries: Schema.Array(DiscussionEntry),
  }),
  Schema.Struct({ type: Schema.Literal("discussion.updated"), discussion: Discussion }),
  Schema.Struct({ type: Schema.Literal("entry.appended"), entry: DiscussionEntry }),
  Schema.Struct({ type: Schema.Literal("entry.updated"), entry: DiscussionEntry }),
  Schema.Struct({ type: Schema.Literal("discussion.deleted"), discussionId: DiscussionId }),
]);
/** Initial consistent snapshot followed by lossless changes; deletion is the final event. */
export type DiscussionSubscriptionEvent = typeof DiscussionSubscriptionEvent.Type;

export const DiscussionPromptListInput = Schema.Struct({
  kind: Schema.optionalKey(DiscussionPrompt.fields.kind),
});
/** Omit kind to list both prompt categories. */
export type DiscussionPromptListInput = typeof DiscussionPromptListInput.Type;
export const DiscussionPromptWithModified = Schema.Struct({
  ...DiscussionPrompt.fields,
  modified: Schema.Boolean,
});
/**
 * Response-only comparison of builtin name, prompt, avatar and description against current defaults.
 * Reverting all four clears modified; a later release changing defaults can mark untouched rows modified.
 * Custom prompts and builtin ids absent from the defaults are false. This flag is never persisted.
 */
export type DiscussionPromptWithModified = typeof DiscussionPromptWithModified.Type;
export const DiscussionPromptListResult = Schema.Struct({
  prompts: Schema.Array(DiscussionPromptWithModified),
});
/** Complete prompt snapshot for list and subscription responses. */
export type DiscussionPromptListResult = typeof DiscussionPromptListResult.Type;
export const DiscussionPromptUpsertInput = Schema.Struct({
  id: Schema.optionalKey(DiscussionPromptId),
  kind: DiscussionPrompt.fields.kind,
  name: TrimmedNonEmptyString,
  prompt: TrimmedNonEmptyString,
  avatar: Schema.NullOr(DiscussionPersonaAvatar),
  description: Schema.String,
});
/** Missing id creates a custom prompt; present id updates the same kind. Persona avatars are required; summary avatars are null. Descriptions are saved unchanged. */
export type DiscussionPromptUpsertInput = typeof DiscussionPromptUpsertInput.Type;
export const DiscussionPromptDeleteInput = Schema.Struct({ id: DiscussionPromptId });
/** Prompt selected for deletion or builtin restoration. */
export type DiscussionPromptDeleteInput = typeof DiscussionPromptDeleteInput.Type;
export const DiscussionPromptRestoreBuiltinInput = DiscussionPromptDeleteInput;
/** Restoration retains the builtin's durable identity and creation time. */
export type DiscussionPromptRestoreBuiltinInput = typeof DiscussionPromptRestoreBuiltinInput.Type;
export const DiscussionPromptMutationResult = Schema.Struct({
  prompt: DiscussionPromptWithModified,
});
/** Persisted prompt after creation, update or restoration. */
export type DiscussionPromptMutationResult = typeof DiscussionPromptMutationResult.Type;
export const DiscussionPromptDeleteResult = DiscussionPromptDeleteInput;
/** Identity of the successfully deleted custom prompt. */
export type DiscussionPromptDeleteResult = typeof DiscussionPromptDeleteResult.Type;

export const DiscussionTemplateListInput = Schema.Struct({});
export const DiscussionTemplateListResult = Schema.Struct({
  templates: Schema.Array(DiscussionTemplate),
});
/** Complete discussion-template snapshot for list and subscription responses. */
export type DiscussionTemplateListResult = typeof DiscussionTemplateListResult.Type;
export const DiscussionTemplateUpsertInput = Schema.Struct({
  id: Schema.optionalKey(DiscussionTemplateId),
  name: DiscussionTemplate.fields.name,
  seats: DiscussionTemplate.fields.seats,
  summaryPromptId: DiscussionTemplate.fields.summaryPromptId,
});
/** Missing id creates a template; ordered seats must reference persona prompts. */
export type DiscussionTemplateUpsertInput = typeof DiscussionTemplateUpsertInput.Type;
export const DiscussionTemplateDeleteInput = Schema.Struct({ id: DiscussionTemplateId });
/** Existing template selected for deletion. */
export type DiscussionTemplateDeleteInput = typeof DiscussionTemplateDeleteInput.Type;
export const DiscussionTemplateMutationResult = Schema.Struct({ template: DiscussionTemplate });
/** Persisted template after creation or update. */
export type DiscussionTemplateMutationResult = typeof DiscussionTemplateMutationResult.Type;
export const DiscussionTemplateDeleteResult = DiscussionTemplateDeleteInput;
/** Identity of the successfully deleted discussion template. */
export type DiscussionTemplateDeleteResult = typeof DiscussionTemplateDeleteResult.Type;

/** Domain failures are shared by service callers and RPC clients. */
export class DiscussionError extends Schema.TaggedError<DiscussionError>()("DiscussionError", {
  reason: Schema.Literals([
    "not_found",
    "invalid_state",
    "in_use",
    "provider_unsupported",
    "orchestration_error",
  ]),
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}
