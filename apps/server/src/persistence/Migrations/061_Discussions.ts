/** Creates discussion storage and seeds only missing builtin ids in the migration transaction. */
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import { builtinPrompts } from "../../discussions/builtinPrompts.ts";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE IF NOT EXISTS discussion_prompts (
    prompt_id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL,
    prompt TEXT NOT NULL, builtin INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`;
  yield* sql`CREATE TABLE IF NOT EXISTS discussion_templates (
    template_id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, seats_json TEXT NOT NULL,
    summary_prompt_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`;
  yield* sql`CREATE TABLE IF NOT EXISTS discussions (
    discussion_id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, title TEXT NOT NULL,
    topic TEXT NOT NULL, status TEXT NOT NULL, seats_json TEXT NOT NULL, cursor_json TEXT NOT NULL,
    pause_json TEXT, closing_json TEXT, created_by TEXT NOT NULL, creation_source TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, ended_at TEXT
  )`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_discussions_project ON discussions(project_id, created_at)`;
  yield* sql`CREATE TABLE IF NOT EXISTS discussion_entries (
    discussion_id TEXT NOT NULL REFERENCES discussions(discussion_id) ON DELETE CASCADE,
    seq INTEGER NOT NULL, entry_id TEXT NOT NULL, kind TEXT NOT NULL, seat_id TEXT, thread_id TEXT,
    run_id TEXT, text TEXT NOT NULL, files_json TEXT, status TEXT NOT NULL, checkpoint_ref TEXT,
    created_at TEXT NOT NULL, PRIMARY KEY(discussion_id, seq)
  )`;
  yield* sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_discussion_entries_run ON discussion_entries(run_id)`;
  yield* sql`CREATE TABLE IF NOT EXISTS discussion_seat_delivery (
    discussion_id TEXT NOT NULL REFERENCES discussions(discussion_id) ON DELETE CASCADE,
    seat_id TEXT NOT NULL, delivered_through_seq INTEGER NOT NULL, PRIMARY KEY(discussion_id, seat_id)
  )`;
  // Fixed timestamps make defaults reproducible. User edits survive both seed retries and layer rebuilds.
  for (const prompt of builtinPrompts) {
    yield* sql`INSERT INTO discussion_prompts ${sql.insert({
      prompt_id: prompt.id,
      kind: prompt.kind,
      name: prompt.name,
      prompt: prompt.prompt,
      builtin: 1,
      created_at: "2026-10-12T00:00:00.000Z",
      updated_at: "2026-10-12T00:00:00.000Z",
    })} ON CONFLICT(prompt_id) DO NOTHING`;
  }
});
