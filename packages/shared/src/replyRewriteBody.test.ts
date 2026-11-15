import { describe, expect, it } from "vite-plus/test";
import { replyRewriteBodyFailure } from "./replyRewriteBody.ts";

describe("reply rewrite protected Markdown", () => {
  it.each([
    { name: "empty output", source: "A reply.", output: " \n", code: "empty_output" },
    {
      name: "code changed",
      source: "Run `vp run check:changed`.",
      output: "Run `vp run check`.",
      code: "protocol",
    },
    {
      name: "code block lost",
      source: "```ts\nconst value = 1;\n```",
      output: "Set value to one.",
      code: "protocol",
    },
    {
      name: "link destination changed",
      source: "[docs](https://example.test/a)",
      output: "[guide](https://example.test/b)",
      code: "protocol",
    },
    {
      name: "duplicate link lost",
      source: "[a](https://example.test/a) [b](https://example.test/a)",
      output: "[a](https://example.test/a)",
      code: "protocol",
    },
    {
      name: "prose and link label rephrased",
      source: "Read [documentation](https://example.test/a), then run `vp run check:changed`.",
      output: "Run `vp run check:changed` after reading the [guide](https://example.test/a).",
      code: null,
    },
  ])("$name", ({ source, output, code }) => {
    expect(replyRewriteBodyFailure(source, output)?.code ?? null).toBe(code);
  });
});
