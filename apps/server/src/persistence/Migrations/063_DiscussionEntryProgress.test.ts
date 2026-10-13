/** Guards nullable transcript progress and repeatable upgrades on isolated SQLite. */
import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import { runMigrations } from "../Migrations.ts";
import migration63 from "./063_DiscussionEntryProgress.ts";

it.effect("migration 63 adds nullable round and reader columns without changing old entries", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 62 });
    yield* sql`INSERT INTO discussions
      (discussion_id, project_id, title, topic, status, seats_json, cursor_json, created_by, creation_source, created_at, updated_at)
      VALUES ('discussion:t4-old', 'project:t4', '旧讨论', '旧议题', 'paused', '[]', '{}', 'user', 'web', '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z')`;
    yield* sql`INSERT INTO discussion_entries
      (discussion_id, seq, entry_id, kind, run_id, text, files_json, status, checkpoint_ref, created_at)
      VALUES ('discussion:t4-old', 1, 'entry:t4-old', 'statement', 'run:t4-old', '旧正文完整保留', '[{"path":"a.ts","additions":2,"deletions":1}]', 'completed', 'refs/t4/old', '2026-10-12T00:00:00.000Z')`;
    yield* runMigrations();
    const columns = yield* sql<{
      name: string;
      type: string;
      notnull: number;
    }>`PRAGMA table_info(discussion_entries)`;
    assert.deepEqual(
      columns
        .filter((column) => column.name === "round" || column.name === "read_by_seat_id")
        .map(({ name, type, notnull }) => ({ name, type, notnull })),
      [
        { name: "round", type: "INTEGER", notnull: 0 },
        { name: "read_by_seat_id", type: "TEXT", notnull: 0 },
      ],
    );
    assert.deepEqual(yield* runMigrations(), []);
    yield* migration63;
    yield* migration63;
    const entries =
      yield* sql`SELECT entry_id, seq, text, files_json, checkpoint_ref, round, read_by_seat_id FROM discussion_entries`;
    assert.deepEqual(entries, [
      {
        entry_id: "entry:t4-old",
        seq: 1,
        text: "旧正文完整保留",
        files_json: '[{"path":"a.ts","additions":2,"deletions":1}]',
        checkpoint_ref: "refs/t4/old",
        round: null,
        read_by_seat_id: null,
      },
    ]);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
