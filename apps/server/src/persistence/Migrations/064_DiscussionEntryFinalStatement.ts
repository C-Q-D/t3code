/** Adds immutable final-statement attribution while keeping existing entries ordinary. */
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql.withTransaction(
    Effect.gen(function* () {
      const columns = yield* sql<{ name: string }>`PRAGMA table_info(discussion_entries)`;
      if (!columns.some((column) => column.name === "final_statement")) {
        yield* sql`ALTER TABLE discussion_entries ADD COLUMN final_statement INTEGER NOT NULL DEFAULT 0`;
      }
    }),
  );
});
