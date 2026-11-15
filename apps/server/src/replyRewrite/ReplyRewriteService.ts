// @effect-diagnostics nodeBuiltinImport:off - Exact UTF-8 hashes are synchronous inside SQLite transactions.
import * as NodeCrypto from "node:crypto";
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  CommandId,
  EnvironmentAuthorizationError,
  MessageId,
  RunId,
  ThreadId,
  ReplyRewriteAttempt,
  ReplyRewriteError,
  ReplyRewriteSuccess,
  type ReplyRewriteCancelInput,
  type ReplyRewriteGetDetailInput,
  type ReplyRewriteListInput,
  type ReplyRewriteListResult,
  type ReplyRewriteRecord,
  type ReplyRewriteRequestInput,
  type ReplyRewriteSettings,
  type ReplyRewriteTargetInput,
  type OrchestrationV2StoredEvent,
} from "@t3tools/contracts";
import { replyRewriteBodyFailure } from "@t3tools/shared/replyRewriteBody";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";
import { requireOperationScope } from "../auth/OperationScopes.ts";
import * as EffectOutbox from "../orchestration-v2/EffectOutbox.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as Runner from "./ReplyRewriteRunner.ts";
import { replyRewriteSystemPrompt } from "./prompt.ts";

type ServiceError = ReplyRewriteError | EnvironmentAuthorizationError;
type RewriteRow = {
  message_id: string;
  thread_id: string;
  run_id: string;
  source_hash: string;
  source_version: number;
  generation: number;
  attempt_json: string;
  success_json: string | null;
};
type ChangeRow = { revision: number; thread_id: string; run_id: string; message_id: string };
const hash = (text: string) => NodeCrypto.createHash("sha256").update(text, "utf8").digest("hex");
const isReplyRewriteError = Schema.is(ReplyRewriteError);
const supportedConfig = (config: ReplyRewriteSettings) =>
  config.provider === "openai-codex" &&
  config.modelId === "gpt-6.1-terra" &&
  config.thinkingLevel === "max" &&
  config.requestedServiceTier === "priority";
const jobId = (requestId: string) => `reply-rewrite:${hash(requestId)}`;
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const encodeAttempt = Schema.encodeSync(Schema.fromJsonString(ReplyRewriteAttempt));
const decodeAttempt = Schema.decodeUnknownSync(Schema.fromJsonString(ReplyRewriteAttempt));
const encodeSuccess = Schema.encodeSync(Schema.fromJsonString(ReplyRewriteSuccess));
const decodeSuccess = Schema.decodeUnknownSync(Schema.fromJsonString(ReplyRewriteSuccess));
const sourceVersion = (row: RewriteRow | null, sourceHash: string) => {
  if (row === null) return 1;
  const attempt = decodeAttempt(row.attempt_json);
  return (
    row.source_version +
    (row.source_hash !== sourceHash ||
    (attempt.status === "cancelled" && attempt.error?.code === "source_changed")
      ? 1
      : 0)
  );
};
const recordOf = (row: RewriteRow): ReplyRewriteRecord => ({
  target: {
    threadId: ThreadId.make(row.thread_id),
    runId: RunId.make(row.run_id),
    messageId: MessageId.make(row.message_id),
    sourceHash: row.source_hash,
  },
  currentAttempt: decodeAttempt(row.attempt_json),
  lastSuccess: row.success_json === null ? null : decodeSuccess(row.success_json),
});
const storageError = (cause: unknown) =>
  Effect.logError("Reply rewrite persistence failed", cause).pipe(
    Effect.andThen(
      Effect.fail(
        new ReplyRewriteError({
          code: "protocol",
          message: "Reply rewrite storage is unavailable.",
        }),
      ),
    ),
  );

/** Owns display-only state. Source messages, turns, forks and context are never written here. */
export class ReplyRewriteService extends Context.Service<
  ReplyRewriteService,
  {
    readonly getDetail: (
      input: ReplyRewriteGetDetailInput,
    ) => Effect.Effect<ReplyRewriteRecord | null, ServiceError>;
    readonly request: (
      input: ReplyRewriteRequestInput,
    ) => Effect.Effect<ReplyRewriteRecord, ServiceError>;
    readonly cancel: (
      input: ReplyRewriteCancelInput,
    ) => Effect.Effect<ReplyRewriteRecord, ServiceError>;
    readonly list: (
      input: ReplyRewriteListInput,
    ) => Effect.Effect<ReplyRewriteListResult, ServiceError>;
    readonly subscribe: (input: {
      readonly threadId: ThreadId;
      readonly afterRevision: number;
    }) => Stream.Stream<
      {
        readonly revision: number;
        readonly threadId: ThreadId;
        readonly runId: RunId;
        readonly messageId: MessageId;
      },
      ServiceError
    >;
    /** Called after projections are applied, inside the event sink's transaction. */
    readonly onEvents: (
      events: ReadonlyArray<OrchestrationV2StoredEvent>,
    ) => Effect.Effect<void, ReplyRewriteError>;
    readonly onCommitted: (
      events: ReadonlyArray<OrchestrationV2StoredEvent>,
    ) => Effect.Effect<void>;
    readonly execute: (
      effect: EffectOutbox.OrchestrationEffectV2,
    ) => Effect.Effect<void, ReplyRewriteError>;
    readonly recover: Effect.Effect<void, ReplyRewriteError>;
  }
>()("t3/replyRewrite/ReplyRewriteService") {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const settings = yield* ServerSettings.ServerSettingsService;
  const outbox = yield* EffectOutbox.EffectOutboxV2;
  const runner = yield* Effect.serviceOption(Runner.ReplyRewriteRunner);
  const active = new Map<string, ReplyRewriteTargetInput & { sourceHash: string }>();
  const notifications = yield* PubSub.sliding<void>(1);
  const nowIso = DateTime.now.pipe(Effect.map(DateTime.formatIso));

  const source = Effect.fn("ReplyRewrite.source")(function* (input: ReplyRewriteTargetInput) {
    const rows = yield* sql<{ text: string; classification: string | null }>`
      SELECT json_extract(m.payload_json, '$.text') AS text,
             json_extract(m.payload_json, '$.replyClassification.kind') AS classification
      FROM orchestration_v2_projection_messages m
      JOIN orchestration_v2_projection_runs r ON r.run_id = m.run_id AND r.thread_id = m.thread_id
      JOIN orchestration_v2_projection_threads t ON t.thread_id = m.thread_id
      JOIN orchestration_v2_projection_provider_threads p ON p.provider_thread_id = r.provider_thread_id
      JOIN orchestration_v2_projection_messages u ON u.message_id = json_extract(r.payload_json, '$.userMessageId') AND u.thread_id = r.thread_id
      WHERE m.message_id = ${input.messageId} AND m.thread_id = ${input.threadId} AND m.run_id = ${input.runId}
        AND m.role = 'assistant' AND m.streaming = 0 AND r.status = 'completed' AND p.driver = 'codex'
        AND json_extract(t.payload_json, '$.deletedAt') IS NULL
        AND json_extract(t.payload_json, '$.lineage.relationshipToParent') IS NOT 'subagent'
        AND json_extract(t.payload_json, '$.lineage.sideChat') IS NOT 1
        AND json_extract(r.payload_json, '$.delegatedTaskId') IS NULL
        AND u.role = 'user' AND json_extract(u.payload_json, '$.createdBy') = 'user'
        AND json_extract(u.payload_json, '$.notification') IS NULL
        AND json_extract(u.payload_json, '$.scheduledTaskId') IS NULL
        AND json_extract(u.payload_json, '$.idleCompaction') IS NULL
        AND json_extract(u.payload_json, '$.workflowScript') IS NOT 1
        AND COALESCE(json_extract(m.payload_json, '$.replyClassification.kind'), 'unknown') IN ('final', 'unknown')
      LIMIT 1
    `;
    const row = rows[0];
    return row === undefined || row.text.trim().length === 0
      ? null
      : { ...row, sourceHash: hash(row.text) };
  }, Effect.catch(storageError));

  const readRow = Effect.fn("ReplyRewrite.readRow")(function* (input: ReplyRewriteTargetInput) {
    const rows =
      yield* sql<RewriteRow>`SELECT * FROM reply_rewrites WHERE message_id = ${input.messageId}
      AND thread_id = ${input.threadId} AND run_id = ${input.runId}`;
    return rows[0] ?? null;
  }, Effect.catch(storageError));
  const read = Effect.fn("ReplyRewrite.read")(function* (input: ReplyRewriteTargetInput) {
    const row = yield* readRow(input);
    return row === null ? null : recordOf(row);
  });

  const changed = Effect.fn("ReplyRewrite.changed")(function* (input: ReplyRewriteTargetInput) {
    // A client needs the latest invalidation per reply, not every intermediate status.
    yield* sql`DELETE FROM reply_rewrite_changes WHERE thread_id = ${input.threadId} AND message_id = ${input.messageId}`;
    yield* sql`INSERT INTO reply_rewrite_changes(thread_id, run_id, message_id)
      VALUES (${input.threadId}, ${input.runId}, ${input.messageId})`;
  });
  const notify = Effect.all([PubSub.publish(notifications, undefined), outbox.notifyAvailable()], {
    discard: true,
  });

  const accept = Effect.fn("ReplyRewrite.accept")(function* (
    input: ReplyRewriteRequestInput,
    config: ReplyRewriteSettings,
    automatic = false,
  ) {
    const original = yield* source(input);
    if (original === null)
      return yield* new ReplyRewriteError({
        code: "not_eligible",
        message: "This reply is not eligible for rewriting.",
      });
    const receipts = yield* sql<{
      thread_id: string;
      run_id: string;
      message_id: string;
      source_version: number;
    }>`SELECT * FROM reply_rewrite_requests WHERE request_id = ${input.requestId}`;
    const receipt = receipts[0];
    if (
      receipt !== undefined &&
      (receipt.thread_id !== input.threadId ||
        receipt.run_id !== input.runId ||
        receipt.message_id !== input.messageId)
    ) {
      return yield* new ReplyRewriteError({
        code: "request_conflict",
        message: "This request ID belongs to another reply.",
      });
    }
    const previousRow = yield* readRow(input);
    const version = sourceVersion(previousRow, original.sourceHash);
    const previous = previousRow === null ? null : recordOf(previousRow);
    if (receipt !== undefined && previous !== null) {
      if (receipt.source_version !== version)
        return yield* new ReplyRewriteError({
          code: "source_changed",
          message: "The source reply changed after this request was accepted.",
        });
      return previous;
    }
    if (automatic && original.classification !== "final") return null;
    const current = previous?.currentAttempt;
    if (
      current !== null &&
      current !== undefined &&
      previous?.target.sourceHash === original.sourceHash &&
      (current.status === "queued" || current.status === "running")
    ) {
      yield* sql`INSERT INTO reply_rewrite_requests(request_id, thread_id, run_id, message_id, generation, source_version)
        VALUES (${input.requestId}, ${input.threadId}, ${input.runId}, ${input.messageId}, ${current.generation}, ${version})`;
      return previous;
    }
    if (Option.isNone(runner))
      return yield* new ReplyRewriteError({
        code: "configuration",
        message: "The Pi reply rewrite runner is not connected.",
      });
    if (!supportedConfig(config)) {
      return yield* new ReplyRewriteError({
        code: "configuration",
        message:
          "Reply rewriting requires openai-codex/gpt-6.1-terra, max thinking and priority service.",
      });
    }
    const { auto: _auto, ...configSnapshot } = config;
    const effectiveConfig = {
      ...configSnapshot,
      systemPrompt: replyRewriteSystemPrompt(configSnapshot.customPrompt),
    };
    const generation = (previous?.currentAttempt?.generation ?? 0) + 1;
    const requestedAt = yield* nowIso;
    const target = {
      threadId: input.threadId,
      runId: input.runId,
      messageId: input.messageId,
      sourceHash: original.sourceHash,
    };
    const attempt: ReplyRewriteAttempt = {
      requestId: input.requestId,
      generation,
      target,
      configSnapshot,
      configHash: hash(encodeJson(effectiveConfig)),
      status: "queued",
      requestedAt,
      startedAt: null,
      finishedAt: null,
      error: null,
    };
    yield* sql`INSERT INTO reply_rewrites(message_id, thread_id, run_id, source_hash, source_version, generation, attempt_json, success_json, updated_at)
      VALUES (${input.messageId}, ${input.threadId}, ${input.runId}, ${original.sourceHash}, ${version}, ${generation}, ${encodeAttempt(attempt)}, NULL, ${requestedAt})
      ON CONFLICT(message_id) DO UPDATE SET source_hash = excluded.source_hash, source_version = excluded.source_version, generation = excluded.generation,
        attempt_json = excluded.attempt_json, updated_at = excluded.updated_at,
        success_json = CASE WHEN reply_rewrites.source_hash = excluded.source_hash THEN reply_rewrites.success_json ELSE NULL END`;
    yield* sql`INSERT INTO reply_rewrite_requests(request_id, thread_id, run_id, message_id, generation, source_version)
      VALUES (${input.requestId}, ${input.threadId}, ${input.runId}, ${input.messageId}, ${generation}, ${version})`;
    yield* outbox.enqueue([
      {
        id: jobId(input.requestId),
        commandId: CommandId.make(jobId(input.requestId)),
        threadId: input.threadId,
        request: {
          type: "reply-rewrite.run",
          messageId: input.messageId,
          runId: input.runId,
          requestId: input.requestId,
          generation,
          sourceHash: original.sourceHash,
        },
      },
    ]);
    yield* changed(input);
    return (yield* read(input))!;
  });

  const getDetail = Effect.fn("ReplyRewrite.getDetail")(function* (
    input: ReplyRewriteGetDetailInput,
  ) {
    yield* requireOperationScope(AuthOrchestrationReadScope);
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const original = yield* source(input);
        const record = yield* read(input);
        return original !== null && record?.target.sourceHash === original.sourceHash
          ? record
          : null;
      }),
    );
  });

  const invalidate = Effect.fn("ReplyRewrite.invalidate")(function* (record: ReplyRewriteRecord) {
    const attempt = record.currentAttempt;
    if (attempt === null) return;
    const finishedAt = yield* nowIso;
    yield* sql`UPDATE reply_rewrites SET success_json = NULL, attempt_json = ${encodeAttempt({ ...attempt, status: "cancelled", finishedAt, error: { code: "source_changed", message: "The source reply is no longer valid." } })}, updated_at = ${finishedAt}
      WHERE message_id = ${record.target.messageId}`;
    yield* sql`UPDATE orchestration_v2_effect_outbox SET status = 'cancelled', lease_owner = NULL, updated_at = ${finishedAt}, completed_at = ${finishedAt}
      WHERE effect_id = ${jobId(attempt.requestId)} AND status IN ('pending', 'running')`;
    yield* changed(record.target);
  });

  const onEvents = Effect.fn("ReplyRewrite.onEvents")(
    function* (events: ReadonlyArray<OrchestrationV2StoredEvent>) {
      const relevant = events.filter(
        ({ event }) =>
          event.type === "thread.deleted" ||
          event.type === "run.updated" ||
          (event.type === "message.updated" && !event.payload.streaming),
      );
      if (relevant.length === 0) return;
      const threadIds = [...new Set(relevant.map(({ event }) => event.threadId))];
      const deletedThreadIds = relevant.flatMap(({ event }) =>
        event.type === "thread.deleted" ? [event.threadId] : [],
      );
      const runIds = relevant.flatMap(({ event }) =>
        event.type === "run.updated" ? [event.payload.id] : [],
      );
      const messageIds = relevant.flatMap(({ event }) =>
        event.type === "message.updated" ? [event.payload.id] : [],
      );
      const rows =
        yield* sql<RewriteRow>`SELECT * FROM reply_rewrites WHERE thread_id IN ${sql.in(threadIds)}
          AND (thread_id IN ${sql.in(deletedThreadIds)} OR run_id IN ${sql.in(runIds)} OR message_id IN ${sql.in(messageIds)})`;
      for (const row of rows) {
        const record = recordOf(row);
        const original = yield* source(record.target);
        if (
          (original === null || original.sourceHash !== record.target.sourceHash) &&
          (record.lastSuccess !== null || record.currentAttempt?.status !== "cancelled")
        )
          yield* invalidate(record);
      }
      if (deletedThreadIds.length > 0) {
        yield* sql`DELETE FROM reply_rewrite_requests WHERE thread_id IN ${sql.in(deletedThreadIds)}`;
        yield* sql`DELETE FROM reply_rewrites WHERE thread_id IN ${sql.in(deletedThreadIds)}`;
      }
      const completedRuns = [
        ...new Map(
          relevant.flatMap(({ event }) => {
            const runId =
              event.type === "run.updated" && event.payload.status === "completed"
                ? event.payload.id
                : event.type === "message.updated" &&
                    event.payload.replyClassification?.kind === "final"
                  ? event.payload.runId
                  : null;
            return runId === null ? [] : [[runId, { threadId: event.threadId, runId }] as const];
          }),
        ).values(),
      ];
      if (completedRuns.length === 0) return;
      const config = (yield* settings.getSettings).replyRewrite;
      if (!config.auto || Option.isNone(runner) || !supportedConfig(config)) return;
      for (const run of completedRuns) {
        const messages = yield* sql<{
          message_id: string;
        }>`SELECT message_id FROM orchestration_v2_projection_messages
        WHERE thread_id = ${run.threadId} AND run_id = ${run.runId} AND role = 'assistant' AND streaming = 0
          AND json_extract(payload_json, '$.replyClassification.kind') = 'final'`;
        for (const message of messages) {
          const target = { ...run, messageId: MessageId.make(message.message_id) };
          const original = yield* source(target);
          if (original !== null) {
            const version = sourceVersion(yield* readRow(target), original.sourceHash);
            yield* accept(
              {
                ...target,
                requestId: `auto:${hash(encodeJson([run.runId, target.messageId, original.sourceHash, version]))}`,
              },
              config,
              true,
            );
          }
        }
      }
    },
    Effect.catchTags({
      SqlError: storageError,
      EffectOutboxError: storageError,
      ServerSettingsError: storageError,
    }),
  );

  const onCommitted = Effect.fn("ReplyRewrite.onCommitted")(
    function* (events: ReadonlyArray<OrchestrationV2StoredEvent>) {
      if (
        !events.some(
          ({ event }) =>
            event.type === "run.updated" ||
            event.type === "thread.deleted" ||
            (event.type === "message.updated" && !event.payload.streaming),
        )
      )
        return;
      // Publication holds the event sink's lane; SQL here would invert its transaction lock order.
      const cancelled = [...active]
        .filter(([, target]) =>
          events.some(
            ({ event }) =>
              event.threadId === target.threadId &&
              (event.type === "thread.deleted" ||
                (event.type === "run.updated" &&
                  event.payload.id === target.runId &&
                  event.payload.status !== "completed") ||
                (event.type === "message.updated" &&
                  event.payload.id === target.messageId &&
                  (event.payload.streaming ||
                    hash(event.payload.text) !== target.sourceHash ||
                    event.payload.role !== "assistant" ||
                    (event.payload.replyClassification?.kind !== undefined &&
                      !["final", "unknown"].includes(event.payload.replyClassification.kind))))),
          ),
        )
        .map(([id]) => id);
      yield* outbox.signalCancellations(cancelled);
      yield* notify;
    },
    Effect.catchCause((cause) =>
      Effect.logError("Reply rewrite commit notification failed", cause),
    ),
  );

  const execute = Effect.fn("ReplyRewrite.execute")(
    function* (effect: EffectOutbox.OrchestrationEffectV2) {
      if (effect.request.type !== "reply-rewrite.run") return;
      const request = effect.request;
      const target = {
        threadId: effect.threadId,
        runId: request.runId,
        messageId: request.messageId,
      };
      active.set(effect.id, { ...target, sourceHash: request.sourceHash });
      const matches = (record: ReplyRewriteRecord | null) =>
        record?.currentAttempt?.requestId === request.requestId &&
        record.currentAttempt.generation === request.generation &&
        record.target.sourceHash === request.sourceHash;
      const started = yield* sql.withTransaction(
        Effect.gen(function* () {
          const record = yield* read(target);
          if (!matches(record) || record?.currentAttempt?.status !== "queued") return null;
          const original = yield* source(target);
          if (original === null || original.sourceHash !== request.sourceHash) {
            yield* invalidate(record!);
            return null;
          }
          const attempt: ReplyRewriteAttempt = {
            ...record!.currentAttempt!,
            status: "running",
            startedAt: yield* nowIso,
          };
          yield* sql`UPDATE reply_rewrites SET attempt_json = ${encodeAttempt(attempt)} WHERE message_id = ${target.messageId}`;
          yield* changed(target);
          return { attempt, sourceText: original.text };
        }),
      );
      yield* notify;
      if (started === null) return;
      const result = Option.isNone(runner)
        ? Effect.fail(
            new ReplyRewriteError({
              code: "configuration",
              message: "The Pi reply rewrite runner is not connected.",
            }),
          )
        : runner.value
            .run({
              ...started.attempt.configSnapshot,
              requestId: request.requestId,
              sourceText: started.sourceText,
              systemPrompt: replyRewriteSystemPrompt(started.attempt.configSnapshot.customPrompt),
              timeoutMs: 120_000,
            })
            .pipe(
              Effect.timeoutOrElse({
                duration: "120 seconds",
                orElse: () =>
                  Effect.fail(
                    new ReplyRewriteError({
                      code: "timeout",
                      message:
                        "The reply rewrite timed out; its provider result and process cleanup are unconfirmed.",
                    }),
                  ),
              }),
              Effect.flatMap((output) => {
                const failure = replyRewriteBodyFailure(started.sourceText, output.text);
                return failure === null
                  ? Effect.succeed(output)
                  : Effect.fail(new ReplyRewriteError(failure));
              }),
            );
      yield* Effect.exit(result).pipe(
        Effect.flatMap((exit) =>
          sql.withTransaction(
            Effect.gen(function* () {
              const record = yield* read(target);
              if (!matches(record) || record?.currentAttempt?.status !== "running") return;
              const original = yield* source(target);
              if (original === null || original.sourceHash !== request.sourceHash) {
                yield* invalidate(record!);
                return;
              }
              const finishedAt = yield* nowIso;
              if (exit._tag === "Success") {
                const output = exit.value;
                const success: ReplyRewriteSuccess = {
                  ...started.attempt,
                  ...output,
                  completedAt: finishedAt,
                };
                yield* sql`UPDATE reply_rewrites SET attempt_json = ${encodeAttempt({ ...started.attempt, status: "succeeded", finishedAt })}, success_json = ${encodeSuccess(success)}, updated_at = ${finishedAt}
          WHERE message_id = ${target.messageId} AND generation = ${request.generation} AND source_hash = ${request.sourceHash}`;
              } else {
                const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));
                const error = isReplyRewriteError(failure)
                  ? { code: failure.code, message: failure.message }
                  : {
                      code: "interrupted" as const,
                      message:
                        "The rewrite stopped after the external call started; its result is unknown.",
                    };
                yield* sql`UPDATE reply_rewrites SET attempt_json = ${encodeAttempt({ ...started.attempt, status: error.code === "interrupted" ? "interrupted" : "failed", finishedAt, error })}, updated_at = ${finishedAt}
          WHERE message_id = ${target.messageId} AND generation = ${request.generation} AND source_hash = ${request.sourceHash}`;
              }
              yield* changed(target);
            }),
          ),
        ),
      );
      yield* notify;
    },
    (program, effect) => program.pipe(Effect.ensuring(Effect.sync(() => active.delete(effect.id)))),
    Effect.catchTags({ SqlError: storageError }),
  );

  const recover = sql
    .withTransaction(
      Effect.gen(function* () {
        const rows = yield* sql<RewriteRow>`SELECT r.* FROM reply_rewrites r
          WHERE json_extract(r.attempt_json, '$.status') = 'running'
            OR EXISTS (SELECT 1 FROM orchestration_v2_effect_outbox o
              WHERE o.effect_type = 'reply-rewrite.run' AND o.status = 'running'
                AND json_extract(o.payload_json, '$.requestId') = json_extract(r.attempt_json, '$.requestId'))`;
        const now = yield* nowIso;
        for (const row of rows) {
          const record = recordOf(row);
          const attempt = record.currentAttempt!;
          if (attempt.status === "running") {
            yield* sql`UPDATE reply_rewrites SET attempt_json = ${encodeAttempt({ ...attempt, status: "interrupted", finishedAt: now, error: { code: "interrupted", message: "The server stopped after the external call started; its result is unknown." } })}, updated_at = ${now} WHERE message_id = ${row.message_id}`;
            yield* changed(record.target);
          }
          yield* sql`UPDATE orchestration_v2_effect_outbox SET status = ${attempt.status === "queued" ? "pending" : attempt.status === "succeeded" ? "succeeded" : "failed"}, lease_owner = NULL, updated_at = ${now}
        WHERE effect_id = ${jobId(attempt.requestId)} AND status = 'running'`;
        }
      }),
    )
    .pipe(Effect.catch(storageError), Effect.andThen(notify));

  return ReplyRewriteService.of({
    getDetail: Effect.fn("ReplyRewriteService.getDetail")((input) =>
      getDetail(input).pipe(Effect.catchTags({ SqlError: storageError })),
    ),
    request: Effect.fn("ReplyRewrite.request")(function* (input) {
      yield* requireOperationScope(AuthOrchestrationOperateScope);
      const accepted = yield* settings
        .withSettingsSnapshot((current) => sql.withTransaction(accept(input, current.replyRewrite)))
        .pipe(
          Effect.catchTags({
            SqlError: storageError,
            EffectOutboxError: storageError,
            ServerSettingsError: storageError,
          }),
        );
      yield* notify;
      return accepted!;
    }),
    cancel: Effect.fn("ReplyRewrite.cancel")(function* (input) {
      yield* requireOperationScope(AuthOrchestrationOperateScope);
      const cancelled = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            const current = yield* read(input);
            if (current === null)
              return yield* new ReplyRewriteError({
                code: "not_found",
                message: "The rewrite request was not found.",
              });
            const attempt = current.currentAttempt;
            if (
              attempt?.requestId !== input.requestId ||
              (attempt.status !== "queued" && attempt.status !== "running")
            )
              return { record: current, effectIds: [] };
            const finishedAt = yield* nowIso;
            yield* sql`UPDATE reply_rewrites SET attempt_json = ${encodeAttempt({ ...attempt, status: "cancelled", finishedAt })}, updated_at = ${finishedAt} WHERE message_id = ${input.messageId}`;
            const effects = yield* sql<{
              effect_id: string;
            }>`UPDATE orchestration_v2_effect_outbox SET status = 'cancelled', lease_owner = NULL, updated_at = ${finishedAt}, completed_at = ${finishedAt} WHERE effect_id = ${jobId(attempt.requestId)} AND status IN ('pending', 'running') RETURNING effect_id`;
            yield* changed(input);
            return {
              record: (yield* read(input))!,
              effectIds: effects.map((row) => row.effect_id),
            };
          }),
        )
        .pipe(Effect.catchTags({ SqlError: storageError }));
      yield* outbox.signalCancellations(cancelled.effectIds).pipe(Effect.andThen(notify));
      return cancelled.record;
    }),
    list: Effect.fn("ReplyRewrite.list")(function* (input: ReplyRewriteListInput) {
      yield* requireOperationScope(AuthOrchestrationReadScope);
      return yield* sql
        .withTransaction(
          Effect.gen(function* () {
            const limit = Math.min(100, input.limit ?? 50);
            const rows =
              yield* sql<RewriteRow>`SELECT * FROM reply_rewrites WHERE thread_id = ${input.threadId} AND message_id > ${input.cursor ?? ""} ORDER BY message_id LIMIT ${limit + 1}`;
            const records = [];
            for (const row of rows.slice(0, limit)) {
              const record = recordOf(row);
              const original = yield* source(record.target);
              if (original === null || original.sourceHash !== record.target.sourceHash) continue;
              const success = record.lastSuccess;
              const lastSuccess =
                success === null ? null : (({ text: _text, ...summary }) => summary)(success);
              records.push({ ...record, lastSuccess });
            }
            const revisions = yield* sql<{
              revision: number;
            }>`SELECT COALESCE(MAX(revision), 0) AS revision FROM reply_rewrite_changes WHERE thread_id = ${input.threadId}`;
            return {
              records,
              nextCursor: rows.length > limit ? MessageId.make(rows[limit - 1]!.message_id) : null,
              revision: revisions[0]!.revision,
            };
          }),
        )
        .pipe(Effect.catch(storageError));
    }),
    subscribe: (input) =>
      Stream.unwrap(
        Effect.gen(function* () {
          yield* requireOperationScope(AuthOrchestrationReadScope);
          const subscription = yield* PubSub.subscribe(notifications);
          let cursor = input.afterRevision;
          const page = Effect.gen(function* () {
            const rows =
              yield* sql<ChangeRow>`SELECT * FROM reply_rewrite_changes WHERE thread_id = ${input.threadId} AND revision > ${cursor} ORDER BY revision LIMIT 100`;
            cursor = rows.at(-1)?.revision ?? cursor;
            return rows;
          }).pipe(Effect.catch(storageError));
          const batches = Stream.unfold(true, (more) =>
            (more ? Effect.void : PubSub.take(subscription)).pipe(
              Effect.andThen(page),
              Effect.map((rows) => [rows, rows.length === 100] as const),
            ),
          );
          return batches.pipe(
            Stream.flatMap(Stream.fromIterable),
            Stream.map((row) => ({
              revision: row.revision,
              threadId: ThreadId.make(row.thread_id),
              runId: RunId.make(row.run_id),
              messageId: MessageId.make(row.message_id),
            })),
          );
        }),
      ),
    onEvents,
    onCommitted,
    execute,
    recover,
  });
});

export const layer = Layer.effect(ReplyRewriteService, make);
