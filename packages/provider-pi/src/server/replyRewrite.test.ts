import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Queue from "effect/Queue";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as HostProcess from "@t3tools/shared/HostProcess";

import { makePiReplyRewriteRunner, type PiReplyRewriteInput } from "./replyRewrite.ts";

const input: PiReplyRewriteInput = {
  requestId: "rewrite-1",
  sourceText: "  原文\r\n\u2028末尾  ",
  systemPrompt: "Keep all facts.",
  binaryPath: "pi",
  provider: "openai-codex",
  modelId: "gpt-6.1-terra",
  thinkingLevel: "max",
  requestedServiceTier: "priority",
  timeoutMs: 10_000,
};

const assistant = {
  type: "message_end",
  message: {
    role: "assistant",
    provider: "openai-codex",
    model: "gpt-6.1-terra",
    stopReason: "stop",
    content: [
      { type: "thinking", thinking: "not visible" },
      { type: "text", text: " 改写\n" },
      { type: "text", text: "完整 " },
    ],
    usage: { input: 10, output: 5, totalTokens: 15 },
  },
};

const makeFakePi = Effect.fn("test.makeRewritePi")(function* (
  options: {
    readonly failCommand?: string;
    readonly state?: Record<string, unknown>;
    readonly events?: ReadonlyArray<Record<string, unknown>>;
    readonly holdCommand?: string;
  } = {},
) {
  const stdout = yield* Queue.unbounded<Uint8Array, Cause.Done>();
  const received: Array<Record<string, unknown>> = [];
  const commands: ChildProcess.StandardCommand[] = [];
  const held = yield* Deferred.make<void>();
  const fs = yield* FileSystem.FileSystem;
  const settings: string[] = [];
  const extensions: string[] = [];
  const emit = (record: Record<string, unknown>) =>
    Queue.offer(stdout, new TextEncoder().encode(`${JSON.stringify(record)}\n`));
  let buffered = "";
  const onStdin = (chunk: Uint8Array) =>
    Effect.gen(function* () {
      buffered += new TextDecoder().decode(chunk);
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines.filter(Boolean)) {
        const record = JSON.parse(line) as Record<string, unknown>;
        received.push(record);
        if (record["type"] === options.holdCommand) {
          yield* Deferred.succeed(held, undefined);
          continue;
        }
        const response = {
          type: "response",
          id: record["id"],
          command: record["type"],
          success: record["type"] !== options.failCommand,
        };
        if (!response.success) {
          yield* emit({ ...response, error: "private provider credential" });
        } else if (record["type"] === "get_state") {
          yield* emit({
            ...response,
            data: options.state ?? {
              model: { provider: "openai-codex", id: "gpt-6.1-terra" },
              thinkingLevel: "max",
              autoCompactionEnabled: false,
              isStreaming: false,
              pendingMessageCount: 0,
            },
          });
        } else if (record["type"] === "prompt") {
          yield* emit(response);
          for (const event of options.events ?? [
            { type: "t3_reply_rewrite", kind: "request" },
            {
              type: "t3_reply_rewrite",
              kind: "response",
              status: "response.completed",
              model: "served-model",
              actualServiceTier: "default",
              usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
            },
            assistant,
            { type: "agent_settled" },
          ])
            yield* emit(event);
        } else {
          yield* emit({ ...response, data: { provider: "openai-codex", id: "gpt-6.1-terra" } });
        }
      }
    });
  const spawner = ChildProcessSpawner.make((command) =>
    Effect.gen(function* () {
      if (!ChildProcess.isStandardCommand(command))
        return yield* Effect.die("Expected one command");
      commands.push(command);
      const cwd = String(command.options.cwd);
      settings.push(yield* fs.readFileString(`${cwd}/.pi/settings.json`));
      const extensionIndex = command.args.indexOf("--extension");
      extensions.push(yield* fs.readFileString(command.args[extensionIndex + 1]!));
      yield* emit({ type: "t3_reply_rewrite", kind: "ready", version: 1 });
      return ChildProcessSpawner.makeHandle({
        // Outside the valid pid range so teardown cannot signal a real process.
        pid: ChildProcessSpawner.ProcessId(999_999_999),
        exitCode: Effect.never,
        isRunning: Effect.succeed(true),
        kill: () => Effect.void,
        unref: Effect.succeed(Effect.void),
        stdin: Sink.forEach(onStdin),
        stdout: Stream.fromQueue(stdout),
        stderr: Stream.empty,
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
      });
    }),
  );
  const runner = yield* makePiReplyRewriteRunner().pipe(
    Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    Effect.provideService(HostProcess.Environment, {
      T3_MCP_URL: "private",
      T3_MCP_BEARER_TOKEN: "private",
      T3_PI_MCP_EXTENSION_PATH: "private",
      SAFE_ENV: "kept",
    }),
  );
  return { runner, received, commands, settings, extensions, held };
});

it.effect(
  "isolates the launch and confirms model and thinking before sending the exact source once",
  () =>
    Effect.gen(function* () {
      const pi = yield* makeFakePi();
      const result = yield* pi.runner.run(input);
      assert.deepEqual(result, {
        text: " 改写\n完整 ",
        model: "served-model",
        requestedServiceTier: "priority",
        actualServiceTier: "default",
        usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
      });
      assert.deepEqual(
        pi.received.map((record) => record["type"]),
        ["set_model", "set_thinking_level", "get_state", "prompt"],
      );
      assert.deepInclude(pi.received[3], { message: "  原文\r\n\u2028末尾  " });
      const command = pi.commands[0]!;
      assert.includeMembers(
        [...command.args],
        [
          "--mode",
          "rpc",
          "--no-session",
          "--no-extensions",
          "--no-mcp",
          "--no-tools",
          "--no-skills",
          "--no-context-files",
          "--no-prompt-templates",
          "--system-prompt",
          "Keep all facts.",
          "--extension",
        ],
      );
      assert.notEqual(command.options.cwd, process.cwd());
      assert.deepInclude(command.options.env, {
        SAFE_ENV: "kept",
        T3_PI_REPLY_REWRITE_TIER: "priority",
      });
      assert.notProperty(command.options.env, "T3_MCP_URL");
      assert.notProperty(command.options.env, "T3_MCP_BEARER_TOKEN");
      assert.notProperty(command.options.env, "T3_PI_MCP_EXTENSION_PATH");
      assert.deepInclude(JSON.parse(pi.settings[0]!), {
        compaction: { enabled: false },
        retry: { enabled: false, provider: { maxRetries: 0 } },
      });
      assert.include(pi.extensions[0], "before_provider_request");
      const fs = yield* FileSystem.FileSystem;
      assert.isFalse(yield* fs.exists(String(command.options.cwd)));
    }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect.each(["set_model", "set_thinking_level"])(
  "does not prompt or fall back after %s is rejected",
  (failCommand) =>
    Effect.gen(function* () {
      const pi = yield* makeFakePi({ failCommand });
      const error = yield* pi.runner.run(input).pipe(Effect.flip);
      assert.equal(error.code, "configuration");
      assert.notInclude(error.message, "private");
      assert.isFalse(pi.received.some((record) => record["type"] === "prompt"));
      assert.lengthOf(pi.commands, 1);
      const fs = yield* FileSystem.FileSystem;
      assert.isFalse(yield* fs.exists(String(pi.commands[0]!.options.cwd)));
    }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect.each([
  { model: { provider: "different", id: "gpt-6.1-terra" }, thinkingLevel: "max" },
  { model: { provider: "openai-codex", id: "fallback-model" }, thinkingLevel: "max" },
  { model: { provider: "openai-codex", id: "gpt-6.1-terra" }, thinkingLevel: "high" },
])("rejects a silently changed model or thinking level: %j", (state) =>
  Effect.gen(function* () {
    const pi = yield* makeFakePi({
      state: { autoCompactionEnabled: false, isStreaming: false, pendingMessageCount: 0, ...state },
    });
    const error = yield* pi.runner.run(input).pipe(Effect.flip);
    assert.equal(error.code, "configuration");
    assert.isFalse(pi.received.some((record) => record["type"] === "prompt"));
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("uses explicit defaults and supports an installed JavaScript CLI entry", () =>
  Effect.gen(function* () {
    const pi = yield* makeFakePi();
    yield* pi.runner.run({
      ...input,
      binaryPath: "relative/pi/cli.js",
      provider: "",
      modelId: "",
      thinkingLevel: "",
      requestedServiceTier: "default",
    });
    assert.deepInclude(pi.received[0], { provider: "openai-codex", modelId: "gpt-6.1-terra" });
    assert.deepInclude(pi.received[1], { level: "max" });
    assert.equal(pi.commands[0]!.command, process.execPath);
    assert.match(pi.commands[0]!.args[0]!, /relative[/\\]pi[/\\]cli.js$/);
    assert.deepInclude(pi.commands[0]!.options.env, { T3_PI_REPLY_REWRITE_TIER: "default" });
  }).pipe(Effect.provide(NodeServices.layer)),
);
