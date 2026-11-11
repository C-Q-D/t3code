import type { OrchestrationV2DomainEvent, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as DispatchAuthorization from "../auth/DispatchAuthorization.ts";

/** Call leases are invalidated before projection writes, including transactions that later roll back. */
export const make = () => {
  const leases = new Set<{
    threadId: ThreadId;
    permits: (event: OrchestrationV2DomainEvent) => boolean;
    authorization: ReturnType<typeof DispatchAuthorization.make>;
  }>();
  return {
    watch: (threadId: ThreadId, permits: (event: OrchestrationV2DomainEvent) => boolean) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          if (leases.size >= 128) return undefined;
          const lease = { threadId, permits, authorization: DispatchAuthorization.make() };
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
  };
};
