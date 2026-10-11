import { englishWorkLogMessages } from "@t3tools/client-runtime/work-log/messages";
/** Checks dictionary key trees and fixes TypeScript counterexamples for translation drift. */
import { expect, it } from "vite-plus/test";
import { en, type Messages } from "./en";
import { messages } from "./zh-CN";

/**
 * Compares the key tree and runtime leaf types (typeof) recursively.
 * TypeScript checks function signatures; this comparison does not check their parameters.
 * @param english English tree that defines the translation contract.
 * @param translated Translation tree to check against that contract.
 */
function expectMatchingTree(english: unknown, translated: unknown): void {
  expect(typeof translated).toBe(typeof english);
  if (typeof english !== "object" || english === null) return;
  if (typeof translated !== "object" || translated === null) {
    throw new Error("Translation must have the same dictionary branches");
  }
  expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());
  for (const [key, value] of Object.entries(english)) {
    expectMatchingTree(value, Object.getOwnPropertyDescriptor(translated, key)?.value);
  }
}

it("matches every namespace, nested key, and leaf type", () => {
  expectMatchingTree(en, messages);
  expect(en.chat.threadCount(1)).toBe("1 thread");
  expect(en.chat.threadCount(2)).toBe("2 threads");
  expect(messages.chat.threadCount(2)).toBe("2 个对话");
});

it("formats complete reset action names with translated setting labels", () => {
  expect(en.common.resetLabelToDefault("time format")).toBe("Reset time format to default");
  expect(messages.common.resetLabelToDefault(messages.settings.rows.language.title)).toBe(
    "将语言恢复为默认值",
  );
  expect(messages.common.resetLabelToDefault(messages.settings.rows.timeFormat.title)).toBe(
    "将时间格式恢复为默认值",
  );
});

// These declarations run through the web typecheck; unused directives fail that check.
// @ts-expect-error A translation cannot omit a required key.
const missingKey: Messages["common"] = {};
const extraKey: Messages["common"] = {
  ...en.common,
  // @ts-expect-error Extra keys must fail at the literal declaration.
  extra: "多余",
};
const stringForFunction: Messages["chat"] = {
  // @ts-expect-error Interpolation functions cannot be replaced by strings.
  threadCount: "对话",
};
const functionForString: Messages["common"] = {
  ...en.common,
  // @ts-expect-error String labels cannot be replaced by functions.
  system: () => "系统默认",
};
const wrongFunctionParameter: Messages["chat"] = {
  // @ts-expect-error Translation functions must preserve argument types.
  threadCount: (count: string) => count,
};
const extraNestedKey: Messages["settings"]["rows"]["timeFormat"]["options"] = {
  ...en.settings.rows.timeFormat.options,
  // @ts-expect-error Nested option literals cannot add keys either.
  extra: "多余",
};
// @ts-expect-error Nested option literals must include every required key.
const missingNestedKey: Messages["settings"]["rows"]["timeFormat"]["options"] = {
  twelveHour: "12 小时制",
};
void [
  missingKey,
  extraKey,
  stringForFunction,
  functionForString,
  wrongFunctionParameter,
  extraNestedKey,
  missingNestedKey,
];

it("shares the package English defaults for generated work-log text", () => {
  expect(en.chat.workLog.shared).toBe(englishWorkLogMessages);
});
