/** Routes ephemeral Codex traffic before main-session handlers can mutate state or await turns. */
import type * as CodexClient from "effect-codex-app-server/client";
import type * as CodexRpc from "effect-codex-app-server/rpc";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Predicate from "effect/Predicate";
import type * as Scope from "effect/Scope";

const SIDE_QUERY_UNSUBSCRIBE_TIMEOUT_MS = 5_000;

const refusals: {
  readonly [M in CodexRpc.ServerRequestMethod]?: CodexRpc.ServerRequestResponsesByMethod[M];
} = {
  "item/commandExecution/requestApproval": { decision: "decline" },
  "item/fileChange/requestApproval": { decision: "decline" },
  "item/permissions/requestApproval": { permissions: {}, scope: "turn" },
  "mcpServer/elicitation/request": { action: "decline" },
  execCommandApproval: { decision: "abort" },
  applyPatchApproval: { decision: "abort" },
  // This protocol has no cancellation flag; no answers supplies no user authority.
  "item/tool/requestUserInput": { answers: {} },
};

/**
 * Wrap one app-server client without changing outbound requests or main-thread handlers.
 * A fork stays registered until bounded unsubscribe finishes, including abandoned late replies.
 * Notifications are already schema-validated by the client; unknown notifications remain unknown.
 * Fork acquisition inherits the caller's deadline; unsubscribe has a five-second limit, no retries.
 * @param transport The session's existing client, shared with the main thread.
 * @returns The guarded client and lifecycle operations for ephemeral thread collectors.
 */
export function make(transport: CodexClient.CodexAppServerClient["Service"]) {
  const threads = new Map<string, (method: string, payload: unknown) => Effect.Effect<void>>();
  const turns = new Map<string, string>();

  const find = (payload: unknown): string | undefined => {
    if (!Predicate.isObject(payload)) return undefined;
    const nativeThreadId = payload.threadId ?? payload.conversationId;
    const turnId =
      payload.turnId ?? (Predicate.isObject(payload.turn) ? payload.turn.id : undefined);
    const threadId =
      typeof nativeThreadId === "string" && threads.has(nativeThreadId)
        ? nativeThreadId
        : typeof turnId === "string"
          ? turns.get(turnId)
          : undefined;
    if (threadId !== undefined && typeof turnId === "string") turns.set(turnId, threadId);
    return threadId;
  };

  const client: CodexClient.CodexAppServerClient["Service"] = {
    ...transport,
    handleServerNotification: (method, handler) =>
      transport.handleServerNotification(method, (payload) =>
        Effect.suspend(() => {
          const threadId = find(payload);
          const collect = threadId === undefined ? undefined : threads.get(threadId);
          return collect === undefined ? handler(payload) : collect(method, payload);
        }),
      ),
    handleServerRequest: (method, handler) =>
      transport.handleServerRequest(method, (payload) =>
        Effect.suspend(() => {
          const refusal = refusals[method];
          return find(payload) !== undefined && refusal !== undefined
            ? Effect.succeed(refusal)
            : handler(payload);
        }),
      ),
    handleUnknownServerNotification: (handler) =>
      transport.handleUnknownServerNotification((method, payload) =>
        Effect.suspend(() => {
          const threadId = find(payload);
          const collect = threadId === undefined ? undefined : threads.get(threadId);
          return collect === undefined ? handler(method, payload) : collect(method, payload);
        }),
      ),
  };

  const remove = (threadId: string) => {
    threads.delete(threadId);
    for (const [turnId, owner] of turns) {
      if (owner === threadId) turns.delete(turnId);
    }
  };

  const release = Effect.fn("CodexSideQuery.release")((threadId: string) =>
    transport.request("thread/unsubscribe", { threadId }).pipe(
      // Finalizers are masked; the RPC must remain interruptible for its own deadline.
      Effect.interruptible,
      Effect.timeout(SIDE_QUERY_UNSUBSCRIBE_TIMEOUT_MS),
      Effect.catchCause((cause) =>
        Effect.logWarning("Failed to unsubscribe Codex side query.", { threadId, cause }),
      ),
      Effect.ensuring(Effect.sync(() => remove(threadId))),
      Effect.asVoid,
    ),
  );

  /**
   * Acquires a routed ephemeral fork for the caller's scope.
   * @param params Native fork parameters, including the main thread's explicit model.
   * @param collect Receives only this fork's notifications while the query is active.
   * @param sessionScope Owns pending fork replies after the query is cancelled.
   * @returns The provider fork response; startup errors propagate to the caller. Waiting is
   * interruptible. Release never replaces a result with a transport error and is not retried.
   */
  const acquireFork = Effect.fn("CodexSideQuery.acquireFork")(function* (
    params: CodexRpc.ClientRequestParamsByMethod["thread/fork"],
    collect: (method: string, payload: unknown) => Effect.Effect<void>,
    sessionScope: Scope.Scope,
  ) {
    let abandoned = false;
    let ownedThreadId: string | undefined;
    // Only launching the receiver is masked. Cancelling its join must not cancel the
    // protocol request: its late reply is the only way to identify and release the fork.
    const receiver = yield* Effect.acquireRelease(
      transport.request("thread/fork", params).pipe(
        Effect.flatMap((response) => {
          const threadId = response.thread.id;
          threads.set(threadId, abandoned ? () => Effect.void : collect);
          if (abandoned) return release(threadId).pipe(Effect.as(response));
          ownedThreadId = threadId;
          return Effect.succeed(response);
        }),
        Effect.forkIn(sessionScope, { startImmediately: true }),
      ),
      () =>
        Effect.suspend(() => {
          abandoned = true;
          return ownedThreadId === undefined ? Effect.void : release(ownedThreadId);
        }),
    );
    return yield* Fiber.join(receiver);
  });

  return {
    client,
    acquireFork,
    register: (
      threadId: string,
      collect: (method: string, payload: unknown) => Effect.Effect<void>,
    ) => {
      threads.set(threadId, collect);
    },
    remove,
  };
}
