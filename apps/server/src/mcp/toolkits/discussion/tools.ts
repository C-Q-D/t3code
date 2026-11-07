/** Local discussion template tools; execution and reference validation stay in the discussion services. */
import {
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
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { McpSchema, Tool, Toolkit } from "effect/ai";
import * as DiscussionTemplates from "../../../discussions/DiscussionTemplateService.ts";
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

/** Shared registration point for local discussion tools. */
export const DiscussionToolkit = Toolkit.make(DiscussionRolesTool);
