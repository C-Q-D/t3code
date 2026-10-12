/** Verifies the discussion schema and repeatable first-start defaults on isolated SQLite. */
import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import { runMigrations } from "../Migrations.ts";
import migrateDiscussions from "./061_Discussions.ts";

it.effect("migration 61 creates all five discussion tables", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 61 });
    const rows = yield* sql<{ name: string }>`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'discussion%'
      ORDER BY name`;
    assert.deepEqual(
      rows.map((row) => row.name),
      [
        "discussion_entries",
        "discussion_prompts",
        "discussion_seat_delivery",
        "discussion_templates",
        "discussions",
      ],
    );
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("repeated migrations keep six builtin prompts and preserve user edits", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 61 });
    yield* sql`UPDATE discussion_prompts SET name = '自定义架构师' WHERE prompt_id = 'builtin:persona:architect'`;
    yield* runMigrations({ toMigrationInclusive: 61 });
    // Execute the idempotent seed too: the migrator's ledger alone would hide duplicate insert bugs.
    yield* migrateDiscussions;
    const rows = yield* sql<{ kind: string; count: number }>`
      SELECT kind, COUNT(*) AS count FROM discussion_prompts GROUP BY kind ORDER BY kind`;
    assert.deepEqual(rows, [
      { kind: "persona", count: 5 },
      { kind: "summary", count: 1 },
    ]);
    const edited = yield* sql<{
      name: string;
    }>`SELECT name FROM discussion_prompts WHERE prompt_id = 'builtin:persona:architect'`;
    assert.deepEqual(edited, [{ name: "自定义架构师" }]);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
