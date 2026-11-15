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
    {
      name: "repeated link reference lost",
      source: "[one][r] [two][r]\n\n[r]: https://example.test/a",
      output: "[one][r]\n\n[r]: https://example.test/a",
      code: "protocol",
    },
    {
      name: "repeated image reference lost",
      source: "![one][r] ![two][r]\n\n[r]: https://example.test/a",
      output: "![one][r]\n\n[r]: https://example.test/a",
      code: "protocol",
    },
    {
      name: "unused definition is not a visible link",
      source: "A reply.\n\n[r]: https://example.test/a",
      output: "A reply.",
      code: null,
    },
    {
      name: "unused definition cannot replace a reference",
      source: "[one][r]\n\n[r]: https://example.test/a",
      output: "A reply.\n\n[r]: https://example.test/a",
      code: "protocol",
    },
    {
      name: "reference link becomes inline",
      source: "[one][r] [r][] [r]\n\n[r]: https://example.test/a",
      output: "[a](https://example.test/a) [b](https://example.test/a) [c](https://example.test/a)",
      code: null,
    },
    {
      name: "reference image becomes inline",
      source: "![one][r]\n\n[r]: https://example.test/a",
      output: "![picture](https://example.test/a)",
      code: null,
    },
    {
      name: "reference identifiers normalize case and whitespace",
      source: "[one][R  key] ![two][r key]\n\n[r key]: https://example.test/a",
      output: "[a](https://example.test/a) ![b](https://example.test/a)",
      code: null,
    },
    {
      name: "first duplicate definition resolves every visible use",
      source: "[one][r] [r]\n\n[r]: https://example.test/a\n[r]: https://example.test/b",
      output: "[a](https://example.test/a) [b](https://example.test/a)",
      code: null,
    },
    {
      name: "inline image destination changed",
      source: "![a](https://example.test/a)",
      output: "![b](https://example.test/b)",
      code: "protocol",
    },
  ])("$name", ({ source, output, code }) => {
    expect(replyRewriteBodyFailure(source, output)?.code ?? null).toBe(code);
  });
});
