/** Exercises the MCP handler against real discussion persistence, including attribution and bounded reads. */
import { assert, expect, it } from "@effect/vitest";
import {
  DiscussionEntryId,
  DiscussionPromptId,
  DiscussionTemplateId,
  EnvironmentId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
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
