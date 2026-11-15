/** Display-only rewrite queries and commands share the authenticated environment transport. */
import {
  REPLY_REWRITE_WS_METHODS,
  type EnvironmentId,
  type ReplyRewriteRecord,
  type ReplyRewriteTargetInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type { Atom, AtomRegistry } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { requestGuarded } from "../rpc/client.ts";
import { createEnvironmentQueryAtomFamily, createEnvironmentRpcCommand } from "./runtime.ts";

export function replyRewriteIsActive(record: ReplyRewriteRecord | null): boolean {
  return (
    record?.currentAttempt?.status === "queued" || record?.currentAttempt?.status === "running"
  );
}

/** Includes a local source snapshot in the cache identity; only IDs cross the RPC boundary. */
export interface ReplyRewriteDetailInput {
  readonly target: ReplyRewriteTargetInput;
  readonly sourceText: string;
}

/**
 * Queries on mount/reconnect and after explicit refresh. An active job permits at most 60 reads
 * per refresh, two seconds apart. Writes never retry; unknown outcomes require a detail read.
 */
export function createReplyRewriteEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const detail = createEnvironmentQueryAtomFamily(runtime, {
    label: "environment-data:reply-rewrite",
    execute: Effect.fn("ReplyRewrite.detail")(function* (
      input: ReplyRewriteDetailInput,
      emit: (record: ReplyRewriteRecord | null) => Effect.Effect<void>,
    ) {
      let record = yield* requestGuarded(REPLY_REWRITE_WS_METHODS.getDetail, input.target);
      for (let read = 1; replyRewriteIsActive(record) && read < 60; read++) {
        yield* emit(record);
        yield* Effect.sleep("2 seconds");
        record = yield* requestGuarded(REPLY_REWRITE_WS_METHODS.getDetail, input.target);
      }
      return record;
    }),
  });
  const refresh = (
    target: { readonly environmentId: EnvironmentId; readonly input: ReplyRewriteDetailInput },
    registry: AtomRegistry.AtomRegistry,
  ) => registry.refresh(detail(target));
  return {
    detail,
    refresh,
    request: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:reply-rewrite:request",
      tag: REPLY_REWRITE_WS_METHODS.request,
      concurrency: {
        mode: "singleFlight",
        key: ({ environmentId, input }) =>
          JSON.stringify([environmentId, input.threadId, input.messageId]),
      },
    }),
    cancel: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:reply-rewrite:cancel",
      tag: REPLY_REWRITE_WS_METHODS.cancel,
    }),
  };
}
