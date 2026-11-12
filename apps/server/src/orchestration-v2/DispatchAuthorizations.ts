import type { OrchestrationV2DomainEvent, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as DispatchAuthorization from "../auth/DispatchAuthorization.ts";

const TransactionWindow = Context.Reference<OrchestrationV2DomainEvent[] | undefined>(
  "terminal/TransactionWindow",
  {
    defaultValue: (): OrchestrationV2DomainEvent[] | undefined => undefined,
  },
);

/** Windows last through SQLite commit/rollback; its writer serializes their nonempty event batches. */
export const make = () => {
  const windows = new Set<OrchestrationV2DomainEvent[]>();
  const leases = new Set<{
    threadId: ThreadId;
    permits: (event: OrchestrationV2DomainEvent) => boolean;
    authorization: ReturnType<typeof DispatchAuthorization.make>;
  }>();
  return {
    transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.suspend(() => {
        const events: OrchestrationV2DomainEvent[] = [];
        return effect.pipe(
          Effect.provideService(TransactionWindow, events),
          Effect.ensuring(Effect.sync(() => windows.delete(events))),
        );
      }),
    watch: (threadId: ThreadId, permits: (event: OrchestrationV2DomainEvent) => boolean) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          if (leases.size >= 128) return undefined;
          const lease = { threadId, permits, authorization: DispatchAuthorization.make() };
          if (
            [...windows].some((events) =>
              events.some((event) => event.threadId === threadId && !permits(event)),
            )
          )
            lease.authorization.invalidate();
          leases.add(lease);
          return lease;
        }),
        (lease) =>
          Effect.sync(() => {
            if (lease) {
              leases.delete(lease);
              lease.authorization.invalidate();
            }
          }),
      ).pipe(Effect.map((lease) => lease?.authorization)),
    beforeProjection: (event: OrchestrationV2DomainEvent) => {
      for (const lease of leases)
        if (event.threadId === lease.threadId && !lease.permits(event)) {
          lease.authorization.invalidate();
          leases.delete(lease);
        }
    },
    projection: Effect.fn("DispatchAuthorizations.projection")(function* (
      event: OrchestrationV2DomainEvent,
    ) {
      const events = yield* TransactionWindow;
      if (events) {
        events.push(event);
        windows.add(events);
      }
    }),
  };
};
