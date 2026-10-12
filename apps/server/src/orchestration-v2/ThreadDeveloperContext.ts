/** Supplies trusted thread instructions without coupling run execution to discussions. */
import { ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";

/**
 * Provide a discussion-owned implementation at the layer that builds
 * RunExecutionService. The default keeps ordinary threads unchanged.
 * Implementations handle their own read failures: this port has no error channel.
 */
export class ThreadDeveloperContext extends Context.Reference<{
  /** Returns this thread's trusted entries in prompt order; no entries means no override. */
  readonly forThread: (
    threadId: ThreadId,
  ) => Effect.Effect<ReadonlyArray<{ readonly key: string; readonly text: string }>>;
}>("t3/orchestration-v2/ThreadDeveloperContext", {
  defaultValue: () => ({ forThread: () => Effect.succeed([]) }),
}) {}
