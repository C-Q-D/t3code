/** Exercises the MCP handler against real discussion persistence, including attribution and bounded reads. */
import { assert, expect, it } from "@effect/vitest";
import {
  DiscussionEntryId,
  DiscussionPromptId,
  DiscussionTemplateId,
  EnvironmentId,
  CommandId,
  EventId,
  NodeId,
  RuntimeRequestId,
  ProviderSessionId,
  TurnItemId,
  ProviderDriverKind,
  type ThreadId,
} from "@t3tools/contracts";
import { CodexProviderCapabilitiesV2 } from "../../../orchestration-v2/Adapters/CodexAdapterV2.ts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as Projections from "../../../orchestration-v2/ProjectionStore.ts";
import * as Threads from "../../../orchestration-v2/ThreadManagementService.ts";
import * as Discussions from "../../../discussions/DiscussionService.ts";
import * as Templates from "../../../discussions/DiscussionTemplateService.ts";
import * as Store from "../../../discussions/DiscussionStore.ts";
import {
  model,
  projectId,
  withDiscussionHarness,
} from "../../../discussions/DiscussionService.testkit.ts";
import {
  discussionFixture,
  entryFixtures,
} from "../../../discussions/discussionFixtures.testkit.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import * as Handlers from "./handlers.ts";
import { DiscussionToolkit } from "./tools.ts";

const scope: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("environment:discussion-test"),
  requestNamespace: "client:discussion-test",
  thread: undefined,
  client: {
    sessionId: "discussion-test",
    label: "Test",
    access: "full-access",
    webOrigin: "https://t3.example",
  },
  capabilities: new Set(["orchestration"]),
  issuedAt: 0,
};
const seats = [
  { personaPromptId: DiscussionPromptId.make("builtin:persona:architect"), modelSelection: model },
];

const questions = [
  {
    id: "scope",
    header: "Scope",
    question: "Which folder?",
    options: [{ label: "Source", description: "Use src", value: "src" }],
    allowCustomAnswer: true,
  },
];
const approvalPrompt =
  'Run tool powershell with {"command":"Get-Content src/main.ts","cwd":"F:/workspace/project"}';

/** Seeds provider-owned pending artifacts in the real projection; response state is written only by orchestration. */
const seedRequest = Effect.fn("test.discussion.seedRequest")(function* (
  threadId: ThreadId,
  kind: "command" | "user_input" | "auth_refresh",
  suffix: string,
  status: "pending" | "resolved" = "pending",
  prompt = approvalPrompt,
) {
  const projections = yield* Projections.ProjectionStoreV2;
  const now = DateTime.makeUnsafe("2026-10-12T08:00:00.000Z");
  const requestId = RuntimeRequestId.make(`request:${suffix}`);
  const nodeId = NodeId.make(`node:${suffix}`);
  const sessionId = ProviderSessionId.make(`session:${threadId}`);
  yield* projections.apply({
    id: EventId.make(`session:${suffix}`),
    type: "provider-session.attached",
    threadId,
    occurredAt: now,
    payload: {
      id: sessionId,
      driver: ProviderDriverKind.make("codex"),
      providerInstanceId: model.instanceId,
      status: "ready",
      cwd: "/repo",
      model: model.model,
      capabilities: CodexProviderCapabilitiesV2,
      createdAt: now,
      updatedAt: now,
      lastError: null,
    },
  });
  yield* projections.apply({
    id: EventId.make(`request:${suffix}`),
    type: "runtime-request.updated",
    threadId,
    occurredAt: now,
    payload: {
      id: requestId,
      nodeId,
      providerTurnId: null,
      nativeRequestRef: null,
      kind,
      status,
      responseCapability: { type: "live", providerSessionId: sessionId },
      createdAt: now,
      resolvedAt: status === "pending" ? null : now,
    },
  });
  if (kind === "auth_refresh") return requestId;
  yield* projections.apply({
    id: EventId.make(`node:${suffix}`),
    type: "node.updated",
    threadId,
    occurredAt: now,
    payload: {
      id: nodeId,
      threadId,
      runId: null,
      parentNodeId: null,
      rootNodeId: nodeId,
      kind: kind === "command" ? "approval_request" : "user_input_request",
      status: "waiting",
      countsForRun: false,
      providerThreadId: null,
      providerTurnId: null,
      nativeItemRef: null,
      runtimeRequestId: requestId,
      checkpointScopeId: null,
      startedAt: now,
      completedAt: null,
    },
  });
  const common = {
    id: TurnItemId.make(`item:${suffix}`),
    threadId,
    runId: null,
    nodeId,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: kind === "command" ? 1 : 2,
    status: "waiting" as const,
    title: null,
    startedAt: now,
    completedAt: null,
    updatedAt: now,
  };
  yield* projections.apply({
    id: EventId.make(`item:${suffix}`),
    type: "turn-item.updated",
    threadId,
    occurredAt: now,
    payload:
      kind === "command"
        ? { ...common, type: "approval_request", requestId, requestKind: "command", prompt }
        : { ...common, type: "user_input_request", requestId, questions },
  });
  return requestId;
});

it.effect.each([
  {
    createdBy: "agent" as const,
    response: { sequence: expect.any(Number) },
    approval: { status: "resolved", decision: "accept" },
  },
  {
    createdBy: "user" as const,
    response: { code: "capability_denied", message: expect.stringContaining("user") },
    approval: { status: "pending" },
  },
])(
  "answers questions but limits approvals in a $createdBy discussion",
  ({ createdBy, response, approval }) =>
    withDiscussionHarness(
      () =>
        Effect.gen(function* () {
          const { discussion } = yield* (yield* Discussions.DiscussionService).create({
            projectId,
            topic: "Runtime requests",
            seats,
            ...(createdBy === "agent"
              ? { initiator: { createdBy, creationSource: "mcp" as const } }
              : {}),
          });
          const threadId = discussion.seats[0]!.threadId;
          const approvalId = yield* seedRequest(threadId, "command", "approval");
          const questionId = yield* seedRequest(threadId, "user_input", "question");
          const otherId = yield* seedRequest(threadId, "auth_refresh", "other");
          const resolvedId = yield* seedRequest(threadId, "command", "old", "resolved");
          const longId = yield* seedRequest(
            threadId,
            "command",
            "long",
            "pending",
            approvalPrompt + "x".repeat(4_000),
          );
          const { discussion: outside } = yield* (yield* Discussions.DiscussionService).create({
            projectId,
            topic: "Other discussion",
            seats,
          });
          const foreignId = yield* seedRequest(outside.seats[0]!.threadId, "command", "foreign");
          const toolkit = yield* DiscussionToolkit.pipe(
            Effect.provide(McpToolAccess.HandlersLayer.layer(Handlers.layer)),
          );
          const read = yield* toolkit
            .handle("t3_discussion", { action: "read", discussionId: discussion.id })
            .pipe(Stream.unwrap, Stream.runCollect);
          const snapshot = read.at(-1)?.result;
          assert(snapshot !== undefined && "entries" in snapshot);
          expect(snapshot.seats[0]!.pendingRequests).toHaveLength(4);
          expect(snapshot.seats[0]!.pendingRequests).toEqual(
            expect.arrayContaining([
              {
                requestId: approvalId,
                type: "approval",
                content: expect.stringContaining(approvalPrompt.replaceAll('"', '\\"')),
                truncated: false,
              },
              { requestId: questionId, type: "question", questions },
              { requestId: otherId, type: "other", kind: "auth_refresh" },
              { requestId: longId, type: "approval", content: expect.any(String), truncated: true },
            ]),
          );
          const longRequest = snapshot.seats[0]!.pendingRequests.find(
            (request) => request.requestId === longId,
          );
          assert(longRequest?.type === "approval");
          expect(longRequest.content).toHaveLength(4_000);
          const longDecision = yield* Schema.decodeUnknownEffect(
            DiscussionToolkit.tools.t3_discussion.parametersSchema,
          )({
            action: "respond",
            discussionId: discussion.id,
            requestId: approvalId,
            decision: "acceptAlways",
          }).pipe(Effect.result);
          expect(Result.isFailure(longDecision)).toBe(true);
          const threads = yield* Threads.ThreadManagementService;
          expect(
            (yield* threads.getThreadRecords(threadId, ["runtimeRequests"])).runtimeRequests.find(
              (request) => request.id === approvalId,
            )?.status,
          ).toBe("pending");
          for (const requestId of [
            otherId,
            resolvedId,
            foreignId,
            RuntimeRequestId.make("request:missing"),
          ]) {
            const rejected = yield* toolkit
              .handle("t3_discussion", {
                action: "respond",
                discussionId: discussion.id,
                requestId,
                decision: "accept",
              })
              .pipe(Stream.unwrap, Stream.runCollect);
            expect(rejected.at(-1)?.result).toMatchObject({ code: "invalid_request" });
          }
          const accepted = yield* toolkit
            .handle("t3_discussion", {
              action: "respond",
              discussionId: discussion.id,
              requestId: approvalId,
              decision: "accept",
            })
            .pipe(Stream.unwrap, Stream.runCollect);
          expect(accepted.at(-1)?.result).toMatchObject(response);
          expect(
            (yield* threads.getThreadRecords(threadId, ["runtimeRequests"])).runtimeRequests.find(
              (request) => request.id === approvalId,
            ),
          ).toMatchObject(approval);
          const answered = yield* toolkit
            .handle("t3_discussion", {
              action: "respond",
              discussionId: discussion.id,
              requestId: questionId,
              answers: { scope: "src" },
            })
            .pipe(Stream.unwrap, Stream.runCollect);
          expect(answered.at(-1)?.result).toMatchObject({ sequence: expect.any(Number) });
          expect(
            (yield* threads.getThreadRecords(threadId, ["runtimeRequests"])).runtimeRequests.find(
              (request) => request.id === questionId,
            ),
          ).toMatchObject({ status: "resolved", answers: { scope: "src" } });
        }).pipe(
          Effect.provide(Templates.layer),
          Effect.provideService(McpInvocationContext.McpInvocationContext, scope),
        ),
      { git: false, startReactor: false },
    ),
);

it.effect("creates agent-attributed discussions from seats and templates through MCP", () =>
  withDiscussionHarness(
    () =>
      Effect.gen(function* () {
        const templates = yield* Templates.DiscussionTemplateService;
        const { template } = yield* templates.upsertTemplate({
          name: "MCP template",
          seats,
          summaryPromptId: null,
        });
        const toolkit = yield* DiscussionToolkit.pipe(
          Effect.provide(McpToolAccess.HandlersLayer.layer(Handlers.layer)),
        );
        const store = yield* Store.DiscussionStore;
        for (const selection of [{ seats }, { templateId: template.id }]) {
          const events = yield* toolkit
            .handle("t3_discussion", {
              action: "create",
              projectId,
              topic: "Review boundaries",
              ...selection,
            })
            .pipe(Stream.unwrap, Stream.runCollect);
          const result = events.at(-1)?.result;
          assert(result !== undefined && "discussion" in result);
          const persisted = yield* store.getDiscussion(result.discussion.id);
          expect(persisted).toMatchObject({
            createdBy: "agent",
            creationSource: "mcp",
            projectId,
            seats: [{ modelSelection: model, personaName: "架构师" }],
          });
          expect(result).toMatchObject({
            link: `https://t3.example/discussions/environment%3Adiscussion-test/${encodeURIComponent(result.discussion.id)}`,
          });
        }
      }).pipe(
        Effect.provide(Templates.layer),
        Effect.provideService(McpInvocationContext.McpInvocationContext, scope),
      ),
    { git: false, startReactor: false },
  ),
);

it.effect(
  "reads transcript pages with strict cursors, bounded text and continuation positions",
  () =>
    withDiscussionHarness(
      () =>
        Effect.gen(function* () {
          const store = yield* Store.DiscussionStore;
          const threads = yield* Threads.ThreadManagementService;
          for (const seat of discussionFixture.seats) {
            yield* threads.dispatch({
              type: "thread.create",
              commandId: CommandId.make(`create:${seat.id}`),
              threadId: seat.threadId,
              projectId,
              title: seat.personaName,
              modelSelection: seat.modelSelection,
              runtimeMode: "full-access",
              interactionMode: "default",
              branch: null,
              worktreePath: null,
              createdBy: "user",
              creationSource: "server",
            });
          }
          yield* store.createDiscussion({ ...discussionFixture, projectId });
          for (let seq = 1; seq <= 101; seq++) {
            yield* store.appendEntry({
              ...entryFixtures[0]!,
              id: DiscussionEntryId.make(`entry:mcp-${seq}`),
              text:
                seq === 100
                  ? "x".repeat(16_000)
                  : seq === 101
                    ? "y".repeat(16_001)
                    : `entry ${seq}`,
            });
          }
          const toolkit = yield* DiscussionToolkit.pipe(
            Effect.provide(McpToolAccess.HandlersLayer.layer(Handlers.layer)),
          );
          const cases = [
            { input: {}, first: 1, last: 20, count: 20, next: 20 },
            { input: { afterSeq: 20, limit: 2 }, first: 21, last: 22, count: 2, next: 22 },
            { input: { limit: 100 }, first: 1, last: 100, count: 100, next: 100 },
            { input: { afterSeq: 99, limit: 2 }, first: 100, last: 101, count: 2, next: null },
            { input: { afterSeq: 101 }, first: undefined, last: undefined, count: 0, next: null },
          ];
          for (const row of cases) {
            const events = yield* toolkit
              .handle("t3_discussion", {
                action: "read",
                discussionId: discussionFixture.id,
                ...row.input,
              })
              .pipe(Stream.unwrap, Stream.runCollect);
            const result = events.at(-1)?.result;
            assert(result !== undefined && "entries" in result);
            expect(result.entries.map((entry) => entry.seq)).toEqual(
              Array.from({ length: row.count }, (_, index) => row.first! + index),
            );
            expect(result.entries.at(-1)?.seq).toBe(row.last);
            expect(result.nextAfterSeq).toBe(row.next);
            for (const entry of result.entries) {
              expect(entry.truncated).toBe(entry.seq === 101);
              expect(entry.text).toBe(
                entry.seq === 100
                  ? "x".repeat(16_000)
                  : entry.seq === 101
                    ? "y".repeat(16_000)
                    : `entry ${entry.seq}`,
              );
            }
            expect(result.seats[0]).toEqual({
              id: discussionFixture.seats[0]!.id,
              personaName: "架构师",
              modelSelection: discussionFixture.seats[0]!.modelSelection,
              threadId: discussionFixture.seats[0]!.threadId,
              link: "https://t3.example/environment%3Adiscussion-test/thread%3At4-a",
              pendingRequests: [],
            });
            expect(result.link).toBe(
              "https://t3.example/discussions/environment%3Adiscussion-test/discussion%3At4-fixture",
            );
          }
        }).pipe(
          Effect.provide(Templates.layer),
          Effect.provideService(McpInvocationContext.McpInvocationContext, scope),
        ),
      { git: false, startReactor: false },
    ),
);

it.effect("rejects incomplete or conflicting create selections as invalid_request", () =>
  withDiscussionHarness(
    () =>
      Effect.gen(function* () {
        const toolkit = yield* DiscussionToolkit.pipe(
          Effect.provide(McpToolAccess.HandlersLayer.layer(Handlers.layer)),
        );
        for (const input of [
          { projectId, seats },
          { projectId, topic: "Missing selection" },
          { topic: "Missing project", seats },
          {
            projectId,
            topic: "Conflicting selection",
            seats,
            templateId: DiscussionTemplateId.make("unused"),
          },
        ]) {
          const events = yield* toolkit
            .handle("t3_discussion", { action: "create", ...input })
            .pipe(Stream.unwrap, Stream.runCollect);
          expect(events.at(-1)?.result).toMatchObject({ code: "invalid_request" });
        }
        expect(yield* (yield* Discussions.DiscussionService).list()).toEqual({ discussions: [] });
      }).pipe(
        Effect.provide(Templates.layer),
        Effect.provideService(McpInvocationContext.McpInvocationContext, scope),
      ),
    { git: false, startReactor: false },
  ),
);
