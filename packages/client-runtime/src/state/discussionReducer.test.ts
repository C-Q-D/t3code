/** Verifies transcript projection contracts independently of RPC transport and provider execution. */
import { Discussion, DiscussionEntry } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { applyDiscussionSubscriptionEvent, type DiscussionState } from "./discussionReducer.ts";

const discussion = Schema.decodeSync(Discussion)({
  id: "discussion-1",
  projectId: "project-1",
  title: "Design",
  topic: "Discuss the design",
  seats: [
    {
      id: "seat-1",
      personaName: "Architect",
      personaPrompt: "Review the design",
      avatar: "architect",
      modelSelection: { instanceId: "codex", model: "test-model" },
      threadId: "thread-1",
    },
  ],
  status: "speaking",
  cursor: {
    seatIndex: 0,
    round: 1,
    dispatchNo: 0,
    runId: null,
    dispatchedEntrySeq: 0,
    briefChars: 0,
    briefSentAsFile: false,
  },
  pause: null,
  closing: null,
  createdBy: "user",
  creationSource: "web",
  createdAt: "2026-10-13T00:00:00.000Z",
  updatedAt: "2026-10-13T00:00:00.000Z",
  endedAt: null,
});

const decodeEntry = Schema.decodeSync(DiscussionEntry);

/**
 * Builds contract-valid input without folding or computing the expected transcript.
 * @param id Stable entry identity used to distinguish replacement from insertion.
 * @param seq Transcript position, kept explicit in expected results.
 * @param text Original text used to detect unintended changes to sibling entries.
 * @returns An entry with fixed time and no checkpoint or file delta.
 */
function entry(id: string, seq: number, text: string) {
  return decodeEntry({
    id,
    discussionId: "discussion-1",
    seq,
    text,
    kind: "user",
    files: null,
    status: "completed",
    checkpointRef: null,
    createdAt: "2026-10-13T00:00:00.000Z",
  });
}

describe("applyDiscussionSubscriptionEvent", () => {
  it("establishes a snapshot and sorts entries without mutating the payload", () => {
    const entries = [entry("third", 3, "Third"), entry("first", 1, "First")];
    const next = applyDiscussionSubscriptionEvent(null, { type: "snapshot", discussion, entries });
    expect(next).toEqual({ discussion, entries: [entries[1], entries[0]], deleted: false });
    expect(entries.map((value) => value.id)).toEqual(["third", "first"]);
  });

  it("appends an entry in seq order and preserves earlier entries", () => {
    const first = entry("first", 1, "First");
    const third = entry("third", 3, "Third");
    const state: DiscussionState = { discussion, entries: [first, third], deleted: false };
    const next = applyDiscussionSubscriptionEvent(state, {
      type: "entry.appended",
      entry: entry("second", 2, "Second"),
    });
    expect(next?.entries.map((value) => [value.id, value.seq, value.text])).toEqual([
      ["first", 1, "First"],
      ["second", 2, "Second"],
      ["third", 3, "Third"],
    ]);
    expect(next?.discussion).toBe(discussion);
    expect(state.entries).toEqual([first, third]);
  });

  it("replaces only the entry with the matching id", () => {
    const first = entry("first", 1, "First");
    const second = entry("second", 2, "Original");
    const third = entry("third", 3, "Third");
    const state: DiscussionState = { discussion, entries: [first, second, third], deleted: false };
    const next = applyDiscussionSubscriptionEvent(state, {
      type: "entry.updated",
      entry: { ...second, text: "Corrected", status: "interrupted" },
    });
    expect(next?.entries).toEqual([
      first,
      { ...second, text: "Corrected", status: "interrupted" },
      third,
    ]);
    expect(next?.discussion).toBe(discussion);
    expect(state.entries).toEqual([first, second, third]);
  });

  it("updates the discussion without changing its transcript", () => {
    const entries = [entry("first", 1, "First")];
    const state: DiscussionState = { discussion, entries, deleted: false };
    const paused: Discussion = { ...discussion, status: "paused", pause: { reason: "stopped" } };
    const next = applyDiscussionSubscriptionEvent(state, {
      type: "discussion.updated",
      discussion: paused,
    });
    expect(next).toEqual({ discussion: paused, entries, deleted: false });
    expect(next?.entries).toBe(entries);
    expect(state.discussion.status).toBe("speaking");
  });

  it("marks deletion while retaining the last discussion and transcript", () => {
    const entries = [entry("first", 1, "First")];
    const state: DiscussionState = { discussion, entries, deleted: false };
    const next = applyDiscussionSubscriptionEvent(state, {
      type: "discussion.deleted",
      discussionId: discussion.id,
    });
    expect(next).toEqual({ discussion, entries, deleted: true });
    expect(state.deleted).toBe(false);
  });
});
