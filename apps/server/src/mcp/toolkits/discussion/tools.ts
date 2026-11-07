/** Local discussion tools; execution and reference validation stay in the discussion services. */
import {
  Discussion,
  DiscussionCreateInput,
  DiscussionEndInput,
  DiscussionEntry,
  DiscussionEntryDiffInput,
  DiscussionEntryDiffResult,
  DiscussionIdInput,
  DiscussionInterjectInput,
  DiscussionInterjectResult,
  DiscussionListResult,
  DiscussionMutationResult,
  DiscussionProviderSupportResult,
  DiscussionSeat,
  OrchestrationV2UserInputQuestion,
  OrchestrationV2DispatchCommandResult,
  ProviderUserInputAnswers,
  RuntimeRequestId,
  DiscussionPromptDeleteInput,
  DiscussionPromptDeleteResult,
  DiscussionPromptListResult,
  DiscussionPromptMutationResult,
  DiscussionPromptUpsertInput,
  DiscussionTemplateDeleteInput,
  DiscussionTemplateDeleteResult,
  DiscussionTemplateListResult,
  DiscussionTemplateMutationResult,
  DiscussionTemplateUpsertInput,
  OrchestratorMcpFailure,
  OrchestratorMcpThreadWaitInput,
  OrchestratorMcpThreadWaitResult,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Crypto from "effect/Crypto";
import { McpSchema, Tool, Toolkit } from "effect/ai";
import * as DiscussionTemplates from "../../../discussions/DiscussionTemplateService.ts";
import * as Discussions from "../../../discussions/DiscussionService.ts";
import * as Threads from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const DiscussionRolesTool = Tool.make("t3_discussion_roles", {
  description:
    "Discussions are experimental: use discussion tools only when the user asked for a discussion, or agreed to one you proposed with a reason. Manage local persona and summary roles and ordered seat templates. list_roles: optional kind. list_templates. upsert_role: kind, name, prompt, avatar (persona required; summary null), description; optional roleId updates. delete_role or restore_builtin_role: roleId. upsert_template: name, seats, summaryPromptId (nullable); optional templateId updates. delete_template: templateId. Builtin roles cannot be deleted; referenced roles must be removed from templates before deletion.",
  parameters: Schema.Struct({
    action: Schema.Literals([
      "list_roles",
      "list_templates",
      "upsert_role",
      "delete_role",
      "restore_builtin_role",
      "upsert_template",
      "delete_template",
    ]),
    roleId: Schema.optional(DiscussionPromptDeleteInput.fields.id),
    templateId: Schema.optional(DiscussionTemplateDeleteInput.fields.id),
    kind: Schema.optional(DiscussionPromptUpsertInput.fields.kind),
    name: Schema.optional(DiscussionPromptUpsertInput.fields.name),
    prompt: Schema.optional(DiscussionPromptUpsertInput.fields.prompt),
    avatar: Schema.optional(DiscussionPromptUpsertInput.fields.avatar),
    description: Schema.optional(DiscussionPromptUpsertInput.fields.description),
    seats: Schema.optional(DiscussionTemplateUpsertInput.fields.seats),
    summaryPromptId: Schema.optional(DiscussionTemplateUpsertInput.fields.summaryPromptId),
  }),
  success: Schema.Union([
    DiscussionPromptListResult,
    DiscussionTemplateListResult,
    DiscussionPromptMutationResult,
    DiscussionPromptDeleteResult,
    DiscussionTemplateMutationResult,
    DiscussionTemplateDeleteResult,
  ]),
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    Threads.ThreadManagementService,
    DiscussionTemplates.DiscussionTemplateService,
  ],
})
  .annotate(Tool.Title, "Manage discussion roles and templates")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.OpenWorld, false)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromDiscussionSeatsAndSubagents);

const DiscussionPendingRequest = Schema.Union([
  Schema.Struct({
    requestId: RuntimeRequestId,
    type: Schema.Literal("approval"),
    content: Schema.String,
    truncated: Schema.Boolean,
  }),
  Schema.Struct({
    requestId: RuntimeRequestId,
    type: Schema.Literal("question"),
    questions: Schema.Array(OrchestrationV2UserInputQuestion),
  }),
  Schema.Struct({
    requestId: RuntimeRequestId,
    type: Schema.Literal("other"),
    kind: Schema.String,
  }),
]);

/** Read and wait expose the same position; null round/phase means a deleted snapshot was unavailable. */
const DiscussionPositionFields = {
  round: Schema.NullOr(Discussion.fields.cursor.fields.round),
  phase: Schema.NullOr(Schema.Literals(["regular", "final_round", "summarizing"])),
  seatCount: Schema.Number,
  speakingSeatId: Schema.NullOr(DiscussionSeat.fields.id),
};

const DiscussionReadResult = Schema.Struct({
  ...DiscussionPositionFields,
  id: Discussion.fields.id,
  title: Discussion.fields.title,
  topic: Discussion.fields.topic,
  status: Discussion.fields.status,
  pause: Discussion.fields.pause,
  closing: Discussion.fields.closing,
  cursor: Schema.Struct({
    round: Discussion.fields.cursor.fields.round,
    seatIndex: Discussion.fields.cursor.fields.seatIndex,
  }),
  createdBy: Discussion.fields.createdBy,
  seats: Schema.Array(
    Schema.Struct({
      id: DiscussionSeat.fields.id,
      personaName: DiscussionSeat.fields.personaName,
      modelSelection: DiscussionSeat.fields.modelSelection,
      threadId: DiscussionSeat.fields.threadId,
      link: Schema.String,
      pendingRequests: Schema.Array(DiscussionPendingRequest),
    }),
  ),
  entries: Schema.Array(Schema.Struct({ ...DiscussionEntry.fields, truncated: Schema.Boolean })),
  nextAfterSeq: Schema.NullOr(Schema.Number),
  link: Schema.NullOr(Schema.String),
});

const DiscussionTool = Tool.make("t3_discussion", {
  description:
    "Discussions are experimental: use discussion tools only when the user asked for a discussion, or agreed to one you proposed with a reason. Before create, show the topic, roles, each model and speaking order in the conversation and wait for user agreement. After creation, give the user the link; follow progress with t3_discussion_wait. list: all discussions. read: discussionId; optional afterSeq and limit (default 20, max 100); texts capped at 16000 characters. provider_support: supported instances; use it and orchestrator_capabilities for model values. diff: discussionId, entryId. create: topic and exactly one of ordered seats or templateId; optional projectId defaults to the caller's project. interject: discussionId, text. stop, continue, delete: discussionId. end: discussionId, summarizerSeatId; optional summaryPromptId. Page links are null without a web origin. When read or wait shows pending seat requests, use respond with discussionId, requestId and exactly one of decision (accept, decline, cancel) or answers. Only discussions you started allow approvals; leave approvals in user-started discussions to the user. Other request types cannot be answered here.",
  parameters: Schema.Struct({
    action: Schema.Literals([
      "list",
      "read",
      "provider_support",
      "diff",
      "create",
      "interject",
      "stop",
      "continue",
      "end",
      "delete",
      "respond",
    ]),
    discussionId: Schema.optional(DiscussionIdInput.fields.discussionId),
    entryId: Schema.optional(DiscussionEntryDiffInput.fields.entryId),
    projectId: Schema.optional(DiscussionCreateInput.fields.projectId),
    topic: Schema.optional(DiscussionCreateInput.fields.topic),
    seats: Schema.optional(DiscussionCreateInput.fields.seats),
    templateId: Schema.optional(DiscussionTemplateDeleteInput.fields.id),
    text: Schema.optional(DiscussionInterjectInput.fields.text),
    summarizerSeatId: Schema.optional(DiscussionEndInput.fields.summarizerSeatId),
    summaryPromptId: Schema.optional(DiscussionEndInput.fields.summaryPromptId),
    requestId: Schema.optional(RuntimeRequestId),
    decision: Schema.optional(Schema.Literals(["accept", "decline", "cancel"])),
    answers: Schema.optional(ProviderUserInputAnswers),
    afterSeq: Schema.optional(
      Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
    ),
    limit: Schema.optional(
      Schema.Number.check(
        Schema.isInt(),
        Schema.isGreaterThanOrEqualTo(1),
        Schema.isLessThanOrEqualTo(100),
      ),
    ),
  }),
  success: Schema.Union([
    DiscussionListResult,
    DiscussionReadResult,
    DiscussionProviderSupportResult,
    DiscussionEntryDiffResult,
    Schema.Struct({ ...DiscussionMutationResult.fields, link: Schema.NullOr(Schema.String) }),
    DiscussionMutationResult,
    DiscussionInterjectResult,
    DiscussionIdInput,
    OrchestrationV2DispatchCommandResult,
  ]),
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    Threads.ThreadManagementService,
    Discussions.DiscussionService,
    Crypto.Crypto,
    DiscussionTemplates.DiscussionTemplateService,
  ],
})
  .annotate(Tool.Title, "Read and manage discussions")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.OpenWorld, false)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromDiscussionSeatsAndSubagents);

const DiscussionWaitTool = Tool.make("t3_discussion_wait", {
  description:
    "Discussions are experimental: use discussion tools only when the user asked for a discussion, or agreed to one you proposed with a reason. Wait for completed entries after afterSeq (default: latest on invocation), paused/ended/deleted state, or pending seat requests. Returns round, phase, seatCount, speakingSeatId and entry positions; use t3_discussion read for text and respond for requests. For a round limit, check round and entry positions, then call end after the last seat speaks in the last requested round; end adds one final statement per seat, then a summary. timeoutMs defaults to 10 minutes, capped at 1 hour. On timeout, with next end your turn; without, call again. Deleted status is null.",
  parameters: Schema.Struct({
    discussionId: DiscussionIdInput.fields.discussionId,
    afterSeq: Schema.optional(
      Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
    ),
    timeoutMs: OrchestratorMcpThreadWaitInput.fields.timeoutMs,
  }),
  success: Schema.Struct({
    ...DiscussionPositionFields,
    reason: Schema.Literals([
      "new_entries",
      "paused",
      "ended",
      "deleted",
      "pending_request",
      "timeout",
    ]),
    status: Schema.NullOr(Discussion.fields.status),
    pause: Discussion.fields.pause,
    latestSeq: Schema.Number,
    newEntrySeqs: Schema.Array(
      Schema.Struct({
        seq: DiscussionEntry.fields.seq,
        round: Schema.NullOr(Discussion.fields.cursor.fields.round),
        seatId: Schema.NullOr(DiscussionSeat.fields.id),
        kind: DiscussionEntry.fields.kind,
      }),
    ),
    pendingRequests: Schema.Array(
      Schema.Struct({
        seatId: DiscussionSeat.fields.id,
        threadId: DiscussionSeat.fields.threadId,
        requests: Schema.Array(DiscussionPendingRequest),
      }),
    ),
    timedOut: Schema.Boolean,
    next: OrchestratorMcpThreadWaitResult.fields.next,
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    Threads.ThreadManagementService,
    Discussions.DiscussionService,
  ],
})
  .annotate(Tool.Title, "Wait for discussion progress")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromDiscussionSeatsAndSubagents);

/** Shared registration point for local discussion tools. */
export const DiscussionToolkit = Toolkit.make(
  DiscussionRolesTool,
  DiscussionTool,
  DiscussionWaitTool,
);
