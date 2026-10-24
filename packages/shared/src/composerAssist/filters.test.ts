/** Locks the reference rejection precedence and accepted boundary inputs. */
import { expect, it } from "vite-plus/test";
import { checkCandidate, stripWrapping } from "./filters.ts";

it("accepts the real Chinese narrowing suggestion", () => {
  expect(checkCandidate("再给一个用 in 收窄的例子，代码不超过 5 行，不要调用任何工具")).toBeNull();
});

it.each([
  ["English", "word ".repeat(12).trim(), "word ".repeat(13).trim()],
  ["kana", "あ".repeat(40), "あ".repeat(41)],
  ["non-whitespace characters", "测 ".repeat(40).trim(), "测 ".repeat(41).trim()],
])("enforces the %s upper boundary", (_label, accepted, rejected) => {
  expect(checkCandidate(accepted)).toBeNull();
  expect(checkCandidate(rejected)).toBe("too_many_words");
});

it.each([
  ["empty", "  ", "run tests"],
  ["done", "完成了", "完成测试"],
  ["meta_text", "nothing to suggest", "suggest a name"],
  ["meta_wrapped", "(run tests)", "run tests"],
  ["error_message", "API error: unavailable", "check API errors"],
  ["prefixed_label", "Action: run tests", "run tests"],
  ["evaluative", "thanks", "run tests"],
  ["assistant_voice", "I'll run tests", "run tests"],
  ["too_few_words", "测试", "测试它"],
  ["too_many_words", "测".repeat(41), "测".repeat(40)],
  ["too_long", "run " + "x".repeat(96), "run " + "x".repeat(95)],
  ["multiple_sentences", "Run tests. Commit changes", "run tests then commit"],
  ["has_formatting", "run *tests*", "run tests"],
])("rejects %s and accepts its nearby valid input", (reason, rejected, accepted) => {
  expect(checkCandidate(rejected)).toBe(reason);
  expect(checkCandidate(accepted)).toBeNull();
});

it.each(["yes", "commit", "continue", "/test", "run tests", "运行测试"])(
  "accepts the reference command %s",
  (text) => expect(checkCandidate(text)).toBeNull(),
);

it.each([
  [" <suggestion>run tests</suggestion> ", "run tests"],
  ["Suggested reply: run tests", "run tests"],
  ["<output><answer>run tests</answer></output>", "<output><answer>run tests</answer></output>"],
])("unwraps only recognized outer wrappers: %s", (raw, expected) => {
  expect(stripWrapping(raw)).toBe(expected);
});
