/** Tests CLI limit validation and bounded reads without starting a Claude process. */
import type { SDKControlGetContextUsageResponse } from "@anthropic-ai/claude-agent-sdk";
import { assert, describe, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";

import { ClaudeAgentSdkQueryRunnerError } from "./ClaudeAdapterV2.ts";
import { claudeContextLimitsFromUsage, readClaudeContextLimits } from "./claudeContextLimits.ts";

const contextUsage = {
  maxTokens: 378_000,
  rawMaxTokens: 1_000_000,
  autoCompactThreshold: 345_000,
  isAutoCompactEnabled: true,
  totalTokens: 0,
  percentage: 0,
  model: "claude-opus-5-5",
  categories: [],
  gridRows: [],
  memoryFiles: [],
  mcpTools: [],
  agents: [],
  apiUsage: null,
} satisfies SDKControlGetContextUsageResponse;

describe("claudeContextLimitsFromUsage", () => {
  it("keeps the effective CLI window and enabled compaction threshold", () => {
    assert.deepEqual(claudeContextLimitsFromUsage(contextUsage), {
      maxTokens: 378_000,
      autoCompactThreshold: 345_000,
    });
  });

  it("omits the threshold when automatic compaction is disabled", () => {
    assert.deepEqual(
      claudeContextLimitsFromUsage({ ...contextUsage, isAutoCompactEnabled: false }),
      { maxTokens: 378_000 },
    );
  });

  it("omits a missing threshold", () => {
    assert.deepEqual(
      claudeContextLimitsFromUsage({ maxTokens: 378_000, isAutoCompactEnabled: true }),
      { maxTokens: 378_000 },
    );
  });

  it.each([0, -1, 378_000.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid window: %s",
    (maxTokens) => {
      assert.isNull(claudeContextLimitsFromUsage({ ...contextUsage, maxTokens }));
    },
  );

  it.each([378_000, 400_000, 0, -1, 345_000.5])(
    "omits an invalid threshold: %s",
    (autoCompactThreshold) => {
      assert.deepEqual(claudeContextLimitsFromUsage({ ...contextUsage, autoCompactThreshold }), {
        maxTokens: 378_000,
      });
    },
  );
});

describe("readClaudeContextLimits", () => {
  it.effect("returns null when the runner has no context usage method", () =>
    Effect.gen(function* () {
      assert.isNull(yield* readClaudeContextLimits({}));
    }),
  );

  it.effect("returns null when the SDK request fails", () =>
    Effect.gen(function* () {
      const limits = yield* readClaudeContextLimits({
        getContextUsage: () =>
          Effect.fail(
            new ClaudeAgentSdkQueryRunnerError({ method: "getContextUsage", cause: "failed" }),
          ),
      });
      assert.isNull(limits);
    }),
  );

  it.effect("reads summary usage and returns validated limits", () =>
    Effect.gen(function* () {
      const limits = yield* readClaudeContextLimits({
        getContextUsage: (options) => {
          assert.deepEqual(options, { detail: "summary" });
          return Effect.succeed(contextUsage);
        },
      });
      assert.deepEqual(limits, { maxTokens: 378_000, autoCompactThreshold: 345_000 });
    }),
  );

  it.effect("returns null when the response has an invalid window", () =>
    Effect.gen(function* () {
      assert.isNull(
        yield* readClaudeContextLimits({
          getContextUsage: () => Effect.succeed({ ...contextUsage, maxTokens: 0 }),
        }),
      );
    }),
  );

  it.effect("returns null when the request throws a defect", () =>
    Effect.gen(function* () {
      assert.isNull(
        yield* readClaudeContextLimits({ getContextUsage: () => Effect.die("request defect") }),
      );
    }),
  );

  it.effect("returns null after a three-second request deadline", () =>
    Effect.gen(function* () {
      const requested = yield* Deferred.make<void>();
      const finished = yield* Deferred.make<void>();
      const reader = yield* readClaudeContextLimits({
        getContextUsage: () =>
          Deferred.succeed(requested, undefined).pipe(Effect.andThen(Effect.never)),
      }).pipe(
        Effect.tap(() => Deferred.succeed(finished, undefined)),
        Effect.forkScoped,
      );
      yield* Deferred.await(requested);
      yield* TestClock.adjust("3 seconds");
      assert.isTrue(yield* Deferred.isDone(finished), "the deadline did not complete the read");
      assert.isNull(yield* Fiber.join(reader));
    }),
  );
});
