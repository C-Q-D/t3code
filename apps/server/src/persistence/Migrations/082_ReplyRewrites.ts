import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE reply_rewrites (
    message_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    generation INTEGER NOT NULL,
    attempt_json TEXT NOT NULL,
    success_json TEXT,
    updated_at TEXT NOT NULL
  )`;
  yield* sql`CREATE INDEX reply_rewrites_thread ON reply_rewrites(thread_id, message_id)`;
  yield* sql`CREATE TABLE reply_rewrite_requests (
    request_id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    generation INTEGER NOT NULL
  )`;
  yield* sql`CREATE INDEX reply_rewrite_requests_thread ON reply_rewrite_requests(thread_id)`;
  yield* sql`CREATE TABLE reply_rewrite_changes (
    revision INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    message_id TEXT NOT NULL
  )`;
  yield* sql`CREATE INDEX reply_rewrite_changes_thread ON reply_rewrite_changes(thread_id, revision)`;
});
