/** Display-only rewrite queries and commands share the authenticated environment transport. */
import {
  REPLY_REWRITE_WS_METHODS,
  EnvironmentAuthorizationError,
  ReplyRewriteError,
  type EnvironmentId,
  type ReplyRewriteRequestInput,
  type ReplyRewriteRecord,
  type ReplyRewriteTargetInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import * as Schema from "effect/Schema";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { requestGuarded } from "../rpc/client.ts";
import { createEnvironmentQueryAtomFamily, createEnvironmentRpcCommand } from "./runtime.ts";

const MAX_UNCONFIRMED_REQUESTS = 128;
const unconfirmedRequests = Atom.make<
  ReadonlyMap<
    string,
    {
      readonly requestId: string;
      readonly runId: ReplyRewriteTargetInput["runId"];
      readonly sourceText: string;
    }
  >
>(new Map()).pipe(Atom.keepAlive);
const submissionKey = (environmentId: EnvironmentId, target: ReplyRewriteTargetInput) =>
  JSON.stringify([environmentId, target.threadId, target.messageId]);
const isAcknowledgedError = Schema.is(
  Schema.Union([ReplyRewriteError, EnvironmentAuthorizationError]),
);

function acknowledgeSubmission(
  registry: AtomRegistry.AtomRegistry,
  key: string,
  requestId: string,
) {
  const values = registry.get(unconfirmedRequests);
  if (values.get(key)?.requestId !== requestId) return;
  const next = new Map(values);
  next.delete(key);
  registry.set(unconfirmedRequests, next);
}

export function replyRewriteIsActive(record: ReplyRewriteRecord | null): boolean {
  return (
    record?.currentAttempt?.status === "queued" || record?.currentAttempt?.status === "running"
  );
}

/** Includes a local source snapshot in the cache identity; only IDs cross the RPC boundary. */
export interface ReplyRewriteDetailInput {
  readonly target: ReplyRewriteTargetInput;
  readonly sourceText: string;
  readonly completionKey?: string;
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
    onAnswer: (
      target: { readonly environmentId: EnvironmentId; readonly input: ReplyRewriteDetailInput },
      record: ReplyRewriteRecord | null,
      registry,
    ) =>
      Effect.sync(() => {
        const key = submissionKey(target.environmentId, target.input.target);
        const unknown = registry.get(unconfirmedRequests).get(key);
        if (
          !unknown ||
          unknown.runId !== target.input.target.runId ||
          unknown.sourceText !== target.input.sourceText ||
          record?.target.threadId !== target.input.target.threadId ||
          record.target.runId !== target.input.target.runId ||
          record.target.messageId !== target.input.target.messageId
        )
          return;
        if (
          record?.currentAttempt?.requestId === unknown.requestId ||
          record?.lastSuccess?.requestId === unknown.requestId
        )
          acknowledgeSubmission(registry, key, unknown.requestId);
      }),
    execute: Effect.fn("ReplyRewrite.detail")(function* (
      input: ReplyRewriteDetailInput,
      emit: (record: ReplyRewriteRecord | null) => Effect.Effect<void>,
    ) {
      const readDetail = requestGuarded(REPLY_REWRITE_WS_METHODS.getDetail, input.target);
      let record = yield* readDetail;
      for (let read = 1; replyRewriteIsActive(record) && read < 60; read++) {
        yield* emit(record);
        yield* Effect.sleep("2 seconds");
        record = yield* readDetail;
      }
      return record;
    }),
  });
  const refresh = (
    target: { readonly environmentId: EnvironmentId; readonly input: ReplyRewriteDetailInput },
    registry: AtomRegistry.AtomRegistry,
  ) => registry.refresh(detail(target));
  const request = createEnvironmentRpcCommand(runtime, {
    label: "environment-command:reply-rewrite:request",
    tag: REPLY_REWRITE_WS_METHODS.request,
    concurrency: {
      mode: "singleFlight",
      key: ({ environmentId, input }) => submissionKey(environmentId, input),
    },
  });
  return {
    detail,
    refresh,
    request: {
      ...request,
      run: async (
        registry: AtomRegistry.AtomRegistry,
        target: {
          readonly environmentId: EnvironmentId;
          readonly input: ReplyRewriteRequestInput & { readonly sourceText: string };
        },
      ) => {
        const { sourceText, ...input } = target.input;
        const key = submissionKey(target.environmentId, input);
        const values = registry.get(unconfirmedRequests);
        const existing = values.get(key);
        if (
          (existing && (existing.runId !== input.runId || existing.sourceText !== sourceText)) ||
          (!existing && values.size >= MAX_UNCONFIRMED_REQUESTS)
        ) {
          return AsyncResult.failure(
            Cause.fail(
              new ReplyRewriteError({
                code: "request_conflict",
                message: existing
                  ? "A rewrite of the previous source has an unconfirmed outcome. Refresh its detail before starting another request."
                  : "Unconfirmed rewrite requests are at capacity. Confirm their outcomes before starting another request.",
              }),
            ),
          );
        }
        const requestId = existing?.requestId ?? input.requestId;
        if (!existing)
          registry.set(
            unconfirmedRequests,
            new Map(values).set(key, { requestId, runId: input.runId, sourceText }),
          );
        const result = await request.run(registry, {
          environmentId: target.environmentId,
          input: { ...input, requestId },
        });
        if (result._tag === "Success" || isAcknowledgedError(Cause.squash(result.cause)))
          acknowledgeSubmission(registry, key, requestId);
        return result;
      },
    },
    cancel: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:reply-rewrite:cancel",
      tag: REPLY_REWRITE_WS_METHODS.cancel,
    }),
  };
}
