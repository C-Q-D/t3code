/** Adds optional transcript round and first-reader progress; preserves every existing entry. */
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql.withTransaction(
    Effect.gen(function* () {
      const columns = yield* sql<{ name: string }>`PRAGMA table_info(discussion_entries)`;
      if (!columns.some((column) => column.name === "round")) {
        yield* sql`ALTER TABLE discussion_entries ADD COLUMN round INTEGER`;
      }
      if (!columns.some((column) => column.name === "read_by_seat_id")) {
        yield* sql`ALTER TABLE discussion_entries ADD COLUMN read_by_seat_id TEXT`;
      }
    }),
  );
});
