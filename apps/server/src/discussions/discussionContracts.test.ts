/** RPC input validation keeps original text while rejecting blank material and empty seat lists. */
import { expect, it } from "@effect/vitest";
import { DiscussionCreateInput, DiscussionInterjectInput } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

it("preserves topic and interjection whitespace through wire decoding", () => {
  const topic = "\n  第一行标题  \n完整议题原文  \n";
  const create = Schema.decodeSync(DiscussionCreateInput)({
    projectId: "project:t4",
    topic,
    seats: [
      {
        personaPromptId: "builtin:persona:architect",
        modelSelection: { instanceId: "codex", model: "test" },
      },
    ],
  });
  expect(create.topic).toBe(topic);
  const text = "  插话原文\n结尾空白  ";
  expect(
    Schema.decodeSync(DiscussionInterjectInput)({ discussionId: "discussion:t4", text }).text,
  ).toBe(text);
  expect(() =>
    Schema.decodeSync(DiscussionCreateInput)({ projectId: "project:t4", topic: " \n ", seats: [] }),
  ).toThrow();
  expect(() =>
    Schema.decodeSync(DiscussionCreateInput)({
      projectId: "project:t4",
      topic: "正常议题",
      seats: [],
    }),
  ).toThrow();
  expect(() =>
    Schema.decodeSync(DiscussionInterjectInput)({ discussionId: "discussion:t4", text: "  \n" }),
  ).toThrow();
});
