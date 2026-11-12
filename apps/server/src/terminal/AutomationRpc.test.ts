import { expect, it } from "@effect/vitest";
import * as A from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Scope from "effect/Scope";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";
import * as RpcTest from "effect/rpc/RpcTest";
import * as Automation from "./AutomationService.ts";
import * as Transport from "./AutomationRpc.ts";
import * as Manager from "./Manager.ts";
import * as Authorization from "../auth/RpcAuthorization.ts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as SessionStore from "../auth/SessionStore.ts";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as ServerConfig from "../config.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";

const threadId = A.ThreadId.make("thread-a");
const environmentId = A.EnvironmentId.make("environment-a");
const target = { terminalId: "original", terminalInstanceId: "instance-a", viewId: "view-a" };
const view: A.TerminalAutomationCandidate = {
  candidateId: "untrusted",
  target,
  title: "original",
  clientKind: "web",
  visible: true,
  readiness: "ready",
  capabilities: { read: true, input: true, show: true },
};
const frame: A.TerminalAutomationFrame = {
  activeScreen: "primary",
  cols: 80,
  rows: 24,
  viewportStartLine: 0,
  frameRevision: 1,
  sequence: 0,
  pendingWrap: null,
  retainedRange: { startLine: 0, endLineExclusive: 24 },
  cursor: { status: "unknown" },
};

const setup = Effect.fn("test.automationRpc.setup")(function* (
  scopes: readonly A.AuthEnvironmentScope[] = [A.AuthTerminalReadScope, A.AuthTerminalOperateScope],
) {
  const writes: string[] = [];
  const service = yield* Automation.TerminalAutomationService.pipe(
    Effect.provide(
      Automation.layer.pipe(
        Layer.provide(
          Layer.mock(Manager.TerminalManager)({
            inspectExisting: () =>
              Effect.succeed({ terminalInstanceId: "instance-a", humanInputEpoch: 0 }),
            writeAutomation: (input) =>
              Effect.sync(() => {
                if (input.canWrite?.() !== false) writes.push(input.data);
              }),
          }),
        ),
      ),
    ),
  );
  const socketScope = yield* Scope.make();
  yield* Effect.addFinalizer(() => Scope.close(socketScope, Exit.void));
  let beforeThreadCheck: Effect.Effect<void> = Effect.void;
  const handlers = yield* Transport.make("socket-a", environmentId, (id) =>
    Effect.suspend(() => beforeThreadCheck).pipe(
      Effect.andThen(
        id === threadId ? Effect.void : Effect.fail({ code: "target_invalid" as const }),
      ),
    ),
  ).pipe(
    Effect.provideService(Automation.TerminalAutomationService, service),
    Effect.provideService(Scope.Scope, socketScope),
  );
  const group = A.TerminalAutomationRpcGroup.middleware(A.RpcScopeAuthorization);
  const client = yield* RpcTest.makeClient(group).pipe(
    Effect.provide(
      Layer.merge(group.toLayer(Effect.succeed(handlers)), Authorization.layer(scopes)),
    ),
  );
  const messages = yield* Queue.unbounded<typeof A.TerminalAutomationRpcEvent.Type>();
  const start = Effect.gen(function* () {
    const fiber = yield* client[A.WS_METHODS.terminalAutomationSubscribe]({ threadId }).pipe(
      Stream.runForEach((event) => Queue.offer(messages, event)),
      Effect.forkChild,
    );
    expect(yield* Queue.take(messages)).toEqual({ type: "ready" });
    return fiber;
  });
  const caller: Automation.Caller = {
    scope: { environmentId, threadId },
    callerId: "model-original",
    selectionConnectionId: `${JSON.stringify(["socket-a", 0, threadId])}:1`,
  };
  const bind = Effect.gen(function* () {
    yield* client[A.WS_METHODS.terminalAutomationRegisterViews]({
      threadId,
      registration: { version: 1, views: [view] },
    });
    const status = yield* service.bind(caller, { mode: "auto" });
    if (status.state.status !== "bound") throw new Error("expected original binding");
    return status.state.binding.bindingId;
  });
  return {
    service,
    client,
    handlers,
    socketScope,
    messages,
    start,
    bind,
    caller,
    writes,
    beforeThreadCheck: (effect: Effect.Effect<void>) => {
      beforeThreadCheck = effect;
    },
  };
});

it.effect("old connection query cannot read a replacement subscription generation", () =>
  Effect.gen(function* () {
    const f = yield* setup();
    const original = yield* f.start;
    yield* f.bind;
    const entered = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    f.beforeThreadCheck(
      Effect.gen(function* () {
        f.beforeThreadCheck(Effect.void);
        yield* Deferred.succeed(entered, undefined);
        yield* Deferred.await(release);
      }),
    );
    const old = yield* f.client[A.WS_METHODS.terminalAutomationGetConnectionState]({
      threadId,
    }).pipe(Effect.result, Effect.forkChild);
    yield* Deferred.await(entered);
    yield* Fiber.interrupt(original);
    yield* f.start;
    yield* Deferred.succeed(release, undefined);
    expect(yield* Fiber.join(old)).toMatchObject({
      _tag: "Failure",
      failure: { code: "client_unavailable" },
    });
    expect(
      yield* f.client[A.WS_METHODS.terminalAutomationGetConnectionState]({ threadId }),
    ).toEqual({ version: 1, bindings: [] });
  }),
);

it.effect("old registration cannot replace views after resubscription", () =>
  Effect.gen(function* () {
    const f = yield* setup();
    const original = yield* f.start;
    yield* f.bind;
    const entered = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    f.beforeThreadCheck(
      Effect.gen(function* () {
        f.beforeThreadCheck(Effect.void);
        yield* Deferred.succeed(entered, undefined);
        yield* Deferred.await(release);
      }),
    );
    const old = yield* f.client[A.WS_METHODS.terminalAutomationRegisterViews]({
      threadId,
      registration: { version: 1, views: [view] },
    }).pipe(Effect.result, Effect.forkChild);
    yield* Deferred.await(entered);
    yield* Fiber.interrupt(original);
    yield* f.start;
    yield* f.client[A.WS_METHODS.terminalAutomationRegisterViews]({
      threadId,
      registration: { version: 1, views: [{ ...view, title: "replacement" }] },
    });
    yield* Deferred.succeed(release, undefined);
    expect(yield* Fiber.join(old)).toMatchObject({ _tag: "Failure" });
    expect(
      (yield* f.service.status(f.caller)).candidates.map((candidate) => candidate.title),
    ).toEqual(["replacement"]);
  }),
);

it.effect("authenticated RPC registration and replies reach the shared model service", () =>
  Effect.gen(function* () {
    const f = yield* setup();
    yield* f.start;
    const bindingId = yield* f.bind;
    const input = yield* f.service
      .input(
        f.caller,
        { bindingId, requestId: "input-a", action: { type: "text", text: "hello" } },
        Effect.void,
      )
      .pipe(Effect.forkChild);
    const show = yield* Queue.take(f.messages);
    if (!("bridgeRequestId" in show)) throw new Error("expected show");
    yield* f.client[A.WS_METHODS.terminalAutomationReplyBridge]({
      threadId,
      reply: {
        version: 1,
        bridgeRequestId: show.bridgeRequestId,
        binding: show.binding,
        result: { operation: "show", status: "visible" },
      },
    });
    const prepare = yield* Queue.take(f.messages);
    if (!("bridgeRequestId" in prepare)) throw new Error("expected prepare");
    yield* f.client[A.WS_METHODS.terminalAutomationReplyBridge]({
      threadId,
      reply: {
        version: 1,
        bridgeRequestId: prepare.bridgeRequestId,
        binding: prepare.binding,
        result: { operation: "prepare_input", inputRequestId: "input-a", frame },
      },
    });
    const encode = yield* Queue.take(f.messages);
    if (!("bridgeRequestId" in encode)) throw new Error("expected encode");
    yield* f.client[A.WS_METHODS.terminalAutomationReplyBridge]({
      threadId,
      reply: {
        version: 1,
        bridgeRequestId: encode.bridgeRequestId,
        binding: encode.binding,
        result: {
          operation: "encode_input",
          inputRequestId: "input-a",
          frameRevision: 1,
          encodedText: "hello",
        },
      },
    });
    expect(yield* Fiber.join(input)).toMatchObject({ status: "written" });
    expect(f.writes).toEqual(["hello"]);
    yield* f.client[A.WS_METHODS.terminalAutomationReportEvent]({
      threadId,
      event: { version: 1, target, event: "human_intervened" },
    });
    expect(
      (yield* f.client[A.WS_METHODS.terminalAutomationResume]({ threadId, bindingId })).state
        .status,
    ).toBe("bound");
    expect((yield* f.service.status(f.caller)).state.status).toBe("bound");
  }),
);

it.effect("socket scope invalidation retires a waiting binding and blocks old callbacks", () =>
  Effect.gen(function* () {
    const f = yield* setup();
    yield* f.start;
    const bindingId = yield* f.bind;
    const input = yield* f.service
      .input(
        f.caller,
        { bindingId, requestId: "waiting", action: { type: "text", text: "never" } },
        Effect.void,
      )
      .pipe(Effect.forkChild);
    const show = yield* Queue.take(f.messages);
    if (!("bridgeRequestId" in show)) throw new Error("expected show");
    yield* Scope.close(f.socketScope, Exit.void);
    expect((yield* f.service.status(f.caller)).state.status).toBe("invalid");
    expect(yield* Fiber.join(input)).toMatchObject({
      status: "not_sent",
      error: { code: "client_unavailable" },
    });
    expect((yield* f.service.status(f.caller)).state.status).toBe("invalid");
    expect(
      yield* Effect.flip(
        f.client[A.WS_METHODS.terminalAutomationRegisterViews]({
          threadId,
          registration: { version: 1, views: [view] },
        }),
      ),
    ).toEqual({ code: "client_unavailable" });
    expect(f.writes).toEqual([]);
  }),
);

it.effect("socket scope invalidation retains unknown apply receipts without replay", () =>
  Effect.gen(function* () {
    const f = yield* setup();
    yield* f.start;
    const bindingId = yield* f.bind;
    const request = {
      bindingId,
      requestId: "scroll-a",
      action: {
        type: "mouse" as const,
        event: "wheel" as const,
        position: { column: 0, row: 0 },
        deltaColumns: 0,
        deltaRows: 2,
        modifiers: { ctrl: false, alt: false, shift: false, meta: false },
        frameRevision: 1,
      },
    };
    const running = yield* f.service.input(f.caller, request, Effect.void).pipe(Effect.forkChild);
    const reply = Effect.fn("test.reply")(function* (
      result: A.TerminalAutomationClientReply["result"],
    ) {
      const message = yield* Queue.take(f.messages);
      if (!("bridgeRequestId" in message)) throw new Error("expected bridge request");
      yield* f.client[A.WS_METHODS.terminalAutomationReplyBridge]({
        threadId,
        reply: {
          version: 1,
          bridgeRequestId: message.bridgeRequestId,
          binding: message.binding,
          result,
        },
      });
    });
    yield* reply({ operation: "show", status: "visible" });
    yield* reply({ operation: "prepare_input", inputRequestId: "scroll-a", frame });
    yield* reply({
      operation: "encode_input",
      inputRequestId: "scroll-a",
      frameRevision: 1,
      status: "local_action",
      localAction: { type: "scroll", deltaRows: 2 },
    });
    const apply = yield* Queue.take(f.messages);
    expect(apply).toMatchObject({ operation: "apply_local", inputRequestId: "scroll-a" });
    yield* Scope.close(f.socketScope, Exit.void);
    expect((yield* f.service.status(f.caller)).state.status).toBe("invalid");
    expect(yield* Fiber.join(running)).toEqual({ status: "unknown", requestId: "scroll-a" });
    expect(yield* f.service.input(f.caller, request, Effect.void)).toEqual({
      status: "unknown",
      requestId: "scroll-a",
    });
    expect(f.writes).toEqual([]);
  }),
);

it.effect(
  "subscription cancellation clears selection and a new subscription keeps old bindings invalid",
  () =>
    Effect.gen(function* () {
      const f = yield* setup();
      const subscription = yield* f.start;
      yield* f.client[A.WS_METHODS.terminalAutomationRegisterViews]({
        threadId,
        registration: {
          version: 1,
          views: [view, { ...view, target: { ...target, viewId: "second" } }],
        },
      });
      expect((yield* f.service.bind(f.caller, { mode: "auto" })).state.status).toBe(
        "selection_required",
      );
      const selection = yield* Queue.take(f.messages);
      expect(selection).toHaveProperty("selectionRequestId");
      yield* Fiber.interrupt(subscription);
      expect((yield* f.service.status(f.caller)).state.status).toBe("unbound");
      yield* f.start;
      const bindingId = yield* f.bind;
      yield* Scope.close(f.socketScope, Exit.void);
      expect((yield* f.service.status(f.caller)).state).toMatchObject({
        status: "invalid",
        binding: { bindingId },
      });
    }),
);

it.effect("authorization rejects registration and subscription before the adapter runs", () =>
  Effect.gen(function* () {
    const f = yield* setup([A.AuthTerminalReadScope]);
    expect(
      yield* Effect.flip(
        f.client[A.WS_METHODS.terminalAutomationRegisterViews]({
          threadId,
          registration: { version: 1, views: [view] },
        }),
      ),
    ).toMatchObject({ _tag: "EnvironmentAuthorizationError" });
    expect(
      yield* f.client[A.WS_METHODS.terminalAutomationSubscribe]({ threadId }).pipe(
        Stream.runCollect,
        Effect.flip,
      ),
    ).toMatchObject({ _tag: "EnvironmentAuthorizationError" });
    expect(
      yield* Effect.flip(
        f.client[A.WS_METHODS.terminalAutomationReportEvent]({
          threadId,
          event: { version: 1, target, event: "human_intervened" },
        }),
      ),
    ).toMatchObject({ _tag: "EnvironmentAuthorizationError" });
    expect(
      yield* Effect.flip(
        f.client[A.WS_METHODS.terminalAutomationResume]({ threadId, bindingId: "forged" }),
      ),
    ).toMatchObject({ _tag: "EnvironmentAuthorizationError" });
    expect(
      yield* Effect.flip(
        f.client[A.WS_METHODS.terminalAutomationReplySelection]({
          threadId,
          reply: {
            version: 1,
            selectionRequestId: "forged",
            candidateVersion: 0,
            choice: { status: "cancelled" },
          },
        }),
      ),
    ).toMatchObject({ _tag: "EnvironmentAuthorizationError" });
    expect(
      yield* Effect.flip(
        f.client[A.WS_METHODS.terminalAutomationReplyBridge]({
          threadId,
          reply: {
            version: 1,
            bridgeRequestId: "forged",
            binding: { bindingId: "forged", target, alias: "terminal", inputEpoch: 0 },
            result: { operation: "show", status: "visible" },
          },
        }),
      ),
    ).toMatchObject({ _tag: "EnvironmentAuthorizationError" });
  }),
);

it.effect("thread validation and RPC metadata isolate another client", () =>
  Effect.gen(function* () {
    const f = yield* setup();
    yield* f.start;
    const bindingId = yield* f.bind;
    expect(
      yield* Effect.flip(
        f.client[A.WS_METHODS.terminalAutomationRegisterViews]({
          threadId: A.ThreadId.make("other"),
          registration: { version: 1, views: [view] },
        }),
      ),
    ).toEqual({ code: "target_invalid" });
    expect(
      yield* Effect.flip(
        f.handlers[A.WS_METHODS.terminalAutomationRegisterViews](
          { threadId, registration: { version: 1, views: [view] } },
          { client: { id: 1 } },
        ),
      ),
    ).toEqual({ code: "client_unavailable" });
    const otherEvents = yield* Queue.unbounded<typeof A.TerminalAutomationRpcEvent.Type>();
    yield* f.handlers[A.WS_METHODS.terminalAutomationSubscribe](
      { threadId },
      { client: { id: 1 } },
    ).pipe(
      Stream.runForEach((event) => Queue.offer(otherEvents, event)),
      Effect.forkChild,
    );
    expect(yield* Queue.take(otherEvents)).toEqual({ type: "ready" });
    yield* f.client[A.WS_METHODS.terminalAutomationReportEvent]({
      threadId,
      event: { version: 1, target, event: "human_intervened" },
    });
    expect(
      yield* Effect.flip(
        f.handlers[A.WS_METHODS.terminalAutomationResume](
          { threadId, bindingId },
          { client: { id: 1 } },
        ),
      ),
    ).toEqual({ code: "stale_request" });
    yield* f.client[A.WS_METHODS.terminalAutomationResume]({ threadId, bindingId });
    const running = yield* f.service
      .input(
        f.caller,
        { bindingId, requestId: "wrong-window", action: { type: "text", text: "never" } },
        Effect.void,
      )
      .pipe(Effect.forkChild);
    const show = yield* Queue.take(f.messages);
    if (!("bridgeRequestId" in show)) throw new Error("expected show");
    expect(
      yield* Effect.flip(
        f.handlers[A.WS_METHODS.terminalAutomationReplyBridge](
          {
            threadId,
            reply: {
              version: 1,
              bridgeRequestId: show.bridgeRequestId,
              binding: show.binding,
              result: { operation: "show", status: "visible" },
            },
          },
          { client: { id: 1 } },
        ),
      ),
    ).toEqual({ code: "stale_request" });
    yield* Scope.close(f.socketScope, Exit.void);
    expect(yield* Fiber.join(running)).toMatchObject({ status: "not_sent" });
  }),
);

it.effect.each(["revoke", "replace with fewer scopes"] as const)(
  "%s closes the authenticated socket scope and ends pending automation",
  (operation) =>
    Effect.gen(function* () {
      const sessions = yield* SessionStore.SessionStore;
      const session = yield* sessions.issue({
        subject: "automation-rpc-test",
        scopes: [A.AuthTerminalReadScope, A.AuthTerminalOperateScope],
      });
      const f = yield* setup();
      yield* f.start;
      const bindingId = yield* f.bind;
      const input = yield* f.service
        .input(
          f.caller,
          { bindingId, requestId: "revoked", action: { type: "text", text: "never" } },
          Effect.void,
        )
        .pipe(Effect.forkChild);
      const pending = yield* Queue.take(f.messages);
      expect(pending).toHaveProperty("bridgeRequestId");
      const invalidation = yield* sessions
        .awaitInvalidation(session.sessionId)
        .pipe(Effect.andThen(Scope.close(f.socketScope, Exit.void)), Effect.forkChild);
      if (operation === "revoke") expect(yield* sessions.revoke(session.sessionId)).toBe(true);
      else
        yield* sessions.issue({
          subject: "automation-rpc-test",
          scopes: [A.AuthTerminalReadScope],
          replaceSessionId: session.sessionId,
        });
      yield* Fiber.join(invalidation);
      expect((yield* f.service.status(f.caller)).state.status).toBe("invalid");
      expect(yield* Fiber.join(input)).toMatchObject({
        status: "not_sent",
        error: { code: "client_unavailable" },
      });
      expect(f.writes).toEqual([]);
    }).pipe(
      Effect.provide(
        SessionStore.layer.pipe(
          Layer.provide(SqlitePersistence.layerMemory),
          Layer.provide(ServerSecretStore.layer),
          Layer.provide(
            Layer.succeed(ServerEnvironment.ServerEnvironmentIdentity, {
              getEnvironmentId: Effect.succeed(environmentId),
            }),
          ),
          Layer.provide(
            ServerConfig.layerTest(process.cwd(), { prefix: "t3-automation-rpc-test-" }),
          ),
          Layer.provideMerge(NodeServices.layer),
        ),
      ),
    ),
);
