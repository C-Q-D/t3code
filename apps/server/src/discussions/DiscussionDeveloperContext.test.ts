/** Trusted persona resolution uses durable seat snapshots and degrades safely when reads fail. */
import { assert, it } from "@effect/vitest";
import { CommandId, ThreadId, DiscussionError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Projection from "../orchestration-v2/ProjectionStore.ts";
import { ThreadDeveloperContext } from "../orchestration-v2/ThreadDeveloperContext.ts";
import * as Context from "./DiscussionDeveloperContext.ts";
import * as Store from "./DiscussionStore.ts";
import { withDiscussionHarness, model, projectId } from "./DiscussionService.testkit.ts";
import * as Threads from "../orchestration-v2/ThreadManagementService.ts";
import * as Discussions from "./DiscussionService.ts";
import * as Sqlite from "../persistence/Sqlite.ts";
import { DiscussionPromptId } from "@t3tools/contracts";

it.effect(
  "ordinary threads get no persona and edited templates cannot change a frozen seat persona",
  () =>
    withDiscussionHarness(() =>
      Effect.gen(function* () {
        const threads = yield* Threads.ThreadManagementService;
        const service = yield* Discussions.DiscussionService;
        const store = yield* Store.DiscussionStore;
        const ordinary = ThreadId.make("thread:t4-ordinary");
        yield* threads.dispatch({
          type: "thread.create",
          commandId: CommandId.make("t4:ordinary"),
          threadId: ordinary,
          projectId,
          title: "普通线程",
          modelSelection: model,
          runtimeMode: "full-access",
          interactionMode: "default",
          worktreePath: null,
          branch: null,
          createdBy: "user",
          creationSource: "web",
        });
        const { discussion } = yield* service.create({
          projectId,
          topic: "身份测试",
          seats: [
            {
              personaPromptId: DiscussionPromptId.make("builtin:persona:architect"),
              modelSelection: model,
            },
          ],
        });
        const prompt = (yield* store.getPrompt(
          DiscussionPromptId.make("builtin:persona:architect"),
        ))!;
        yield* store.upsertPrompt({ ...prompt, prompt: "后来改过的身份提示词" });
        yield* Effect.gen(function* () {
          const context = yield* ThreadDeveloperContext;
          assert.deepEqual(yield* context.forThread(ordinary), []);
          const seat = yield* context.forThread(discussion.seats[0]!.threadId);
          assert.equal(seat.length, 1);
          assert.equal(seat[0]?.key, "t3_discussion_persona");
          assert.include(seat[0]!.text, prompt.prompt);
          assert.notInclude(seat[0]!.text, "后来改过的身份提示词");
        }).pipe(Effect.provide(Context.layer));
      }),
    ),
);

it.effect("a failed thread lookup returns no developer entries through the infallible port", () =>
  Effect.gen(function* () {
    const context = yield* ThreadDeveloperContext;
    assert.deepEqual(yield* context.forThread(ThreadId.make("thread:t4-failed")), []);
  }).pipe(
    Effect.provide(
      Context.layer.pipe(
        Layer.provide(
          Layer.mock(Projection.ProjectionStoreV2)({
            getThreadShell: () =>
              Effect.fail(
                new Projection.ProjectionStoreReadError({
                  threadId: ThreadId.make("thread:t4-failed"),
                  cause: "lookup failed",
                }),
              ),
          }),
        ),
        Layer.provide(Sqlite.layerMemory),
      ),
    ),
  ),
);
