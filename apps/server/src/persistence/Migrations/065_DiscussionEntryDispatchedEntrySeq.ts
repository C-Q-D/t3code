/** Adds immutable dispatch positions while leaving legacy transcript entries unpositioned. */
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql.withTransaction(
    Effect.gen(function* () {
      const columns = yield* sql<{ name: string }>`PRAGMA table_info(discussion_entries)`;
      if (!columns.some((column) => column.name === "dispatched_entry_seq")) {
        yield* sql`ALTER TABLE discussion_entries ADD COLUMN dispatched_entry_seq INTEGER`;
      }
    }),
  );
});
