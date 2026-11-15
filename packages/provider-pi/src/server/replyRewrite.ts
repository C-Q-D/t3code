import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
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
  },
) {
  override get message(): string {
    return `Pi reply rewrite failed (${this.code}).`;
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

export const makePiReplyRewriteRunner = Effect.fn("makePiReplyRewriteRunner")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const environment = yield* HostProcess.Environment;
  const executable = yield* HostProcess.ExecutablePath;
  const workingDirectory = yield* HostProcess.WorkingDirectory;

  const execute = Effect.fn("PiReplyRewrite.execute")(function* (
    input: PiReplyRewriteInput,
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

    const cwd = yield* fs
      .makeTempDirectoryScoped({ prefix: "t3-pi-rewrite-" })
      .pipe(Effect.mapError((cause) => new PiReplyRewriteError({ code: "configuration", cause })));
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
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
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

  const run = Effect.fn("PiReplyRewrite.run")(
    (input: PiReplyRewriteInput) => execute(input).pipe(Effect.scoped),
    (effect, input) =>
      effect.pipe(
        Effect.timeoutOrElse({
          duration:
            Number.isSafeInteger(input.timeoutMs) && input.timeoutMs > 0 ? input.timeoutMs : 1,
          orElse: () => Effect.fail(new PiReplyRewriteError({ code: "timeout" })),
        }),
      ),
  );
  return { run };
});
