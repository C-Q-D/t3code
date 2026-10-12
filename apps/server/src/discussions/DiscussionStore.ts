/** SQLite repositories for discussion snapshots, ordered entries, delivery cursors and templates. */
import {
  Discussion,
  DiscussionEntry,
  DiscussionError,
  DiscussionPrompt,
  DiscussionTemplate,
  type DiscussionId,
  type DiscussionPromptId,
  type DiscussionTemplateId,
  type DiscussionSeatId,
  type ProjectId,
  type RunId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";

/** Input omits seq because allocation and insertion must be one atomic database operation. */
export type DiscussionEntryAppend = Omit<DiscussionEntry, "seq">;

/** SQL operations do not retry writes; failures retain their cause for the caller. */
export class DiscussionStore extends Context.Service<
  DiscussionStore,
  {
    /** Lists both prompt kinds, ordered by creation time then id. */
    readonly listPrompts: () => Effect.Effect<ReadonlyArray<DiscussionPrompt>, DiscussionError>;
    /** Returns null when id is absent. */
    readonly getPrompt: (
      id: DiscussionPromptId,
    ) => Effect.Effect<DiscussionPrompt | null, DiscussionError>;
    /** Persists a complete prompt, replacing an existing row with the same id. */
    readonly upsertPrompt: (prompt: DiscussionPrompt) => Effect.Effect<void, DiscussionError>;
    /** Deletes id without enforcing template rules; callers use the template service for user mutations. */
    readonly deletePrompt: (id: DiscussionPromptId) => Effect.Effect<void, DiscussionError>;
    /** Lists templates by creation time then id. */
    readonly listTemplates: () => Effect.Effect<ReadonlyArray<DiscussionTemplate>, DiscussionError>;
    /** Returns null when id is absent. */
    readonly getTemplate: (
      id: DiscussionTemplateId,
    ) => Effect.Effect<DiscussionTemplate | null, DiscussionError>;
    /** Persists a complete template; reference validation belongs to the template service. */
    readonly upsertTemplate: (template: DiscussionTemplate) => Effect.Effect<void, DiscussionError>;
    /** Deletes the template selected by id. */
    readonly deleteTemplate: (id: DiscussionTemplateId) => Effect.Effect<void, DiscussionError>;
    /** Inserts a new discussion; duplicate id is an error. */
    readonly createDiscussion: (discussion: Discussion) => Effect.Effect<void, DiscussionError>;
    /** Replaces an existing snapshot; absent id fails with not_found. */
    readonly updateDiscussion: (discussion: Discussion) => Effect.Effect<void, DiscussionError>;
    /** Returns null when id is absent. */
    readonly getDiscussion: (id: DiscussionId) => Effect.Effect<Discussion | null, DiscussionError>;
    /** Lists only the selected project's discussions by creation time then id. */
    readonly listDiscussions: (
      projectId: ProjectId,
    ) => Effect.Effect<ReadonlyArray<Discussion>, DiscussionError>;
    /** Deletes discussion, entries and delivery progress in a transaction. */
    readonly deleteDiscussion: (id: DiscussionId) => Effect.Effect<void, DiscussionError>;
    /** Allocates max(seq)+1, starting at 1, atomically; duplicate non-null runId is rejected. */
    readonly appendEntry: (
      entry: DiscussionEntryAppend,
    ) => Effect.Effect<DiscussionEntry, DiscussionError>;
    /** Reads (afterSeq, throughSeq] in ascending seq; omitted throughSeq has no upper bound. */
    readonly listEntries: (
      id: DiscussionId,
      afterSeq?: number,
      throughSeq?: number,
    ) => Effect.Effect<ReadonlyArray<DiscussionEntry>, DiscussionError>;
    /** Returns the entry for a globally unique provider run, or null. */
    readonly getEntryByRunId: (id: RunId) => Effect.Effect<DiscussionEntry | null, DiscussionError>;
    /** Returns persisted progress, or null for an undelivered seat. */
    readonly getSeatDelivery: (
      id: DiscussionId,
      seatId: DiscussionSeatId,
    ) => Effect.Effect<number | null, DiscussionError>;
    /** Replaces progress for one seat; seq is a nonnegative transcript position. */
    readonly setSeatDelivery: (
      id: DiscussionId,
      seatId: DiscussionSeatId,
      seq: number,
    ) => Effect.Effect<void, DiscussionError>;
  }
>()("t3/discussions/DiscussionStore") {}

/** SQLite prompt row before contract validation. */
interface PromptRow {
  prompt_id: string;
  kind: string;
  name: string;
  prompt: string;
  avatar: string | null;
  description: string;
  builtin: number;
  created_at: string;
  updated_at: string;
}
/** Seat JSON is decoded separately so ordering and model options survive persistence. */
interface TemplateRow {
  template_id: string;
  name: string;
  seats_json: string;
  summary_prompt_id: string | null;
  created_at: string;
  updated_at: string;
}
/** SQL snapshot layout; nullable state is represented by SQL NULL. */
interface DiscussionRow {
  discussion_id: string;
  project_id: string;
  title: string;
  topic: string;
  status: string;
  seats_json: string;
  cursor_json: string;
  pause_json: string | null;
  closing_json: string | null;
  created_by: string;
  creation_source: string;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
}
/** SQL transcript layout; seq is unique within the parent discussion. */
interface EntryRow {
  discussion_id: string;
  seq: number;
  entry_id: string;
  kind: string;
  seat_id: string | null;
  thread_id: string | null;
  run_id: string | null;
  text: string;
  files_json: string | null;
  status: string;
  checkpoint_ref: string | null;
  created_at: string;
}

const templateSeatsJson = Schema.fromJsonString(DiscussionTemplate.fields.seats);
const seatsJson = Schema.fromJsonString(Discussion.fields.seats);
const cursorJson = Schema.fromJsonString(Discussion.fields.cursor);
const pauseJson = Schema.fromJsonString(Discussion.fields.pause);
const closingJson = Schema.fromJsonString(Discussion.fields.closing);
const filesJson = Schema.fromJsonString(DiscussionEntry.fields.files);

/** Converts SQL failures or malformed persisted data to a stable domain error without hiding the cause. */
const storageFailure = <A, E, R>(operation: string, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.mapError((cause) =>
      Schema.is(DiscussionError)(cause)
        ? cause
        : new DiscussionError({
            reason: "orchestration_error",
            message: `Could not ${operation}.`,
            cause,
          }),
    ),
  );

/** Maps SQL names to the prompt contract and validates stored values. */
const decodePrompt = (row: PromptRow) =>
  Schema.decodeUnknownEffect(DiscussionPrompt)({
    id: row.prompt_id,
    kind: row.kind,
    name: row.name,
    prompt: row.prompt,
    avatar: row.avatar,
    description: row.description,
    builtin: row.builtin === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

/** Decodes the ordered seat configuration through its schema before validating the whole template. */
const decodeTemplate = (row: TemplateRow) =>
  Effect.gen(function* () {
    return yield* Schema.decodeUnknownEffect(DiscussionTemplate)({
      id: row.template_id,
      name: row.name,
      seats: yield* Schema.decodeUnknownEffect(templateSeatsJson)(row.seats_json),
      summaryPromptId: row.summary_prompt_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  });

/** Restores snapshots; SQL NULL remains null instead of becoming a missing state. */
const decodeDiscussion = (row: DiscussionRow) =>
  Effect.gen(function* () {
    return yield* Schema.decodeUnknownEffect(Discussion)({
      id: row.discussion_id,
      projectId: row.project_id,
      title: row.title,
      topic: row.topic,
      status: row.status,
      seats: yield* Schema.decodeUnknownEffect(seatsJson)(row.seats_json),
      cursor: yield* Schema.decodeUnknownEffect(cursorJson)(row.cursor_json),
      pause:
        row.pause_json === null
          ? null
          : yield* Schema.decodeUnknownEffect(pauseJson)(row.pause_json),
      closing:
        row.closing_json === null
          ? null
          : yield* Schema.decodeUnknownEffect(closingJson)(row.closing_json),
      createdBy: row.created_by,
      creationSource: row.creation_source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      endedAt: row.ended_at,
    });
  });

/** Validates transcript data and maps nullable SQL identifiers back to optional contract fields. */
const decodeEntry = (row: EntryRow) =>
  Effect.gen(function* () {
    return yield* Schema.decodeUnknownEffect(DiscussionEntry)({
      id: row.entry_id,
      discussionId: row.discussion_id,
      seq: row.seq,
      kind: row.kind,
      ...(row.seat_id === null ? {} : { seatId: row.seat_id }),
      ...(row.thread_id === null ? {} : { threadId: row.thread_id }),
      ...(row.run_id === null ? {} : { runId: row.run_id }),
      text: row.text,
      files:
        row.files_json === null
          ? null
          : yield* Schema.decodeUnknownEffect(filesJson)(row.files_json),
      status: row.status,
      checkpointRef: row.checkpoint_ref,
      createdAt: row.created_at,
    });
  });

/** Encodes JSON columns using their contract codecs; provider model transformations must also run on writes. */
const encodeDiscussion = (value: Discussion) =>
  Effect.gen(function* () {
    yield* Schema.encodeEffect(Discussion)(value);
    return {
      discussion_id: value.id,
      project_id: value.projectId,
      title: value.title,
      topic: value.topic,
      status: value.status,
      seats_json: yield* Schema.encodeEffect(seatsJson)(value.seats),
      cursor_json: yield* Schema.encodeEffect(cursorJson)(value.cursor),
      pause_json: value.pause === null ? null : yield* Schema.encodeEffect(pauseJson)(value.pause),
      closing_json:
        value.closing === null ? null : yield* Schema.encodeEffect(closingJson)(value.closing),
      created_by: value.createdBy,
      creation_source: value.creationSource,
      created_at: value.createdAt,
      updated_at: value.updatedAt,
      ended_at: value.endedAt,
    };
  });

/** Construction acquires only the application-owned SQL client; it never opens a database itself. */
const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return DiscussionStore.of({
    listPrompts: () =>
      storageFailure(
        "list discussion prompts",
        sql<PromptRow>`SELECT * FROM discussion_prompts ORDER BY created_at, prompt_id`.pipe(
          Effect.flatMap((rows) => Effect.forEach(rows, decodePrompt)),
        ),
      ),
    getPrompt: (id) =>
      storageFailure(
        "read discussion prompt",
        sql<PromptRow>`SELECT * FROM discussion_prompts WHERE prompt_id = ${id}`.pipe(
          Effect.flatMap((rows) => (rows[0] ? decodePrompt(rows[0]) : Effect.succeed(null))),
        ),
      ),
    upsertPrompt: (prompt) =>
      storageFailure(
        "save discussion prompt",
        Effect.gen(function* () {
          yield* Schema.encodeEffect(DiscussionPrompt)(prompt);
          yield* sql`INSERT INTO discussion_prompts ${sql.insert({
            prompt_id: prompt.id,
            kind: prompt.kind,
            name: prompt.name,
            prompt: prompt.prompt,
            avatar: prompt.avatar,
            description: prompt.description,
            builtin: prompt.builtin ? 1 : 0,
            created_at: prompt.createdAt,
            updated_at: prompt.updatedAt,
          })} ON CONFLICT(prompt_id) DO UPDATE SET kind = excluded.kind, name = excluded.name,
        prompt = excluded.prompt, avatar = excluded.avatar, description = excluded.description, builtin = excluded.builtin, created_at = excluded.created_at, updated_at = excluded.updated_at`;
        }),
      ),
    deletePrompt: (id) =>
      storageFailure(
        "delete discussion prompt",
        sql`DELETE FROM discussion_prompts WHERE prompt_id = ${id}`.pipe(Effect.asVoid),
      ),
    listTemplates: () =>
      storageFailure(
        "list discussion templates",
        sql<TemplateRow>`SELECT * FROM discussion_templates ORDER BY created_at, template_id`.pipe(
          Effect.flatMap((rows) => Effect.forEach(rows, decodeTemplate)),
        ),
      ),
    getTemplate: (id) =>
      storageFailure(
        "read discussion template",
        sql<TemplateRow>`SELECT * FROM discussion_templates WHERE template_id = ${id}`.pipe(
          Effect.flatMap((rows) => (rows[0] ? decodeTemplate(rows[0]) : Effect.succeed(null))),
        ),
      ),
    upsertTemplate: (template) =>
      storageFailure(
        "save discussion template",
        Effect.gen(function* () {
          yield* Schema.encodeEffect(DiscussionTemplate)(template);
          yield* sql`INSERT INTO discussion_templates ${sql.insert({
            template_id: template.id,
            name: template.name,
            seats_json: yield* Schema.encodeEffect(templateSeatsJson)(template.seats),
            summary_prompt_id: template.summaryPromptId,
            created_at: template.createdAt,
            updated_at: template.updatedAt,
          })} ON CONFLICT(template_id) DO UPDATE SET name = excluded.name, seats_json = excluded.seats_json,
        summary_prompt_id = excluded.summary_prompt_id, created_at = excluded.created_at, updated_at = excluded.updated_at`;
        }),
      ),
    deleteTemplate: (id) =>
      storageFailure(
        "delete discussion template",
        sql`DELETE FROM discussion_templates WHERE template_id = ${id}`.pipe(Effect.asVoid),
      ),
    createDiscussion: (discussion) =>
      storageFailure(
        "create discussion",
        Effect.gen(function* () {
          const row = yield* encodeDiscussion(discussion);
          yield* sql`INSERT INTO discussions ${sql.insert(row)}`;
        }),
      ),
    updateDiscussion: (discussion) =>
      storageFailure(
        "update discussion",
        Effect.gen(function* () {
          const { discussion_id, ...row } = yield* encodeDiscussion(discussion);
          const updated =
            yield* sql`UPDATE discussions SET ${sql.update(row)} WHERE discussion_id = ${discussion_id} RETURNING discussion_id`;
          if (updated.length === 0)
            return yield* Effect.fail(
              new DiscussionError({ reason: "not_found", message: "Discussion not found." }),
            );
        }),
      ),
    getDiscussion: (id) =>
      storageFailure(
        "read discussion",
        sql<DiscussionRow>`SELECT * FROM discussions WHERE discussion_id = ${id}`.pipe(
          Effect.flatMap((rows) => (rows[0] ? decodeDiscussion(rows[0]) : Effect.succeed(null))),
        ),
      ),
    listDiscussions: (projectId) =>
      storageFailure(
        "list discussions",
        sql<DiscussionRow>`SELECT * FROM discussions WHERE project_id = ${projectId} ORDER BY created_at, discussion_id`.pipe(
          Effect.flatMap((rows) => Effect.forEach(rows, decodeDiscussion)),
        ),
      ),
    deleteDiscussion: (id) =>
      storageFailure(
        "delete discussion",
        sql.withTransaction(
          Effect.gen(function* () {
            // Explicit deletes also work for callers using a SQL client with foreign_keys disabled.
            yield* sql`DELETE FROM discussion_entries WHERE discussion_id = ${id}`;
            yield* sql`DELETE FROM discussion_seat_delivery WHERE discussion_id = ${id}`;
            yield* sql`DELETE FROM discussions WHERE discussion_id = ${id}`;
          }),
        ),
      ),
    appendEntry: (entry) =>
      storageFailure(
        "append discussion entry",
        Effect.gen(function* () {
          yield* Schema.encodeEffect(DiscussionEntry)({ ...entry, seq: 1 });
          const files =
            entry.files === null ? null : yield* Schema.encodeEffect(filesJson)(entry.files);
          // One statement owns allocation and insertion, so concurrent writers cannot both claim the same seq.
          const rows = yield* sql<EntryRow>`INSERT INTO discussion_entries
        (discussion_id, seq, entry_id, kind, seat_id, thread_id, run_id, text, files_json, status, checkpoint_ref, created_at)
        SELECT ${entry.discussionId}, COALESCE(MAX(seq), 0) + 1, ${entry.id}, ${entry.kind},
          ${entry.seatId ?? null}, ${entry.threadId ?? null}, ${entry.runId ?? null}, ${entry.text},
          ${files}, ${entry.status}, ${entry.checkpointRef}, ${entry.createdAt}
        FROM discussion_entries WHERE discussion_id = ${entry.discussionId} RETURNING *`;
          const row = rows[0];
          if (!row)
            return yield* Effect.fail(
              new DiscussionError({
                reason: "orchestration_error",
                message: "Entry insertion returned no record.",
              }),
            );
          return yield* decodeEntry(row);
        }),
      ),
    listEntries: (id, afterSeq = 0, throughSeq = Number.MAX_SAFE_INTEGER) =>
      storageFailure(
        "read discussion entries",
        sql<EntryRow>`SELECT * FROM discussion_entries WHERE discussion_id = ${id} AND seq > ${afterSeq} AND seq <= ${throughSeq} ORDER BY seq`.pipe(
          Effect.flatMap((rows) => Effect.forEach(rows, decodeEntry)),
        ),
      ),
    getEntryByRunId: (id) =>
      storageFailure(
        "read discussion run entry",
        sql<EntryRow>`SELECT * FROM discussion_entries WHERE run_id = ${id}`.pipe(
          Effect.flatMap((rows) => (rows[0] ? decodeEntry(rows[0]) : Effect.succeed(null))),
        ),
      ),
    getSeatDelivery: (id, seatId) =>
      storageFailure(
        "read discussion seat delivery",
        sql<{
          delivered_through_seq: number;
        }>`SELECT delivered_through_seq FROM discussion_seat_delivery WHERE discussion_id = ${id} AND seat_id = ${seatId}`.pipe(
          Effect.map((rows) => rows[0]?.delivered_through_seq ?? null),
        ),
      ),
    setSeatDelivery: (id, seatId, seq) =>
      storageFailure(
        "save discussion seat delivery",
        Effect.gen(function* () {
          yield* Schema.decodeUnknownEffect(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)))(
            seq,
          );
          yield* sql`INSERT INTO discussion_seat_delivery ${sql.insert({ discussion_id: id, seat_id: seatId, delivered_through_seq: seq })}
        ON CONFLICT(discussion_id, seat_id) DO UPDATE SET delivered_through_seq = excluded.delivered_through_seq`;
        }),
      ),
  });
});

export const layer = Layer.effect(DiscussionStore, make);
