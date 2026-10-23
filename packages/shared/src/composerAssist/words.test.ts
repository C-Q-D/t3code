/** Protects script weights and rounding used by suggestion limits. */
import { expect, it } from "vite-plus/test";
import { wordCount } from "./words.ts";

it.each([
  ["", 0],
  ["  ", 0],
  ["run tests", 2],
  ["测", 1],
  ["测试", 1],
  ["测试它", 2],
  ["运行测试", 2],
  ["测".repeat(24), 12],
  ["测".repeat(25), 13],
  ["あいうえ", 1],
  ["あいうえお", 2],
  ["한국어", 1],
  ["test测试", 2],
  ["!", 1],
])("counts %j as %i", (text, expected) => {
  expect(wordCount(text)).toBe(expected);
});
