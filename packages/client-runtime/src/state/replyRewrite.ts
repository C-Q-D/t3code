/** Display-only rewrite queries and commands share the authenticated environment transport. */
import {
  REPLY_REWRITE_WS_METHODS,
  EnvironmentAuthorizationError,
  ReplyRewriteError,
  type EnvironmentId,
  type ReplyRewriteRequestInput,
  type ReplyRewriteRecord,
  type ReplyRewriteTargetInput,
  type ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { requestGuarded, subscribeDynamic } from "../rpc/client.ts";
import { createEnvironmentQueryAtomFamily, createEnvironmentRpcCommand } from "./runtime.ts";
import { createCommandPermissions } from "./commandPermissions.ts";
import { followStreamInEnvironment } from "./environmentStreams.ts";

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

interface RewriteRevisions {
  readonly revision: number;
  readonly targets: ReadonlyMap<string, number>;
  readonly allowed: boolean;
}

const revisionKey = (target: ReplyRewriteTargetInput) =>
  JSON.stringify([target.runId, target.messageId]);

/** Mounted details share one durable invalidation feed per destination thread. Writes never retry. */
export function createReplyRewriteEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const permissions = createCommandPermissions(runtime, REPLY_REWRITE_WS_METHODS.subscribe);
  const changes = Atom.family((key: string) => {
    const { environmentId, threadId } = JSON.parse(key) as {
      readonly environmentId: EnvironmentId;
      readonly threadId: ThreadId;
    };
    return runtime
      .atom((get) => {
        const initial = Option.getOrElse(
          Option.flatMap(
            get.self<AsyncResult.AsyncResult<RewriteRevisions, unknown>>(),
            AsyncResult.value,
          ),
          (): RewriteRevisions => ({ revision: 0, targets: new Map(), allowed: true }),
        );
        if (!get(permissions.permissionAtom(environmentId)))
          return Stream.succeed({ ...initial, allowed: false });
        let current = { ...initial, allowed: true };
        const events = subscribeDynamic(REPLY_REWRITE_WS_METHODS.subscribe, () =>
          Effect.sync(() => ({ threadId, afterRevision: current.revision })),
        ).pipe(
          Stream.filter(
            (event) => event.threadId === threadId && event.revision > current.revision,
          ),
          Stream.map((event): RewriteRevisions => {
            current = {
              revision: event.revision,
              targets: new Map(current.targets).set(revisionKey(event), event.revision),
              allowed: true,
            };
            return current;
          }),
        );
        return followStreamInEnvironment(
          environmentId,
          Stream.succeed(current).pipe(Stream.concat(events)),
        );
      })
      .pipe(Atom.setIdleTTL(0));
  });
  const targetRevision = Atom.family((key: string) => {
    const { environmentId, target } = JSON.parse(key) as {
      readonly environmentId: EnvironmentId;
      readonly target: ReplyRewriteTargetInput;
    };
    return Atom.make((get) => {
      const result = get(changes(JSON.stringify({ environmentId, threadId: target.threadId })));
      if (result._tag === "Failure") return -1;
      const value = AsyncResult.getOrElse(result, () => null);
      return value?.allowed === false ? -1 : (value?.targets.get(revisionKey(target)) ?? 0);
    }).pipe(Atom.setIdleTTL(0));
  });
  const detail = createEnvironmentQueryAtomFamily(runtime, {
    label: "environment-data:reply-rewrite",
    idleTtlMs: 0,
    refreshTrigger: ({
      environmentId,
      input,
    }: {
      readonly environmentId: EnvironmentId;
      readonly input: ReplyRewriteDetailInput;
    }) => targetRevision(JSON.stringify({ environmentId, target: input.target })),
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
    execute: Effect.fn("ReplyRewrite.detail")((input: ReplyRewriteDetailInput) =>
      requestGuarded(REPLY_REWRITE_WS_METHODS.getDetail, input.target),
    ),
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
      key: ({ environmentId, input }) =>
        JSON.stringify([submissionKey(environmentId, input), input.requestId]),
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
        // Rejection of a retransmission cannot settle the earlier unknown attempt.
        if (
          result._tag === "Success" ||
          (!existing && isAcknowledgedError(Cause.squash(result.cause)))
        )
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
