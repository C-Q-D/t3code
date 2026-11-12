import { it } from "@effect/vitest";
import * as A from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Scope from "effect/Scope";
import * as TestClock from "effect/testing/TestClock";
import { expect } from "vite-plus/test";
import * as Automation from "./AutomationService.ts";
import * as Manager from "./Manager.ts";
import * as McpSessionRegistry from "../mcp/McpSessionRegistry.ts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { HttpServer } from "effect/http";
import * as NetAddress from "effect/net/NetAddress";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";

const scope: A.TerminalAutomationScope = {
  environmentId: A.EnvironmentId.make("env"),
  threadId: A.ThreadId.make("thread"),
};
const caller: Automation.Caller = {
  scope,
  callerId: "provider-a",
  selectionConnectionId: "client",
};
const view = (id = "one"): A.TerminalAutomationCandidate => ({
  candidateId: "untrusted",
  target: { terminalId: id, terminalInstanceId: `instance-${id}`, viewId: id },
  title: id,
  visible: true,
  readiness: "ready",
  clientKind: "web",
  capabilities: { show: true, read: true, input: true },
});
const setup = Effect.gen(function* () {
  const writes: string[] = [];
  const instances = new Map([
    ["one", "instance-one"],
    ["two", "instance-two"],
  ]);
  let humanInputEpoch = 0;
  let writeFailure = false;
  let beforeWrite: Effect.Effect<void> = Effect.void;
  let beforeInspect: Effect.Effect<void> = Effect.void;
  const manager = {
    inspectExisting: (input: A.TerminalObserveInput) =>
      Effect.suspend(() =>
        beforeInspect.pipe(
          Effect.andThen(
            Effect.suspend(() => {
              const terminalInstanceId = instances.get(input.terminalId);
              return terminalInstanceId
                ? Effect.succeed({ terminalInstanceId, humanInputEpoch })
                : Effect.fail(new A.TerminalNotRunningError(input));
            }),
          ),
        ),
      ),
    writeAutomation: (
      input: Parameters<Manager.TerminalManager["Service"]["writeAutomation"]>[0],
    ) =>
      Effect.suspend(() =>
        beforeWrite.pipe(
          Effect.andThen(
            Effect.suspend((): Effect.Effect<void, A.TerminalError> => {
              if (
                instances.get(input.terminalId) !== input.terminalInstanceId ||
                humanInputEpoch !== input.humanInputEpoch ||
                input.canWrite?.() === false
              )
                return Effect.fail(new A.TerminalNotRunningError(input));
              writes.push(input.data);
              if (writeFailure)
                return Effect.fail(
                  new A.TerminalWriteError({
                    threadId: input.threadId,
                    terminalId: input.terminalId,
                    terminalPid: 1,
                    cause: "lost acknowledgement",
                  }),
                );
              return Effect.void;
            }),
          ),
        ),
      ),
  };
  // Only the two Manager operations used by automation are external process boundaries.
  const service = yield* Automation.TerminalAutomationService.pipe(
    Effect.provide(
      Automation.layer.pipe(
        Layer.provide(
          Layer.succeed(Manager.TerminalManager, manager as Manager.TerminalManager["Service"]),
        ),
      ),
    ),
  );
  const messages = yield* service.connect(scope, "client");
  return {
    service,
    messages,
    writes,
    instances,
    humanInput: () => {
      humanInputEpoch += 1;
    },
    loseWriteReceipt: () => {
      writeFailure = true;
    },
    beforeNativeWrite: (effect: Effect.Effect<void>) => {
      beforeWrite = effect;
    },
    beforeInspect: (effect: Effect.Effect<void>) => {
      beforeInspect = effect;
    },
  };
});

it.effect(
  "publishes binding revisions before bridge work and clears delivered invitations on both clients",
  () =>
    Effect.gen(function* () {
      const f = yield* setup;
      const second = yield* f.service.connect(scope, "second");
      yield* f.service.registerViews("client", { version: 1, views: [view()] });
      const before = yield* f.service.getConnectionState("client");
      const changes = yield* f.service.watchState("client");
      const bound = yield* f.service.bind(caller, { mode: "auto" });
      const after = yield* f.service.getConnectionState("client");
      expect(after).toHaveProperty("revision");
      expect(after).not.toEqual(before);
      expect(yield* Queue.take(changes)).toEqual({
        type: "state_changed",
        revision: after.revision,
      });
      if (!("binding" in bound.state)) throw new Error("expected binding");
      yield* f.service.release(caller, { bindingId: bound.state.binding.bindingId });
      const released = yield* f.service.getConnectionState("client");
      expect(released.bindings).toEqual([]);
      expect(yield* Queue.take(changes)).toEqual({
        type: "state_changed",
        revision: released.revision,
      });
      yield* f.service.registerViews("second", { version: 1, views: [view("two")] });
      yield* f.service.bind({ scope, callerId: caller.callerId }, { mode: "request_selection" });
      const request = yield* Queue.take(f.messages);
      yield* Queue.take(second);
      if (!("selectionRequestId" in request)) throw new Error("expected invitation");
      expect(yield* f.service.getConnectionState("second")).toHaveProperty("selections", [request]);
      yield* f.service.replySelection("client", {
        version: 1,
        selectionRequestId: request.selectionRequestId,
        candidateVersion: request.candidateVersion,
        choice: { status: "cancelled" },
      });
      expect(yield* f.service.getConnectionState("second")).toHaveProperty("selections", []);
    }),
);

it.effect.each(["cancelled", "selected", "candidate change", "disconnect"] as const)(
  "invalidates already delivered invitations after %s",
  (outcome) =>
    Effect.gen(function* () {
      const f = yield* setup;
      const second = yield* f.service.connect(scope, "second");
      yield* f.service.registerViews("client", { version: 1, views: [view()] });
      yield* f.service.registerViews("second", { version: 1, views: [view("two")] });
      yield* f.service.bind({ scope, callerId: "model" }, { mode: "request_selection" });
      const invitation = yield* Queue.take(f.messages);
      expect(yield* Queue.take(second)).toEqual(invitation);
      if (!("selectionRequestId" in invitation)) throw new Error("expected selection");
      expect(yield* f.service.getConnectionState("second")).toHaveProperty("selections", [
        invitation,
      ]);
      if (outcome === "candidate change")
        yield* f.service.registerViews("client", { version: 1, views: [view()] });
      else if (outcome === "disconnect") yield* f.service.disconnect("client");
      else
        yield* f.service.replySelection("client", {
          version: 1,
          selectionRequestId: invitation.selectionRequestId,
          candidateVersion: invitation.candidateVersion,
          choice:
            outcome === "selected"
              ? { status: "selected", candidateId: invitation.candidates[0]!.candidateId }
              : { status: "cancelled" },
        });
      expect(yield* f.service.getConnectionState("second")).toHaveProperty("selections", []);
    }),
);

it.effect("does not notify again when a revoked binding is already invalid", () =>
  Effect.gen(function* () {
    const f = yield* setup;
    let allowed = true;
    const authorizedCaller = {
      ...caller,
      credentialAuthorization: { isValid: () => allowed, invalidated: Effect.never },
    };
    yield* f.service.registerViews("client", { version: 1, views: [view()] });
    yield* f.service.bind(authorizedCaller, { mode: "auto" });
    allowed = false;
    const invalid = yield* f.service.getConnectionState("client");
    expect(invalid.bindings).toMatchObject([{ status: "invalid" }]);
    expect(yield* f.service.getConnectionState("client")).toEqual(invalid);
  }),
);

it.effect("coalesces a full notification backlog and keeps unrelated scopes untouched", () =>
  Effect.gen(function* () {
    const f = yield* setup;
    yield* f.service.connect({ ...scope, threadId: A.ThreadId.make("unrelated") }, "unrelated");
    const unrelated = yield* f.service.watchState("unrelated");
    const changes = yield* f.service.watchState("client");
    yield* f.service.registerViews("client", { version: 1, views: [view()] });
    yield* f.service.bind(caller, { mode: "auto" });
    yield* Effect.forEach(Array.from({ length: 130 }), () =>
      f.service.reportEvent("client", {
        version: 1,
        target: view().target,
        event: "human_intervened",
      }),
    );
    expect(yield* Queue.size(changes)).toBe(1);
    const current = yield* f.service.getConnectionState("client");
    expect(yield* Queue.take(changes)).toEqual({
      type: "state_changed",
      revision: current.revision,
    });
    expect(current.bindings).toMatchObject([{ status: "paused", binding: { inputEpoch: 130 } }]);
    expect(yield* Queue.size(unrelated)).toBe(0);
  }),
);

it.effect(
  "connection state discovers paused owners before any bridge and omits released bindings",
  () =>
    Effect.gen(function* () {
      const f = yield* setup;
      yield* f.service.registerViews("client", { version: 1, views: [view()] });
      const first = yield* f.service.bind(caller, { mode: "auto" });
      const secondCaller = { ...caller, callerId: "provider-b" };
      yield* f.service.bind(secondCaller, { mode: "auto" });
      expect(yield* Queue.clear(f.messages)).toEqual([]);
      yield* f.service.reportEvent("client", {
        version: 1,
        target: view().target,
        event: "human_intervened",
      });
      const state = yield* f.service.getConnectionState("client");
      expect(state.bindings).toHaveLength(2);
      expect(state.bindings.map((entry) => entry.status)).toEqual(["paused", "paused"]);
      const bindingId = state.bindings[0]!.binding.bindingId;
      expect(first.state).toMatchObject({ binding: { bindingId } });
      expect((yield* f.service.resumeFromConnection("client", bindingId, 1)).state.status).toBe(
        "bound",
      );
      yield* f.service.release(caller, { bindingId });
      expect((yield* f.service.getConnectionState("client")).bindings).toHaveLength(1);
      yield* f.service.connect(scope, "other-window");
      yield* f.service.connect({ ...scope, threadId: A.ThreadId.make("other") }, "other-thread");
      yield* f.service.connect(
        { ...scope, environmentId: A.EnvironmentId.make("other") },
        "other-env",
      );
      for (const id of ["other-window", "other-thread", "other-env"]) {
        expect(yield* f.service.getConnectionState(id)).toEqual({
          version: 1,
          revision: 0,
          bindings: [],
          selections: [],
        });
      }
      yield* f.service.disconnect("client");
      expect(yield* Effect.flip(f.service.getConnectionState("client"))).toEqual({
        code: "client_unavailable",
      });
    }),
);

it.effect("connection state rejects a disconnected generation while inspecting a binding", () =>
  Effect.gen(function* () {
    const f = yield* setup;
    const testScope = yield* Scope.Scope;
    yield* bindOne(f.service);
    f.beforeInspect(
      Effect.gen(function* () {
        f.beforeInspect(Effect.void);
        yield* f.service.disconnect("client");
        yield* f.service.connect(scope, "client");
      }).pipe(Effect.provideService(Scope.Scope, testScope), Effect.orDie),
    );
    expect(yield* Effect.flip(f.service.getConnectionState("client"))).toEqual({
      code: "client_unavailable",
    });
  }),
);

it.effect("connection state queries do not allocate model owners", () =>
  Effect.gen(function* () {
    const f = yield* setup;
    yield* f.service.registerViews("client", { version: 1, views: [view()] });
    for (let index = 0; index < 130; index += 1) {
      expect(yield* f.service.getConnectionState("client")).toEqual({
        version: 1,
        revision: 0,
        bindings: [],
        selections: [],
      });
    }
    expect((yield* f.service.bind(caller, { mode: "auto" })).state.status).toBe("bound");
  }),
);

it.effect(
  "selection queue overflow rolls back invitations already delivered to another window",
  () =>
    Effect.gen(function* () {
      const f = yield* setup;
      const second = yield* f.service.connect(scope, "second");
      yield* f.service.registerViews("client", { version: 1, views: [view()] });
      yield* f.service.registerViews("second", { version: 1, views: [view("two")] });
      const filler: A.TerminalAutomationSelectionRequest = {
        version: 1,
        selectionRequestId: "filler",
        candidateVersion: 0,
        candidates: [],
      };
      const queue = second as Queue.Queue<
        A.TerminalAutomationSelectionRequest | A.TerminalAutomationClientRequest
      >;
      for (let i = 0; i < 128; i += 1) expect(Queue.offerUnsafe(queue, filler)).toBe(true);
      const model = { scope, callerId: "model" };
      expect(yield* f.service.bind(model, { mode: "auto" }).pipe(Effect.flip)).toEqual({
        code: "budget_exceeded",
      });
      expect(yield* Queue.clear(f.messages)).toEqual([]);
      expect((yield* f.service.status(model)).state.status).toBe("unbound");
      expect(yield* Queue.clear(second)).toHaveLength(128);
      expect((yield* f.service.bind(model, { mode: "auto" })).state.status).toBe(
        "selection_required",
      );
    }),
);

it.effect("routes model selection to real views and accepts only the first invited reply", () =>
  Effect.gen(function* () {
    const { service, messages, beforeInspect } = yield* setup;
    const model = { scope, callerId: "model" };
    const second = yield* service.connect(scope, "second");
    yield* service.connect(scope, "empty");
    yield* service.connect({ ...scope, threadId: A.ThreadId.make("elsewhere") }, "foreign");
    yield* service.registerViews("client", { version: 1, views: [view()] });
    yield* service.registerViews("second", { version: 1, views: [view("two")] });
    expect((yield* service.bind(model, { mode: "auto" })).state.status).toBe("selection_required");
    const request = yield* Queue.take(messages);
    expect(yield* Queue.take(second)).toEqual(request);
    if (!("selectionRequestId" in request)) throw new Error("expected selection");
    const reply: A.TerminalAutomationSelectionReply = {
      version: 1,
      selectionRequestId: request.selectionRequestId,
      candidateVersion: request.candidateVersion,
      choice: { status: "selected", candidateId: request.candidates[0]!.candidateId },
    };
    expect(yield* Effect.flip(service.replySelection("empty", reply))).toEqual({
      code: "stale_request",
    });
    expect(yield* Effect.flip(service.replySelection("foreign", reply))).toEqual({
      code: "stale_request",
    });
    const racing = yield* Deferred.make<void>();
    const proceed = yield* Deferred.make<void>();
    let inspections = 0;
    beforeInspect(
      Effect.gen(function* () {
        inspections += 1;
        if (inspections === 2) yield* Deferred.succeed(racing, undefined);
        yield* Deferred.await(proceed);
      }),
    );
    const first = yield* service
      .replySelection("second", reply)
      .pipe(Effect.result, Effect.forkChild);
    const next = yield* service
      .replySelection("client", reply)
      .pipe(Effect.result, Effect.forkChild);
    yield* Deferred.await(racing);
    beforeInspect(Effect.void);
    yield* Deferred.succeed(proceed, undefined);
    const results = [yield* Fiber.join(first), yield* Fiber.join(next)];
    expect(results.filter((result) => result._tag === "Success")).toHaveLength(1);
    expect(results.filter((result) => result._tag === "Failure")).toMatchObject([
      { failure: { code: "stale_request" } },
    ]);
    expect((yield* service.status(model)).state.status).toBe("bound");
  }),
);

it.effect.each([
  ["authorization", "selected"],
  ["authorization", "cancelled"],
  ["authorization-failure", "selected"],
  ["authorization-failure", "cancelled"],
  ["authorization-failure", "replaced"],
  ["authorization", "replaced"],
  ["inspect", "selected"],
  ["inspect", "cancelled"],
  ["inspect", "replaced"],
] as const)("rejects a late selection after %s yields to %s", ([stage, outcome]) =>
  Effect.gen(function* () {
    const f = yield* setup;
    const entered = yield* Deferred.make<void>();
    const proceed = yield* Deferred.make<void>();
    const wait = Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(proceed)));
    let authorizations = 0;
    const model: Automation.Caller = {
      scope,
      callerId: "model",
      authorizeSelection: (select) =>
        Effect.gen(function* () {
          authorizations += 1;
          if (stage.startsWith("authorization") && authorizations === 1) {
            yield* wait;
            if (stage === "authorization-failure")
              return yield* Effect.fail({ code: "target_invalid" as const });
          }
          return yield* select(Effect.void);
        }),
    };
    yield* f.service.connect(scope, "second");
    yield* f.service.registerViews("client", { version: 1, views: [view()] });
    yield* f.service.registerViews("second", { version: 1, views: [view("two")] });
    yield* f.service.bind(model, { mode: "auto" });
    const request = yield* Queue.take(f.messages);
    if (!("selectionRequestId" in request)) throw new Error("expected selection");
    let inspections = 0;
    f.beforeInspect(
      Effect.suspend(() => {
        inspections += 1;
        return stage === "inspect" && inspections === 3 ? wait : Effect.void;
      }),
    );
    const reply = {
      version: 1 as const,
      selectionRequestId: request.selectionRequestId,
      candidateVersion: request.candidateVersion,
    };
    const late = yield* f.service
      .replySelection("client", {
        ...reply,
        choice: { status: "selected", candidateId: request.candidates[0]!.candidateId },
      })
      .pipe(Effect.result, Effect.forkChild);
    yield* Deferred.await(entered);
    yield* f.service.replySelection("second", {
      ...reply,
      choice:
        outcome === "selected"
          ? { status: "selected", candidateId: request.candidates[1]!.candidateId }
          : { status: "cancelled" },
    });
    if (outcome === "replaced") yield* f.service.bind(model, { mode: "auto" });
    const winningState = (yield* f.service.status(model)).state;
    expect(winningState.status).toBe(
      outcome === "selected" ? "bound" : outcome === "replaced" ? "selection_required" : "unbound",
    );
    yield* Deferred.succeed(proceed, undefined);
    expect(yield* Fiber.join(late)).toMatchObject({
      _tag: "Failure",
      failure: { code: "stale_request" },
    });
    expect((yield* f.service.status(model)).state).toEqual(winningState);
  }),
);

it.effect("model selection cleans queued invitations on candidate changes and disconnect", () =>
  Effect.gen(function* () {
    const { service, messages } = yield* setup;
    const model = { scope, callerId: "model" };
    const second = yield* service.connect(scope, "second");
    yield* service.registerViews("client", { version: 1, views: [view()] });
    yield* service.registerViews("second", { version: 1, views: [view("two")] });
    yield* service.bind(model, { mode: "auto" });
    const old = yield* Queue.take(messages);
    if (!("selectionRequestId" in old)) throw new Error("expected selection");
    yield* service.registerViews("second", { version: 1, views: [view("two")] });
    expect(yield* Queue.clear(second)).toEqual([]);
    expect(
      yield* Effect.flip(
        service.replySelection("client", {
          version: 1,
          selectionRequestId: old.selectionRequestId,
          candidateVersion: old.candidateVersion,
          choice: { status: "selected", candidateId: old.candidates[0]!.candidateId },
        }),
      ),
    ).toEqual({ code: "stale_request" });
    yield* service.bind(model, { mode: "auto" });
    yield* service.disconnect("second");
    expect(yield* Queue.clear(messages)).toEqual([]);
    expect((yield* service.status(model)).state.status).toBe("unbound");
    expect((yield* service.bind(model, { mode: "auto" })).state.status).toBe("bound");
  }),
);

it.effect("an undeliverable trusted selection route fails without a pending selection", () =>
  Effect.gen(function* () {
    const { service } = yield* setup;
    yield* service.registerViews("client", { version: 1, views: [view(), view("two")] });
    const missing = { ...caller, selectionConnectionId: "missing" };
    expect(yield* Effect.flip(service.bind(missing, { mode: "auto" }))).toEqual({
      code: "client_unavailable",
    });
    expect((yield* service.status(missing)).state.status).toBe("unbound");
  }),
);

it.effect("connection confirmation resumes the original model owner only", () =>
  Effect.gen(function* () {
    const { service } = yield* setup;
    const bindingId = yield* bindOne(service);
    yield* service.connect(scope, "other-window");
    yield* service.connect({ ...scope, threadId: A.ThreadId.make("other") }, "other-thread");
    yield* service.connect({ ...scope, environmentId: A.EnvironmentId.make("other") }, "other-env");
    yield* service.reportEvent("client", {
      version: 1,
      target: view().target,
      event: "human_intervened",
    });
    expect(yield* Effect.flip(service.resumeFromConnection("other-window", bindingId, 1))).toEqual({
      code: "stale_request",
    });
    expect(yield* Effect.flip(service.resumeFromConnection("other-thread", bindingId, 1))).toEqual({
      code: "stale_request",
    });
    expect(yield* Effect.flip(service.resumeFromConnection("other-env", bindingId, 1))).toEqual({
      code: "stale_request",
    });
    expect((yield* service.status(caller)).state.status).toBe("paused");
    expect((yield* service.resumeFromConnection("client", bindingId, 1)).state).toMatchObject({
      status: "bound",
      binding: { bindingId },
    });
    expect((yield* service.status(caller)).state).toMatchObject({
      status: "bound",
      binding: { bindingId },
    });
    yield* service.disconnect("client");
    expect(yield* Effect.flip(service.resumeFromConnection("client", bindingId, 1))).toEqual({
      code: "stale_request",
    });
  }),
);

it.effect("connection confirmation cannot clear a newer human pause", () =>
  Effect.gen(function* () {
    const f = yield* setup;
    const bindingId = yield* bindOne(f.service);
    const pause = f.service.reportEvent("client", {
      version: 1,
      target: view().target,
      event: "human_intervened",
    });
    yield* pause;
    f.beforeInspect(
      Effect.gen(function* () {
        f.beforeInspect(Effect.void);
        f.humanInput();
        yield* pause.pipe(Effect.orDie);
      }),
    );
    expect(yield* Effect.flip(f.service.resumeFromConnection("client", bindingId, 1))).toEqual({
      code: "stale_request",
    });
    expect((yield* f.service.status(caller)).state.status).toBe("paused");
    expect(
      yield* f.service.input(
        caller,
        { bindingId, requestId: "after-pause", action: { type: "text", text: "x" } },
        Effect.void,
      ),
    ).toMatchObject({ status: "not_sent", error: { code: "human_intervened" } });
    expect(f.writes).toEqual([]);
  }),
);

it.effect("connection confirmation rejects an epoch from an earlier completed pause", () =>
  Effect.gen(function* () {
    const f = yield* setup;
    const bindingId = yield* bindOne(f.service);
    const pause = f.service.reportEvent("client", {
      version: 1,
      target: view().target,
      event: "human_intervened",
    });
    yield* pause;
    yield* pause;
    expect(yield* Effect.flip(f.service.resumeFromConnection("client", bindingId, 1))).toEqual({
      code: "stale_request",
    });
    expect((yield* f.service.resumeFromConnection("client", bindingId, 2)).state.status).toBe(
      "bound",
    );
  }),
);

it.effect("connection confirmation cannot revive a binding disconnected during inspect", () =>
  Effect.gen(function* () {
    const fixture = yield* setup;
    const bindingId = yield* bindOne(fixture.service);
    yield* fixture.service.reportEvent("client", {
      version: 1,
      target: view().target,
      event: "human_intervened",
    });
    fixture.beforeInspect(fixture.service.disconnect("client"));
    expect(
      yield* Effect.flip(fixture.service.resumeFromConnection("client", bindingId, 1)),
    ).toEqual({
      code: "stale_request",
    });
    expect((yield* fixture.service.status(caller)).state.status).toBe("invalid");
  }),
);

it.effect("release restores binding and owner capacity without replaying retired IDs", () =>
  Effect.gen(function* () {
    const { service, writes } = yield* setup;
    const bindingId = yield* bindOne(service);
    const denied = Effect.fail({ code: "target_invalid" as const });
    yield* Effect.forEach(
      Array.from({ length: 256 }, (_, index) => String(index)),
      (requestId) =>
        service.input(
          caller,
          { bindingId, requestId, action: { type: "text", text: "x" } },
          denied,
        ),
    );
    yield* service.release(caller, { bindingId });
    const fresh = yield* service.bind(caller, { mode: "auto" });
    if (fresh.state.status !== "bound") throw new Error("expected binding");
    expect(
      yield* service.input(
        caller,
        {
          bindingId: fresh.state.binding.bindingId,
          requestId: "new",
          action: { type: "text", text: "x" },
        },
        denied,
      ),
    ).toMatchObject({ status: "not_sent", error: { code: "target_invalid" } });
    expect(
      yield* service.input(
        caller,
        { bindingId, requestId: "0", action: { type: "text", text: "x" } },
        permission,
      ),
    ).toMatchObject({ status: "not_sent" });
    yield* service.release(caller, { bindingId: fresh.state.binding.bindingId });
    yield* Effect.forEach(
      Array.from({ length: 129 }, (_, index) => `owner-${index}`),
      (callerId) =>
        Effect.gen(function* () {
          const who = { ...caller, callerId };
          const bound = yield* service.bind(who, { mode: "auto" });
          if (bound.state.status !== "bound") throw new Error("expected binding");
          yield* service.release(who, { bindingId: bound.state.binding.bindingId });
        }),
    );
    expect((yield* service.status({ ...caller, callerId: "last" })).state.status).toBe("unbound");
    expect(writes).toEqual([]);
  }),
);

it.effect("other environments and threads do not invalidate a pending selection", () =>
  Effect.gen(function* () {
    const { service, messages } = yield* setup;
    yield* service.registerViews("client", { version: 1, views: [view(), view("two")] });
    yield* service.bind(caller, { mode: "auto" });
    const request = yield* Queue.take(messages);
    if (!("selectionRequestId" in request)) throw new Error("expected selection");
    yield* service.connect({ ...scope, environmentId: A.EnvironmentId.make("other") }, "other-env");
    yield* service.registerViews("other-env", { version: 1, views: [view()] });
    yield* service.connect({ ...scope, threadId: A.ThreadId.make("other") }, "other-thread");
    yield* service.registerViews("other-thread", { version: 1, views: [view()] });
    yield* service.disconnect("other-env");
    expect((yield* service.status(caller)).state).toMatchObject({
      status: "selection_required",
      selectionRequestId: request.selectionRequestId,
    });
    yield* service.replySelection("client", {
      version: 1,
      selectionRequestId: request.selectionRequestId,
      candidateVersion: request.candidateVersion,
      choice: { status: "selected", candidateId: request.candidates[0]!.candidateId },
    });
    expect((yield* service.status(caller)).state.status).toBe("bound");
  }),
);

it.effect("an original stale mouse frame is rejected before encode", () =>
  Effect.gen(function* () {
    const { service, messages, writes } = yield* setup;
    const bindingId = yield* bindOne(service);
    const running = yield* service
      .input(
        caller,
        {
          bindingId,
          requestId: "old",
          action: {
            type: "mouse",
            event: "press",
            button: "left",
            position: { column: 1, row: 1 },
            modifiers: { ctrl: false, alt: false, shift: false, meta: false },
            frameRevision: 0,
          },
        },
        permission,
      )
      .pipe(Effect.forkChild);
    const show = yield* takeBridge(messages);
    yield* service.replyBridge("client", {
      version: 1,
      bridgeRequestId: show.bridgeRequestId,
      binding: show.binding,
      result: { operation: "show", status: "visible" },
    });
    const prepare = yield* takeBridge(messages);
    yield* service.replyBridge("client", {
      version: 1,
      bridgeRequestId: prepare.bridgeRequestId,
      binding: prepare.binding,
      result: { operation: "prepare_input", inputRequestId: "old", frame },
    });
    expect(yield* Effect.raceFirst(Fiber.join(running), Queue.take(messages))).toMatchObject({
      status: "not_sent",
      error: { code: "stale_request" },
    });
    expect(writes).toEqual([]);
  }),
);

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
const permission = Effect.void;
const credential = Effect.gen(function* () {
  const registry = yield* McpSessionRegistry.__testing.make().pipe(
    Effect.provideService(ServerEnvironment.ServerEnvironment, {
      getEnvironmentId: Effect.succeed(scope.environmentId),
      getDescriptor: Effect.die("unused"),
    }),
    Effect.provideService(HttpServer.HttpServer, {
      address: NetAddress.inetAddressFromIpStringUnsafe("127.0.0.1", 43123),
      serve: (() => Effect.void) as HttpServer.HttpServer["Service"]["serve"],
    }),
    Effect.provide(NodeServices.layer),
  );
  const issued = yield* registry.issue({
    threadId: scope.threadId,
    providerInstanceId: A.ProviderInstanceId.make("codex"),
  });
  const invocation = yield* registry.resolve(issued.config.authorizationHeader.slice(7));
  if (!invocation?.credentialAuthorization) throw new Error("missing credential authorization");
  return {
    authorization: invocation.credentialAuthorization,
    revoke: registry.revokeThread(scope.threadId),
  };
});

const startBindAtAcquisition = (service: Automation.TerminalAutomationService["Service"]) => {
  let operations = 0;
  const tasks: Array<() => void> = [];
  const firstCaller = { ...caller, callerId: "first" };
  // oxlint-disable-next-line t3code/no-manual-effect-runtime-in-tests -- A separate scheduler must pause acquisition without pausing the competing test fiber.
  const first = Effect.runFork(service.bind(firstCaller, { mode: "auto" }).pipe(Effect.result), {
    scheduler: {
      executionMode: "async",
      shouldYield: () => ++operations === 13,
      makeDispatcher: () => ({
        scheduleTask: (task) => {
          tasks.push(task);
        },
        flush: () => {
          while (tasks.length) tasks.shift()!();
        },
      }),
    },
  });
  return {
    first,
    flush: () => {
      while (tasks.length) tasks.shift()!();
    },
  };
};

it.effect("owner acquisition reserves capacity before a scheduler handoff", () =>
  Effect.gen(function* () {
    const { service } = yield* setup;
    yield* service.registerViews("client", { version: 1, views: [view()] });
    for (let index = 0; index < 127; index++) {
      yield* service.bind({ ...caller, callerId: `occupied-${index}` }, { mode: "auto" });
    }
    const { first, flush } = startBindAtAcquisition(service);
    const second = yield* service
      .bind({ ...caller, callerId: "second" }, { mode: "auto" })
      .pipe(Effect.result);
    // Drain the controlled scheduler, not a clock or a polled application condition.
    flush();
    const result = yield* Fiber.join(first);
    const outcomes = [result, second];
    expect(outcomes.filter((outcome) => outcome._tag === "Success")).toHaveLength(1);
    expect(outcomes).toContainEqual(
      expect.objectContaining({ _tag: "Failure", failure: { code: "budget_exceeded" } }),
    );
    for (const outcome of outcomes) {
      if (outcome._tag === "Success") expect(outcome.success.state.status).toBe("bound");
    }
  }),
);

it.effect("in-flight binding owners retain their capacity reservation", () =>
  Effect.gen(function* () {
    const { service, beforeInspect } = yield* setup;
    yield* service.registerViews("client", { version: 1, views: [view()] });
    const ready = yield* Deferred.make<void>();
    const overflow = yield* Deferred.make<"overflow">();
    const gate = yield* Deferred.make<void>();
    let calls = 0;
    beforeInspect(
      Effect.suspend(() => {
        calls += 1;
        const mark =
          calls === 128
            ? Deferred.succeed(ready, undefined).pipe(Effect.asVoid)
            : calls === 129
              ? Deferred.succeed(overflow, "overflow").pipe(Effect.asVoid)
              : Effect.void;
        return mark.pipe(Effect.andThen(Deferred.await(gate)));
      }),
    );
    const running = yield* Effect.forEach(
      Array.from({ length: 128 }, (_, index) => `pending-${index}`),
      (callerId) =>
        service
          .bind({ ...caller, callerId }, { mode: "auto" })
          .pipe(Effect.result, Effect.forkChild),
    );
    yield* Deferred.await(ready);
    const outcome = yield* Effect.raceFirst(
      service.bind({ ...caller, callerId: "extra" }, { mode: "auto" }).pipe(Effect.result),
      Deferred.await(overflow),
    );
    yield* Effect.forEach(running, Fiber.interrupt);
    yield* Deferred.succeed(gate, undefined);
    expect(outcome).toMatchObject({ _tag: "Failure", failure: { code: "budget_exceeded" } });
  }),
);

it.effect.each([
  { startLine: 11, endLineExclusive: 12 },
  { startLine: 10, endLineExclusive: 11 },
])(
  "complete history cannot omit requested lines with range $startLine..$endLineExclusive",
  (returnedRange) =>
    Effect.gen(function* () {
      const { service, messages } = yield* setup;
      const bindingId = yield* bindOne(service);
      const running = yield* service
        .read(
          caller,
          {
            bindingId,
            query: {
              source: "history",
              activeScreen: "primary",
              range: { startLine: 10, endLineExclusive: 12 },
              budget: { maxCodeUnits: 2, maxLines: 1 },
            },
          },
          permission,
        )
        .pipe(Effect.result, Effect.forkChild);
      const request = yield* takeBridge(messages);
      yield* service.replyBridge("client", {
        version: 1,
        bridgeRequestId: request.bridgeRequestId,
        binding: request.binding,
        result: {
          operation: "read",
          read: {
            source: "history",
            frame,
            text: "A",
            returnedRange,
            nextCursor: null,
            continuity: "complete",
            truncated: false,
            change: "data",
            softWrapAfterLines: [],
            process: { status: "running" },
          },
        },
      });
      expect(yield* Fiber.join(running)).toMatchObject({
        _tag: "Failure",
        failure: { code: "stale_request" },
      });
    }),
);

it.effect("same-scope view changes invalidate only the outstanding selection", () =>
  Effect.gen(function* () {
    const { service, messages } = yield* setup;
    yield* service.registerViews("client", { version: 1, views: [view(), view("two")] });
    yield* service.bind(caller, { mode: "auto" });
    const selection = yield* Queue.take(messages);
    if (!("selectionRequestId" in selection)) throw new Error("expected selection");
    yield* service.registerViews("client", { version: 1, views: [view()] });
    expect((yield* service.status(caller)).state.status).toBe("unbound");
    expect(
      yield* Effect.flip(
        service.replySelection("client", {
          version: 1,
          selectionRequestId: selection.selectionRequestId,
          candidateVersion: selection.candidateVersion,
          choice: { status: "selected", candidateId: selection.candidates[0]!.candidateId },
        }),
      ),
    ).toEqual({ code: "stale_request" });
  }),
);

it.effect("duplicates share the original deadline while authorization is blocked", () =>
  Effect.gen(function* () {
    const { service } = yield* setup;
    const bindingId = yield* bindOne(service);
    const started = yield* Deferred.make<void>();
    const block = yield* Deferred.make<void>();
    const request: A.TerminalAutomationInput = {
      bindingId,
      requestId: "waiting",
      action: { type: "text", text: "x" },
    };
    const authorize = Deferred.succeed(started, undefined).pipe(
      Effect.andThen(Deferred.await(block)),
    );
    const first = yield* service.input(caller, request, authorize).pipe(Effect.forkChild);
    yield* Deferred.await(started);
    const duplicate = yield* service.input(caller, request, permission).pipe(Effect.forkChild);
    yield* TestClock.adjust("10 seconds");
    expect(yield* Fiber.join(duplicate)).toMatchObject({ status: "not_sent" });
    expect(yield* Fiber.join(first)).toMatchObject({ status: "not_sent" });
  }),
);
const takeBridge = Effect.fn("test.takeBridge")(function* (
  messages: Queue.Dequeue<A.TerminalAutomationClientRequest | A.TerminalAutomationSelectionRequest>,
) {
  const request = yield* Queue.take(messages);
  if (!("operation" in request)) throw new Error("expected bridge request");
  return request;
});
const bindOne = Effect.fn("test.bindOne")(function* (
  service: Automation.TerminalAutomationService["Service"],
) {
  yield* service.registerViews("client", { version: 1, views: [view()] });
  const bound = yield* service.bind(caller, { mode: "auto" });
  if (bound.state.status !== "bound") throw new Error("expected binding");
  return bound.state.binding.bindingId;
});

const prepareToEncode = Effect.fn("test.prepareToEncode")(function* (
  service: Automation.TerminalAutomationService["Service"],
  messages: Queue.Dequeue<A.TerminalAutomationClientRequest | A.TerminalAutomationSelectionRequest>,
  requestId = "request",
) {
  const show = yield* takeBridge(messages);
  yield* service.replyBridge("client", {
    version: 1,
    bridgeRequestId: show.bridgeRequestId,
    binding: show.binding,
    result: { operation: "show", status: "visible" },
  });
  const prepare = yield* takeBridge(messages);
  yield* service.replyBridge("client", {
    version: 1,
    bridgeRequestId: prepare.bridgeRequestId,
    binding: prepare.binding,
    result: { operation: "prepare_input", inputRequestId: requestId, frame },
  });
  return yield* takeBridge(messages);
});

const wheel: A.TerminalAutomationAction = {
  type: "mouse",
  event: "wheel",
  position: { column: 1, row: 1 },
  deltaColumns: 0,
  deltaRows: 3,
  modifiers: { ctrl: false, alt: false, shift: false, meta: false },
  frameRevision: 1,
};

const encodeLocal = Effect.fn("test.encodeLocal")(function* (
  service: Automation.TerminalAutomationService["Service"],
  messages: Queue.Dequeue<A.TerminalAutomationClientRequest | A.TerminalAutomationSelectionRequest>,
  deltaRows = 3,
) {
  const encode = yield* prepareToEncode(service, messages);
  yield* service.replyBridge("client", {
    version: 1,
    bridgeRequestId: encode.bridgeRequestId,
    binding: encode.binding,
    result: {
      operation: "encode_input",
      inputRequestId: "request",
      frameRevision: 1,
      status: "local_action",
      localAction: { type: "scroll", deltaRows },
    },
  });
});

it.effect("cancelling after apply dispatch preserves an unknown receipt", () =>
  Effect.gen(function* () {
    const { service, messages, writes } = yield* setup;
    const bindingId = yield* bindOne(service);
    const input: A.TerminalAutomationInput = { bindingId, requestId: "request", action: wheel };
    const running = yield* service.input(caller, input, permission).pipe(Effect.forkChild);
    yield* encodeLocal(service, messages);
    const apply = yield* takeBridge(messages);
    yield* Fiber.interrupt(running);
    expect(
      (yield* service.status(caller, { receipt: { bindingId, requestId: "request" } })).inputResult,
    ).toEqual({ status: "unknown", requestId: "request" });
    expect(yield* service.input(caller, input, permission)).toEqual({
      status: "unknown",
      requestId: "request",
    });
    expect(
      yield* Effect.flip(
        service.replyBridge("client", {
          version: 1,
          bridgeRequestId: apply.bridgeRequestId,
          binding: apply.binding,
          result: { operation: "apply_local", inputRequestId: "request", status: "local_applied" },
        }),
      ),
    ).toEqual({ code: "stale_request" });
    expect(writes).toEqual([]);
  }),
);

it.effect("apply replies require the original connection input ID and epoch", () =>
  Effect.gen(function* () {
    const { service, messages, writes } = yield* setup;
    const bindingId = yield* bindOne(service);
    const running = yield* service
      .input(caller, { bindingId, requestId: "request", action: wheel }, permission)
      .pipe(Effect.forkChild);
    yield* encodeLocal(service, messages);
    const apply = yield* takeBridge(messages);
    const reply: A.TerminalAutomationClientReply = {
      version: 1,
      bridgeRequestId: apply.bridgeRequestId,
      binding: apply.binding,
      result: { operation: "apply_local", inputRequestId: "request", status: "local_applied" },
    };
    yield* service.connect(scope, "wrong-local");
    expect(yield* Effect.flip(service.replyBridge("wrong-local", reply))).toEqual({
      code: "stale_request",
    });
    expect(
      yield* Effect.flip(
        service.replyBridge("client", { ...reply, binding: { ...reply.binding, inputEpoch: 7 } }),
      ),
    ).toEqual({ code: "stale_request" });
    expect(
      yield* Effect.flip(
        service.replyBridge("client", {
          ...reply,
          result: { operation: "apply_local", inputRequestId: "other", status: "local_applied" },
        }),
      ),
    ).toEqual({ code: "stale_request" });
    yield* service.replyBridge("client", {
      ...reply,
      result: {
        operation: "apply_local",
        inputRequestId: "request",
        error: { code: "stale_request" },
      },
    });
    expect(yield* Fiber.join(running)).toMatchObject({
      status: "not_sent",
      error: { code: "stale_request" },
    });
    expect(writes).toEqual([]);
  }),
);

it.effect.each([-3, 2])("rejects a local plan that changes wheel rows to %s", (deltaRows) =>
  Effect.gen(function* () {
    const { service, messages, writes } = yield* setup;
    const bindingId = yield* bindOne(service);
    const running = yield* service
      .input(caller, { bindingId, requestId: "request", action: wheel }, permission)
      .pipe(Effect.forkChild);
    yield* encodeLocal(service, messages, deltaRows);
    expect(yield* Effect.raceFirst(Fiber.join(running), Queue.take(messages))).toMatchObject({
      status: "not_sent",
      error: { code: "stale_request" },
    });
    expect(writes).toEqual([]);
  }),
);

it.effect("apply timeout preserves unknown and late replies cannot replay the scroll", () =>
  Effect.gen(function* () {
    const { service, messages, writes } = yield* setup;
    const bindingId = yield* bindOne(service);
    const input: A.TerminalAutomationInput = { bindingId, requestId: "request", action: wheel };
    const running = yield* service.input(caller, input, permission).pipe(Effect.forkChild);
    yield* encodeLocal(service, messages);
    const apply = yield* takeBridge(messages);
    expect(apply.operation).toBe("apply_local");
    yield* TestClock.adjust("10 seconds");
    expect(yield* Fiber.join(running)).toEqual({ status: "unknown", requestId: "request" });
    expect(yield* service.input(caller, input, permission)).toEqual({
      status: "unknown",
      requestId: "request",
    });
    expect(
      (yield* service.status(caller, { receipt: { bindingId, requestId: "request" } })).inputResult,
    ).toEqual({ status: "unknown", requestId: "request" });
    expect(
      yield* Effect.flip(
        service.replyBridge("client", {
          version: 1,
          bridgeRequestId: apply.bridgeRequestId,
          binding: apply.binding,
          result: { operation: "apply_local", inputRequestId: "request", status: "local_applied" },
        }),
      ),
    ).toEqual({ code: "stale_request" });
    expect(yield* Queue.size(messages)).toBe(0);
    expect(writes).toEqual([]);
  }),
);

it.effect("release after dispatch resolves the apply and duplicates as unknown", () =>
  Effect.gen(function* () {
    const { service, messages, writes } = yield* setup;
    const bindingId = yield* bindOne(service);
    const input: A.TerminalAutomationInput = { bindingId, requestId: "request", action: wheel };
    const running = yield* service.input(caller, input, permission).pipe(Effect.forkChild);
    yield* encodeLocal(service, messages);
    const apply = yield* takeBridge(messages);
    yield* service.release(caller, { bindingId });
    expect(yield* Fiber.join(running)).toEqual({ status: "unknown", requestId: "request" });
    expect(yield* service.input(caller, input, permission)).toEqual({
      status: "unknown",
      requestId: "request",
    });
    expect(
      yield* Effect.flip(
        service.replyBridge("client", {
          version: 1,
          bridgeRequestId: apply.bridgeRequestId,
          binding: apply.binding,
          result: { operation: "apply_local", inputRequestId: "request", status: "local_applied" },
        }),
      ),
    ).toEqual({ code: "stale_request" });
    expect((yield* service.bind(caller, { mode: "auto" })).state.status).toBe("bound");
    expect(writes).toEqual([]);
  }),
);

it.effect("active revocation cancels an encoded plan while authorization is pending", () =>
  Effect.gen(function* () {
    const { service, messages, writes } = yield* setup;
    const bindingId = yield* bindOne(service);
    const rechecking = yield* Deferred.make<void>();
    const block = yield* Deferred.make<void>();
    let checks = 0;
    const authorize = Effect.suspend(() =>
      ++checks === 1
        ? Effect.void
        : Deferred.succeed(rechecking, undefined).pipe(Effect.andThen(Deferred.await(block))),
    );
    const running = yield* service
      .input(caller, { bindingId, requestId: "request", action: wheel }, authorize)
      .pipe(Effect.forkChild);
    yield* encodeLocal(service, messages);
    yield* Deferred.await(rechecking);
    yield* service.revoke(caller, bindingId);
    expect(yield* Fiber.join(running)).toMatchObject({
      status: "not_sent",
      error: { code: "target_invalid" },
    });
    expect(yield* Queue.size(messages)).toBe(0);
    expect(writes).toEqual([]);
  }),
);

it.effect.each([
  { offset: 0, text: "A", nextLine: 10, nextOffset: 1, soft: [] },
  { offset: 1, text: "😀", nextLine: 10, nextOffset: 3, soft: [] },
  { offset: 3, text: "B", nextLine: 11, nextOffset: 0, soft: [10] },
])(
  "accepts physical-line continuation from offset $offset",
  ({ offset, text, nextLine, nextOffset, soft }) =>
    Effect.gen(function* () {
      const { service, messages } = yield* setup;
      const bindingId = yield* bindOne(service);
      const running = yield* service
        .read(
          caller,
          {
            bindingId,
            query: {
              source: "history",
              activeScreen: "primary",
              frameRevision: 1,
              codeUnitOffset: offset,
              range: { startLine: 10, endLineExclusive: 12 },
              budget: { maxCodeUnits: 2, maxLines: 1 },
            },
          },
          permission,
        )
        .pipe(Effect.forkChild);
      const request = yield* takeBridge(messages);
      yield* service.replyBridge("client", {
        version: 1,
        bridgeRequestId: request.bridgeRequestId,
        binding: request.binding,
        result: {
          operation: "read",
          read: {
            source: "history",
            frame,
            text,
            returnedRange: { startLine: 10, endLineExclusive: 11 },
            nextCursor: {
              source: "history",
              activeScreen: "primary",
              frameRevision: 1,
              nextLine,
              codeUnitOffset: nextOffset,
            },
            continuity: "complete",
            truncated: true,
            change: "data",
            softWrapAfterLines: soft,
            process: { status: "running" },
          },
        },
      });
      expect((yield* Fiber.join(running)).text).toBe(text);
    }),
);

it.effect("history continuation must advance within the requested physical line and frame", () =>
  Effect.gen(function* () {
    const { service, messages } = yield* setup;
    const bindingId = yield* bindOne(service);
    const request: A.TerminalAutomationReadInput = {
      bindingId,
      query: {
        source: "history",
        activeScreen: "primary",
        frameRevision: 1,
        range: { startLine: 10, endLineExclusive: 12 },
        codeUnitOffset: 1,
        budget: { maxCodeUnits: 2, maxLines: 1 },
      },
    };
    const running = yield* service
      .read(caller, request, permission)
      .pipe(Effect.result, Effect.forkChild);
    const bridge = yield* takeBridge(messages);
    yield* service.replyBridge("client", {
      version: 1,
      bridgeRequestId: bridge.bridgeRequestId,
      binding: bridge.binding,
      result: {
        operation: "read",
        read: {
          source: "history",
          frame,
          text: "😀",
          returnedRange: { startLine: 10, endLineExclusive: 11 },
          nextCursor: {
            source: "history",
            activeScreen: "primary",
            frameRevision: 1,
            nextLine: 10,
            codeUnitOffset: 1,
          },
          continuity: "complete",
          truncated: true,
          change: "data",
          softWrapAfterLines: [],
          process: { status: "running" },
        },
      },
    });
    expect(yield* Fiber.join(running)).toMatchObject({
      _tag: "Failure",
      failure: { code: "stale_request" },
    });
  }),
);

it.effect("local scroll uses an independent apply request and no PTY write", () =>
  Effect.gen(function* () {
    const { service, messages, writes } = yield* setup;
    const bindingId = yield* bindOne(service);
    const input: A.TerminalAutomationInput = { bindingId, requestId: "request", action: wheel };
    const running = yield* service.input(caller, input, permission).pipe(Effect.forkChild);
    const encode = yield* prepareToEncode(service, messages);
    yield* service.replyBridge("client", {
      version: 1,
      bridgeRequestId: encode.bridgeRequestId,
      binding: encode.binding,
      result: {
        operation: "encode_input",
        inputRequestId: "request",
        frameRevision: 1,
        status: "local_action",
        localAction: { type: "scroll", deltaRows: 3 },
      },
    });
    const apply = yield* Effect.raceFirst(takeBridge(messages), Fiber.join(running));
    expect(apply).toMatchObject({
      operation: "apply_local",
      inputRequestId: "request",
      localAction: { type: "scroll", deltaRows: 3 },
    });
    if (!("operation" in apply)) throw new Error("expected apply");
    yield* service.replyBridge("client", {
      version: 1,
      bridgeRequestId: apply.bridgeRequestId,
      binding: apply.binding,
      result: { operation: "apply_local", inputRequestId: "request", status: "local_applied" },
    });
    expect(yield* Fiber.join(running)).toEqual({ status: "local_applied", requestId: "request" });
    expect(yield* service.input(caller, input, permission)).toEqual({
      status: "local_applied",
      requestId: "request",
    });
    expect(writes).toEqual([]);
  }),
);

it.effect(
  "release resolves in-flight duplicates and expired receipts cannot revive old bindings",
  () =>
    Effect.gen(function* () {
      const { service, messages, writes } = yield* setup;
      const bindingId = yield* bindOne(service);
      const request: A.TerminalAutomationInput = {
        bindingId,
        requestId: "cancel",
        action: { type: "text", text: "x" },
      };
      const first = yield* service.input(caller, request, permission).pipe(Effect.forkChild);
      yield* takeBridge(messages);
      const duplicate = yield* service.input(caller, request, permission).pipe(Effect.forkChild);
      yield* service.release(caller, { bindingId });
      expect(yield* Fiber.join(first)).toMatchObject({ status: "not_sent" });
      expect(yield* Fiber.join(duplicate)).toMatchObject({ status: "not_sent" });
      expect(
        (yield* service.status(caller, { receipt: { bindingId, requestId: "cancel" } }))
          .inputResult,
      ).toMatchObject({ status: "not_sent" });
      yield* TestClock.adjust("5 minutes");
      expect(
        yield* Effect.flip(service.status(caller, { receipt: { bindingId, requestId: "cancel" } })),
      ).toEqual({ code: "stale_request" });
      expect(yield* service.input(caller, request, permission)).toMatchObject({
        status: "not_sent",
        error: { code: "target_invalid" },
      });
      expect(writes).toEqual([]);
    }),
);

it.effect("revocation after the final async check prevents the native write", () =>
  Effect.gen(function* () {
    const f = yield* setup;
    const bindingId = yield* bindOne(f.service);
    const { authorization, revoke } = yield* credential;
    f.beforeNativeWrite(revoke);
    // Delay notification delivery so only the synchronous guard can prevent this write.
    const running = yield* f.service
      .input(
        caller,
        { bindingId, requestId: "request", action: { type: "text", text: "x" } },
        { ...authorization, invalidated: Effect.never, check: Effect.void },
      )
      .pipe(Effect.forkChild);
    const encode = yield* prepareToEncode(f.service, f.messages);
    yield* f.service.replyBridge("client", {
      version: 1,
      bridgeRequestId: encode.bridgeRequestId,
      binding: encode.binding,
      result: {
        operation: "encode_input",
        inputRequestId: "request",
        frameRevision: 1,
        encodedText: "x",
      },
    });
    expect(yield* Fiber.join(running)).toMatchObject({ status: "not_sent" });
    expect(f.writes).toEqual([]);
  }),
);

it.effect("revocation ends a pending bridge without waiting for its reply", () =>
  Effect.gen(function* () {
    const f = yield* setup;
    const bindingId = yield* bindOne(f.service);
    const { authorization, revoke } = yield* credential;
    const running = yield* f.service
      .input(
        caller,
        { bindingId, requestId: "request", action: { type: "text", text: "x" } },
        { ...authorization, check: Effect.void },
      )
      .pipe(Effect.forkChild);
    yield* takeBridge(f.messages);
    yield* revoke;
    expect(yield* Fiber.join(running)).toMatchObject({ status: "not_sent" });
    expect((yield* f.service.status(caller)).state.status).toBe("invalid");
    expect(f.writes).toEqual([]);
  }),
);

it.effect("revocation between local authorization and dispatch prevents apply_local", () =>
  Effect.gen(function* () {
    const f = yield* setup;
    const bindingId = yield* bindOne(f.service);
    const { authorization, revoke } = yield* credential;
    const guard = { ...authorization, invalidated: Effect.never, check: Effect.void };
    const running = yield* f.service
      .input(caller, { bindingId, requestId: "request", action: wheel }, guard)
      .pipe(Effect.forkChild);
    const encode = yield* prepareToEncode(f.service, f.messages);
    let inspections = 0;
    f.beforeInspect(Effect.suspend(() => (++inspections === 2 ? revoke : Effect.void)));
    yield* f.service.replyBridge("client", {
      version: 1,
      bridgeRequestId: encode.bridgeRequestId,
      binding: encode.binding,
      result: {
        operation: "encode_input",
        inputRequestId: "request",
        frameRevision: 1,
        status: "local_action",
        localAction: { type: "scroll", deltaRows: 3 },
      },
    });
    const outcome = yield* Effect.raceFirst(
      Fiber.join(running),
      takeBridge(f.messages).pipe(
        Effect.map((message) => ({ status: "unexpected_dispatch", operation: message.operation })),
      ),
    );
    expect(outcome).toMatchObject({ status: "not_sent" });
    expect(yield* Queue.clear(f.messages)).toEqual([]);
    expect(f.writes).toEqual([]);
  }),
);

it.effect("revocation after local dispatch retains unknown and never replays", () =>
  Effect.gen(function* () {
    const f = yield* setup;
    const bindingId = yield* bindOne(f.service);
    const { authorization, revoke } = yield* credential;
    const guard = { ...authorization, check: Effect.void };
    const request = { bindingId, requestId: "request", action: wheel };
    const running = yield* f.service.input(caller, request, guard).pipe(Effect.forkChild);
    yield* encodeLocal(f.service, f.messages);
    yield* revoke;
    expect(yield* Fiber.join(running)).toEqual({ status: "unknown", requestId: "request" });
    expect(
      (yield* f.service.status(caller, { receipt: { bindingId, requestId: "request" } }))
        .inputResult,
    ).toEqual({ status: "unknown", requestId: "request" });
    expect(yield* f.service.input(caller, request, guard)).toEqual({
      status: "unknown",
      requestId: "request",
    });
    expect(yield* Queue.clear(f.messages)).toEqual([]);
    expect(f.writes).toEqual([]);
  }),
);

it.effect("the Manager fake enforces final canWrite after a release at the native boundary", () =>
  Effect.gen(function* () {
    const { service, messages, writes, beforeNativeWrite } = yield* setup;
    const bindingId = yield* bindOne(service);
    beforeNativeWrite(service.release(caller, { bindingId }).pipe(Effect.orDie, Effect.asVoid));
    const running = yield* service
      .input(
        caller,
        { bindingId, requestId: "request", action: { type: "text", text: "x" } },
        permission,
      )
      .pipe(Effect.forkChild);
    const encode = yield* prepareToEncode(service, messages);
    yield* service.replyBridge("client", {
      version: 1,
      bridgeRequestId: encode.bridgeRequestId,
      binding: encode.binding,
      result: {
        operation: "encode_input",
        inputRequestId: "request",
        frameRevision: 1,
        encodedText: "x",
      },
    });
    expect(yield* Fiber.join(running)).toMatchObject({ status: "not_sent" });
    expect(writes).toEqual([]);
  }),
);

it.effect(
  "human input defeats old encode, empty encoding is rejected, and late replies cannot write",
  () =>
    Effect.gen(function* () {
      const { service, messages, writes, humanInput } = yield* setup;
      const bindingId = yield* bindOne(service);
      const request: A.TerminalAutomationInput = {
        bindingId,
        requestId: "request",
        action: { type: "text", text: "hello" },
      };
      const running = yield* service.input(caller, request, permission).pipe(Effect.forkChild);
      const encode = yield* prepareToEncode(service, messages);
      const reply: A.TerminalAutomationClientReply = {
        version: 1,
        bridgeRequestId: encode.bridgeRequestId,
        binding: encode.binding,
        result: {
          operation: "encode_input",
          inputRequestId: "request",
          frameRevision: 1,
          encodedText: "",
        },
      };
      expect(yield* Effect.flip(service.replyBridge("client", reply))).toEqual({
        code: "stale_request",
      });
      humanInput();
      expect(
        yield* Effect.flip(
          service.replyBridge("client", {
            ...reply,
            result: {
              operation: "encode_input",
              inputRequestId: "request",
              frameRevision: 1,
              encodedText: "hello",
            },
          }),
        ),
      ).toEqual({ code: "human_intervened" });
      yield* service.disconnect("client");
      expect(yield* Fiber.join(running)).toMatchObject({ status: "not_sent" });
      expect(writes).toEqual([]);
      expect(yield* service.input(caller, request, permission)).toMatchObject({
        status: "not_sent",
      });
    }),
);

it.effect("an ambiguous native write keeps unknown and never replays", () =>
  Effect.gen(function* () {
    const { service, messages, writes, loseWriteReceipt } = yield* setup;
    const bindingId = yield* bindOne(service);
    loseWriteReceipt();
    const request: A.TerminalAutomationInput = {
      bindingId,
      requestId: "request",
      action: { type: "text", text: "hello" },
    };
    const running = yield* service.input(caller, request, permission).pipe(Effect.forkChild);
    const encode = yield* prepareToEncode(service, messages);
    yield* service.replyBridge("client", {
      version: 1,
      bridgeRequestId: encode.bridgeRequestId,
      binding: encode.binding,
      result: {
        operation: "encode_input",
        inputRequestId: "request",
        frameRevision: 1,
        encodedText: "hello",
      },
    });
    expect(yield* Fiber.join(running)).toEqual({ status: "unknown", requestId: "request" });
    expect(yield* service.input(caller, request, permission)).toEqual({
      status: "unknown",
      requestId: "request",
    });
    expect(
      (yield* service.status(caller, { receipt: { bindingId, requestId: "request" } })).inputResult,
    ).toEqual({ status: "unknown", requestId: "request" });
    expect(writes).toEqual(["hello"]);
  }),
);

it.effect("one deadline covers all bridge stages and rejects late replies", () =>
  Effect.gen(function* () {
    const { service, messages, writes } = yield* setup;
    const bindingId = yield* bindOne(service);
    const running = yield* service
      .input(
        caller,
        { bindingId, requestId: "request", action: { type: "text", text: "hello" } },
        permission,
      )
      .pipe(Effect.forkChild);
    const show = yield* takeBridge(messages);
    yield* TestClock.adjust("6 seconds");
    yield* service.replyBridge("client", {
      version: 1,
      bridgeRequestId: show.bridgeRequestId,
      binding: show.binding,
      result: { operation: "show", status: "visible" },
    });
    const prepare = yield* takeBridge(messages);
    yield* TestClock.adjust("5 seconds");
    expect(yield* Fiber.join(running)).toMatchObject({ status: "not_sent" });
    expect(
      yield* Effect.flip(
        service.replyBridge("client", {
          version: 1,
          bridgeRequestId: prepare.bridgeRequestId,
          binding: prepare.binding,
          result: { operation: "prepare_input", inputRequestId: "request", frame },
        }),
      ),
    ).toEqual({ code: "stale_request" });
    expect(writes).toEqual([]);
  }),
);

it.effect("read enforces the requested budget and source", () =>
  Effect.gen(function* () {
    const { service, messages } = yield* setup;
    const bindingId = yield* bindOne(service);
    const running = yield* service
      .read(
        caller,
        {
          bindingId,
          query: {
            source: "screen",
            view: "current_viewport",
            budget: { maxCodeUnits: 2, maxLines: 1 },
          },
        },
        permission,
      )
      .pipe(Effect.result, Effect.forkChild);
    const request = yield* takeBridge(messages);
    yield* service.replyBridge("client", {
      version: 1,
      bridgeRequestId: request.bridgeRequestId,
      binding: request.binding,
      result: {
        operation: "read",
        read: {
          source: "screen",
          frame,
          text: "large",
          returnedRange: null,
          nextCursor: null,
          continuity: "unknown",
          truncated: false,
          change: "data",
          softWrapAfterLines: [],
          process: { status: "unknown" },
        },
      },
    });
    expect(yield* Fiber.join(running)).toMatchObject({
      _tag: "Failure",
      failure: { code: "budget_exceeded" },
    });
  }),
);

it.effect("concurrent duplicate input has one bridge and one native write", () =>
  Effect.gen(function* () {
    const { service, messages, writes } = yield* setup;
    const bindingId = yield* bindOne(service);
    const request: A.TerminalAutomationInput = {
      bindingId,
      requestId: "request",
      action: { type: "text", text: "hello" },
    };
    const first = yield* service.input(caller, request, permission).pipe(Effect.forkChild);
    const encode = yield* prepareToEncode(service, messages);
    const second = yield* service.input(caller, request, permission).pipe(Effect.forkChild);
    yield* service.replyBridge("client", {
      version: 1,
      bridgeRequestId: encode.bridgeRequestId,
      binding: encode.binding,
      result: {
        operation: "encode_input",
        inputRequestId: "request",
        frameRevision: 1,
        encodedText: "hello",
      },
    });
    expect(yield* Fiber.join(first)).toMatchObject({ status: "written" });
    expect(yield* Fiber.join(second)).toMatchObject({ status: "written" });
    expect(writes).toEqual(["hello"]);
  }),
);

it.effect("full receipt storage refuses new IDs and retains old receipts", () =>
  Effect.gen(function* () {
    const { service, writes } = yield* setup;
    const bindingId = yield* bindOne(service);
    const denied = Effect.fail({ code: "target_invalid" as const });
    yield* Effect.forEach(
      Array.from({ length: 256 }, (_, index) => String(index)),
      (requestId) =>
        service.input(
          caller,
          { bindingId, requestId, action: { type: "text", text: "hello" } },
          denied,
        ),
    );
    expect(
      yield* service.input(
        caller,
        { bindingId, requestId: "overflow", action: { type: "text", text: "hello" } },
        denied,
      ),
    ).toMatchObject({ status: "not_sent", error: { code: "budget_exceeded" } });
    expect(
      yield* service.input(
        caller,
        { bindingId, requestId: "0", action: { type: "text", text: "hello" } },
        permission,
      ),
    ).toMatchObject({ status: "not_sent", error: { code: "target_invalid" } });
    expect(writes).toEqual([]);
  }),
);

it.effect("permission is checked again after encoding before native input", () =>
  Effect.gen(function* () {
    const { service, messages, writes } = yield* setup;
    const bindingId = yield* bindOne(service);
    let allowed = true;
    const authorize = Effect.suspend(() =>
      allowed ? Effect.void : Effect.fail({ code: "target_invalid" as const }),
    );
    const running = yield* service
      .input(
        caller,
        { bindingId, requestId: "request", action: { type: "text", text: "hello" } },
        authorize,
      )
      .pipe(Effect.forkChild);
    const encode = yield* prepareToEncode(service, messages);
    allowed = false;
    yield* service.replyBridge("client", {
      version: 1,
      bridgeRequestId: encode.bridgeRequestId,
      binding: encode.binding,
      result: {
        operation: "encode_input",
        inputRequestId: "request",
        frameRevision: 1,
        encodedText: "hello",
      },
    });
    expect(yield* Fiber.join(running)).toMatchObject({
      status: "not_sent",
      error: { code: "target_invalid" },
    });
    expect(writes).toEqual([]);
  }),
);

it.effect("output no_change remains running and history cannot switch screens", () =>
  Effect.gen(function* () {
    const { service, messages } = yield* setup;
    const bindingId = yield* bindOne(service);
    const output = yield* service
      .read(
        caller,
        {
          bindingId,
          query: { source: "output", cursor: null, budget: { maxCodeUnits: 20, maxLines: 1 } },
        },
        permission,
      )
      .pipe(Effect.forkChild);
    const request = yield* takeBridge(messages);
    const result: A.TerminalAutomationReadResult = {
      source: "output",
      frame,
      text: "",
      returnedRange: null,
      nextCursor: null,
      continuity: "complete",
      truncated: false,
      change: "no_change",
      softWrapAfterLines: [],
      process: { status: "running" },
    };
    yield* service.replyBridge("client", {
      version: 1,
      bridgeRequestId: request.bridgeRequestId,
      binding: request.binding,
      result: { operation: "read", read: result },
    });
    expect(yield* Fiber.join(output)).toEqual(result);
    const history = yield* service
      .read(
        caller,
        {
          bindingId,
          query: {
            source: "history",
            activeScreen: "alternate",
            range: { startLine: 0, endLineExclusive: 1 },
            budget: { maxCodeUnits: 20, maxLines: 1 },
          },
        },
        permission,
      )
      .pipe(Effect.result, Effect.forkChild);
    const request2 = yield* takeBridge(messages);
    yield* service.replyBridge("client", {
      version: 1,
      bridgeRequestId: request2.bridgeRequestId,
      binding: request2.binding,
      result: { operation: "read", read: { ...result, source: "history" } },
    });
    expect(yield* Fiber.join(history)).toMatchObject({
      _tag: "Failure",
      failure: { code: "stale_request" },
    });
  }),
);

it.effect("bridges show prepare encode and deduplicates PTY writes", () =>
  Effect.gen(function* () {
    const { service, messages, writes } = yield* setup;
    const bindingId = yield* bindOne(service);
    const input: A.TerminalAutomationInput = {
      bindingId,
      requestId: "request",
      action: { type: "text", text: "hello" },
    };
    const running = yield* service.input(caller, input, permission).pipe(Effect.forkChild);
    const show = yield* takeBridge(messages);
    expect(show.operation).toBe("show");
    yield* service.connect(scope, "wrong");
    expect(
      yield* Effect.flip(
        service.replyBridge("wrong", {
          version: 1,
          bridgeRequestId: show.bridgeRequestId,
          binding: show.binding,
          result: { operation: "show", status: "visible" },
        }),
      ),
    ).toEqual({ code: "stale_request" });
    yield* service.replyBridge("client", {
      version: 1,
      bridgeRequestId: show.bridgeRequestId,
      binding: show.binding,
      result: { operation: "show", status: "visible" },
    });
    const prepare = yield* takeBridge(messages);
    yield* service.replyBridge("client", {
      version: 1,
      bridgeRequestId: prepare.bridgeRequestId,
      binding: prepare.binding,
      result: { operation: "prepare_input", inputRequestId: "request", frame },
    });
    const encode = yield* takeBridge(messages);
    yield* service.replyBridge("client", {
      version: 1,
      bridgeRequestId: encode.bridgeRequestId,
      binding: encode.binding,
      result: {
        operation: "encode_input",
        inputRequestId: "request",
        frameRevision: 1,
        encodedText: "hello",
      },
    });
    expect(yield* Fiber.join(running)).toEqual({
      status: "written",
      requestId: "request",
      writtenBytes: 5,
    });
    expect(yield* service.input(caller, input, permission)).toEqual({
      status: "written",
      requestId: "request",
      writtenBytes: 5,
    });
    expect(
      yield* service.input(
        caller,
        { ...input, action: { type: "text", text: "different" } },
        permission,
      ),
    ).toMatchObject({ status: "not_sent", error: { code: "request_conflict" } });
    expect(
      (yield* service.status(caller, { receipt: { bindingId, requestId: "request" } })).inputResult,
    ).toMatchObject({ status: "written" });
    expect(writes).toEqual(["hello"]);
  }),
);

it.effect("release and auto bind preserve unconfirmed human intervention", () =>
  Effect.gen(function* () {
    const f = yield* setup;
    f.humanInput();
    const original = yield* bindOne(f.service);
    expect((yield* f.service.status(caller)).state.status).toBe("bound");
    f.humanInput();
    expect((yield* f.service.status(caller)).state.status).toBe("paused");
    yield* f.service.release(caller, { bindingId: original });
    const rebound = yield* f.service.bind(caller, { mode: "auto" });
    expect(rebound.state.status).toBe("paused");
    if (!("binding" in rebound.state)) throw new Error("expected binding");
    const binding = rebound.state.binding;
    expect(binding.bindingId).not.toBe(original);
    expect(
      yield* f.service.input(
        caller,
        {
          bindingId: binding.bindingId,
          requestId: "blocked",
          action: { type: "text", text: "hello" },
        },
        permission,
      ),
    ).toMatchObject({ status: "not_sent", error: { code: "human_intervened" } });
    expect(f.writes).toEqual([]);
    expect(
      (yield* f.service.bind({ ...caller, callerId: "other" }, { mode: "auto" })).state.status,
    ).toBe("bound");
    expect(
      (yield* f.service.resumeFromConnection("client", binding.bindingId, binding.inputEpoch)).state
        .status,
    ).toBe("bound");
  }),
);

it.effect("a delayed release cannot discard a replacement paused binding", () =>
  Effect.gen(function* () {
    const f = yield* setup;
    const original = yield* bindOne(f.service);
    f.humanInput();
    expect((yield* f.service.status(caller)).state.status).toBe("paused");
    const entered = yield* Deferred.make<void>();
    const proceed = yield* Deferred.make<void>();
    f.beforeInspect(
      Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(proceed))),
    );
    const delayed = yield* f.service
      .release(caller, { bindingId: original })
      .pipe(Effect.result, Effect.forkChild);
    yield* Deferred.await(entered);
    f.beforeInspect(Effect.void);
    yield* f.service.release(caller, { bindingId: original });
    const rebound = yield* f.service.bind(caller, { mode: "auto" });
    if (rebound.state.status !== "paused") throw new Error("expected paused binding");
    const binding = rebound.state.binding;
    expect(binding.bindingId).not.toBe(original);
    yield* Deferred.succeed(proceed, undefined);
    expect((yield* Fiber.join(delayed))._tag).toBe("Failure");
    expect((yield* f.service.status(caller)).state).toEqual(rebound.state);
    expect((yield* f.service.getConnectionState("client")).bindings).toHaveLength(1);
    yield* f.service.resumeFromConnection("client", binding.bindingId, binding.inputEpoch);
    yield* f.service.release(caller, { bindingId: binding.bindingId });
    expect((yield* f.service.getConnectionState("client")).bindings).toEqual([]);
  }),
);

it.effect("selection cancellation cannot discard a released human pause barrier", () =>
  Effect.gen(function* () {
    const f = yield* setup;
    const original = yield* bindOne(f.service);
    f.humanInput();
    yield* f.service.release(caller, { bindingId: original });
    yield* f.service.bind(caller, { mode: "request_selection" });
    const invitation = yield* Queue.take(f.messages);
    if (!("selectionRequestId" in invitation)) throw new Error("expected selection");
    yield* f.service.replySelection("client", {
      version: 1,
      selectionRequestId: invitation.selectionRequestId,
      candidateVersion: invitation.candidateVersion,
      choice: { status: "cancelled" },
    });
    expect((yield* f.service.bind(caller, { mode: "auto" })).state.status).toBe("paused");
  }),
);

it.effect("released pause barriers reclaim owner capacity when their instances exit", () =>
  Effect.gen(function* () {
    const f = yield* setup;
    for (let index = 0; index < 130; index += 1) {
      const identity = { ...caller, callerId: `caller-${index}` };
      f.instances.set("one", `instance-${index}`);
      yield* f.service.registerViews("client", {
        version: 1,
        views: [
          { ...view(), target: { ...view().target, terminalInstanceId: `instance-${index}` } },
        ],
      });
      const bound = yield* f.service.bind(identity, { mode: "auto" });
      if (!("binding" in bound.state)) throw new Error("expected binding");
      f.humanInput();
      yield* f.service.release(identity, { bindingId: bound.state.binding.bindingId });
    }
    f.instances.set("one", "instance-one");
    yield* f.service.registerViews("client", { version: 1, views: [view()] });
    expect((yield* f.service.bind(caller, { mode: "auto" })).state.status).toBe("bound");
  }),
);

it.effect("uses explicit views, isolates providers, pauses and requires confirmed resume", () =>
  Effect.gen(function* () {
    const { service, instances, humanInput } = yield* setup;
    expect((yield* service.status(caller)).candidates).toEqual([]);
    yield* service.registerViews("client", { version: 1, views: [view()] });
    const bound = yield* service.bind(caller, { mode: "auto" });
    expect(bound.state.status).toBe("bound");
    if (bound.state.status !== "bound") throw new Error("expected binding");
    const bindingId = bound.state.binding.bindingId;
    expect((yield* service.status({ ...caller, callerId: "provider-b" })).state.status).toBe(
      "unbound",
    );
    humanInput();
    expect((yield* service.status(caller)).state).toMatchObject({
      status: "paused",
      binding: { inputEpoch: 1 },
    });
    expect(yield* Effect.flip(service.bind(caller, { mode: "resume", bindingId }))).toEqual({
      code: "human_intervened",
    });
    expect((yield* service.resumeConfirmed(caller, bindingId)).state.status).toBe("bound");
    instances.set("one", "replacement");
    expect((yield* service.status(caller)).state.status).toBe("invalid");
    expect((yield* service.bind(caller, { mode: "auto" })).state.status).toBe("invalid");
  }),
);

it.effect("requires selection from the authenticated connection and handles cancellation", () =>
  Effect.gen(function* () {
    const { service, messages } = yield* setup;
    yield* service.connect(scope, "other");
    yield* service.registerViews("client", { version: 1, views: [view(), view("two")] });
    expect((yield* service.bind(caller, { mode: "auto" })).state.status).toBe("selection_required");
    const message = yield* Queue.take(messages);
    if (!("selectionRequestId" in message)) throw new Error("expected selection");
    const reply: A.TerminalAutomationSelectionReply = {
      version: 1,
      selectionRequestId: message.selectionRequestId,
      candidateVersion: message.candidateVersion,
      choice: { status: "cancelled" },
    };
    expect(yield* Effect.flip(service.replySelection("other", reply))).toEqual({
      code: "stale_request",
    });
    yield* service.replySelection("client", reply);
    expect((yield* service.status(caller)).state.status).toBe("unbound");
    yield* service.bind(caller, { mode: "auto" });
    const selected = yield* Queue.take(messages);
    if (!("selectionRequestId" in selected)) throw new Error("expected selection");
    yield* service.replySelection("client", {
      version: 1,
      selectionRequestId: selected.selectionRequestId,
      candidateVersion: selected.candidateVersion,
      choice: { status: "selected", candidateId: selected.candidates[1]!.candidateId },
    });
    expect((yield* service.status(caller)).state).toMatchObject({
      status: "bound",
      binding: { target: { terminalId: "two" } },
    });
    yield* service.disconnect("client");
    yield* service.connect(scope, "client");
    yield* service.registerViews("client", { version: 1, views: [view("two")] });
    expect((yield* service.status(caller)).state).toMatchObject({
      status: "invalid",
      reason: "client_unavailable",
    });
  }),
);

it.effect("release keeps the original PTY and refuses another provider's binding", () =>
  Effect.gen(function* () {
    const { service, instances } = yield* setup;
    yield* service.registerViews("client", { version: 1, views: [view()] });
    const bound = yield* service.bind(caller, { mode: "auto" });
    if (bound.state.status !== "bound") throw new Error("expected binding");
    const input = { bindingId: bound.state.binding.bindingId };
    expect(yield* Effect.flip(service.release({ ...caller, callerId: "other" }, input))).toEqual({
      code: "target_invalid",
    });
    yield* service.release(caller, input);
    expect(instances.get("one")).toBe("instance-one");
    expect((yield* service.status(caller)).state.status).toBe("unbound");
  }),
);
