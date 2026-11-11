import { expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { Tool } from "effect/ai";

import { advertisedJsonSchema } from "./advertisedJsonSchema.ts";

it.each([
  { allowed: ["name"], closed: true },
  { allowed: ["name", "extension"], closed: false },
])(
  "only closes propertyNames when every permitted name is declared: $closed",
  ({ allowed, closed }) => {
    const schema = advertisedJsonSchema(
      Tool.dynamic("names", {
        parameters: {
          type: "object",
          properties: { name: { type: "string" } },
          propertyNames: { enum: allowed },
          additionalProperties: true,
        },
      }),
    );
    if (closed) {
      expect(schema.additionalProperties).toBe(false);
      expect(schema.propertyNames).toBeUndefined();
    } else {
      expect(schema.additionalProperties).toBeUndefined();
      expect(schema.propertyNames).toEqual({ enum: allowed });
    }
  },
);

it("drops JSON noise, merges tagged unions, and keeps null where it is required", () => {
  const Every = Schema.Struct({ ms: Schema.Int });
  const tool = Tool.make("example", {
    parameters: Schema.Struct({
      threadId: Schema.optional(Schema.NullOr(Schema.String)),
      beforeRunId: Schema.NullOr(Schema.String),
      limit: Schema.optional(Schema.Int),
      every: Schema.Union([Every, Schema.fromJsonString(Every)]),
      target: Schema.optional(
        Schema.NullOr(
          Schema.Union([
            Schema.Struct({ kind: Schema.Literal("url"), url: Schema.String }),
            Schema.Struct({ kind: Schema.Literal("number"), number: Schema.Int }),
          ]),
        ),
      ),
    }),
  });

  expect(advertisedJsonSchema(tool)).toEqual({
    type: "object",
    properties: {
      threadId: { type: "string" },
      beforeRunId: { anyOf: [{ type: "string" }, { type: "null" }] },
      limit: { type: "integer" },
      every: { type: "object", properties: { ms: { type: "integer" } }, required: ["ms"] },
      target: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["url", "number"] },
          url: { type: "string" },
          number: { type: "integer" },
        },
        required: ["kind"],
      },
    },
    required: ["beforeRunId", "every"],
  });
});
