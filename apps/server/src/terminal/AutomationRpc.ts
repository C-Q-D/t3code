/** Adapts authenticated RPC connections to the shared automation service; owns no binding state. */
import * as A from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as Automation from "./AutomationService.ts";

type Metadata = { readonly client: { readonly id: number } };

/** The prefix and environment come from the socket, and checkThread resolves the local authorized thread. */
export const make = Effect.fn("TerminalAutomationRpc.make")(function* (
  prefix: string,
  environmentId: A.EnvironmentId,
  checkThread: (threadId: A.ThreadId) => Effect.Effect<void, A.TerminalAutomationError>,
) {
  const service = yield* Automation.TerminalAutomationService;
  const connections = new Map<string, string>();
  let generation = 0;
  let closed = false;
  const connectionId = (threadId: A.ThreadId, metadata: Metadata) =>
    JSON.stringify([prefix, metadata.client.id, threadId]);
  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      closed = true;
      yield* Effect.forEach(connections.values(), (id) => service.disconnect(id), {
        discard: true,
      });
    }),
  );
  const checked = Effect.fn("TerminalAutomationRpc.checked")(function* (
    threadId: A.ThreadId,
    metadata: Metadata,
  ) {
    if (closed) return yield* Effect.fail({ code: "client_unavailable" as const });
    const key = connectionId(threadId, metadata);
    const id = connections.get(key);
    yield* checkThread(threadId);
    if (closed || !id || connections.get(key) !== id)
      return yield* Effect.fail({ code: "client_unavailable" as const });
    return id;
  });
  return {
    [A.WS_METHODS.terminalAutomationGetConnectionState]: (
      input: typeof A.TerminalAutomationSubscribeInput.Type,
      metadata: Metadata,
    ) =>
      checked(input.threadId, metadata).pipe(
        Effect.flatMap((id) => service.getConnectionState(id)),
      ),
    [A.WS_METHODS.terminalAutomationSubscribe]: (
      input: typeof A.TerminalAutomationSubscribeInput.Type,
      metadata: Metadata,
    ) =>
      Stream.unwrap(
        Effect.gen(function* () {
          if (closed) return yield* Effect.fail({ code: "client_unavailable" as const });
          yield* checkThread(input.threadId);
          const key = connectionId(input.threadId, metadata);
          const queue = yield* Effect.uninterruptible(
            Effect.gen(function* () {
              if (closed) return yield* Effect.fail({ code: "client_unavailable" as const });
              if (connections.has(key))
                return yield* Effect.fail({ code: "request_conflict" as const });
              const id = `${key}:${++generation}`;
              yield* Effect.acquireRelease(
                Effect.sync(() => {
                  connections.set(key, id);
                }),
                () =>
                  Effect.sync(() => {
                    if (connections.get(key) === id) connections.delete(key);
                  }),
              );
              return yield* service.connect({ environmentId, threadId: input.threadId }, id);
            }),
          );
          const changes = yield* service.watchState(connections.get(key)!);
          return Stream.concat(
            Stream.succeed({ type: "ready" as const }),
            Stream.merge(Stream.fromQueue(queue), Stream.fromQueue(changes)),
          );
        }),
      ),
    [A.WS_METHODS.terminalAutomationRegisterViews]: (
      input: typeof A.TerminalAutomationRegisterViewsInput.Type,
      metadata: Metadata,
    ) =>
      checked(input.threadId, metadata).pipe(
        Effect.flatMap((id) => service.registerViews(id, input.registration)),
      ),
    [A.WS_METHODS.terminalAutomationReplyBridge]: (
      input: typeof A.TerminalAutomationReplyBridgeInput.Type,
      metadata: Metadata,
    ) =>
      checked(input.threadId, metadata).pipe(
        Effect.flatMap((id) => service.replyBridge(id, input.reply)),
      ),
    [A.WS_METHODS.terminalAutomationReplySelection]: (
      input: typeof A.TerminalAutomationReplySelectionInput.Type,
      metadata: Metadata,
    ) =>
      checked(input.threadId, metadata).pipe(
        Effect.flatMap((id) => service.replySelection(id, input.reply)),
      ),
    [A.WS_METHODS.terminalAutomationReportEvent]: (
      input: typeof A.TerminalAutomationReportEventInput.Type,
      metadata: Metadata,
    ) =>
      checked(input.threadId, metadata).pipe(
        Effect.flatMap((id) => service.reportEvent(id, input.event)),
      ),
    [A.WS_METHODS.terminalAutomationResume]: (
      input: typeof A.TerminalAutomationResumeInput.Type,
      metadata: Metadata,
    ) =>
      checked(input.threadId, metadata).pipe(
        Effect.flatMap((id) => service.resumeFromConnection(id, input.bindingId, input.inputEpoch)),
      ),
  };
});
