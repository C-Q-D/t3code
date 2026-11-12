import { expect, it } from "@effect/vitest";
import * as A from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import { idleThreadProjection, liveThreadShell } from "../mcp/McpToolAccess.testkit.ts";
import { make } from "./DispatchAuthorizations.ts";

it.effect.each(["commit", "rollback", "cancel"] as const)(
  "closes new stale leases through %s and releases the transaction window",
  (finish) =>
    Effect.gen(function* () {
      const grants = make();
      const threadId = A.ThreadId.make("thread");
      const shell = liveThreadShell(threadId);
      const thread = idleThreadProjection(shell).thread;
      const event: A.OrchestrationV2DomainEvent = {
        id: A.EventId.make("mode"),
        threadId,
        occurredAt: thread.updatedAt,
        type: "thread.runtime-mode-updated",
        payload: { ...thread, runtimeMode: "approval-required" },
      };
      const reached = yield* Deferred.make<void>();
      const proceed = yield* Deferred.make<void>();
      const pending = yield* grants
        .transaction(
          Effect.gen(function* () {
            yield* grants.projection(event);
            grants.beforeProjection(event);
            yield* Deferred.succeed(reached, undefined);
            yield* Deferred.await(proceed);
            if (finish === "rollback") return yield* Effect.fail("rollback");
          }),
        )
        .pipe(Effect.forkChild);
      yield* Deferred.await(reached);
      const late = yield* grants.watch(threadId, () => false);
      const unrelated = yield* grants.watch(A.ThreadId.make("other"), () => false);
      expect(late?.isValid()).toBe(false);
      expect(unrelated?.isValid()).toBe(true);
      if (finish === "cancel") yield* Fiber.interrupt(pending);
      else {
        yield* Deferred.succeed(proceed, undefined);
        yield* Fiber.join(pending).pipe(Effect.result);
      }
      expect(late?.isValid()).toBe(false);
      expect((yield* grants.watch(threadId, () => false))?.isValid()).toBe(true);
    }),
);
