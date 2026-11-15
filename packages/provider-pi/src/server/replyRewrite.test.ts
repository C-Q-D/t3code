import { assert, it } from "@effect/vitest";
import * as TestClock from "effect/testing/TestClock";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as HostProcess from "@t3tools/shared/HostProcess";

import {
  makePiReplyRewriteRunner,
  PiReplyRewriteError,
  type PiReplyRewriteInput,
} from "./replyRewrite.ts";

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
    usage: { input: 10, cacheRead: 3, cacheWrite: 2, output: 5, totalTokens: 20 },
  },
};

const makeFakePi = Effect.fn("test.makeRewritePi")(function* (
  options: {
    readonly failCommand?: string;
    readonly state?: Record<string, unknown>;
    readonly events?: ReadonlyArray<Record<string, unknown>>;
    readonly holdCommand?: string;
    readonly omitReady?: boolean;
    readonly holdSpawn?: boolean;
    readonly holdPreparation?: boolean;
    readonly holdCleanup?: boolean;
  } = {},
) {
  const stdout = yield* Queue.unbounded<Uint8Array, Cause.Done>();
  const received: Array<Record<string, unknown>> = [];
  const commands: ChildProcess.StandardCommand[] = [];
  const held = yield* Deferred.make<void>();
  const emitted = yield* Deferred.make<void>();
  const cleanupStarted = yield* Deferred.make<void>();
  const releaseCleanup = yield* Deferred.make<void>();
  const directories: string[] = [];
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
          if (options.omitReady) yield* Deferred.succeed(held, undefined);
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
          yield* Deferred.succeed(emitted, undefined);
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
      if (options.holdSpawn) {
        yield* Deferred.succeed(held, undefined);
        return yield* Effect.never;
      }
      const cwd = String(command.options.cwd);
      settings.push(yield* fs.readFileString(`${cwd}/.pi/settings.json`));
      const extensionIndex = command.args.indexOf("--extension");
      extensions.push(yield* fs.readFileString(command.args[extensionIndex + 1]!));
      if (!options.omitReady) yield* emit({ type: "t3_reply_rewrite", kind: "ready", version: 1 });
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
    Effect.provideService(FileSystem.FileSystem, {
      ...fs,
      makeTempDirectoryScoped: (tempOptions) =>
        Effect.gen(function* () {
          const directory = yield* fs.makeTempDirectoryScoped(tempOptions);
          directories.push(directory);
          if (options.holdCleanup)
            yield* Effect.addFinalizer(() =>
              Deferred.succeed(cleanupStarted, undefined).pipe(
                Effect.andThen(Deferred.await(releaseCleanup)),
              ),
            );
          return directory;
        }),
      ...(options.holdPreparation
        ? {
            writeFileString: () =>
              Deferred.succeed(held, undefined).pipe(Effect.andThen(Effect.never)),
          }
        : {}),
    }),
  );
  return {
    runner,
    received,
    commands,
    settings,
    extensions,
    held,
    emitted,
    directories,
    cleanupStarted,
    releaseCleanup,
  };
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

it.effect.each([
  {
    name: "provider error",
    event: {
      ...assistant,
      message: { ...assistant.message, stopReason: "error", errorMessage: "private credential" },
    },
    code: "provider",
  },
  {
    name: "token limit",
    event: { ...assistant, message: { ...assistant.message, stopReason: "length" } },
    code: "truncated",
  },
  {
    name: "aborted reply",
    event: { ...assistant, message: { ...assistant.message, stopReason: "aborted" } },
    code: "provider",
  },
  {
    name: "tool call",
    event: { type: "tool_execution_start", toolName: "write" },
    code: "provider",
  },
  { name: "tool error", event: { type: "tool_execution_end", isError: true }, code: "provider" },
  {
    name: "tool result error",
    event: { type: "message_end", message: { role: "toolResult", isError: true } },
    code: "provider",
  },
  {
    name: "extension error",
    event: { type: "extension_error", error: "private credential" },
    code: "protocol",
  },
  { name: "automatic retry", event: { type: "auto_retry_start" }, code: "protocol" },
  { name: "automatic compaction", event: { type: "auto_compaction_start" }, code: "protocol" },
  {
    name: "provider incomplete",
    event: { type: "t3_reply_rewrite", kind: "response", status: "response.incomplete" },
    code: "truncated",
  },
  {
    name: "provider failed",
    event: { type: "t3_reply_rewrite", kind: "response", status: "response.failed" },
    code: "provider",
  },
])("rejects $name even after a complete assistant reply", ({ event, code }) =>
  Effect.gen(function* () {
    const pi = yield* makeFakePi({
      events: [
        { type: "t3_reply_rewrite", kind: "request" },
        assistant,
        event,
        { type: "agent_settled" },
      ],
    });
    const error = yield* pi.runner.run(input).pipe(Effect.flip);
    assert.equal(error.code, code);
    assert.notInclude(error.message, "private");
    assert.lengthOf(
      pi.received.filter((record) => record["type"] === "prompt"),
      1,
    );
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect.each([
  {
    name: "empty text",
    events: [
      { ...assistant, message: { ...assistant.message, content: [{ type: "text", text: " \n" }] } },
    ],
    code: "empty_output",
  },
  { name: "no final message", events: [], code: "protocol" },
  {
    name: "tool content",
    events: [
      {
        ...assistant,
        message: { ...assistant.message, content: [{ type: "toolCall", name: "write" }] },
      },
    ],
    code: "protocol",
  },
  {
    name: "malformed text",
    events: [
      { ...assistant, message: { ...assistant.message, content: [{ type: "text", text: 123 }] } },
    ],
    code: "protocol",
  },
  {
    name: "extra provider request",
    events: [{ type: "t3_reply_rewrite", kind: "request" }, assistant],
    code: "protocol",
  },
])("rejects $name at settlement", ({ events, code }) =>
  Effect.gen(function* () {
    const pi = yield* makeFakePi({
      events: [{ type: "t3_reply_rewrite", kind: "request" }, ...events, { type: "agent_settled" }],
    });
    const error = yield* pi.runner.run(input).pipe(Effect.flip);
    assert.equal(error.code, code);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("keeps actual tier unknown when the provider does not report it", () =>
  Effect.gen(function* () {
    const pi = yield* makeFakePi({
      events: [{ type: "t3_reply_rewrite", kind: "request" }, assistant, { type: "agent_settled" }],
    });
    const result = yield* pi.runner.run(input);
    assert.equal(result.actualServiceTier, null);
    assert.equal(result.requestedServiceTier, "priority");
    assert.deepEqual(result.usage, { inputTokens: 15, outputTokens: 5, totalTokens: 20 });
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect.each(["set_model", "set_thinking_level", "get_state", "prompt"])(
  "times out while waiting for %s and cleans the cwd",
  (holdCommand) =>
    Effect.gen(function* () {
      const pi = yield* makeFakePi({ holdCommand });
      const fiber = yield* pi.runner.run(input).pipe(Effect.flip, Effect.forkChild);
      yield* Deferred.await(pi.held);
      yield* TestClock.adjust(input.timeoutMs);
      const error = yield* Fiber.join(fiber);
      assert.equal(error.code, "timeout");
      const fs = yield* FileSystem.FileSystem;
      assert.isFalse(yield* fs.exists(String(pi.commands[0]!.options.cwd)));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("does not treat agent_end as settlement and preserves cancellation", () =>
  Effect.gen(function* () {
    const pi = yield* makeFakePi({
      events: [
        { type: "t3_reply_rewrite", kind: "request" },
        assistant,
        { type: "agent_end", messages: [assistant.message] },
      ],
    });
    const fiber = yield* pi.runner.run(input).pipe(Effect.forkChild);
    yield* Deferred.await(pi.emitted);
    yield* Fiber.interrupt(fiber);
    const exit = yield* Fiber.await(fiber);
    assert.isTrue(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause));
    const fs = yield* FileSystem.FileSystem;
    assert.isFalse(yield* fs.exists(String(pi.commands[0]!.options.cwd)));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("rejects errors after agent_end until authoritative settlement", () =>
  Effect.gen(function* () {
    const pi = yield* makeFakePi({
      events: [
        { type: "t3_reply_rewrite", kind: "request" },
        assistant,
        { type: "agent_end" },
        { type: "extension_error" },
        { type: "agent_settled" },
      ],
    });
    const error = yield* pi.runner.run(input).pipe(Effect.flip);
    assert.equal(error.code, "protocol");
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("times out while waiting for settlement after the assistant finished", () =>
  Effect.gen(function* () {
    const pi = yield* makeFakePi({
      events: [{ type: "t3_reply_rewrite", kind: "request" }, assistant, { type: "agent_end" }],
    });
    const fiber = yield* pi.runner.run(input).pipe(Effect.flip, Effect.forkChild);
    yield* Deferred.await(pi.emitted);
    yield* TestClock.adjust(input.timeoutMs);
    assert.equal((yield* Fiber.join(fiber)).code, "timeout");
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect.each([
  { name: "preparation", holdPreparation: true },
  { name: "spawn", holdSpawn: true },
])("applies the total deadline to $name", (options) =>
  Effect.gen(function* () {
    const pi = yield* makeFakePi(options);
    const fiber = yield* pi.runner.run(input).pipe(Effect.flip, Effect.forkChild);
    yield* Deferred.await(pi.held);
    yield* TestClock.adjust(input.timeoutMs);
    assert.equal((yield* Fiber.join(fiber)).code, "timeout");
    assert.isEmpty(pi.received);
    const fs = yield* FileSystem.FileSystem;
    assert.isFalse(yield* fs.exists(pi.directories[0]!));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("keeps the total deadline active during resource cleanup", () =>
  Effect.gen(function* () {
    const pi = yield* makeFakePi({ holdCleanup: true });
    const fiber = yield* pi.runner.run(input).pipe(Effect.flip, Effect.forkChild);
    yield* Deferred.await(pi.cleanupStarted);
    yield* TestClock.adjust(input.timeoutMs);
    yield* Deferred.succeed(pi.releaseCleanup, undefined);
    assert.equal((yield* Fiber.join(fiber)).code, "timeout");
    const fs = yield* FileSystem.FileSystem;
    assert.isFalse(yield* fs.exists(pi.directories[0]!));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("does not prompt if the dedicated extension never becomes ready", () =>
  Effect.gen(function* () {
    const pi = yield* makeFakePi({ omitReady: true });
    const fiber = yield* pi.runner.run(input).pipe(Effect.flip, Effect.forkChild);
    yield* Deferred.await(pi.held);
    yield* TestClock.adjust(input.timeoutMs);
    assert.equal((yield* Fiber.join(fiber)).code, "timeout");
    assert.isFalse(pi.received.some((record) => record["type"] === "prompt"));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

// This fixture loads the materialized extension but never loads Pi or provider credentials.
const PROCESS_FIXTURE = `
import { spawn } from "node:child_process";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
const handlers = new Map();
const emit = (record) => process.stdout.write(JSON.stringify(record) + "\\n");
const extensionPath = process.argv[process.argv.indexOf("--extension") + 1];
(await import(pathToFileURL(extensionPath).href)).default({
  on: (name, handler) => handlers.set(name, handler),
});
handlers.get("session_start")();
let buffer = "";
for await (const chunk of process.stdin) {
  buffer += chunk.toString("utf8");
  let newline;
  while ((newline = buffer.indexOf("\\n")) >= 0) {
  const line = buffer.slice(0, newline);
  buffer = buffer.slice(newline + 1);
  const command = JSON.parse(line);
  const response = { type: "response", id: command.id, command: command.type, success: true };
  if (command.type === "get_state") {
    emit({ ...response, data: {
      model: { provider: "openai-codex", id: "gpt-6.1-terra" }, thinkingLevel: "max",
      autoCompactionEnabled: !process.argv.includes("--approve"), isStreaming: false, pendingMessageCount: 0,
    }});
  } else if (command.type === "prompt") {
    emit(response);
    handlers.get("before_provider_request")({ payload: { input: command.message, tools: [] } });
    if (command.message === "exit") {
      await new Promise((resolve) => process.stdout.write(JSON.stringify({
        type: "message_end", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "partial" }] },
      }) + "\\n", resolve));
      process.exit(17);
    } else if (command.message === "hold") {
      const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
      await once(child, "spawn");
      emit({ type: "fixture_pending", parentPid: process.pid, childPid: child.pid });
    } else {
      handlers.get("provider_stream_event")({ data: {
        type: "response.completed", response: { service_tier: "default", model: "fixture-model" },
      }});
      emit({ type: "message_end", message: {
        role: "assistant", stopReason: "stop", content: [{ type: "text", text: command.message }],
      }});
      emit({ type: "agent_settled" });
    }
  } else emit(response);
  }
}
`;

const makeProcessFixture = Effect.fn("test.makeRewriteProcessFixture")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-pi-rewrite-fixture-" });
  const binaryPath = path.join(directory, "fixture.mjs");
  yield* fs.writeFileString(binaryPath, PROCESS_FIXTURE);
  const pending = yield* Deferred.make<{ parentPid: number; childPid: number }>();
  const base = yield* ChildProcessSpawner.ChildProcessSpawner;
  const commands: ChildProcess.StandardCommand[] = [];
  const spawner = ChildProcessSpawner.make((command) =>
    Effect.gen(function* () {
      const child = yield* base.spawn(command);
      if (!ChildProcess.isStandardCommand(command) || !command.args.includes(binaryPath))
        return child;
      commands.push(command);
      let buffered = "";
      return {
        ...child,
        stdout: child.stdout.pipe(
          Stream.decodeText(),
          Stream.tap((chunk) =>
            Effect.gen(function* () {
              buffered += chunk;
              const lines = buffered.split("\n");
              buffered = lines.pop() ?? "";
              for (const line of lines.filter(Boolean)) {
                const record = JSON.parse(line) as Record<string, unknown>;
                if (
                  record["type"] === "fixture_pending" &&
                  typeof record["parentPid"] === "number" &&
                  typeof record["childPid"] === "number"
                ) {
                  yield* Deferred.succeed(pending, {
                    parentPid: record["parentPid"],
                    childPid: record["childPid"],
                  });
                }
              }
            }),
          ),
          Stream.map((chunk) => new TextEncoder().encode(chunk)),
        ),
      };
    }),
  );
  const runner = yield* makePiReplyRewriteRunner().pipe(
    Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    Effect.provideService(HostProcess.Environment, { SystemRoot: process.env["SystemRoot"] }),
  );
  return { runner, pending, binaryPath, commands };
});

it.live(
  "loads the extension from an arbitrary install location and completes a real RPC subprocess",
  () =>
    Effect.gen(function* () {
      const fixture = yield* makeProcessFixture();
      const result = yield* fixture.runner.run({ ...input, binaryPath: fixture.binaryPath });
      assert.equal(result.text, "  原文\r\n\u2028末尾  ");
      assert.equal(result.model, "fixture-model");
      assert.equal(result.actualServiceTier, "default");
      const fs = yield* FileSystem.FileSystem;
      assert.isFalse(yield* fs.exists(String(fixture.commands[0]!.options.cwd)));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.live.each(["cancel", "timeout"])("cleans a real subprocess tree on %s", (action) =>
  Effect.gen(function* () {
    const fixture = yield* makeProcessFixture();
    const fiber = yield* fixture.runner
      .run({ ...input, sourceText: "hold", binaryPath: fixture.binaryPath, timeoutMs: 5_000 })
      .pipe(Effect.forkChild);
    const pids = yield* Effect.raceFirst(
      Deferred.await(fixture.pending),
      Fiber.join(fiber).pipe(
        Effect.andThen(Effect.die("Fixture exited before spawning its child")),
      ),
    );
    if (action === "cancel") yield* Fiber.interrupt(fiber);
    const exit = yield* Fiber.await(fiber);
    assert.isTrue(Exit.isFailure(exit));
    if (Exit.isFailure(exit)) {
      if (action === "cancel") assert.isTrue(Cause.hasInterrupts(exit.cause));
      else {
        const error = Cause.squash(exit.cause);
        assert.instanceOf(error, PiReplyRewriteError);
        assert.equal(error.code, "timeout");
      }
    }
    assert.throws(() => process.kill(pids.parentPid, 0));
    assert.throws(() => process.kill(pids.childPid, 0));
    const fs = yield* FileSystem.FileSystem;
    assert.isFalse(yield* fs.exists(String(fixture.commands[0]!.options.cwd)));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.live("rejects an exited subprocess even when its final assistant text was nonempty", () =>
  Effect.gen(function* () {
    const fixture = yield* makeProcessFixture();
    const error = yield* fixture.runner
      .run({ ...input, sourceText: "exit", binaryPath: fixture.binaryPath })
      .pipe(Effect.flip);
    assert.equal(error.code, "protocol");
    const fs = yield* FileSystem.FileSystem;
    assert.isFalse(yield* fs.exists(String(fixture.commands[0]!.options.cwd)));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
