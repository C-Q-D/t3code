/** Exercises side-query routing with real client decoding and fake app-server frames. */
import { assert, describe, it } from "@effect/vitest";
import * as CodexClient from "effect-codex-app-server/client";
import * as CodexReplay from "effect-codex-app-server/replay";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as CodexSideQuery from "./CodexSideQuery.ts";

const requests = [
  {
    method: "item/commandExecution/requestApproval",
    params: { threadId: "side", turnId: "turn", itemId: "command" },
    result: { decision: "decline" },
  },
  {
    method: "item/fileChange/requestApproval",
    params: { threadId: "side", turnId: "turn", itemId: "patch" },
    result: { decision: "decline" },
  },
  {
    method: "item/permissions/requestApproval",
    params: {
      threadId: "side",
      turnId: "turn",
      itemId: "permissions",
      cwd: "/project",
      startedAtMs: 0,
      permissions: { network: { enabled: true } },
    },
    result: { permissions: {}, scope: "turn" },
  },
  {
    method: "mcpServer/elicitation/request",
    params: {
      threadId: "side",
      serverName: "external",
      message: "authorize",
      mode: "url",
      url: "https://example.invalid",
      elicitationId: "e",
    },
    result: { action: "decline" },
  },
  {
    method: "execCommandApproval",
    params: {
      conversationId: "side",
      callId: "exec",
      command: ["write"],
      cwd: "/project",
      parsedCmd: [],
    },
    result: { decision: "abort" },
  },
  {
    method: "applyPatchApproval",
    params: { conversationId: "side", callId: "patch", fileChanges: {} },
    result: { decision: "abort" },
  },
  {
    method: "item/tool/requestUserInput",
    params: { threadId: "side", turnId: "turn", itemId: "input", questions: [] },
    result: { answers: {} },
  },
] as const;

describe("Codex side-query routing", () => {
  it.effect(
    "delivers account rate limits to the main handler while a side query is registered",
    () =>
      Effect.gen(function* () {
        const finished = yield* Deferred.make<void>();
        const received: Array<unknown> = [];
        const side: Array<string> = [];
        const transport = yield* Effect.service(CodexClient.CodexAppServerClient);
        const router = CodexSideQuery.make(transport);
        router.register("side", (method) =>
          Effect.sync(() => {
            side.push(method);
          }),
        );
        yield* router.client.handleServerNotification("account/rateLimits/updated", (payload) =>
          Effect.sync(() => {
            received.push(payload);
          }),
        );
        yield* router.client.handleServerNotification("item/agentMessage/delta", () =>
          Deferred.succeed(finished, undefined).pipe(Effect.asVoid),
        );
        yield* router.client.notify("initialized", undefined);
        yield* Deferred.await(finished);
        assert.deepEqual(side, ["item/agentMessage/delta"]);
        assert.deepEqual(received, [{ rateLimits: { limitId: "codex" } }]);
      }).pipe(
        Effect.scoped,
        Effect.provide(
          CodexReplay.layerReplay({
            provider: "codex",
            protocol: "codex.app-server",
            version: "0.164.0",
            scenario: "side-account-notifications",
            entries: [
              { type: "expect_outbound", frame: { method: "initialized" } },
              {
                type: "emit_inbound",
                frame: {
                  method: "item/agentMessage/delta",
                  params: { threadId: "side", turnId: "turn", itemId: "m", delta: "hidden" },
                },
              },
              {
                type: "emit_inbound",
                frame: {
                  method: "account/rateLimits/updated",
                  params: { rateLimits: { limitId: "codex" } },
                },
              },
              {
                type: "emit_inbound",
                frame: {
                  method: "item/agentMessage/delta",
                  params: { threadId: "main", turnId: "main-turn", itemId: "done", delta: "done" },
                },
              },
            ],
          }),
        ),
      ),
  );

  it.effect("refuses all seven request protocols without invoking main approval handlers", () =>
    Effect.gen(function* () {
      const finished = yield* Deferred.make<void>();
      const mainRequests: Array<string> = [];
      const entries: Array<CodexReplay.CodexAppServerReplayEntry> = [
        { type: "expect_outbound", frame: { method: "initialized" } },
        ...requests.flatMap((request, index): Array<CodexReplay.CodexAppServerReplayEntry> => [
          {
            type: "emit_inbound",
            frame: { id: index + 100, method: request.method, params: request.params },
          },
          { type: "expect_outbound", frame: { id: index + 100, result: request.result } },
        ]),
        {
          type: "emit_inbound",
          frame: {
            method: "item/agentMessage/delta",
            params: { threadId: "main", turnId: "main-turn", itemId: "done", delta: "done" },
          },
        },
      ];
      const driver = yield* CodexReplay.makeReplayDriver({
        provider: "codex",
        protocol: "codex.app-server",
        version: "0.164.0",
        scenario: "side-refusals",
        entries,
      });
      const context = yield* Layer.build(CodexReplay.layerReplayWithDriver(driver));
      const transport = yield* Effect.service(CodexClient.CodexAppServerClient).pipe(
        Effect.provide(context),
      );
      const router = CodexSideQuery.make(transport);
      router.register("side", () => Effect.void);
      for (const request of requests) {
        yield* router.client.handleServerRequest(request.method, () =>
          Effect.sync(() => {
            mainRequests.push(request.method);
          }).pipe(
            Effect.andThen(Deferred.succeed(finished, undefined)),
            Effect.andThen(Effect.die("side request reached main approval handler")),
          ),
        );
      }
      yield* router.client.handleServerNotification("item/agentMessage/delta", () =>
        Deferred.succeed(finished, undefined).pipe(Effect.asVoid),
      );
      yield* router.client.notify("initialized", undefined);
      yield* Deferred.await(finished);
      assert.deepEqual(mainRequests, []);
      assert.equal((yield* Ref.get(driver.state)).failure, null);
      assert.equal((yield* Ref.get(driver.state)).cursor, entries.length);
    }).pipe(Effect.scoped),
  );

  it.effect(
    "diverts notifications by thread and turn before main handlers, then removes both registrations",
    () =>
      Effect.gen(function* () {
        const finished = yield* Deferred.make<void>();
        const side: Array<string> = [];
        const main: Array<string> = [];
        const transport = yield* Effect.service(CodexClient.CodexAppServerClient);
        const router = CodexSideQuery.make(transport);
        router.register("side", (method) =>
          Effect.sync(() => {
            side.push(method);
          }),
        );
        yield* router.client.handleServerNotification("item/agentMessage/delta", (payload) =>
          Effect.sync(() => {
            main.push(payload.delta);
          }),
        );
        yield* router.client.handleUnknownServerNotification((method) =>
          Effect.sync(() => {
            main.push(method);
          }).pipe(Effect.andThen(Deferred.succeed(finished, undefined)), Effect.asVoid),
        );
        yield* router.client.handleServerNotification("thread/closed", () =>
          Effect.sync(() => router.remove("side")),
        );
        // The collector removes its own registration at the last side notification.
        router.register("side", (method) =>
          Effect.sync(() => {
            side.push(method);
            if (method === "thread/closed") router.remove("side");
          }),
        );
        yield* router.client.notify("initialized", undefined);
        yield* Deferred.await(finished);
        assert.deepEqual(side, ["item/agentMessage/delta", "side/turn-only", "thread/closed"]);
        assert.deepEqual(main, ["after", "side/turn-only"]);
      }).pipe(
        Effect.scoped,
        Effect.provide(
          CodexReplay.layerReplay({
            provider: "codex",
            protocol: "codex.app-server",
            version: "0.164.0",
            scenario: "side-notifications",
            entries: [
              { type: "expect_outbound", frame: { method: "initialized" } },
              {
                type: "emit_inbound",
                frame: {
                  method: "item/agentMessage/delta",
                  params: { threadId: "side", turnId: "turn", itemId: "m", delta: "hidden" },
                },
              },
              {
                type: "emit_inbound",
                frame: { method: "side/turn-only", params: { turnId: "turn" } },
              },
              {
                type: "emit_inbound",
                frame: { method: "thread/closed", params: { threadId: "side" } },
              },
              {
                type: "emit_inbound",
                frame: {
                  method: "item/agentMessage/delta",
                  params: { threadId: "side", turnId: "turn", itemId: "m", delta: "after" },
                },
              },
              {
                type: "emit_inbound",
                frame: { method: "side/turn-only", params: { turnId: "turn" } },
              },
            ],
          }),
        ),
      ),
  );
});
