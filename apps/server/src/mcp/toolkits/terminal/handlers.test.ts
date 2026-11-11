import { expect, it } from "@effect/vitest";
import * as A from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { McpServer, McpSchema, Tool } from "effect/ai";
import { HttpServer } from "effect/http";
import * as NetAddress from "effect/net/NetAddress";
import * as ServerEnvironment from "../../../environment/ServerEnvironment.ts";
import * as Automation from "../../../terminal/AutomationService.ts";
import * as Manager from "../../../terminal/Manager.ts";
import * as ThreadManagement from "../../../orchestration-v2/ThreadManagementService.ts";
import * as EventSink from "../../../orchestration-v2/EventSink.ts";
import * as DispatchAuthorizations from "../../../orchestration-v2/DispatchAuthorizations.ts";
import * as Invocation from "../../McpInvocationContext.ts";
import * as Registry from "../../McpSessionRegistry.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import * as McpHttpServer from "../../McpHttpServer.ts";
import { idleThreadProjection, liveThreadShell } from "../../McpToolAccess.testkit.ts";
import { advertisedJsonSchema } from "../../advertisedJsonSchema.ts";
import { TerminalToolkit } from "./tools.ts";
import * as Handlers from "./handlers.ts";

const threadId = A.ThreadId.make("thread");
const environmentId = A.EnvironmentId.make("env");
const parameterDecoders = {
  terminal_status: Schema.decodeSync(A.TerminalMcpStatusInput),
  terminal_bind: Schema.decodeSync(A.TerminalMcpBindInput),
  terminal_read: Schema.decodeSync(A.TerminalMcpReadInput),
  terminal_input: Schema.decodeSync(A.TerminalMcpInput),
  terminal_release: Schema.decodeSync(A.TerminalMcpReleaseInput),
};
const frame: A.TerminalAutomationFrame = {
  activeScreen: "primary",
  cols: 80,
  rows: 24,
  viewportStartLine: 0,
  retainedRange: { startLine: 0, endLineExclusive: 24 },
  sequence: 0,
  frameRevision: 1,
  cursor: { status: "unknown" },
  pendingWrap: null,
};

const setup = Effect.gen(function* () {
  const registry = yield* Registry.__testing.make().pipe(
    Effect.provideService(ServerEnvironment.ServerEnvironment, {
      getEnvironmentId: Effect.succeed(environmentId),
      getDescriptor: Effect.die("unused"),
    }),
    Effect.provideService(HttpServer.HttpServer, {
      address: NetAddress.inetAddressFromIpStringUnsafe("127.0.0.1", 43123),
      serve: (() => Effect.void) as HttpServer.HttpServer["Service"]["serve"],
    }),
    Effect.provide(NodeServices.layer),
  );
  const issued = yield* registry.issue({
    threadId,
    providerInstanceId: A.ProviderInstanceId.make("codex"),
  });
  const invocation = yield* registry.resolve(issued.config.authorizationHeader.slice(7));
  if (!invocation) throw new Error("missing invocation");
  let shell = liveThreadShell(threadId);
  const changes = DispatchAuthorizations.make();
  const writes: string[] = [];
  let beforeWrite: Effect.Effect<void> = Effect.void;
  const service = yield* Automation.TerminalAutomationService.pipe(
    Effect.provide(
      Automation.layer.pipe(
        Layer.provide(
          Layer.mock(Manager.TerminalManager)({
            inspectExisting: () =>
              Effect.succeed({ terminalInstanceId: "instance", humanInputEpoch: 0 }),
            writeAutomation: (input) =>
              beforeWrite.pipe(
                Effect.andThen(
                  Effect.suspend(() => {
                    if (!input.canWrite?.())
                      return Effect.fail(new A.TerminalNotRunningError(input));
                    writes.push(input.data);
                    return Effect.void;
                  }),
                ),
              ),
          }),
        ),
      ),
    ),
  );
  const scope = { environmentId, threadId };
  const messages = yield* service.connect(scope, "window");
  yield* service.registerViews("window", {
    version: 1,
    views: [
      {
        candidateId: "ignored",
        target: { terminalId: "one", terminalInstanceId: "instance", viewId: "view" },
        title: "Original",
        visible: true,
        readiness: "ready",
        clientKind: "web",
        capabilities: { read: true, input: true, show: true },
      },
    ],
  });
  const dependencies = Layer.mergeAll(
    Layer.succeed(Automation.TerminalAutomationService, service),
    Layer.mock(EventSink.EventSinkV2)({ watchDispatchAuthorization: changes.watch }),
    Layer.mock(ThreadManagement.ThreadManagementService)({
      getThreadShell: () => Effect.sync(() => shell),
    }),
    Layer.succeed(Invocation.McpInvocationContext, invocation),
  );
  const toolkit = yield* TerminalToolkit.pipe(
    Effect.provide(
      McpToolAccess.HandlersLayer.layer(Handlers.layer).pipe(Layer.provide(dependencies)),
    ),
  );
  const call = <N extends keyof typeof TerminalToolkit.tools>(
    name: N,
    input: Tool.ParametersEncoded<(typeof TerminalToolkit.tools)[N]>,
    context = invocation,
  ) =>
    toolkit.handle(name, input).pipe(
      Stream.unwrap,
      Stream.runCollect,
      Effect.map((items) => items.at(-1)!.result),
      Effect.provideService(Invocation.McpInvocationContext, context),
      Effect.provide(dependencies),
    );
  const take = Queue.take(messages).pipe(
    Effect.map((message) => {
      if (!("binding" in message)) throw new Error("expected bridge");
      return message;
    }),
  );
  const reply = (
    message: A.TerminalAutomationClientRequest,
    result: A.TerminalAutomationClientReply["result"],
  ) =>
    service.replyBridge("window", {
      version: 1,
      bridgeRequestId: message.bridgeRequestId,
      binding: message.binding,
      result,
    });
  return {
    registry,
    invocation,
    dependencies,
    service,
    messages,
    writes,
    call,
    take,
    reply,
    beforeWrite: (effect: Effect.Effect<void>) => {
      beforeWrite = effect;
    },
    change: (kind: "mode" | "run" | "provider") => {
      const thread = idleThreadProjection(shell).thread;
      if (kind === "mode") {
        shell = { ...shell, runtimeMode: "approval-required" };
        changes.beforeProjection({
          id: A.EventId.make("mode"),
          threadId,
          occurredAt: shell.updatedAt,
          type: "thread.runtime-mode-updated",
          payload: { ...thread, runtimeMode: "approval-required" },
        });
      } else if (kind === "provider") {
        shell = { ...shell, providerInstanceId: A.ProviderInstanceId.make("claude") };
        changes.beforeProjection({
          id: A.EventId.make("provider"),
          threadId,
          occurredAt: shell.updatedAt,
          type: "thread.provider-switched",
          payload: { ...thread, providerInstanceId: shell.providerInstanceId },
        });
      } else {
        const runId = shell.activeRunId!;
        shell = { ...shell, activeRunId: null };
        changes.beforeProjection({
          id: A.EventId.make("run"),
          threadId,
          occurredAt: shell.updatedAt,
          type: "run.updated",
          payload: {
            id: runId,
            threadId,
            ordinal: 1,
            providerInstanceId: thread.providerInstanceId,
            modelSelection: thread.modelSelection,
            providerThreadId: null,
            userMessageId: A.MessageId.make("message"),
            rootNodeId: null,
            activeAttemptId: null,
            status: "completed",
            requestedAt: shell.createdAt,
            startedAt: shell.createdAt,
            completedAt: shell.updatedAt,
            checkpointId: null,
            contextHandoffId: null,
          },
        });
      }
    },
  };
});

it("advertises object schemas and rejects injected identities and model resume", () => {
  expect(Object.keys(TerminalToolkit.tools)).toEqual([
    "terminal_status",
    "terminal_bind",
    "terminal_read",
    "terminal_input",
    "terminal_release",
  ]);
  for (const tool of Object.values(TerminalToolkit.tools)) {
    expect(Tool.getJsonSchema(tool).type).toBe("object");
    expect(advertisedJsonSchema(tool).type).toBe("object");
    const valid =
      tool.name === "terminal_status"
        ? {}
        : tool.name === "terminal_bind"
          ? { mode: "auto" }
          : tool.name === "terminal_read"
            ? {
                bindingId: "binding",
                query: {
                  source: "screen",
                  view: "current_viewport",
                  budget: { maxCodeUnits: 10, maxLines: 1 },
                },
              }
            : tool.name === "terminal_input"
              ? { bindingId: "binding", requestId: "request", action: { type: "text", text: "x" } }
              : { bindingId: "binding" };
    const decode = parameterDecoders[tool.name];
    expect(() => decode(valid), tool.name).not.toThrow();
    for (const key of ["callerId", "connectionId", "threadId", "environmentId"])
      expect(() => decode({ ...valid, [key]: "injected" }), tool.name + ":" + key).toThrow();
  }
  expect(() => parameterDecoders.terminal_bind({ mode: "resume", bindingId: "x" })).toThrow();
});

it.effect(
  "MCP binds the shared original terminal, reads history, writes once and queries receipts",
  () =>
    Effect.gen(function* () {
      const f = yield* setup;
      const bound = yield* f.call("terminal_bind", { mode: "auto" });
      expect(bound).toMatchObject({ state: { status: "bound" } });
      if (!("state" in bound) || bound.state.status !== "bound") throw new Error("expected bound");
      const bindingId = bound.state.binding.bindingId;
      const reading = yield* f
        .call("terminal_read", {
          bindingId,
          query: {
            source: "history",
            activeScreen: "primary",
            frameRevision: 1,
            range: { startLine: 0, endLineExclusive: 1 },
            budget: { maxCodeUnits: 100, maxLines: 1 },
          },
        })
        .pipe(Effect.forkChild);
      yield* f.reply(yield* f.take, {
        operation: "read",
        read: {
          source: "history",
          frame,
          text: "original output",
          returnedRange: { startLine: 0, endLineExclusive: 1 },
          nextCursor: null,
          continuity: "complete",
          truncated: false,
          change: "data",
          softWrapAfterLines: [],
          process: { status: "unknown" },
        },
      });
      expect(yield* Fiber.join(reading)).toMatchObject({ text: "original output" });
      expect(f.writes).toEqual([]);
      const running = yield* f
        .call("terminal_input", {
          bindingId,
          requestId: "request",
          action: { type: "text", text: "pwd\r" },
        })
        .pipe(Effect.forkChild);
      yield* f.reply(yield* f.take, { operation: "show", status: "visible" });
      yield* f.reply(yield* f.take, {
        operation: "prepare_input",
        inputRequestId: "request",
        frame,
      });
      yield* f.reply(yield* f.take, {
        operation: "encode_input",
        inputRequestId: "request",
        frameRevision: 1,
        encodedText: "pwd\r",
      });
      expect(yield* Fiber.join(running)).toMatchObject({ status: "written" });
      expect(f.writes).toEqual(["pwd\r"]);
      expect(
        yield* f.call("terminal_status", { receipt: { bindingId, requestId: "request" } }),
      ).toMatchObject({ inputResult: { status: "written" } });
      expect(f.writes).toEqual(["pwd\r"]);
      const other = {
        ...f.invocation,
        thread: { ...f.invocation.thread, providerSessionId: "other-session" },
      };
      expect(yield* f.call("terminal_release", { bindingId }, other)).toMatchObject({
        code: "target_invalid",
      });
      expect(yield* f.call("terminal_release", { bindingId })).toEqual({ status: "released" });
    }),
);

it.effect.each(["credential", "mode", "run", "provider"] as const)(
  "%s invalidation defeats dispatch after the final async check",
  (kind) =>
    Effect.gen(function* () {
      const f = yield* setup;
      const bound = yield* f.call("terminal_bind", { mode: "auto" });
      if (!("state" in bound) || bound.state.status !== "bound") throw new Error("expected bound");
      f.beforeWrite(
        kind === "credential"
          ? f.registry.revokeThread(threadId)
          : Effect.sync(() => f.change(kind)),
      );
      const running = yield* f
        .call("terminal_input", {
          bindingId: bound.state.binding.bindingId,
          requestId: "request",
          action: { type: "text", text: "x" },
        })
        .pipe(Effect.forkChild);
      yield* f.reply(yield* f.take, { operation: "show", status: "visible" });
      yield* f.reply(yield* f.take, {
        operation: "prepare_input",
        inputRequestId: "request",
        frame,
      });
      yield* f.reply(yield* f.take, {
        operation: "encode_input",
        inputRequestId: "request",
        frameRevision: 1,
        encodedText: "x",
      });
      expect(yield* Fiber.join(running)).toMatchObject({ status: "not_sent" });
      expect(f.writes).toEqual([]);
    }),
);

it.effect("read mode refuses input and external clients lack a supported terminal caller", () =>
  Effect.gen(function* () {
    const f = yield* setup;
    const bound = yield* f.call("terminal_bind", { mode: "auto" });
    if (!("state" in bound) || bound.state.status !== "bound") throw new Error("expected bound");
    f.change("mode");
    expect(yield* f.call("terminal_status", {})).toMatchObject({ state: { status: "bound" } });
    expect(yield* f.call("terminal_bind", { mode: "auto" })).toMatchObject({
      _tag: "OrchestratorMcpFailure",
      code: "capability_denied",
    });
    expect(
      yield* f.call("terminal_input", {
        bindingId: bound.state.binding.bindingId,
        requestId: "denied",
        action: { type: "text", text: "x" },
      }),
    ).toMatchObject({ _tag: "OrchestratorMcpFailure", code: "capability_denied" });
    const external = {
      ...f.invocation,
      thread: undefined,
      client: { sessionId: "oauth", label: "External", access: "full-access" as const },
    };
    expect(
      yield* f.call("terminal_status", {}, external as Invocation.McpThreadInvocationScope),
    ).toMatchObject({ _tag: "OrchestratorMcpFailure" });
    expect(f.writes).toEqual([]);
  }),
);

it.effect(
  "production registration preserves advertised schemas and rejects identities before dispatch",
  () =>
    Effect.gen(function* () {
      const f = yield* setup;
      yield* Effect.gen(function* () {
        const server = yield* McpServer.McpServer;
        expect(server.tools.map(({ tool }) => tool.name)).toEqual(
          Object.keys(TerminalToolkit.tools),
        );
        for (const { tool } of server.tools)
          expect(tool.inputSchema).toEqual(
            advertisedJsonSchema(
              TerminalToolkit.tools[tool.name as keyof typeof TerminalToolkit.tools],
            ),
          );
        const client = McpSchema.McpServerClient.of({
          clientId: 1,
          clientCapabilities: {},
          clientInfo: { name: "test", version: "1" },
          protocolVersion: "2025-06-18",
          initializePayload: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "test", version: "1" },
          },
          getClient: Effect.die("unused"),
        });
        const call = (args: Record<string, unknown>) =>
          server
            .callTool({ name: "terminal_bind", arguments: args })
            .pipe(
              Effect.provideService(Invocation.McpInvocationContext, f.invocation),
              Effect.provideService(McpSchema.McpServerClient, client),
            );
        const invalid = yield* call({ mode: "auto", callerId: "forged" }).pipe(Effect.result);
        expect(invalid).toMatchObject({ _tag: "Failure", failure: { _tag: "InvalidParams" } });
        expect(yield* f.call("terminal_status", {})).toMatchObject({
          state: { status: "unbound" },
        });
        expect((yield* call({ mode: "auto" })).isError).not.toBe(true);
        expect(yield* f.call("terminal_status", {})).toMatchObject({ state: { status: "bound" } });
      }).pipe(
        Effect.provide(
          McpHttpServer.layerTerminalToolkit.pipe(
            Layer.provideMerge(McpServer.McpServer.layer),
            Layer.provide(f.dependencies),
          ),
        ),
      );
      expect(f.writes).toEqual([]);
    }),
);

it.effect.each(["credential", "mode", "run", "provider"] as const)(
  "pending user selection rechecks %s authorization without inheriting a UI identity",
  (kind) =>
    Effect.gen(function* () {
      const f = yield* setup;
      yield* f.service.registerViews("window", {
        version: 1,
        views: ["one", "two"].map((terminalId) => ({
          candidateId: "ignored",
          target: { terminalId, terminalInstanceId: "instance", viewId: terminalId },
          title: terminalId,
          visible: true,
          readiness: "ready",
          clientKind: "web",
          capabilities: { read: true, input: true, show: true },
        })),
      });
      expect(yield* f.call("terminal_bind", { mode: "auto" })).toMatchObject({
        state: { status: "selection_required" },
      });
      const request = yield* Queue.take(f.messages);
      if (!("selectionRequestId" in request)) throw new Error("expected selection");
      if (kind === "credential") yield* f.registry.revokeThread(threadId);
      else f.change(kind);
      expect(
        yield* f.service
          .replySelection("window", {
            version: 1,
            selectionRequestId: request.selectionRequestId,
            candidateVersion: request.candidateVersion,
            choice: { status: "selected", candidateId: request.candidates[0]!.candidateId },
          })
          .pipe(Effect.result),
      ).toMatchObject({ _tag: "Failure" });
      expect(f.writes).toEqual([]);
    }),
);
