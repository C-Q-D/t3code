/** Verifies ephemeral fork ownership and bounded release with real protocol decoding. */
import { assert, describe, it } from "@effect/vitest";
import * as CodexClient from "effect-codex-app-server/client";
import * as CodexReplay from "effect-codex-app-server/replay";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Scope from "effect/Scope";
import { TestClock } from "effect/testing";
import * as CodexSideQuery from "./CodexSideQuery.ts";

const forkResult = {
  thread: {
    id: "side-child",
    sessionId: "side-child",
    forkedFromId: "side-parent",
    preview: "",
    ephemeral: true,
    modelProvider: "openai",
    createdAt: 1782622440,
    updatedAt: 1782622440,
    status: { type: "idle" },
    path: null,
    cwd: "/workspace",
    cliVersion: "0.164.0",
    source: "vscode",
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: null,
    turns: [],
  },
  model: "gpt-5.4-resolved",
  modelProvider: "openai",
  cwd: "/workspace",
  approvalPolicy: "never",
  approvalsReviewer: "user",
  sandbox: { type: "dangerFullAccess" },
};

const forkParams = { threadId: "parent", ephemeral: true, excludeTurns: true, model: "gpt-5.4" };
const forkEntry = {
  type: "expect_outbound",
  frame: { id: 1, method: "thread/fork", params: forkParams },
} as const;
const forkReply = {
  type: "emit_inbound",
  label: "fork-reply",
  frame: { id: 1, result: forkResult },
} as const;
const unsubscribeEntry = {
  type: "expect_outbound",
  frame: { id: 2, method: "thread/unsubscribe", params: { threadId: "side-child" } },
} as const;
const unsubscribeReply = {
  type: "emit_inbound",
  label: "unsubscribe-reply",
  frame: { id: 2, result: { status: "unsubscribed" } },
} as const;
const afterRelease = [
  { type: "expect_outbound", frame: { method: "initialized" } },
  {
    type: "emit_inbound",
    frame: {
      method: "item/agentMessage/delta",
      params: { threadId: "side-child", turnId: "side-turn", itemId: "m", delta: "after release" },
    },
  },
] as const;

/** Builds a real replay client; gates control provider reply timing, never application results. */
const setup = Effect.fn("test.sideQueryLifecycle.setup")(function* (
  entries: ReadonlyArray<CodexReplay.CodexAppServerReplayEntry>,
  beforeEmitInbound: NonNullable<CodexReplay.CodexAppServerReplayDriver["beforeEmitInbound"]>,
) {
  const driver = yield* CodexReplay.makeReplayDriver(
    {
      provider: "codex",
      protocol: "codex.app-server",
      version: "0.164.0",
      scenario: "side-lifecycle",
      entries,
    },
    { beforeEmitInbound },
  );
  const context = yield* Layer.build(CodexReplay.layerReplayWithDriver(driver));
  const transport = yield* Effect.service(CodexClient.CodexAppServerClient).pipe(
    Effect.provide(context),
  );
  const released = yield* Deferred.make<void>();
  const router = CodexSideQuery.make({
    ...transport,
    request: (method, params) =>
      transport
        .request(method, params)
        .pipe(
          Effect.onExit(() =>
            method === "thread/unsubscribe" ? Deferred.succeed(released, undefined) : Effect.void,
          ),
        ),
  });
  const main: Array<string> = [];
  const mainReceived = yield* Deferred.make<void>();
  yield* router.client.handleServerNotification("item/agentMessage/delta", (payload) =>
    Effect.sync(() => main.push(payload.delta)).pipe(
      Effect.andThen(Deferred.succeed(mainReceived, undefined)),
      Effect.asVoid,
    ),
  );
  yield* router.client.handleServerRequest("item/commandExecution/requestApproval", () =>
    Effect.die("late fork request reached main"),
  );
  const scope = yield* Scope.Scope;
  const query = router
    .acquireFork(forkParams, () => Effect.void, scope)
    .pipe(Effect.as("query result"), Effect.scoped);
  return { router, query, main, mainReceived, released };
});

describe("Codex side-query lifecycle", () => {
  it.effect("cancels a pending fork and owns its late reply, notification and approval", () =>
    Effect.gen(function* () {
      const waiting = yield* Deferred.make<void>();
      const reply = yield* Deferred.make<void>();
      const fixture = yield* setup(
        [
          forkEntry,
          forkReply,
          {
            type: "emit_inbound",
            frame: {
              method: "item/agentMessage/delta",
              params: {
                threadId: "side-child",
                turnId: "side-turn",
                itemId: "m",
                delta: "late hidden",
              },
            },
          },
          unsubscribeEntry,
          {
            type: "emit_inbound",
            frame: {
              id: 99,
              method: "item/commandExecution/requestApproval",
              params: { threadId: "side-child", turnId: "side-turn", itemId: "command" },
            },
          },
          { type: "expect_outbound", frame: { id: 99, result: { decision: "decline" } } },
          unsubscribeReply,
          ...afterRelease,
        ],
        (entry) =>
          entry.label === "fork-reply"
            ? Deferred.succeed(waiting, undefined).pipe(Effect.andThen(Deferred.await(reply)))
            : Effect.void,
      );
      const finished = yield* Deferred.make<void>();
      const pending = yield* fixture.query.pipe(
        Effect.timeout("45 seconds"),
        Effect.ensuring(Deferred.succeed(finished, undefined)),
        Effect.exit,
        Effect.forkChild({ startImmediately: true }),
      );
      yield* Deferred.await(waiting);
      yield* TestClock.adjust("45 seconds");
      const endedBeforeReply = yield* Deferred.isDone(finished);
      // Release the fake even on the broken implementation so the failing assertion cannot hang teardown.
      yield* Deferred.succeed(reply, undefined);
      const result = yield* Fiber.join(pending);
      yield* Deferred.await(fixture.released);
      assert.isTrue(endedBeforeReply, "caller deadline must finish before the fork replies");
      assert.isTrue(Exit.isFailure(result));
      assert.deepEqual(fixture.main, []);
      yield* fixture.router.client.notify("initialized", undefined);
      yield* Deferred.await(fixture.mainReceived);
      assert.deepEqual(fixture.main, ["after release"]);
    }).pipe(Effect.scoped),
  );

  it.effect.each(["timeout", "error"] as const)(
    "unsubscribe %s preserves the result and clears routing",
    (mode) =>
      Effect.gen(function* () {
        const waiting = yield* Deferred.make<void>();
        const reply = yield* Deferred.make<void>();
        const warnings: Array<string> = [];
        const logger = Logger.make(({ logLevel, message }) => {
          if (logLevel === "Warn" && Array.isArray(message)) warnings.push(String(message[0]));
        });
        const fixture = yield* setup(
          [
            forkEntry,
            forkReply,
            unsubscribeEntry,
            mode === "error"
              ? {
                  type: "emit_inbound",
                  label: "unsubscribe-reply",
                  frame: { id: 2, error: { code: -32603, message: "unsubscribe failed" } },
                }
              : unsubscribeReply,
            ...afterRelease,
          ],
          (entry) =>
            entry.label === "unsubscribe-reply"
              ? Deferred.succeed(waiting, undefined).pipe(
                  Effect.andThen(mode === "timeout" ? Deferred.await(reply) : Effect.void),
                )
              : Effect.void,
        );
        const finished = yield* Deferred.make<void>();
        const pending = yield* fixture.query.pipe(
          Effect.provide(Logger.layer([logger], { mergeWithExisting: false })),
          Effect.ensuring(Deferred.succeed(finished, undefined)),
          Effect.exit,
          Effect.forkChild({ startImmediately: true }),
        );
        yield* Deferred.await(waiting);
        yield* TestClock.adjust("6 seconds");
        const endedBeforeReply = yield* Deferred.isDone(finished);
        yield* Deferred.succeed(reply, undefined);
        const result = yield* Fiber.join(pending);
        assert.isTrue(endedBeforeReply, "release must not wait indefinitely for unsubscribe");
        assert.deepEqual(result, Exit.succeed("query result"));
        assert.deepEqual(warnings, ["Failed to unsubscribe Codex side query."]);
        yield* fixture.router.client.notify("initialized", undefined);
        yield* Deferred.await(fixture.mainReceived);
        assert.deepEqual(fixture.main, ["after release"]);
      }).pipe(Effect.scoped),
  );
});
