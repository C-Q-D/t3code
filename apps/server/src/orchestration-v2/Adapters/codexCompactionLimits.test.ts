/** Tests Codex compaction math and configuration-log isolation at their public boundaries. */
import { assert, describe, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Scope from "effect/Scope";
import { TestClock } from "effect/testing";
import * as CodexError from "effect-codex-app-server/errors";
import type { CodexAppServerProtocolLogEvent } from "effect-codex-app-server/protocol";

import {
  CodexCompactionLimits,
  codexAutoCompactThreshold,
  makeCodexConfigReadLogRedactor,
  prefetchCodexCompactionLimits,
} from "./codexCompactionLimits.ts";

const decodeCompactionLimits = Schema.decodeUnknownSync(CodexCompactionLimits);

describe("codexAutoCompactThreshold", () => {
  it.each([
    [
      "configured limit",
      { model_auto_compact_token_limit: 240000, model_context_window: 272000 },
      258400,
      240000,
    ],
    [
      "window cap",
      { model_auto_compact_token_limit: 300000, model_context_window: 272000 },
      258400,
      244800,
    ],
    ["inferred window", { model_auto_compact_token_limit: 250000 }, 258400, 244800],
    [
      "body scope",
      {
        model_auto_compact_token_limit: 240000,
        model_auto_compact_token_limit_scope: "body_after_prefix",
      },
      258400,
      undefined,
    ],
    ["null limit", { model_auto_compact_token_limit: null }, 258400, undefined],
    [
      "outside usable window",
      { model_auto_compact_token_limit: 300000, model_context_window: 400000 },
      258400,
      undefined,
    ],
    ["missing limits", undefined, 258400, undefined],
    ["fractional limit", { model_auto_compact_token_limit: 1.5 }, 258400, undefined],
    ["zero limit", { model_auto_compact_token_limit: 0 }, 258400, undefined],
    ["null usable window", { model_auto_compact_token_limit: 240000 }, null, undefined],
    ["fractional usable window", { model_auto_compact_token_limit: 240000 }, 258400.5, undefined],
    [
      "nonpositive result",
      { model_auto_compact_token_limit: 1, model_context_window: 1 },
      1,
      undefined,
    ],
  ] as const)("handles %s", (_name, limits, usableWindow, expected) => {
    assert.equal(codexAutoCompactThreshold(limits, usableWindow), expected);
  });

  it("decodes only compaction fields and ignores unrelated config", () => {
    assert.deepEqual(
      decodeCompactionLimits({
        model_auto_compact_token_limit: 240000,
        model_context_window: 272000,
        model_auto_compact_token_limit_scope: "total",
        unrelated_version_specific_config: { arbitrary: true },
      }),
      {
        model_auto_compact_token_limit: 240000,
        model_context_window: 272000,
        model_auto_compact_token_limit_scope: "total",
      },
    );
  });
});

describe("prefetchCodexCompactionLimits", () => {
  it.effect("caches each cwd once, including null, while a request is pending", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.Scope;
      const result = yield* Deferred.make<unknown>();
      const returned = yield* Deferred.make<void>();
      const cache = new Map<string | null, CodexCompactionLimits | null>();
      const requests: Array<unknown> = [];
      const client = {
        raw: {
          request: (method: string, params?: unknown) =>
            Effect.sync(() => {
              requests.push({ method, params });
            }).pipe(
              Effect.andThen(Deferred.await(result)),
              Effect.onExit(() => Deferred.succeed(returned, undefined)),
            ),
        },
      };
      yield* prefetchCodexCompactionLimits(client, cache, null, scope);
      yield* prefetchCodexCompactionLimits(client, cache, null, scope);
      assert.deepEqual(requests, [{ method: "config/read", params: {} }]);
      assert.strictEqual(cache.get(null), null);
      yield* Deferred.succeed(result, {
        config: { model_auto_compact_token_limit: 240000, irrelevant: true },
      });
      yield* Deferred.await(returned);
      yield* prefetchCodexCompactionLimits(client, cache, "/workspace", scope);
      assert.deepEqual(cache.get(null), { model_auto_compact_token_limit: 240000 });
      assert.deepEqual(cache.get("/workspace"), { model_auto_compact_token_limit: 240000 });
      assert.deepEqual(requests, [
        { method: "config/read", params: {} },
        { method: "config/read", params: { cwd: "/workspace" } },
      ]);
    }).pipe(Effect.scoped),
  );

  it.effect.each(["failure", "defect", "decode"] as const)(
    "retains a null cache entry after %s without retrying",
    (fault) =>
      Effect.gen(function* () {
        const scope = yield* Scope.Scope;
        const cache = new Map<string | null, CodexCompactionLimits | null>();
        let requests = 0;
        const client = {
          raw: {
            request: () =>
              Effect.sync(() => {
                requests++;
              }).pipe(
                Effect.andThen(
                  fault === "failure"
                    ? Effect.fail(
                        CodexError.CodexAppServerRequestError.methodNotFound("config/read"),
                      )
                    : fault === "defect"
                      ? Effect.die("config request defect")
                      : Effect.succeed({ config: { model_auto_compact_token_limit: "invalid" } }),
                ),
              ),
          },
        };
        yield* prefetchCodexCompactionLimits(client, cache, "/workspace", scope);
        yield* prefetchCodexCompactionLimits(client, cache, "/workspace", scope);
        assert.equal(requests, 1);
        assert.isTrue(cache.has("/workspace"));
        assert.strictEqual(cache.get("/workspace"), null);
      }).pipe(Effect.scoped),
  );

  it.effect("interrupts a pending config request at three seconds without retrying", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.Scope;
      const interrupted = yield* Deferred.make<void>();
      const cache = new Map<string | null, CodexCompactionLimits | null>();
      let requests = 0;
      const client = {
        raw: {
          request: () =>
            Effect.sync(() => {
              requests++;
            }).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
            ),
        },
      };
      yield* prefetchCodexCompactionLimits(client, cache, null, scope);
      assert.equal(requests, 1);
      yield* TestClock.adjust("3 seconds");
      yield* Deferred.await(interrupted);
      yield* prefetchCodexCompactionLimits(client, cache, null, scope);
      assert.equal(requests, 1);
      assert.strictEqual(cache.get(null), null);
    }).pipe(Effect.scoped),
  );
});

describe("makeCodexConfigReadLogRedactor", () => {
  it("replaces a matched config response and consumes its request id", () => {
    const redact = makeCodexConfigReadLogRedactor();
    const request: CodexAppServerProtocolLogEvent = {
      direction: "outgoing",
      stage: "decoded",
      payload: { id: 7, method: "config/read" },
    };
    const response: CodexAppServerProtocolLogEvent = {
      direction: "incoming",
      stage: "decoded",
      payload: { id: "7", result: { config: { model_auto_compact_token_limit: 240000 } } },
    };
    assert.strictEqual(redact(request), request);
    assert.deepEqual(redact(response), {
      ...response,
      payload: { id: "7", result: { redacted: true } },
    });
    assert.strictEqual(redact(response), response);
  });

  it("preserves a matched error response by reference and consumes its request id", () => {
    const redact = makeCodexConfigReadLogRedactor();
    const request: CodexAppServerProtocolLogEvent = {
      direction: "outgoing",
      stage: "decoded",
      payload: { id: 7, method: "config/read" },
    };
    const errorResponse: CodexAppServerProtocolLogEvent = {
      direction: "incoming",
      stage: "decoded",
      payload: { id: 7, error: { code: -32601, message: "Method not found" } },
    };
    const laterResponse: CodexAppServerProtocolLogEvent = {
      direction: "incoming",
      stage: "decoded",
      payload: { id: 7, result: { config: { model_auto_compact_token_limit: 240000 } } },
    };
    assert.strictEqual(redact(request), request);
    const redactedError = redact(errorResponse);
    assert.strictEqual(redactedError, errorResponse);
    assert.notProperty(redactedError.payload, "result");
    assert.strictEqual(redact(laterResponse), laterResponse);
  });

  it("preserves other responses, notifications and unmatched ids by reference", () => {
    const redact = makeCodexConfigReadLogRedactor();
    const request: CodexAppServerProtocolLogEvent = {
      direction: "outgoing",
      stage: "decoded",
      payload: { id: 8, method: "thread/read" },
    };
    const response: CodexAppServerProtocolLogEvent = {
      direction: "incoming",
      stage: "decoded",
      payload: { id: 8, result: { thread: {} } },
    };
    const notification: CodexAppServerProtocolLogEvent = {
      direction: "incoming",
      stage: "decoded",
      payload: { method: "thread/started", params: {} },
    };
    const unmatched: CodexAppServerProtocolLogEvent = {
      direction: "incoming",
      stage: "decoded",
      payload: { id: 9, result: { config: {} } },
    };
    assert.strictEqual(redact(request), request);
    assert.strictEqual(redact(response), response);
    assert.strictEqual(redact(notification), notification);
    assert.strictEqual(redact(unmatched), unmatched);
  });
});
