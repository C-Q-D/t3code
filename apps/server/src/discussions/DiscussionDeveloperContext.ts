/** Resolves frozen discussion identities for run execution; ordinary threads receive no override. */
import * as Effect from "effect/Effect";
import type { ThreadId } from "@t3tools/contracts";
import * as Layer from "effect/Layer";
import * as DiscussionStore from "./DiscussionStore.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import { ThreadDeveloperContext } from "../orchestration-v2/ThreadDeveloperContext.ts";

const protocol =
  "你正处于多方讨论。只以自己的身份发言，不代替别人说话。可以修改共享工作区的文件，但必须在发言里写明改了什么。不要复述材料原文。";

/**
 * Supplies trusted identity without depending on DiscussionService, avoiding a runtime construction cycle.
 * Reads do not retry. A read failure logs once and leaves that run without a persona because this port has no error channel.
 */
export const layer = Layer.effect(
  ThreadDeveloperContext,
  Effect.gen(function* () {
    const store = yield* DiscussionStore.DiscussionStore;
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    return {
      forThread: (threadId: ThreadId) =>
        Effect.gen(function* () {
          const shell = yield* projections.getThreadShell(threadId);
          if (!shell?.discussion) return [];
          const discussion = yield* store.getDiscussion(shell.discussion.discussionId);
          const seat = discussion?.seats.find(
            (item) => item.id === shell.discussion?.seatId && item.threadId === threadId,
          );
          return seat
            ? [{ key: "t3_discussion_persona", text: `${protocol}\n\n${seat.personaPrompt}` }]
            : [];
        }).pipe(
          Effect.catch((cause) =>
            Effect.logWarning("discussion identity read failed; run will have no persona", {
              threadId,
              cause,
            }).pipe(Effect.as([])),
          ),
        ),
    };
  }),
).pipe(Layer.provide(DiscussionStore.layer));
