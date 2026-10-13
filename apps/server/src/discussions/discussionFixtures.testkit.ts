/** Independent fixed snapshots for pure material and identity tests; no expected text comes from the implementation. */
import { Discussion, DiscussionEntry } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

/** Two immutable personas let tests distinguish target identity, transcript ownership and seat order. */
export const discussionFixture = Schema.decodeSync(Discussion)({
  id: "discussion:t4-fixture",
  projectId: "project:t4-fixture",
  title: "边界讨论",
  topic: "议题第一行\n议题完整原文🌿",
  seats: [
    {
      id: "seat:t4-a",
      personaName: "架构师",
      avatar: "architect",
      personaPrompt: "身份A秘密提示词",
      threadId: "thread:t4-a",
      modelSelection: { instanceId: "codex", model: "test" },
    },
    {
      id: "seat:t4-b",
      personaName: "实现者",
      avatar: "implementer",
      personaPrompt: "身份B秘密提示词",
      threadId: "thread:t4-b",
      modelSelection: { instanceId: "codex", model: "test" },
    },
  ],
  status: "speaking",
  cursor: {
    seatIndex: 1,
    round: 3,
    dispatchNo: 7,
    runId: null,
    dispatchedEntrySeq: 2,
    briefChars: 0,
    briefSentAsFile: false,
  },
  pause: null,
  closing: null,
  createdBy: "user",
  creationSource: "web",
  createdAt: "2026-10-12T00:00:00.000Z",
  updatedAt: "2026-10-12T00:00:00.000Z",
  endedAt: null,
});

/** Full transcript originals and known file statistics are inputs, not mock results of a formatting function. */
export const entryFixtures = [
  Schema.decodeSync(DiscussionEntry)({
    id: "entry:t4-user",
    discussionId: discussionFixture.id,
    seq: 1,
    kind: "user",
    text: "插话完整原文\n第二行",
    files: null,
    status: "completed",
    checkpointRef: null,
    createdAt: "2026-10-12T00:00:00.000Z",
  }),
  Schema.decodeSync(DiscussionEntry)({
    id: "entry:t4-statement",
    discussionId: discussionFixture.id,
    seq: 2,
    kind: "statement",
    seatId: discussionFixture.seats[0]!.id,
    round: 3,
    text: "上一位全部原文\n不准裁剪🌿",
    files: [{ path: "new/a.ts", additions: 8, deletions: 2 }],
    status: "completed",
    checkpointRef: "refs/t4/a",
    createdAt: "2026-10-12T00:01:00.000Z",
  }),
  Schema.decodeSync(DiscussionEntry)({
    id: "entry:t4-end",
    discussionId: discussionFixture.id,
    seq: 3,
    kind: "system",
    text: "讨论到此",
    files: null,
    status: "completed",
    checkpointRef: null,
    createdAt: "2026-10-12T00:02:00.000Z",
  }),
];
