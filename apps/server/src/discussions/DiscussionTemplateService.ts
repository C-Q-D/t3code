/** User-facing template mutations and subscriptions; owns reference rules but no discussion execution. */
import {
  DiscussionError,
  DiscussionPromptId,
  DiscussionTemplateId,
  DiscussionPromptUpsertInput,
  DiscussionTemplateUpsertInput,
  type DiscussionPromptListInput,
  type DiscussionPromptListResult,
  type DiscussionPromptMutationResult,
  type DiscussionPromptDeleteInput,
  type DiscussionPromptDeleteResult,
  type DiscussionTemplateListResult,
  type DiscussionTemplateMutationResult,
  type DiscussionTemplateDeleteInput,
  type DiscussionTemplateDeleteResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";
import * as DiscussionStore from "./DiscussionStore.ts";
import { builtinPrompts } from "./builtinPrompts.ts";

/** All user template writes pass here so future MCP callers share validation and notifications. */
export class DiscussionTemplateService extends Context.Service<
  DiscussionTemplateService,
  {
    /** Lists persisted prompts; optional kind selects personas or summaries. */
    readonly listPrompts: (
      input?: DiscussionPromptListInput,
    ) => Effect.Effect<DiscussionPromptListResult, DiscussionError>;
    /** Emits an initial snapshot and full lists after prompt mutations; releases its subscription on close. */
    readonly subscribePrompts: (
      input?: DiscussionPromptListInput,
    ) => Stream.Stream<DiscussionPromptListResult, DiscussionError>;
    /** Creates when id is omitted; updates existing id while preserving kind, builtin flag and createdAt. */
    readonly upsertPrompt: (
      input: DiscussionPromptUpsertInput,
    ) => Effect.Effect<DiscussionPromptMutationResult, DiscussionError>;
    /** Rejects builtin prompts and prompts referenced by any discussion template. */
    readonly deletePrompt: (
      input: DiscussionPromptDeleteInput,
    ) => Effect.Effect<DiscussionPromptDeleteResult, DiscussionError>;
    /** Restores builtin name and text, keeping identity and createdAt; custom prompts fail invalid_state. */
    readonly restoreBuiltin: (
      input: DiscussionPromptDeleteInput,
    ) => Effect.Effect<DiscussionPromptMutationResult, DiscussionError>;
    /** Lists persisted ordered seat templates. */
    readonly listTemplates: () => Effect.Effect<DiscussionTemplateListResult, DiscussionError>;
    /** Emits an initial template snapshot and full lists after template mutations. */
    readonly subscribeTemplates: () => Stream.Stream<DiscussionTemplateListResult, DiscussionError>;
    /** Validates every prompt reference and its kind before atomically writing a template. */
    readonly upsertTemplate: (
      input: DiscussionTemplateUpsertInput,
    ) => Effect.Effect<DiscussionTemplateMutationResult, DiscussionError>;
    /** Deletes an existing discussion template; absent ids fail not_found. */
    readonly deleteTemplate: (
      input: DiscussionTemplateDeleteInput,
    ) => Effect.Effect<DiscussionTemplateDeleteResult, DiscussionError>;
  }
>()("t3/discussions/DiscussionTemplateService") {}

/** Acquires application SQL/Crypto; seed is owned by migration 61 so rebuilding this service preserves edits. */
const make = Effect.gen(function* () {
  const store = yield* DiscussionStore.DiscussionStore;
  const sql = yield* SqlClient.SqlClient;
  const crypto = yield* Crypto.Crypto;
  const mutex = yield* Semaphore.make(1);
  // Lists are snapshots: slow clients need the latest state, not an unbounded backlog of older lists.
  const promptChanges = yield* PubSub.sliding<DiscussionPromptListResult>(1);
  const templateChanges = yield* PubSub.sliding<DiscussionTemplateListResult>(1);
  yield* Effect.addFinalizer(() =>
    Effect.all([PubSub.shutdown(promptChanges), PubSub.shutdown(templateChanges)]),
  );

  const listPrompts: DiscussionTemplateService["Service"]["listPrompts"] = (input = {}) =>
    store.listPrompts().pipe(
      Effect.map((prompts) => ({
        prompts:
          input.kind === undefined
            ? prompts
            : prompts.filter((prompt) => prompt.kind === input.kind),
      })),
    );
  const listTemplates: DiscussionTemplateService["Service"]["listTemplates"] = () =>
    store.listTemplates().pipe(Effect.map((templates) => ({ templates })));

  /**
   * Serializes reference checks and writes. Waiting for the permit and running the transaction
   * body remain interruptible; commit, snapshot read and publication are protected together so
   * cancelling a committed request cannot leave existing subscribers with a stale list.
   */
  const mutate = <A>(effect: Effect.Effect<A, DiscussionError>, kind: "prompt" | "template") =>
    mutex.withPermit(
      Effect.uninterruptibleMask((restore) =>
        sql.withTransaction(restore(effect)).pipe(
          Effect.mapError((cause) =>
            Schema.is(DiscussionError)(cause)
              ? cause
              : new DiscussionError({
                  reason: "orchestration_error",
                  message: "Could not save discussion templates.",
                  cause,
                }),
          ),
          Effect.tap(() =>
            kind === "prompt"
              ? listPrompts().pipe(Effect.flatMap((list) => PubSub.publish(promptChanges, list)))
              : listTemplates().pipe(
                  Effect.flatMap((list) => PubSub.publish(templateChanges, list)),
                ),
          ),
        ),
      ),
    );
  const now = DateTime.now.pipe(Effect.map(DateTime.formatIso));
  const newId = crypto.randomUUIDv4.pipe(
    Effect.mapError(
      (cause) =>
        new DiscussionError({
          reason: "orchestration_error",
          message: "Could not create template identity.",
          cause,
        }),
    ),
  );

  /** Looks up a prompt for user operations; missing ids have a stable domain failure. */
  const requirePrompt = (id: DiscussionPromptId) =>
    store
      .getPrompt(id)
      .pipe(
        Effect.flatMap((prompt) =>
          prompt === null
            ? Effect.fail(
                new DiscussionError({ reason: "not_found", message: `Prompt ${id} not found.` }),
              )
            : Effect.succeed(prompt),
        ),
      );

  /** Looks up a template selected for update/delete without silently recreating a missing id. */
  const requireTemplate = (id: DiscussionTemplateId) =>
    store
      .getTemplate(id)
      .pipe(
        Effect.flatMap((template) =>
          template === null
            ? Effect.fail(
                new DiscussionError({ reason: "not_found", message: `Template ${id} not found.` }),
              )
            : Effect.succeed(template),
        ),
      );

  return DiscussionTemplateService.of({
    listPrompts,
    listTemplates,
    subscribePrompts: (input = {}) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const { subscription, initial } = yield* mutex.withPermit(
            Effect.gen(function* () {
              const subscription = yield* PubSub.subscribe(promptChanges);
              return { subscription, initial: yield* listPrompts(input) };
            }),
          );
          return Stream.concat(
            Stream.succeed(initial),
            Stream.fromSubscription(subscription).pipe(
              Stream.map((list) => ({
                prompts:
                  input.kind === undefined
                    ? list.prompts
                    : list.prompts.filter((prompt) => prompt.kind === input.kind),
              })),
            ),
          );
        }),
      ),
    subscribeTemplates: () =>
      Stream.unwrap(
        Effect.gen(function* () {
          const { subscription, initial } = yield* mutex.withPermit(
            Effect.gen(function* () {
              const subscription = yield* PubSub.subscribe(templateChanges);
              return { subscription, initial: yield* listTemplates() };
            }),
          );
          return Stream.concat(Stream.succeed(initial), Stream.fromSubscription(subscription));
        }),
      ),
    upsertPrompt: (input) =>
      mutate(
        Effect.gen(function* () {
          const value = yield* Schema.decodeUnknownEffect(DiscussionPromptUpsertInput)(input).pipe(
            Effect.mapError(
              (cause) =>
                new DiscussionError({
                  reason: "invalid_state",
                  message: "Invalid prompt input.",
                  cause,
                }),
            ),
          );
          const existing = value.id === undefined ? null : yield* requirePrompt(value.id);
          if (existing !== null && existing.kind !== value.kind)
            return yield* Effect.fail(
              new DiscussionError({
                reason: "invalid_state",
                message: "A prompt's kind cannot be changed.",
              }),
            );
          const timestamp = yield* now;
          const prompt = {
            ...value,
            id: existing?.id ?? DiscussionPromptId.make(yield* newId),
            builtin: existing?.builtin ?? false,
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp,
          };
          yield* store.upsertPrompt(prompt);
          return { prompt };
        }),
        "prompt",
      ),
    deletePrompt: (input) =>
      mutate(
        Effect.gen(function* () {
          const prompt = yield* requirePrompt(input.id);
          if (prompt.builtin)
            return yield* Effect.fail(
              new DiscussionError({
                reason: "invalid_state",
                message: "Builtin prompts cannot be deleted.",
              }),
            );
          const references = (yield* store.listTemplates()).filter(
            (template) =>
              template.summaryPromptId === input.id ||
              template.seats.some((seat) => seat.personaPromptId === input.id),
          );
          if (references.length > 0)
            return yield* Effect.fail(
              new DiscussionError({
                reason: "in_use",
                message: `Prompt is used by templates: ${references.map((template) => `${template.name} (${template.id})`).join(", ")}.`,
              }),
            );
          yield* store.deletePrompt(input.id);
          return { id: input.id };
        }),
        "prompt",
      ),
    restoreBuiltin: (input) =>
      mutate(
        Effect.gen(function* () {
          const existing = yield* requirePrompt(input.id);
          const builtin = builtinPrompts.find((prompt) => prompt.id === input.id);
          if (!existing.builtin || !builtin)
            return yield* Effect.fail(
              new DiscussionError({
                reason: "invalid_state",
                message: "Only builtin prompts can be restored.",
              }),
            );
          const prompt = { ...existing, ...builtin, updatedAt: yield* now };
          yield* store.upsertPrompt(prompt);
          return { prompt };
        }),
        "prompt",
      ),
    upsertTemplate: (input) =>
      mutate(
        Effect.gen(function* () {
          const value = yield* Schema.decodeUnknownEffect(DiscussionTemplateUpsertInput)(
            input,
          ).pipe(
            Effect.mapError(
              (cause) =>
                new DiscussionError({
                  reason: "invalid_state",
                  message: "Invalid discussion template input.",
                  cause,
                }),
            ),
          );
          const existing = value.id === undefined ? null : yield* requireTemplate(value.id);
          for (const seat of value.seats) {
            const persona = yield* requirePrompt(seat.personaPromptId);
            if (persona.kind !== "persona")
              return yield* Effect.fail(
                new DiscussionError({
                  reason: "invalid_state",
                  message: `Prompt ${persona.id} is not a persona.`,
                }),
              );
          }
          if (value.summaryPromptId !== null) {
            const summary = yield* requirePrompt(value.summaryPromptId);
            if (summary.kind !== "summary")
              return yield* Effect.fail(
                new DiscussionError({
                  reason: "invalid_state",
                  message: `Prompt ${summary.id} is not a summary.`,
                }),
              );
          }
          const timestamp = yield* now;
          const template = {
            ...value,
            id: existing?.id ?? DiscussionTemplateId.make(yield* newId),
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp,
          };
          yield* store.upsertTemplate(template);
          return { template };
        }),
        "template",
      ),
    deleteTemplate: (input) =>
      mutate(
        Effect.gen(function* () {
          yield* requireTemplate(input.id);
          yield* store.deleteTemplate(input.id);
          return { id: input.id };
        }),
        "template",
      ),
  });
});

export const layer = Layer.effect(DiscussionTemplateService, make).pipe(
  Layer.provide(DiscussionStore.layer),
);
