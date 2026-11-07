/** Maps local MCP actions to one template service operation after the action's access check. */
import { type DiscussionError, OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as DiscussionTemplates from "../../../discussions/DiscussionTemplateService.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
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

/** Reads remain available to read-only clients; mutations use the common local write policy. */
export const layer = McpToolAccess.toLayer(DiscussionToolkit, {
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
