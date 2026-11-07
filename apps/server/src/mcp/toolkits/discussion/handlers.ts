/** Applies MCP access policy before discussion services own lifecycle and template validation. */
import {
  type DiscussionError,
  type DiscussionId,
  OrchestratorMcpFailure,
  ProviderRequestKind,
  type OrchestrationV2RuntimeRequest,
  type OrchestrationV2TurnItem,
  type RuntimeRequestId,
  type ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as Schema from "effect/Schema";
import * as Threads from "../../../orchestration-v2/ThreadManagementService.ts";
import * as DiscussionTemplates from "../../../discussions/DiscussionTemplateService.ts";
import * as Discussions from "../../../discussions/DiscussionService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { dispatchFailure, newCommandId, readCaller, unavailable } from "../../threadAccess.ts";
import { DiscussionToolkit } from "./tools.ts";

/** Requires an action's field; null remains a valid explicit avatar or summary selection. */
const required = <A>(value: A | undefined, name: string) =>
  value === undefined
    ? Effect.fail(
        new OrchestratorMcpFailure({
          code: "invalid_request",
          message: `This action needs \`${name}\`.`,
        }),
      )
    : Effect.succeed(value);

/** Preserves missing-field failures and maps service validation or infrastructure errors to MCP failures. */
const discussionFailure = (error: DiscussionError | OrchestratorMcpFailure) =>
  error._tag === "DiscussionError"
    ? new OrchestratorMcpFailure({
        code: error.reason === "orchestration_error" ? "orchestration_error" : "invalid_request",
        message: error.message,
      })
    : error;

/** Uses the existing web route only when an approved MCP client supplied its origin. */
const discussionLink = (scope: McpInvocationContext.McpInvocationScope, id: DiscussionId) =>
  scope.client?.webOrigin === undefined
    ? null
    : `${scope.client.webOrigin}/discussions/${encodeURIComponent(scope.environmentId)}/${encodeURIComponent(id)}`;

/** The subscription's first event holds state and transcript under the same publication permit. */
const readSnapshot = Effect.fn("mcp.discussion.readSnapshot")(function* (
  discussionId: DiscussionId,
) {
  const service = yield* Discussions.DiscussionService;
  const first = yield* service.subscribe({ discussionId }).pipe(Stream.runHead);
  if (Option.isNone(first) || first.value.type !== "snapshot") {
    return yield* new OrchestratorMcpFailure({
      code: "orchestration_error",
      message: "Discussion snapshot was unavailable.",
    });
  }
  return first.value;
});

/** Keeps provider-supplied approval detail bounded while preserving the requested tool, arguments and paths. */
const pendingRequest = (
  request: OrchestrationV2RuntimeRequest,
  items: ReadonlyArray<OrchestrationV2TurnItem>,
) => {
  const item = items.find(
    (item) =>
      (item.type === "approval_request" || item.type === "user_input_request") &&
      item.requestId === request.id,
  );
  if (request.kind === "user_input" && item?.type === "user_input_request") {
    return { requestId: request.id, type: "question" as const, questions: item.questions };
  }
  if (Schema.is(ProviderRequestKind)(request.kind)) {
    const parent =
      item?.parentItemId === null
        ? undefined
        : items.find((candidate) => candidate.id === item?.parentItemId);
    const tool =
      parent?.type === "command_execution"
        ? { command: parent.input }
        : parent?.type === "dynamic_tool"
          ? { toolName: parent.toolName, input: parent.input }
          : parent?.type === "file_change"
            ? { path: parent.fileName, changes: parent.changes, diff: parent.diffStr }
            : undefined;
    const content = JSON.stringify({
      requestKind: request.kind,
      ...(item?.type === "approval_request"
        ? { prompt: item.prompt, reason: item.reason, appName: item.appName }
        : {}),
      tool,
    });
    return {
      requestId: request.id,
      type: "approval" as const,
      content: content.slice(0, 4_000),
      truncated: content.length > 4_000,
    };
  }
  return { requestId: request.id, type: "other" as const, kind: request.kind };
};

/** Loads request and item records without fetching a full thread projection. */
const readSeatRequests = Effect.fn("mcp.discussion.readSeatRequests")(function* (
  threadId: ThreadId,
) {
  const threads = yield* Threads.ThreadManagementService;
  return yield* threads
    .getThreadRecords(threadId, ["runtimeRequests", "turnItems"])
    .pipe(Effect.mapError(unavailable));
});

/** Resolves a still-pending request inside the selected discussion; arbitrary thread ids never come from the client. */
const findSeatRequest = Effect.fn("mcp.discussion.findSeatRequest")(function* (input: {
  readonly discussionId?: DiscussionId | undefined;
  readonly requestId?: RuntimeRequestId | undefined;
}) {
  const { discussion } = yield* readSnapshot(yield* required(input.discussionId, "discussionId"));
  const requestId = yield* required(input.requestId, "requestId");
  for (const seat of discussion.seats) {
    const records = yield* readSeatRequests(seat.threadId);
    const request = records.runtimeRequests.find(
      (request) => request.id === requestId && request.status === "pending",
    );
    if (request !== undefined)
      return {
        discussion,
        threadId: seat.threadId,
        request,
        type: pendingRequest(request, records.turnItems).type,
      };
  }
  return yield* new OrchestratorMcpFailure({
    code: "invalid_request",
    message: "The pending request was not found in this discussion's seats.",
  });
});

/** Reads remain available to read-only clients; mutations use the common local write policy. */
export const layer = McpToolAccess.toLayer(DiscussionToolkit, {
  t3_discussion: McpToolAccess.either(
    (input) => input.action === "respond",
    McpToolAccess.writesThreads(
      (input) =>
        findSeatRequest(input).pipe(
          Effect.map(({ threadId }) => [threadId]),
          Effect.mapError(discussionFailure),
        ),
      (input) =>
        Effect.gen(function* () {
          const { discussion, threadId, request, type } = yield* findSeatRequest(input);
          if ((input.decision === undefined) === (input.answers === undefined)) {
            return yield* new OrchestratorMcpFailure({
              code: "invalid_request",
              message: "Respond needs exactly one of `decision` or `answers`.",
            });
          }
          if (type === "question") {
            yield* required(input.answers, "answers");
          } else if (type === "approval") {
            yield* required(input.decision, "decision");
            if (discussion.createdBy !== "agent") {
              return yield* new OrchestratorMcpFailure({
                code: "capability_denied",
                message:
                  "This discussion was started by the user. Leave its approvals to the user.",
              });
            }
          } else {
            return yield* new OrchestratorMcpFailure({
              code: "invalid_request",
              message: "This request type cannot be answered by discussion tools.",
            });
          }
          const threads = yield* Threads.ThreadManagementService;
          const result = yield* threads
            .dispatch({
              type: "runtime-request.respond",
              commandId: yield* newCommandId(),
              threadId,
              requestId: request.id,
              ...(input.decision === undefined ? {} : { decision: input.decision }),
              ...(input.answers === undefined ? {} : { answers: input.answers }),
            })
            .pipe(Effect.mapError(dispatchFailure));
          return { sequence: result.sequence };
        }).pipe(Effect.mapError(discussionFailure)),
    ),
    McpToolAccess.either(
      (input) => ["list", "read", "provider_support", "diff"].includes(input.action),
      McpToolAccess.reads((input) =>
        Effect.gen(function* () {
          const service = yield* Discussions.DiscussionService;
          switch (input.action) {
            case "list":
              return yield* service.list();
            case "provider_support":
              return yield* service.providerSupport();
            case "diff":
              return yield* service.getEntryDiff({
                discussionId: yield* required(input.discussionId, "discussionId"),
                entryId: yield* required(input.entryId, "entryId"),
              });
            default: {
              const scope = yield* McpInvocationContext.McpInvocationContext;
              const { discussion, entries } = yield* readSnapshot(
                yield* required(input.discussionId, "discussionId"),
              );
              const remaining = entries.filter((entry) => entry.seq > (input.afterSeq ?? 0));
              const page = remaining.slice(0, input.limit ?? 20);
              return {
                id: discussion.id,
                title: discussion.title,
                topic: discussion.topic,
                status: discussion.status,
                pause: discussion.pause,
                closing: discussion.closing,
                cursor: { round: discussion.cursor.round, seatIndex: discussion.cursor.seatIndex },
                createdBy: discussion.createdBy,
                seats: yield* Effect.forEach(discussion.seats, (seat) =>
                  Effect.gen(function* () {
                    const records = yield* readSeatRequests(seat.threadId);
                    return {
                      id: seat.id,
                      personaName: seat.personaName,
                      modelSelection: seat.modelSelection,
                      threadId: seat.threadId,
                      link: McpInvocationContext.threadLinkFor(scope, seat.threadId),
                      pendingRequests: records.runtimeRequests
                        .filter((request) => request.status === "pending")
                        .map((request) => pendingRequest(request, records.turnItems)),
                    };
                  }),
                ),
                entries: page.map((entry) => ({
                  ...entry,
                  text: entry.text.slice(0, 16_000),
                  truncated: entry.text.length > 16_000,
                })),
                nextAfterSeq: remaining.length > page.length ? page.at(-1)!.seq : null,
                link: discussionLink(scope, discussion.id),
              };
            }
          }
        }).pipe(Effect.mapError(discussionFailure)),
      ),
      McpToolAccess.writes((input) =>
        Effect.gen(function* () {
          const service = yield* Discussions.DiscussionService;
          if (input.action === "create") {
            const topic = yield* required(input.topic, "topic");
            if ((input.seats === undefined) === (input.templateId === undefined)) {
              return yield* new OrchestratorMcpFailure({
                code: "invalid_request",
                message: "Create needs exactly one of `seats` or `templateId`.",
              });
            }
            const { scope, caller } = yield* readCaller();
            const projectId = yield* required(input.projectId ?? caller?.projectId, "projectId");
            let seats = input.seats;
            if (input.templateId !== undefined) {
              const templates = yield* DiscussionTemplates.DiscussionTemplateService;
              const template = (yield* templates.listTemplates()).templates.find(
                (item) => item.id === input.templateId,
              );
              if (template === undefined)
                return yield* new OrchestratorMcpFailure({
                  code: "invalid_request",
                  message: "Discussion template was not found.",
                });
              seats = template.seats;
            }
            const result = yield* service.create({
              projectId,
              topic,
              seats: yield* required(seats, "seats"),
              initiator: { createdBy: "agent", creationSource: "mcp" },
            });
            return { ...result, link: discussionLink(scope, result.discussion.id) };
          }
          const discussionId = yield* required(input.discussionId, "discussionId");
          switch (input.action) {
            case "interject":
              return yield* service.interject({
                discussionId,
                text: yield* required(input.text, "text"),
              });
            case "stop":
              return yield* service.stop({ discussionId });
            case "continue":
              return yield* service.continue({ discussionId });
            case "end":
              return yield* service.end({
                discussionId,
                summarizerSeatId: yield* required(input.summarizerSeatId, "summarizerSeatId"),
                ...(input.summaryPromptId === undefined
                  ? {}
                  : { summaryPromptId: input.summaryPromptId }),
              });
            case "delete":
              return yield* service.delete({ discussionId });
            default:
              return yield* new OrchestratorMcpFailure({
                code: "invalid_request",
                message: "This action does not change a discussion.",
              });
          }
        }).pipe(Effect.mapError(discussionFailure)),
      ),
    ),
  ),
  t3_discussion_roles: McpToolAccess.either(
    (input) => input.action === "list_roles" || input.action === "list_templates",
    McpToolAccess.reads((input) =>
      Effect.gen(function* () {
        const service = yield* DiscussionTemplates.DiscussionTemplateService;
        return input.action === "list_roles"
          ? yield* service.listPrompts(input.kind === undefined ? {} : { kind: input.kind })
          : yield* service.listTemplates();
      }).pipe(Effect.mapError(discussionFailure)),
    ),
    McpToolAccess.writes((input) =>
      Effect.gen(function* () {
        const service = yield* DiscussionTemplates.DiscussionTemplateService;
        switch (input.action) {
          case "upsert_role":
            return yield* service.upsertPrompt({
              ...(input.roleId === undefined ? {} : { id: input.roleId }),
              kind: yield* required(input.kind, "kind"),
              name: yield* required(input.name, "name"),
              prompt: yield* required(input.prompt, "prompt"),
              avatar: yield* required(input.avatar, "avatar"),
              description: yield* required(input.description, "description"),
            });
          case "delete_role":
            return yield* service.deletePrompt({ id: yield* required(input.roleId, "roleId") });
          case "restore_builtin_role":
            return yield* service.restoreBuiltin({ id: yield* required(input.roleId, "roleId") });
          case "upsert_template":
            return yield* service.upsertTemplate({
              ...(input.templateId === undefined ? {} : { id: input.templateId }),
              name: yield* required(input.name, "name"),
              seats: yield* required(input.seats, "seats"),
              summaryPromptId: yield* required(input.summaryPromptId, "summaryPromptId"),
            });
          case "delete_template":
            return yield* service.deleteTemplate({
              id: yield* required(input.templateId, "templateId"),
            });
          default:
            return yield* new OrchestratorMcpFailure({
              code: "invalid_request",
              message: "This action does not change discussion roles or templates.",
            });
        }
      }).pipe(Effect.mapError(discussionFailure)),
    ),
  ),
});
