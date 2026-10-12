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
import { OrchestrationV2Actor, OrchestrationV2CreationSource } from "./orchestrationV2.ts";

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

export const DiscussionPrompt = Schema.Struct({
  id: DiscussionPromptId,
  kind: Schema.Literals(["persona", "summary"]),
  name: TrimmedNonEmptyString,
  prompt: TrimmedNonEmptyString,
  builtin: Schema.Boolean,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
/** Editable prompt; builtin identity remains fixed so defaults can be restored. */
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
  modelSelection: ModelSelection,
  threadId: ThreadId,
});
/** A seat owns an independent app thread and a frozen persona prompt. */
export type DiscussionSeat = typeof DiscussionSeat.Type;

export const Discussion = Schema.Struct({
  id: DiscussionId,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  topic: Schema.String,
  seats: Schema.Array(DiscussionSeat).check(Schema.isMinLength(1)),
  status: Schema.Literals(["speaking", "paused", "closing", "ended"]),
  cursor: Schema.Struct({
    seatIndex: NonNegativeInt,
    turnNo: NonNegativeInt,
    runId: Schema.NullOr(RunId),
    dispatchedEntrySeq: NonNegativeInt,
  }),
  pause: Schema.NullOr(
    Schema.Struct({
      reason: Schema.Literals(["stopped", "seat_failed", "server_restarted"]),
      seatId: Schema.optionalKey(DiscussionSeatId),
      message: Schema.optionalKey(Schema.String),
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

export const DiscussionPromptListInput = Schema.Struct({
  kind: Schema.optionalKey(DiscussionPrompt.fields.kind),
});
/** Omit kind to list both prompt categories. */
export type DiscussionPromptListInput = typeof DiscussionPromptListInput.Type;
export const DiscussionPromptListResult = Schema.Struct({
  prompts: Schema.Array(DiscussionPrompt),
});
/** Complete prompt snapshot for list and subscription responses. */
export type DiscussionPromptListResult = typeof DiscussionPromptListResult.Type;
export const DiscussionPromptUpsertInput = Schema.Struct({
  id: Schema.optionalKey(DiscussionPromptId),
  kind: DiscussionPrompt.fields.kind,
  name: TrimmedNonEmptyString,
  prompt: TrimmedNonEmptyString,
});
/** Missing id creates a custom prompt; present id updates an existing prompt of the same kind. */
export type DiscussionPromptUpsertInput = typeof DiscussionPromptUpsertInput.Type;
export const DiscussionPromptDeleteInput = Schema.Struct({ id: DiscussionPromptId });
/** Prompt selected for deletion or builtin restoration. */
export type DiscussionPromptDeleteInput = typeof DiscussionPromptDeleteInput.Type;
export const DiscussionPromptRestoreBuiltinInput = DiscussionPromptDeleteInput;
/** Restoration retains the builtin's durable identity and creation time. */
export type DiscussionPromptRestoreBuiltinInput = typeof DiscussionPromptRestoreBuiltinInput.Type;
export const DiscussionPromptMutationResult = Schema.Struct({ prompt: DiscussionPrompt });
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
