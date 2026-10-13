/** Real in-memory SQLite round trips guard storage, sequence allocation and deletion boundaries. */
import { assert, it } from "@effect/vitest";
import {
  Discussion,
  DiscussionEntryId,
  DiscussionPrompt,
  DiscussionTemplate,
  DiscussionError,
  DiscussionId,
  DiscussionSeatId,
  RunId,
  CheckpointRef,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as DiscussionStore from "./DiscussionStore.ts";

const timestamp = "2026-10-12T01:00:00.000Z";
const discussion = Schema.decodeUnknownSync(Discussion)({
  id: "discussion:test",
  projectId: "project:test",
  title: "实现边界",
  topic: "后端方案",
  seats: [
    {
      id: "seat:test",
      personaName: "审查者快照",
      avatar: "reviewer",
      personaPrompt: "检查边界",
      modelSelection: { instanceId: "codex", model: "gpt-5" },
      threadId: "thread:test",
    },
  ],
  status: "speaking",
  cursor: {
    seatIndex: 0,
    round: 1,
    dispatchNo: 1,
    runId: "run:first",
    dispatchedEntrySeq: 0,
    briefChars: 100,
    briefSentAsFile: false,
  },
  pause: null,
  closing: null,
  createdBy: "user",
  creationSource: "web",
  createdAt: timestamp,
  updatedAt: timestamp,
  endedAt: null,
});
const entry: DiscussionStore.DiscussionEntryAppend = {
  id: DiscussionEntryId.make("entry:first"),
  discussionId: discussion.id,
  kind: "statement",
  seatId: discussion.seats[0]!.id,
  threadId: discussion.seats[0]!.threadId,
  runId: RunId.make("run:first"),
  text: "第一条发言",
  files: [{ path: "src/example.ts", additions: 3, deletions: 2 }],
  status: "completed",
  checkpointRef: null,
  createdAt: timestamp,
};

it.effect("final attribution survives entry enrichment and old cursor JSON remains readable", () =>
  Effect.gen(function* () {
    const store = yield* DiscussionStore.DiscussionStore;
    const sql = yield* SqlClient.SqlClient;
    yield* store.createDiscussion(discussion);
    const rows = yield* sql<{ cursor_json: string }>`SELECT cursor_json FROM discussions`;
    assert.notProperty(JSON.parse(rows[0]!.cursor_json), "phase");
    assert.deepEqual((yield* store.getDiscussion(discussion.id))?.cursor, discussion.cursor);
    const first = yield* store.appendEntry({ ...entry, finalStatement: true });
    const ordinary = yield* store.appendEntry({
      ...entry,
      id: DiscussionEntryId.make("entry:ordinary"),
      runId: RunId.make("run:ordinary"),
    });
    assert.deepEqual(
      (yield* store.listEntries(discussion.id)).map((e) => [
        e.seq,
        e.finalStatement,
        Object.hasOwn(e, "finalStatement"),
      ]),
      [
        [1, true, true],
        [2, undefined, false],
      ],
    );
    yield* store.updateEntry(first.id, {
      files: [{ path: "later.ts", additions: 7, deletions: 4 }],
      checkpointRef: CheckpointRef.make("refs/c3/final"),
      readBySeatId: discussion.seats[0]!.id,
    });
    yield* store.updateEntry(ordinary.id, { files: [] });
    assert.deepEqual(
      (yield* store.listEntries(discussion.id)).map((e) => [e.seq, e.finalStatement, e.files]),
      [
        [1, true, [{ path: "later.ts", additions: 7, deletions: 4 }]],
        [2, undefined, []],
      ],
    );
    assert.equal((yield* store.getEntryByRunId(entry.runId!))?.finalStatement, true);
  }).pipe(
    Effect.provide(DiscussionStore.layer.pipe(Layer.provideMerge(SqlitePersistence.layerMemory))),
  ),
);

it.effect("prompt and ordered template records persist edits and deletion", () =>
  Effect.gen(function* () {
    const store = yield* DiscussionStore.DiscussionStore;
    const prompt = yield* Schema.decodeUnknownEffect(DiscussionPrompt)({
      id: "prompt:custom",
      kind: "persona",
      name: "定制审查",
      prompt: "检查错误",
      avatar: "opponent",
      description: "  自定义简介\n",
      builtin: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const template = yield* Schema.decodeUnknownEffect(DiscussionTemplate)({
      id: "template:custom",
      name: "双席",
      seats: [
        { personaPromptId: prompt.id, modelSelection: { instanceId: "codex", model: "gpt-5" } },
        {
          personaPromptId: "builtin:persona:architect",
          modelSelection: { instanceId: "claude-code", model: "sonnet" },
        },
      ],
      summaryPromptId: "builtin:summary:default",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    yield* store.upsertPrompt(prompt);
    yield* store.upsertTemplate(template);
    assert.deepEqual(yield* store.getPrompt(prompt.id), prompt);
    assert.equal((yield* store.getPrompt(prompt.id))?.avatar, "opponent");
    assert.equal((yield* store.getPrompt(prompt.id))?.description, "  自定义简介\n");
    assert.deepEqual(yield* store.getTemplate(template.id), template);
    yield* store.upsertPrompt({
      ...prompt,
      name: "改名",
      prompt: "改后的正文",
      avatar: "product",
      description: "",
    });
    yield* store.upsertTemplate({ ...template, name: "改后的讨论", summaryPromptId: null });
    assert.equal((yield* store.getPrompt(prompt.id))?.prompt, "改后的正文");
    assert.equal((yield* store.getPrompt(prompt.id))?.avatar, "product");
    assert.equal((yield* store.getPrompt(prompt.id))?.description, "");
    assert.deepEqual(
      (yield* store.listPrompts())
        .filter((value) => value.id === prompt.id)
        .map((value) => [value.avatar, value.description]),
      [["product", ""]],
    );
    const summary = {
      ...prompt,
      id: yield* Schema.decodeUnknownEffect(DiscussionPrompt.fields.id)("prompt:summary"),
      kind: "summary" as const,
      avatar: null,
      description: "梳理简介",
    };
    yield* store.upsertPrompt(summary);
    assert.deepEqual(yield* store.getPrompt(summary.id), summary);
    assert.deepEqual(
      (yield* store.listTemplates()).map((value) => [value.name, value.summaryPromptId]),
      [["改后的讨论", null]],
    );
    assert.equal((yield* store.listPrompts()).filter((value) => value.id === prompt.id).length, 1);
    yield* store.deleteTemplate(template.id);
    yield* store.deletePrompt(prompt.id);
    assert.isNull(yield* store.getTemplate(template.id));
    assert.isNull(yield* store.getPrompt(prompt.id));
  }).pipe(
    Effect.provide(DiscussionStore.layer.pipe(Layer.provideMerge(SqlitePersistence.layerMemory))),
  ),
);

it.effect(
  "discussion snapshots round trip nullable and nested state and remain project scoped",
  () =>
    Effect.gen(function* () {
      const store = yield* DiscussionStore.DiscussionStore;
      yield* store.createDiscussion(discussion);
      yield* store.createDiscussion({
        ...discussion,
        id: DiscussionId.make("discussion:other"),
        projectId: yield* Schema.decodeUnknownEffect(Discussion.fields.projectId)("project:other"),
      });
      assert.deepEqual(yield* store.getDiscussion(discussion.id), discussion);
      assert.equal((yield* store.getDiscussion(discussion.id))?.seats[0]?.avatar, "reviewer");
      const updated: Discussion = {
        ...discussion,
        title: "暂停后的讨论",
        seats: [{ ...discussion.seats[0]!, avatar: "implementer" }],
        status: "paused",
        cursor: {
          seatIndex: 0,
          round: 2,
          dispatchNo: 2,
          runId: null,
          dispatchedEntrySeq: 5,
          briefChars: 200,
          briefSentAsFile: false,
        },
        pause: {
          reason: "seat_failed",
          seatId: discussion.seats[0]!.id,
          message: "等待重试",
          resetAt: timestamp,
        },
        closing: {
          summarizerSeatId: discussion.seats[0]!.id,
          summaryPrompt: "汇总",
          remainingFinalSeatIds: [discussion.seats[0]!.id],
          phase: "final_round",
        },
        updatedAt: "2026-10-12T02:00:00.000Z",
        endedAt: timestamp,
      };
      yield* store.updateDiscussion(updated);
      assert.deepEqual(yield* store.getDiscussion(discussion.id), updated);
      assert.equal((yield* store.getDiscussion(discussion.id))?.seats[0]?.avatar, "implementer");
      assert.deepEqual(yield* store.listDiscussions(discussion.projectId), [updated]);
      assert.isNull(yield* store.getDiscussion(DiscussionId.make("missing")));
      const error = yield* store
        .updateDiscussion({ ...discussion, id: DiscussionId.make("missing") })
        .pipe(Effect.flip);
      assert.instanceOf(error, DiscussionError);
      assert.equal(error.reason, "not_found");
    }).pipe(
      Effect.provide(DiscussionStore.layer.pipe(Layer.provideMerge(SqlitePersistence.layerMemory))),
    ),
);

it.effect(
  "concurrent appends allocate increasing seq and duplicate runs leave only one record",
  () =>
    Effect.gen(function* () {
      const store = yield* DiscussionStore.DiscussionStore;
      yield* store.createDiscussion(discussion);
      const first = yield* store.appendEntry(entry);
      assert.deepEqual(first, { ...entry, seq: 1 });
      const failure = yield* store
        .appendEntry({ ...entry, id: DiscussionEntryId.make("entry:duplicate") })
        .pipe(Effect.flip);
      assert.instanceOf(failure, DiscussionError);
      assert.equal(failure.reason, "orchestration_error");
      assert.deepEqual(yield* store.getEntryByRunId(RunId.make("run:first")), first);
      const { runId: _runId, ...withoutRun } = entry;
      yield* Effect.all(
        [
          store.appendEntry({
            ...withoutRun,
            id: DiscussionEntryId.make("entry:second"),
            text: "第二条",
          }),
          store.appendEntry({
            ...withoutRun,
            id: DiscussionEntryId.make("entry:third"),
            text: "第三条",
          }),
        ],
        { concurrency: "unbounded" },
      );
      assert.deepEqual(
        (yield* store.listEntries(discussion.id)).map((value) => value.seq),
        [1, 2, 3],
      );
      assert.deepEqual(
        (yield* store.listEntries(discussion.id, 1, 2)).map((value) => value.seq),
        [2],
      );
      const sql = yield* SqlClient.SqlClient;
      assert.deepEqual(
        yield* sql<{
          count: number;
        }>`SELECT COUNT(*) AS count FROM discussion_entries WHERE run_id = 'run:first'`,
        [{ count: 1 }],
      );
      assert.isNull(yield* store.getEntryByRunId(RunId.make("missing")));
    }).pipe(
      Effect.provide(DiscussionStore.layer.pipe(Layer.provideMerge(SqlitePersistence.layerMemory))),
    ),
);

it.effect(
  "deleting one discussion removes its entries and seat delivery while preserving another",
  () =>
    Effect.gen(function* () {
      const store = yield* DiscussionStore.DiscussionStore;
      const otherId = DiscussionId.make("discussion:other");
      const seatId = DiscussionSeatId.make("seat:test");
      yield* store.createDiscussion(discussion);
      yield* store.createDiscussion({ ...discussion, id: otherId });
      yield* store.appendEntry(entry);
      yield* store.appendEntry({
        ...entry,
        discussionId: otherId,
        id: DiscussionEntryId.make("entry:other"),
        runId: RunId.make("run:other"),
      });
      assert.isNull(yield* store.getSeatDelivery(discussion.id, seatId));
      yield* store.setSeatDelivery(discussion.id, seatId, 1);
      yield* store.setSeatDelivery(discussion.id, seatId, 4);
      yield* store.setSeatDelivery(otherId, seatId, 2);
      assert.equal(yield* store.getSeatDelivery(discussion.id, seatId), 4);
      yield* store.deleteDiscussion(discussion.id);
      assert.isNull(yield* store.getDiscussion(discussion.id));
      assert.deepEqual(yield* store.listEntries(discussion.id), []);
      assert.isNull(yield* store.getSeatDelivery(discussion.id, seatId));
      assert.equal((yield* store.listEntries(otherId)).length, 1);
      assert.equal(yield* store.getSeatDelivery(otherId, seatId), 2);
    }).pipe(
      Effect.provide(DiscussionStore.layer.pipe(Layer.provideMerge(SqlitePersistence.layerMemory))),
    ),
);

it.effect(
  "dispatch positions round trip zero, positive and legacy absence without changing on enrichment",
  () =>
    Effect.gen(function* () {
      const store = yield* DiscussionStore.DiscussionStore;
      yield* store.createDiscussion(discussion);
      const first = yield* store.appendEntry({ ...entry, dispatchedEntrySeq: 0 });
      const second = yield* store.appendEntry({
        ...entry,
        id: DiscussionEntryId.make("entry:position"),
        runId: RunId.make("run:position"),
        dispatchedEntrySeq: 7,
      });
      const legacy = yield* store.appendEntry({
        ...entry,
        id: DiscussionEntryId.make("entry:legacy"),
        runId: RunId.make("run:legacy"),
      });
      assert.deepEqual(
        (yield* store.listEntries(discussion.id)).map((value) => [
          value.dispatchedEntrySeq,
          Object.hasOwn(value, "dispatchedEntrySeq"),
        ]),
        [
          [0, true],
          [7, true],
          [undefined, false],
        ],
      );
      yield* store.updateEntry(first.id, { files: [] });
      yield* store.updateEntry(second.id, {
        files: [{ path: "enriched.ts", additions: 2, deletions: 1 }],
        checkpointRef: CheckpointRef.make("refs/c4a/capture"),
        readBySeatId: discussion.seats[0]!.id,
      });
      yield* store.updateEntry(legacy.id, { files: [] });
      assert.deepEqual(
        (yield* store.listEntries(discussion.id)).map((value) => [
          value.dispatchedEntrySeq,
          Object.hasOwn(value, "dispatchedEntrySeq"),
        ]),
        [
          [0, true],
          [7, true],
          [undefined, false],
        ],
      );
      assert.equal((yield* store.getEntryByRunId(second.runId!))?.dispatchedEntrySeq, 7);
    }).pipe(
      Effect.provide(DiscussionStore.layer.pipe(Layer.provideMerge(SqlitePersistence.layerMemory))),
    ),
);
