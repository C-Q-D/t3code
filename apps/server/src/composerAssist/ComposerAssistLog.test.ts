/** Verifies the real local diagnostic file, independent of provider and database state. */
import * as NodeServices from "@effect/platform-node/NodeServices";
import { it, assert } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as ServerConfig from "../config.ts";
import * as ComposerAssistLog from "./ComposerAssistLog.ts";

it.effect("writes two complete metadata records without draft or suggestion bodies", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const stateDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-composer-assist-" });
    const record: ComposerAssistLog.ComposerAssistLogRecord = {
      ts: "2026-10-23T10:00:00.000Z",
      feature: "suggestion",
      requestId: "request-1",
      threadId: "thread-1",
      runId: "run-1",
      driver: "codex",
      instanceId: "codex-1",
      requestedModel: "model-1",
      actualModel: "model-1",
      outcome: "suggested",
      reason: null,
      promptVersion: "s1",
      usage: { inputTokens: 46230, cachedInputTokens: 45233, outputTokens: 9 },
      uncachedInputTokens: 997,
      cacheColdSuspected: false,
      cacheMaybeExpired: false,
      toolAttempted: false,
      attemptedTools: [],
      stop: "completed",
      latencyMs: 4800,
      chars: 13,
    };
    yield* Effect.gen(function* () {
      const log = yield* ComposerAssistLog.ComposerAssistLog;
      yield* log.write(record);
      yield* log.write({
        ...record,
        requestId: "request-2",
        outcome: "suppressed",
        reason: "inflight",
      });
    }).pipe(
      Effect.provide(
        ComposerAssistLog.layer.pipe(Layer.provide(ServerConfig.layerTest(stateDir, stateDir))),
      ),
    );
    const content = yield* fs.readFileString(
      path.join(stateDir, "userdata", "logs", "composer-assist.ndjson"),
    );
    assert.deepStrictEqual(
      content
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
      [record, { ...record, requestId: "request-2", outcome: "suppressed", reason: "inflight" }],
    );
    assert.isFalse(content.includes('"text"'));
    assert.isFalse(content.includes('"draft"'));
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
);
