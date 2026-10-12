/** Verifies appearance backfills and preserves user edits on isolated in-memory SQLite. */
import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import { runMigrations } from "../Migrations.ts";
import migrateAppearance from "./062_DiscussionPromptAppearance.ts";

it.effect("migration 62 fills the six builtin avatars and descriptions", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 62 });
    const rows =
      yield* sql`SELECT prompt_id, avatar, description FROM discussion_prompts ORDER BY prompt_id`;
    assert.deepEqual(rows, [
      {
        prompt_id: "builtin:persona:architect",
        avatar: "architect",
        description: "关注整体结构和长期维护成本",
      },
      {
        prompt_id: "builtin:persona:implementer",
        avatar: "implementer",
        description: "关注怎么落地、工作量多大",
      },
      { prompt_id: "builtin:persona:opponent", avatar: "opponent", description: "专门提反对意见" },
      {
        prompt_id: "builtin:persona:product",
        avatar: "product",
        description: "从用户使用的角度看",
      },
      {
        prompt_id: "builtin:persona:reviewer",
        avatar: "reviewer",
        description: "找正确性问题和遗漏",
      },
      { prompt_id: "builtin:summary:default", avatar: null, description: "共识 / 分歧 / 待你决定" },
    ]);
    const columns = yield* sql`PRAGMA table_info(discussion_prompts)`;
    assert.deepInclude(columns, {
      cid: 7,
      name: "avatar",
      type: "TEXT",
      notnull: 0,
      dflt_value: null,
      pk: 0,
    });
    assert.deepInclude(columns, {
      cid: 8,
      name: "description",
      type: "TEXT",
      notnull: 1,
      dflt_value: "''",
      pk: 0,
    });
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("migration 62 retains edited builtin text and backfills only custom personas", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 61 });
    yield* sql`UPDATE discussion_prompts SET name = '我的架构师', prompt = '保留我的正文' WHERE prompt_id = 'builtin:persona:architect'`;
    yield* sql`INSERT INTO discussion_prompts (prompt_id, kind, name, prompt, builtin, created_at, updated_at) VALUES
      ('custom:persona', 'persona', '我的身份', '身份正文', 0, '2026-10-12T01:00:00.000Z', '2026-10-12T01:00:00.000Z'),
      ('custom:summary', 'summary', '我的梳理', '梳理正文', 0, '2026-10-12T01:00:00.000Z', '2026-10-12T01:00:00.000Z')`;
    yield* runMigrations({ toMigrationInclusive: 62 });
    assert.deepEqual(
      yield* sql`SELECT name, prompt FROM discussion_prompts WHERE prompt_id = 'builtin:persona:architect'`,
      [{ name: "我的架构师", prompt: "保留我的正文" }],
    );
    assert.deepEqual(
      yield* sql`SELECT prompt_id, avatar, description FROM discussion_prompts WHERE builtin = 0 ORDER BY prompt_id`,
      [
        { prompt_id: "custom:persona", avatar: "architect", description: "" },
        { prompt_id: "custom:summary", avatar: null, description: "" },
      ],
    );
    assert.deepEqual(
      yield* sql`SELECT created_at, updated_at FROM discussion_prompts WHERE prompt_id = 'custom:persona'`,
      [{ created_at: "2026-10-12T01:00:00.000Z", updated_at: "2026-10-12T01:00:00.000Z" }],
    );
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("direct migration 62 retries preserve later appearance edits", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 62 });
    yield* sql`UPDATE discussion_prompts SET avatar = 'product', description = '我的新简介' WHERE prompt_id = 'builtin:persona:architect'`;
    yield* sql`UPDATE discussion_prompts SET description = '' WHERE prompt_id = 'builtin:summary:default'`;
    yield* sql`INSERT INTO discussion_prompts (prompt_id, kind, name, prompt, builtin, created_at, updated_at, avatar, description) VALUES
      ('custom:persona', 'persona', '我的身份', '身份正文', 0, '2026-10-12T01:00:00.000Z', '2026-10-12T01:00:00.000Z', 'opponent', '定制简介')`;
    // Run the body directly so the migration ledger cannot hide destructive backfills.
    yield* migrateAppearance;
    assert.deepEqual(
      yield* sql`SELECT prompt_id, avatar, description FROM discussion_prompts WHERE prompt_id IN ('builtin:persona:architect', 'builtin:summary:default', 'custom:persona') ORDER BY prompt_id`,
      [
        { prompt_id: "builtin:persona:architect", avatar: "product", description: "我的新简介" },
        { prompt_id: "builtin:summary:default", avatar: null, description: "" },
        { prompt_id: "custom:persona", avatar: "opponent", description: "定制简介" },
      ],
    );
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
