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
  const connections = new Set<string>();
  let closed = false;
  const connectionId = (threadId: A.ThreadId, metadata: Metadata) =>
    JSON.stringify([prefix, metadata.client.id, threadId]);
  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      closed = true;
      yield* Effect.forEach(connections, (id) => service.disconnect(id), { discard: true });
    }),
  );
  const checked = Effect.fn("TerminalAutomationRpc.checked")(function* (
    threadId: A.ThreadId,
    metadata: Metadata,
  ) {
    if (closed) return yield* Effect.fail({ code: "client_unavailable" as const });
    yield* checkThread(threadId);
    if (closed) return yield* Effect.fail({ code: "client_unavailable" as const });
    return connectionId(threadId, metadata);
  });
  return {
    [A.WS_METHODS.terminalAutomationSubscribe]: (
      input: typeof A.TerminalAutomationSubscribeInput.Type,
      metadata: Metadata,
    ) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const id = yield* checked(input.threadId, metadata);
          const queue = yield* service.connect({ environmentId, threadId: input.threadId }, id);
          if (closed) {
            yield* service.disconnect(id);
            return yield* Effect.fail({ code: "client_unavailable" as const });
          }
          connections.add(id);
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              connections.delete(id);
            }),
          );
          return Stream.concat(Stream.succeed({ type: "ready" as const }), Stream.fromQueue(queue));
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
        Effect.flatMap((id) => service.resumeFromConnection(id, input.bindingId)),
      ),
  };
});
