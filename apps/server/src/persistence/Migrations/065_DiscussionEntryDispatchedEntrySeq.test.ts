/** Guards legacy rows, nullable dispatch positions and repeatable upgrades on isolated SQLite. */
import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import { runMigrations } from "../Migrations.ts";
import migration65 from "./065_DiscussionEntryDispatchedEntrySeq.ts";

it.effect(
  "migration 65 preserves legacy rows and adds a repeatable nullable dispatch position",
  () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 64 });
      yield* sql`INSERT INTO discussions
      (discussion_id, project_id, title, topic, status, seats_json, cursor_json, created_by, creation_source, created_at, updated_at)
      VALUES ('discussion:c3-old', 'project:c3', '旧讨论', '议题', 'paused', '[]', '{}', 'user', 'web', '2026-10-13T00:00:00.000Z', '2026-10-13T00:00:00.000Z')`;
      yield* sql`INSERT INTO discussion_entries
      (discussion_id, seq, entry_id, kind, run_id, text, files_json, status, checkpoint_ref, created_at, round, read_by_seat_id)
      VALUES ('discussion:c3-old', 1, 'entry:c3-old', 'statement', 'run:c3-old', '完整保留', '[{"path":"a.ts","additions":2,"deletions":1}]', 'interrupted', 'refs/c3/old', '2026-10-13T00:00:00.000Z', 3, 'seat:c3-reader')`;
      const before = yield* sql`SELECT * FROM discussion_entries`;
      // Keep later schema additions out of this migration's full-row assertions.
      yield* runMigrations({ toMigrationInclusive: 65 });
      const columns = yield* sql<{
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
      }>`PRAGMA table_info(discussion_entries)`;
      assert.deepEqual(
        columns
          .filter((column) => column.name === "dispatched_entry_seq")
          .map(({ name, type, notnull, dflt_value }) => ({ name, type, notnull, dflt_value })),
        [{ name: "dispatched_entry_seq", type: "INTEGER", notnull: 0, dflt_value: null }],
      );
      assert.deepEqual(yield* sql`SELECT * FROM discussion_entries`, [
        { ...before[0], dispatched_entry_seq: null },
      ]);
      assert.deepEqual(yield* runMigrations({ toMigrationInclusive: 65 }), []);
      yield* migration65;
      yield* migration65;
      assert.deepEqual(yield* sql`SELECT * FROM discussion_entries`, [
        { ...before[0], dispatched_entry_seq: null },
      ]);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
