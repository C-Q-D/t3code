/** Exercises user-visible template rules against real SQLite and waits for subscription snapshots, never sleeps. */
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { assert, it } from "@effect/vitest";
import {
  DiscussionError,
  DiscussionPromptId,
  ProviderInstanceId,
  type DiscussionPromptListResult,
  type DiscussionTemplateListResult,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";
import { vi } from "vite-plus/test";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as DiscussionTemplates from "./DiscussionTemplateService.ts";
import * as DiscussionStore from "./DiscussionStore.ts";

const serviceLayer = DiscussionTemplates.layer.pipe(Layer.provide(NodeCrypto.layer));
const personaInput = {
  kind: "persona" as const,
  name: "自定义身份",
  prompt: "检查实现边界。",
  avatar: "architect" as const,
  description: "",
};
const summaryInput = {
  kind: "summary" as const,
  name: "自定义梳理",
  prompt: "列出结论。",
  avatar: null,
  description: "",
};
const modelSelection = { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" };

it.effect("a cancelled request still publishes its committed template change", () =>
  Effect.gen(function* () {
    const service = yield* DiscussionTemplates.DiscussionTemplateService;
    const store = yield* DiscussionStore.DiscussionStore;
    const sql = yield* SqlClient.SqlClient;
    const afterCommit = yield* Deferred.make<void>();
    const releaseRead = yield* Deferred.make<void>();
    const received = yield* Deferred.make<boolean>();
    const cancelledRead = yield* Deferred.make<boolean>();
    const snapshots = yield* Queue.unbounded<DiscussionPromptListResult>();
    yield* service.subscribePrompts().pipe(
      Stream.runForEach((list) =>
        list.prompts.length === 7
          ? Deferred.succeed(received, true).pipe(Effect.andThen(Queue.offer(snapshots, list)))
          : Queue.offer(snapshots, list),
      ),
      Effect.forkScoped,
    );
    assert.equal((yield* Queue.take(snapshots)).prompts.length, 6);

    // Delay the real post-commit read at the existing repository boundary. The query
    // still runs against SQLite; no fixture supplies the persisted or published list.
    const listPrompts = store.listPrompts;
    const readSpy = vi.spyOn(store, "listPrompts").mockImplementation(() =>
      listPrompts().pipe(
        Effect.tap(() => Deferred.succeed(afterCommit, undefined)),
        Effect.tap(() => Deferred.await(releaseRead)),
        Effect.onInterrupt(() => Deferred.succeed(cancelledRead, false)),
      ),
    );
    yield* Effect.addFinalizer(() => Effect.sync(() => readSpy.mockRestore()));
    yield* Effect.gen(function* () {
      const request = yield* service.upsertPrompt(personaInput).pipe(Effect.forkScoped);
      yield* Effect.raceFirst(
        Deferred.await(afterCommit),
        Fiber.join(request).pipe(
          Effect.andThen(Effect.die(new Error("post-commit gate was not reached"))),
        ),
      );
      const rows = yield* sql`
        SELECT name, prompt FROM discussion_prompts WHERE builtin = 0
      `;
      assert.deepEqual(rows, [{ name: "自定义身份", prompt: "检查实现边界。" }]);
      request.interruptUnsafe();
      yield* Deferred.succeed(releaseRead, undefined);
      // Either publication or interruption completes a Deferred. A lost notification
      // therefore fails explicitly instead of relying on a timeout or scheduler delay.
      assert.isTrue(
        yield* Effect.raceFirst(Deferred.await(received), Deferred.await(cancelledRead)),
        "the subscriber must receive the committed change despite request cancellation",
      );
      const list = yield* Queue.take(snapshots);
      assert.deepEqual(
        list.prompts
          .filter((prompt) => !prompt.builtin)
          .map((prompt) => [prompt.name, prompt.prompt]),
        [["自定义身份", "检查实现边界。"]],
      );
      yield* Fiber.await(request);
    }).pipe(Effect.ensuring(Deferred.succeed(releaseRead, undefined)));
  }).pipe(
    Effect.provide(
      Layer.mergeAll(serviceLayer, DiscussionStore.layer).pipe(
        Layer.provideMerge(SqlitePersistence.layerMemory),
      ),
    ),
    Effect.scoped,
  ),
);

it.effect("prompt create, update and delete persist custom values and preserve identity", () =>
  Effect.gen(function* () {
    const service = yield* DiscussionTemplates.DiscussionTemplateService;
    const { prompt } = yield* service.upsertPrompt(personaInput);
    assert.equal(prompt.name, "自定义身份");
    assert.isFalse(prompt.builtin);
    assert.isFalse(prompt.modified);
    const { prompt: edited } = yield* service.upsertPrompt({
      ...personaInput,
      id: prompt.id,
      name: "改名",
      prompt: "修改后的提示词。",
    });
    assert.equal(edited.id, prompt.id);
    assert.equal(edited.createdAt, prompt.createdAt);
    assert.deepEqual(
      (yield* service.listPrompts({ kind: "persona" })).prompts
        .filter((item) => item.id === prompt.id)
        .map((item) => [item.name, item.prompt]),
      [["改名", "修改后的提示词。"]],
    );
    assert.deepEqual(yield* service.deletePrompt({ id: prompt.id }), { id: prompt.id });
    assert.isFalse((yield* service.listPrompts()).prompts.some((item) => item.id === prompt.id));
  }).pipe(Effect.provide(serviceLayer.pipe(Layer.provide(SqlitePersistence.layerMemory)))),
);

it.effect(
  "builtin prompts allow edits, reject deletion and restore their original name and text",
  () =>
    Effect.gen(function* () {
      const service = yield* DiscussionTemplates.DiscussionTemplateService;
      const id = DiscussionPromptId.make("builtin:persona:architect");
      yield* service.upsertPrompt({
        id,
        kind: "persona",
        avatar: "opponent",
        description: "改过的简介",
        name: "我的架构师",
        prompt: "我的正文。",
      });
      const failure = yield* service.deletePrompt({ id }).pipe(Effect.flip);
      assert.instanceOf(failure, DiscussionError);
      assert.equal(failure.reason, "invalid_state");
      const { prompt } = yield* service.restoreBuiltin({ id });
      assert.equal(prompt.name, "架构师");
      assert.equal(
        prompt.prompt,
        "你从整体结构和长期维护成本审视方案。关注模块边界、依赖方向与数据归属。用具体场景检验扩展性，避免为假设中的需求增加复杂度。说明关键取舍和它们带来的维护负担。",
      );
      assert.isTrue(prompt.builtin);
      assert.equal(prompt.avatar, "architect");
      assert.equal(prompt.description, "关注整体结构和长期维护成本");
      assert.isFalse(prompt.modified);
      const summaryId = DiscussionPromptId.make("builtin:summary:default");
      yield* service.upsertPrompt({
        id: summaryId,
        kind: "summary",
        avatar: null,
        description: "改过的梳理简介",
        name: "我的总结",
        prompt: "短文。",
      });
      const { prompt: summary } = yield* service.restoreBuiltin({ id: summaryId });
      assert.equal(summary.name, "默认");
      assert.isNull(summary.avatar);
      assert.equal(summary.description, "共识 / 分歧 / 待你决定");
      assert.isFalse(summary.modified);
      assert.equal(
        summary.prompt,
        "你负责把材料整理成清楚的结论。按“共识 / 分歧 / 待你决定”三段输出。共识只记录已经一致的观点，分歧写清不同观点和依据。待你决定列出需要用户选择的事项及主要取舍，不把未决事项写成结论。",
      );
    }).pipe(Effect.provide(serviceLayer.pipe(Layer.provide(SqlitePersistence.layerMemory)))),
);

it.effect(
  "custom restore and changing a prompt kind are rejected without changing persisted data",
  () =>
    Effect.gen(function* () {
      const service = yield* DiscussionTemplates.DiscussionTemplateService;
      const { prompt } = yield* service.upsertPrompt(personaInput);
      const restoreError = yield* service.restoreBuiltin({ id: prompt.id }).pipe(Effect.flip);
      assert.instanceOf(restoreError, DiscussionError);
      assert.equal(restoreError.reason, "invalid_state");
      const kindError = yield* service
        .upsertPrompt({ ...summaryInput, id: prompt.id })
        .pipe(Effect.flip);
      assert.instanceOf(kindError, DiscussionError);
      assert.equal(kindError.reason, "invalid_state");
      assert.deepEqual(
        (yield* service.listPrompts()).prompts.find((item) => item.id === prompt.id),
        prompt,
      );
    }).pipe(Effect.provide(serviceLayer.pipe(Layer.provide(SqlitePersistence.layerMemory)))),
);

it.effect("discussion templates create, update and delete while retaining ordered seats", () =>
  Effect.gen(function* () {
    const service = yield* DiscussionTemplates.DiscussionTemplateService;
    const input = {
      name: "讨论配置",
      seats: [
        { personaPromptId: DiscussionPromptId.make("builtin:persona:reviewer"), modelSelection },
        { personaPromptId: DiscussionPromptId.make("builtin:persona:architect"), modelSelection },
      ],
      summaryPromptId: DiscussionPromptId.make("builtin:summary:default"),
    };
    const { template } = yield* service.upsertTemplate(input);
    assert.deepEqual(
      template.seats.map((seat) => seat.personaPromptId),
      ["builtin:persona:reviewer", "builtin:persona:architect"],
    );
    const { template: edited } = yield* service.upsertTemplate({
      ...input,
      id: template.id,
      name: "新配置",
      summaryPromptId: null,
    });
    assert.equal(edited.id, template.id);
    assert.equal(edited.createdAt, template.createdAt);
    assert.deepEqual(
      (yield* service.listTemplates()).templates.map((item) => [item.name, item.summaryPromptId]),
      [["新配置", null]],
    );
    assert.deepEqual(yield* service.deleteTemplate({ id: template.id }), { id: template.id });
    assert.deepEqual(yield* service.listTemplates(), { templates: [] });
  }).pipe(Effect.provide(serviceLayer.pipe(Layer.provide(SqlitePersistence.layerMemory)))),
);

it.effect.each([{ kind: "persona" as const }, { kind: "summary" as const }])(
  "referenced $kind prompts cannot be deleted until the referring template is removed",
  ({ kind }) =>
    Effect.gen(function* () {
      const service = yield* DiscussionTemplates.DiscussionTemplateService;
      const { prompt } = yield* service.upsertPrompt(
        kind === "persona" ? personaInput : summaryInput,
      );
      const { template } = yield* service.upsertTemplate({
        name: "引用者",
        seats: [
          {
            personaPromptId:
              kind === "persona" ? prompt.id : DiscussionPromptId.make("builtin:persona:architect"),
            modelSelection,
          },
        ],
        summaryPromptId: kind === "summary" ? prompt.id : null,
      });
      const failure = yield* service.deletePrompt({ id: prompt.id }).pipe(Effect.flip);
      assert.instanceOf(failure, DiscussionError);
      assert.equal(failure.reason, "in_use");
      assert.include(failure.message, "引用者");
      assert.include(failure.message, template.id);
      assert.isTrue((yield* service.listPrompts()).prompts.some((item) => item.id === prompt.id));
      yield* service.deleteTemplate({ id: template.id });
      yield* service.deletePrompt({ id: prompt.id });
      assert.isFalse((yield* service.listPrompts()).prompts.some((item) => item.id === prompt.id));
    }).pipe(Effect.provide(serviceLayer.pipe(Layer.provide(SqlitePersistence.layerMemory)))),
);

it.effect.each([
  { label: "missing persona", persona: "missing", summary: null, reason: "not_found" },
  {
    label: "wrong persona kind",
    persona: "builtin:summary:default",
    summary: null,
    reason: "invalid_state",
  },
  {
    label: "missing summary",
    persona: "builtin:persona:architect",
    summary: "missing",
    reason: "not_found",
  },
  {
    label: "wrong summary kind",
    persona: "builtin:persona:architect",
    summary: "builtin:persona:reviewer",
    reason: "invalid_state",
  },
])("rejects $label without creating a template", ({ persona, summary, reason }) =>
  Effect.gen(function* () {
    const service = yield* DiscussionTemplates.DiscussionTemplateService;
    const failure = yield* service
      .upsertTemplate({
        name: "错误配置",
        seats: [{ personaPromptId: DiscussionPromptId.make(persona), modelSelection }],
        summaryPromptId: summary === null ? null : DiscussionPromptId.make(summary),
      })
      .pipe(Effect.flip);
    assert.instanceOf(failure, DiscussionError);
    assert.equal(failure.reason, reason);
    assert.deepEqual(yield* service.listTemplates(), { templates: [] });
  }).pipe(Effect.provide(serviceLayer.pipe(Layer.provide(SqlitePersistence.layerMemory)))),
);

it.effect(
  "rebuilding the layer on the same database preserves custom and edited builtin templates",
  () =>
    Effect.gen(function* () {
      const saved = yield* Effect.gen(function* () {
        const service = yield* DiscussionTemplates.DiscussionTemplateService;
        const { prompt } = yield* service.upsertPrompt(personaInput);
        yield* service.upsertPrompt({
          ...personaInput,
          id: prompt.id,
          name: "重建后仍在",
          prompt: "持久正文。",
        });
        yield* service.upsertPrompt({
          id: DiscussionPromptId.make("builtin:persona:architect"),
          kind: "persona",
          avatar: "architect",
          description: "",
          name: "改过的内置身份",
          prompt: "保持修改。",
        });
        const { template } = yield* service.upsertTemplate({
          name: "持久配置",
          seats: [{ personaPromptId: prompt.id, modelSelection }],
          summaryPromptId: null,
        });
        yield* service.upsertTemplate({ ...template, name: "修改过的配置" });
        return { promptId: prompt.id, templateId: template.id };
      }).pipe(Effect.provide(Layer.fresh(serviceLayer)), Effect.scoped);
      yield* Effect.gen(function* () {
        const service = yield* DiscussionTemplates.DiscussionTemplateService;
        const { prompts } = yield* service.listPrompts();
        assert.equal(prompts.length, 7);
        assert.deepEqual(
          prompts
            .filter((item) => item.id === saved.promptId)
            .map((item) => [item.name, item.prompt]),
          [["重建后仍在", "持久正文。"]],
        );
        assert.deepEqual(
          prompts
            .filter((item) => item.id === "builtin:persona:architect")
            .map((item) => [item.name, item.prompt]),
          [["改过的内置身份", "保持修改。"]],
        );
        assert.deepEqual(
          (yield* service.listTemplates()).templates.map((item) => [item.id, item.name]),
          [[saved.templateId, "修改过的配置"]],
        );
      }).pipe(Effect.provide(Layer.fresh(serviceLayer)), Effect.scoped);
    }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);

it.effect("prompt subscription emits initial, upsert, edit, restore and delete snapshots", () =>
  Effect.gen(function* () {
    const service = yield* DiscussionTemplates.DiscussionTemplateService;
    const snapshots = yield* Queue.unbounded<DiscussionPromptListResult>();
    yield* service.subscribePrompts({ kind: "persona" }).pipe(
      Stream.runForEach((list) => Queue.offer(snapshots, list)),
      Effect.forkScoped,
    );
    assert.equal((yield* Queue.take(snapshots)).prompts.length, 5);
    const { prompt } = yield* service.upsertPrompt(personaInput);
    assert.deepEqual(
      (yield* Queue.take(snapshots)).prompts
        .filter((item) => item.id === prompt.id)
        .map((item) => item.name),
      ["自定义身份"],
    );
    yield* service.upsertPrompt({ ...personaInput, id: prompt.id, name: "订阅修改" });
    assert.deepEqual(
      (yield* Queue.take(snapshots)).prompts
        .filter((item) => item.id === prompt.id)
        .map((item) => item.name),
      ["订阅修改"],
    );
    yield* service.restoreBuiltin({ id: DiscussionPromptId.make("builtin:persona:architect") });
    assert.equal(
      (yield* Queue.take(snapshots)).prompts.find((item) => item.id === "builtin:persona:architect")
        ?.name,
      "架构师",
    );
    yield* service.deletePrompt({ id: prompt.id });
    const deleted = yield* Queue.take(snapshots);
    assert.equal(deleted.prompts.length, 5);
    assert.isFalse(deleted.prompts.some((item) => item.id === prompt.id));
  }).pipe(
    Effect.provide(serviceLayer.pipe(Layer.provide(SqlitePersistence.layerMemory))),
    Effect.scoped,
  ),
);

it.effect("template subscription emits fresh lists on upsert and delete", () =>
  Effect.gen(function* () {
    const service = yield* DiscussionTemplates.DiscussionTemplateService;
    const snapshots = yield* Queue.unbounded<DiscussionTemplateListResult>();
    yield* service.subscribeTemplates().pipe(
      Stream.runForEach((list) => Queue.offer(snapshots, list)),
      Effect.forkScoped,
    );
    assert.deepEqual(yield* Queue.take(snapshots), { templates: [] });
    const { template } = yield* service.upsertTemplate({
      name: "订阅配置",
      seats: [
        { personaPromptId: DiscussionPromptId.make("builtin:persona:architect"), modelSelection },
      ],
      summaryPromptId: null,
    });
    assert.deepEqual(
      (yield* Queue.take(snapshots)).templates.map((item) => item.name),
      ["订阅配置"],
    );
    yield* service.deleteTemplate({ id: template.id });
    assert.deepEqual(yield* Queue.take(snapshots), { templates: [] });
  }).pipe(
    Effect.provide(serviceLayer.pipe(Layer.provide(SqlitePersistence.layerMemory))),
    Effect.scoped,
  ),
);

it.effect.each([
  { label: "persona without avatar", input: { ...personaInput, avatar: null } },
  { label: "summary with avatar", input: { ...summaryInput, avatar: "architect" as const } },
])("rejects $label without saving a prompt", ({ input }) =>
  Effect.gen(function* () {
    const service = yield* DiscussionTemplates.DiscussionTemplateService;
    const failure = yield* service.upsertPrompt(input).pipe(Effect.flip);
    assert.instanceOf(failure, DiscussionError);
    assert.equal(failure.reason, "invalid_state");
    assert.equal((yield* service.listPrompts()).prompts.length, 6);
  }).pipe(Effect.provide(serviceLayer.pipe(Layer.provide(SqlitePersistence.layerMemory)))),
);

const architectDefaults = {
  id: DiscussionPromptId.make("builtin:persona:architect"),
  kind: "persona" as const,
  name: "架构师",
  prompt:
    "你从整体结构和长期维护成本审视方案。关注模块边界、依赖方向与数据归属。用具体场景检验扩展性，避免为假设中的需求增加复杂度。说明关键取舍和它们带来的维护负担。",
  avatar: "architect" as const,
  description: "关注整体结构和长期维护成本",
};

it.effect.each([
  { field: "name", edit: { name: "我的身份" } },
  { field: "prompt", edit: { prompt: "我的正文" } },
  { field: "avatar", edit: { avatar: "reviewer" as const } },
  { field: "description", edit: { description: "  我的简介\n" } },
])("builtin $field edits set modified and reverting clears it", ({ edit }) =>
  Effect.gen(function* () {
    const service = yield* DiscussionTemplates.DiscussionTemplateService;
    const { prompt: edited } = yield* service.upsertPrompt({ ...architectDefaults, ...edit });
    assert.isTrue(edited.modified);
    assert.isTrue(
      (yield* service.listPrompts()).prompts.find((item) => item.id === architectDefaults.id)
        ?.modified,
    );
    const { prompt: reverted } = yield* service.upsertPrompt(architectDefaults);
    assert.isFalse(reverted.modified);
    assert.isFalse(
      (yield* service.listPrompts({ kind: "persona" })).prompts.find(
        (item) => item.id === architectDefaults.id,
      )?.modified,
    );
  }).pipe(Effect.provide(serviceLayer.pipe(Layer.provide(SqlitePersistence.layerMemory)))),
);

it.effect("custom descriptions survive unchanged and unknown builtin ids are not modified", () =>
  Effect.gen(function* () {
    const service = yield* DiscussionTemplates.DiscussionTemplateService;
    const store = yield* DiscussionStore.DiscussionStore;
    const { prompt } = yield* service.upsertPrompt({ ...personaInput, description: "  简介\n" });
    assert.equal(prompt.description, "  简介\n");
    assert.isFalse(prompt.modified);
    const persisted = yield* store.getPrompt(prompt.id);
    assert.isNotNull(persisted);
    assert.notProperty(persisted, "modified");
    yield* store.upsertPrompt({
      ...prompt,
      id: DiscussionPromptId.make("builtin:persona:unknown"),
      builtin: true,
    });
    const list = yield* service.listPrompts();
    assert.equal(list.prompts.find((item) => item.id === prompt.id)?.description, "  简介\n");
    assert.isFalse(list.prompts.find((item) => item.id === "builtin:persona:unknown")?.modified);
  }).pipe(
    Effect.provide(
      Layer.mergeAll(serviceLayer, DiscussionStore.layer).pipe(
        Layer.provideMerge(SqlitePersistence.layerMemory),
      ),
    ),
  ),
);

it.effect(
  "prompt snapshots report modified on initial, edited, reverted and restored builtin values",
  () =>
    Effect.gen(function* () {
      const service = yield* DiscussionTemplates.DiscussionTemplateService;
      yield* service.upsertPrompt({ ...architectDefaults, description: "订阅前修改" });
      const snapshots = yield* Queue.unbounded<DiscussionPromptListResult>();
      yield* service.subscribePrompts({ kind: "persona" }).pipe(
        Stream.runForEach((list) => Queue.offer(snapshots, list)),
        Effect.forkScoped,
      );
      assert.isTrue(
        (yield* Queue.take(snapshots)).prompts.find((item) => item.id === architectDefaults.id)
          ?.modified,
      );
      yield* service.upsertPrompt(architectDefaults);
      assert.isFalse(
        (yield* Queue.take(snapshots)).prompts.find((item) => item.id === architectDefaults.id)
          ?.modified,
      );
      yield* service.upsertPrompt({ ...architectDefaults, avatar: "product" });
      assert.isTrue(
        (yield* Queue.take(snapshots)).prompts.find((item) => item.id === architectDefaults.id)
          ?.modified,
      );
      yield* service.restoreBuiltin({ id: architectDefaults.id });
      assert.isFalse(
        (yield* Queue.take(snapshots)).prompts.find((item) => item.id === architectDefaults.id)
          ?.modified,
      );
      const { prompt } = yield* service.upsertPrompt(personaInput);
      const created = yield* Queue.take(snapshots);
      assert.equal(created.prompts.length, 6);
      assert.isTrue(created.prompts.every((item) => item.kind === "persona"));
      assert.isFalse(created.prompts.find((item) => item.id === prompt.id)?.modified);
    }).pipe(
      Effect.provide(serviceLayer.pipe(Layer.provide(SqlitePersistence.layerMemory))),
      Effect.scoped,
    ),
);
