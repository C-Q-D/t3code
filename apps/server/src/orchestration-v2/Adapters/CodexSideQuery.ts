/** Routes ephemeral Codex traffic before main-session handlers can mutate state or await turns. */
import type * as CodexClient from "effect-codex-app-server/client";
import type * as CodexRpc from "effect-codex-app-server/rpc";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";

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
 * The owner registers a fork before starting its turn and removes it after unsubscribe.
 * Notifications are already schema-validated by the client; unknown notifications remain unknown.
 * No I/O, retries, or deadlines are introduced by the registry itself.
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

  return {
    client,
    register: (
      threadId: string,
      collect: (method: string, payload: unknown) => Effect.Effect<void>,
    ) => {
      threads.set(threadId, collect);
    },
    remove: (threadId: string) => {
      threads.delete(threadId);
      for (const [turnId, owner] of turns) {
        if (owner === threadId) turns.delete(turnId);
      }
    },
  };
}
