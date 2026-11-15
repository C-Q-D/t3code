import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE reply_rewrites ADD COLUMN source_version INTEGER NOT NULL DEFAULT 1`;
  yield* sql`ALTER TABLE reply_rewrite_requests ADD COLUMN source_version INTEGER NOT NULL DEFAULT 1`;
  // Older receipts lack source versions; distinct generations must not regain validity after restoration.
  yield* sql`UPDATE reply_rewrites SET source_version = generation`;
  yield* sql`UPDATE reply_rewrite_requests SET source_version = generation`;
});
