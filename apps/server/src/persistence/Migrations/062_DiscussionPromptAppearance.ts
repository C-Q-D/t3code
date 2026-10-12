/** Adds and backfills prompt appearance once; leaves user names, text and later appearance edits intact. */
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import { builtinPrompts } from "../../discussions/builtinPrompts.ts";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // Column creation and its backfill are atomic even when the effect is called without the migrator.
  yield* sql.withTransaction(
    Effect.gen(function* () {
      const columns = yield* sql<{ name: string }>`PRAGMA table_info(discussion_prompts)`;
      // Only a newly added column is initialized: retrying must preserve even empty user descriptions.
      if (!columns.some((column) => column.name === "avatar")) {
        yield* sql`ALTER TABLE discussion_prompts ADD COLUMN avatar TEXT`;
        for (const prompt of builtinPrompts) {
          yield* sql`UPDATE discussion_prompts SET avatar = ${prompt.avatar}
          WHERE prompt_id = ${prompt.id} AND builtin = 1`;
        }
        yield* sql`UPDATE discussion_prompts SET avatar = 'architect'
        WHERE builtin = 0 AND kind = 'persona' AND avatar IS NULL`;
      }
      if (!columns.some((column) => column.name === "description")) {
        yield* sql`ALTER TABLE discussion_prompts ADD COLUMN description TEXT NOT NULL DEFAULT ''`;
        for (const prompt of builtinPrompts) {
          yield* sql`UPDATE discussion_prompts SET description = ${prompt.description}
          WHERE prompt_id = ${prompt.id} AND builtin = 1`;
        }
      }
    }),
  );
});
