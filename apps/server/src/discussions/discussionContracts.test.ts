/** RPC input validation keeps original text while rejecting blank material and empty seat lists. */
import { expect, it } from "@effect/vitest";
import {
  DiscussionCreateInput,
  DiscussionInterjectInput,
  DiscussionEntry,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const decodeCreate = Schema.decodeSync(DiscussionCreateInput);
const decodeInterject = Schema.decodeSync(DiscussionInterjectInput);
const decodeEntry = Schema.decodeUnknownSync(DiscussionEntry);

it("preserves topic and interjection whitespace through wire decoding", () => {
  const topic = "\n  第一行标题  \n完整议题原文  \n";
  const create = decodeCreate({
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
  expect(decodeInterject({ discussionId: "discussion:t4", text }).text).toBe(text);
  expect(() => decodeCreate({ projectId: "project:t4", topic: " \n ", seats: [] })).toThrow();
  expect(() =>
    decodeCreate({
      projectId: "project:t4",
      topic: "正常议题",
      seats: [],
    }),
  ).toThrow();
  expect(() => decodeInterject({ discussionId: "discussion:t4", text: "  \n" })).toThrow();
});

it("wire entries accept true or absent final attribution and reject false", () => {
  const entry = {
    id: "entry:c3",
    discussionId: "discussion:c3",
    seq: 1,
    kind: "statement",
    text: "最后陈述",
    files: null,
    status: "completed",
    checkpointRef: null,
    createdAt: "2026-10-13T00:00:00.000Z",
  };
  expect(decodeEntry({ ...entry, finalStatement: true })).toEqual({
    ...entry,
    finalStatement: true,
  });
  expect(decodeEntry(entry)).toEqual(entry);
  expect(() => decodeEntry({ ...entry, finalStatement: false })).toThrow();
});
