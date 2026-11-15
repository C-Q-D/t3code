import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as HostProcess from "@t3tools/shared/HostProcess";

import { makePiRpcConnection, piRecordField, piRecordNumber, piRecordString } from "./rpc.ts";
import { PI_REPLY_REWRITE_EXTENSION_SOURCE } from "./replyRewriteExtensionSource.ts";

const REWRITE_SETTINGS = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))({
  compaction: { enabled: false },
  retry: { enabled: false, provider: { maxRetries: 0 } },
});

export interface PiReplyRewriteInput {
  readonly requestId: string;
  readonly sourceText: string;
  readonly systemPrompt: string;
  readonly binaryPath: string;
  readonly provider: string;
  readonly modelId: string;
  readonly thinkingLevel: string;
  readonly requestedServiceTier: "priority" | "default";
  readonly timeoutMs: number;
}

export class PiReplyRewriteError extends Schema.TaggedError<PiReplyRewriteError>()(
  "PiReplyRewriteError",
  {
    code: Schema.Literals([
      "configuration",
      "protocol",
      "provider",
      "empty_output",
      "truncated",
      "timeout",
    ]),
    cause: Schema.optional(Schema.Defect()),
    cleanupPending: Schema.optional(Schema.Boolean),
    detail: Schema.optional(Schema.String),
  },
) {
  override get message(): string {
    return `Pi reply rewrite failed (${this.code})${this.detail ? `: ${this.detail}` : "."}${
      this.cleanupPending ? " Resource cleanup is still pending." : ""
    }`;
  }
}

export interface PiReplyRewriteOutput {
  readonly text: string;
  readonly model: string;
  readonly requestedServiceTier: "priority" | "default";
  readonly actualServiceTier: string | null;
  readonly usage: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly totalTokens?: number;
  } | null;
}

function tokenCount(value: unknown, key: string): number | undefined {
  const count = piRecordNumber(value, key);
  return count !== undefined && Number.isSafeInteger(count) && count >= 0 ? count : undefined;
}

function readUsage(value: unknown, normalized: boolean): PiReplyRewriteOutput["usage"] {
  const input = tokenCount(value, normalized ? "inputTokens" : "input");
  // Pi separates cached input, while Responses reports it inside input_tokens.
  const combinedInput =
    input === undefined
      ? undefined
      : input +
        (normalized
          ? 0
          : (tokenCount(value, "cacheRead") ?? 0) + (tokenCount(value, "cacheWrite") ?? 0));
  const inputTokens =
    combinedInput !== undefined && Number.isSafeInteger(combinedInput) ? combinedInput : undefined;
  const outputTokens = tokenCount(value, normalized ? "outputTokens" : "output");
  const totalTokens = tokenCount(value, "totalTokens");
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined)
    return null;
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
  };
}

function safeLabel(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9._:/-]{1,200}$/.test(value) ? value : null;
}

interface RewriteResources {
  readonly requestId: string;
  readonly processes: Map<number, ChildProcessSpawner.ChildProcessHandle>;
  readonly finished: Deferred.Deferred<void>;
  readonly result: Deferred.Deferred<PiReplyRewriteOutput, PiReplyRewriteError>;
  directory: string | null;
  phase: "running" | "cleanup" | "cleanup_failed";
  worker: Fiber.Fiber<void> | undefined;
}

const SHUTDOWN_WAIT_MS = 1_000;
const CLEANUP_RETRY_MS = 1_000;

// Construct once in the server service scope; one request or pending cleanup occupies the instance.
export const makePiReplyRewriteRunner = Effect.fn("makePiReplyRewriteRunner")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const environment = yield* HostProcess.Environment;
  const executable = yield* HostProcess.ExecutablePath;
  const workingDirectory = yield* HostProcess.WorkingDirectory;
  let active: RewriteResources | undefined;
  let closed = false;
  let shutdownWarned = false;

  const getState = Effect.sync(() => ({
    closed,
    active:
      active === undefined
        ? null
        : {
            requestId: active.requestId,
            directory: active.directory,
            pids: [...active.processes.keys()],
            phase: active.phase,
          },
  }));

  // Signalling must not join a worker that is inside an OS finalizer.
  const stop = (resources: RewriteResources) =>
    Effect.sync(() => {
      if (resources.phase === "running") resources.phase = "cleanup";
      resources.worker?.interruptUnsafe();
    });

  const execute = Effect.fn("PiReplyRewrite.execute")(function* (
    input: PiReplyRewriteInput,
    resources: RewriteResources,
  ): Effect.fn.Return<PiReplyRewriteOutput, PiReplyRewriteError, Scope.Scope> {
    const provider = input.provider || "openai-codex";
    const modelId = input.modelId || "gpt-6.1-terra";
    const thinkingLevel = input.thinkingLevel || "max";
    if (
      !input.requestId ||
      typeof input.sourceText !== "string" ||
      !input.sourceText.length ||
      !input.systemPrompt ||
      !safeLabel(provider) ||
      !safeLabel(modelId) ||
      !["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(thinkingLevel) ||
      !["priority", "default"].includes(input.requestedServiceTier) ||
      !Number.isSafeInteger(input.timeoutMs) ||
      input.timeoutMs <= 0 ||
      input.timeoutMs > 2_147_483_647
    ) {
      return yield* new PiReplyRewriteError({ code: "configuration" });
    }

    const cwd = yield* fs.makeTempDirectoryScoped({ prefix: "t3-pi-rewrite-" }).pipe(
      Effect.tap((directory) =>
        Effect.sync(() => {
          resources.directory = directory;
        }),
      ),
      Effect.mapError((cause) => new PiReplyRewriteError({ code: "configuration", cause })),
    );
    const extensionPath = path.join(cwd, "reply-rewrite-extension.mjs");
    const systemPromptPath = path.join(cwd, "system-prompt.txt");
    const appendPromptPath = path.join(cwd, "append-system-prompt.txt");
    yield* Effect.gen(function* () {
      yield* fs.makeDirectory(path.join(cwd, ".pi"));
      // RPC retry setters persist globally; project settings isolate both retry layers instead.
      yield* fs.writeFileString(path.join(cwd, ".pi", "settings.json"), REWRITE_SETTINGS);
      yield* fs.writeFileString(extensionPath, PI_REPLY_REWRITE_EXTENSION_SOURCE);
      yield* fs.writeFileString(systemPromptPath, input.systemPrompt);
      yield* fs.writeFileString(appendPromptPath, "");
    }).pipe(Effect.mapError((cause) => new PiReplyRewriteError({ code: "configuration", cause })));

    const binary = input.binaryPath || "pi";
    const resolvedBinary =
      binary.includes("/") || binary.includes("\\")
        ? path.resolve(workingDirectory, binary)
        : binary;
    const isNodeEntry = /\.[cm]?js$/i.test(resolvedBinary);
    const env: NodeJS.ProcessEnv = {
      ...environment,
      T3_PI_REPLY_REWRITE_TIER: input.requestedServiceTier,
    };
    delete env["T3_MCP_URL"];
    delete env["T3_MCP_BEARER_TOKEN"];
    delete env["T3_PI_MCP_EXTENSION_PATH"];
    delete env["T3_PI_RUNTIME_MODE"];
    const connection = yield* makePiRpcConnection({
      command: isNodeEntry ? executable : resolvedBinary,
      args: [
        ...(isNodeEntry ? [resolvedBinary] : []),
        "--mode",
        "rpc",
        "--no-session",
        "--no-extensions",
        "--no-mcp",
        "--no-tools",
        "--no-skills",
        "--no-context-files",
        "--no-prompt-templates",
        "--offline",
        // Session-only trust applies to the runner-owned cwd, including its retry settings.
        "--approve",
        "--system-prompt",
        systemPromptPath,
        "--append-system-prompt",
        appendPromptPath,
        "--extension",
        extensionPath,
      ],
      cwd,
      env,
    }).pipe(
      Effect.provideService(
        ChildProcessSpawner.ChildProcessSpawner,
        ChildProcessSpawner.make((command) =>
          spawner.spawn(command).pipe(
            Effect.tap((child) =>
              Effect.sync(() => {
                resources.processes.set(Number(child.pid), child);
              }),
            ),
          ),
        ),
      ),
      Effect.mapError((cause) => new PiReplyRewriteError({ code: "configuration", cause })),
    );

    yield* connection
      .request({ type: "set_model", provider, modelId }, input.timeoutMs)
      .pipe(Effect.mapError((cause) => new PiReplyRewriteError({ code: "configuration", cause })));
    yield* connection
      .request({ type: "set_thinking_level", level: thinkingLevel }, input.timeoutMs)
      .pipe(Effect.mapError((cause) => new PiReplyRewriteError({ code: "configuration", cause })));
    const state = yield* connection
      .request({ type: "get_state" }, input.timeoutMs)
      .pipe(Effect.mapError((cause) => new PiReplyRewriteError({ code: "configuration", cause })));
    const model = piRecordField(state, "model");
    if (
      piRecordString(model, "provider") !== provider ||
      piRecordString(model, "id") !== modelId ||
      piRecordString(state, "thinkingLevel") !== thinkingLevel ||
      piRecordField(state, "autoCompactionEnabled") !== false ||
      piRecordField(state, "isStreaming") !== false ||
      piRecordNumber(state, "pendingMessageCount") !== 0
    ) {
      return yield* new PiReplyRewriteError({ code: "configuration" });
    }

    // A handshake proves the explicit extension loaded despite --no-extensions.
    let ready = false;
    while (!ready) {
      const event = yield* Queue.take(connection.events).pipe(
        Effect.mapError((cause) => new PiReplyRewriteError({ code: "protocol", cause })),
      );
      if (event["type"] === "extension_error")
        return yield* new PiReplyRewriteError({ code: "configuration" });
      ready =
        event["type"] === "t3_reply_rewrite" && event["kind"] === "ready" && event["version"] === 1;
    }

    yield* connection
      .request({ type: "prompt", message: input.sourceText }, input.timeoutMs)
      .pipe(Effect.mapError((cause) => new PiReplyRewriteError({ code: "provider", cause })));
    let text: string | undefined;
    let outputModel = `${provider}/${modelId}`;
    let actualServiceTier: string | null = null;
    let usage: PiReplyRewriteOutput["usage"] = null;
    let providerUsage: PiReplyRewriteOutput["usage"] = null;
    let requestCount = 0;
    while (true) {
      const event = yield* Queue.take(connection.events).pipe(
        Effect.mapError((cause) => new PiReplyRewriteError({ code: "protocol", cause })),
      );
      const type = event["type"];
      if (
        type === "extension_error" ||
        type === "auto_retry_start" ||
        type === "auto_compaction_start"
      ) {
        return yield* new PiReplyRewriteError({ code: "protocol" });
      }
      if (type === "tool_execution_start" || type === "tool_execution_end") {
        return yield* new PiReplyRewriteError({ code: "provider" });
      }
      if (type === "t3_reply_rewrite" && event["kind"] === "request") {
        requestCount++;
        if (requestCount > 1) return yield* new PiReplyRewriteError({ code: "protocol" });
      }
      if (type === "t3_reply_rewrite" && event["kind"] === "response") {
        if (event["status"] === "response.incomplete")
          return yield* new PiReplyRewriteError({ code: "truncated" });
        if (event["status"] === "response.failed")
          return yield* new PiReplyRewriteError({ code: "provider" });
        if (event["status"] !== "response.completed")
          return yield* new PiReplyRewriteError({ code: "protocol" });
        outputModel = safeLabel(event["model"]) ?? outputModel;
        actualServiceTier = safeLabel(event["actualServiceTier"]);
        providerUsage = readUsage(event["usage"], true);
      }
      if (type === "message_end") {
        const message = event["message"];
        const role = piRecordString(message, "role");
        if (role === "toolResult") return yield* new PiReplyRewriteError({ code: "provider" });
        if (role !== "assistant") continue;
        const stopReason = piRecordString(message, "stopReason");
        if (stopReason === "length") return yield* new PiReplyRewriteError({ code: "truncated" });
        if (stopReason === "error" || stopReason === "aborted" || stopReason === "toolUse") {
          return yield* new PiReplyRewriteError({ code: "provider" });
        }
        const content = piRecordField(message, "content");
        if (stopReason !== "stop" || !Array.isArray(content) || text !== undefined) {
          return yield* new PiReplyRewriteError({ code: "protocol" });
        }
        const parts: string[] = [];
        for (const part of content) {
          const partType = piRecordString(part, "type");
          if (partType === "thinking") continue;
          const partText = piRecordString(part, "text");
          if (partType !== "text" || partText === undefined)
            return yield* new PiReplyRewriteError({ code: "protocol" });
          parts.push(partText);
        }
        text = parts.join("");
        usage = readUsage(piRecordField(message, "usage"), false);
      }
      if (type === "agent_settled") break;
    }
    if (requestCount !== 1 || text === undefined)
      return yield* new PiReplyRewriteError({ code: "protocol" });
    if (!text.trim()) return yield* new PiReplyRewriteError({ code: "empty_output" });
    return {
      text,
      model: outputModel,
      requestedServiceTier: input.requestedServiceTier,
      actualServiceTier,
      usage: providerUsage ?? usage,
    };
  });

  const release = Effect.fn("PiReplyRewrite.release")(function* (resources: RewriteResources) {
    let warned = false;
    while (true) {
      const checked = yield* Effect.gen(function* () {
        for (const [pid, child] of resources.processes) {
          if (yield* child.isRunning) yield* child.kill({ killSignal: "SIGKILL" });
          if (!(yield* child.isRunning)) resources.processes.delete(pid);
        }
        if (resources.processes.size !== 0) return false;
        if (resources.directory !== null) {
          if (yield* fs.exists(resources.directory))
            yield* fs.remove(resources.directory, { recursive: true, force: true });
          if (yield* fs.exists(resources.directory)) return false;
        }
        return true;
      }).pipe(Effect.catchCause(() => Effect.succeed(false)));
      if (checked) return;
      resources.phase = "cleanup_failed";
      if (!warned) {
        warned = true;
        yield* Effect.logWarning("Pi reply rewrite cleanup remains pending", {
          requestId: resources.requestId,
          directory: resources.directory,
          pids: [...resources.processes.keys()],
        });
      }
      yield* Effect.sleep(CLEANUP_RETRY_MS);
    }
  });

  const run = Effect.fn("PiReplyRewrite.run")((input: PiReplyRewriteInput) =>
    Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const resources: RewriteResources = {
          requestId: input.requestId,
          processes: new Map(),
          directory: null,
          phase: "running",
          worker: undefined,
          finished: yield* Deferred.make<void>(),
          result: yield* Deferred.make<PiReplyRewriteOutput, PiReplyRewriteError>(),
        };
        if (closed || active !== undefined) {
          return yield* new PiReplyRewriteError({
            code: "configuration",
            cleanupPending: active !== undefined && active.phase !== "running",
            detail: closed
              ? "Runner is closed."
              : active?.phase === "running"
                ? "Runner already has an active request."
                : "Previous request resources are still being cleaned up.",
          });
        }
        active = resources;
        const timeoutMs =
          Number.isSafeInteger(input.timeoutMs) &&
          input.timeoutMs > 0 &&
          input.timeoutMs <= 2_147_483_647
            ? input.timeoutMs
            : 1;
        const cleanupBudgetMs = Math.min(1_000, Math.max(1, Math.ceil(timeoutMs / 10)));
        // The instance owns this single worker; its service finalizer only waits a bounded time.
        resources.worker = yield* Effect.uninterruptibleMask((restoreWorker) =>
          Effect.gen(function* () {
            const requestScope = yield* Scope.make();
            const outcome = yield* restoreWorker(
              execute(input, resources).pipe(
                Effect.provideService(Scope.Scope, requestScope),
                Effect.timeoutOrElse({
                  duration: Math.max(1, timeoutMs - cleanupBudgetMs),
                  orElse: () => Effect.fail(new PiReplyRewriteError({ code: "timeout" })),
                }),
              ),
            ).pipe(Effect.exit);
            resources.phase = "cleanup";
            yield* Scope.close(requestScope, outcome).pipe(Effect.exit);
            yield* release(resources);
            active = undefined;
            yield* Deferred.done(resources.result, outcome);
            yield* Deferred.succeed(resources.finished, undefined);
          }),
        ).pipe(Effect.forkDetach({ startImmediately: false, uninterruptible: false }));
        return yield* restore(
          Deferred.await(resources.result).pipe(
            Effect.timeoutOrElse({
              duration: timeoutMs,
              orElse: () =>
                stop(resources).pipe(
                  Effect.andThen(
                    Effect.fail(
                      new PiReplyRewriteError({
                        code: "timeout",
                        cleanupPending: active === resources,
                      }),
                    ),
                  ),
                ),
            }),
          ),
        ).pipe(Effect.onInterrupt(() => stop(resources)));
      }),
    ),
  );

  // Waits for the current owned cleanup; callers can stop waiting without stopping that cleanup.
  const awaitIdle = Effect.suspend(() =>
    active === undefined ? Effect.void : Deferred.await(active.finished),
  );

  // Shutdown stops admission permanently and waits at most one second; the worker keeps ownership.
  const shutdown = Effect.fn("PiReplyRewrite.shutdown")(function* () {
    closed = true;
    const resources = active;
    if (resources !== undefined) {
      yield* Deferred.fail(
        resources.result,
        new PiReplyRewriteError({
          code: "configuration",
          cleanupPending: true,
          detail: "Runner is closed.",
        }),
      );
      yield* stop(resources);
      yield* Deferred.await(resources.finished).pipe(
        Effect.timeoutOption(SHUTDOWN_WAIT_MS),
        Effect.interruptible,
      );
    }
    const state = yield* getState;
    if (state.active !== null && !shutdownWarned) {
      shutdownWarned = true;
      yield* Effect.logWarning(
        "Pi reply rewrite runner closed with unreleased resources",
        state.active,
      );
    }
    return state;
  });
  yield* Effect.addFinalizer(() => shutdown().pipe(Effect.asVoid));
  return { run, getState, awaitIdle, shutdown };
});
