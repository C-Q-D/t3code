import { it } from "@effect/vitest";
import * as A from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as TestClock from "effect/testing/TestClock";
import { expect } from "vite-plus/test";
import * as Automation from "./AutomationService.ts";
import * as Manager from "./Manager.ts";

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
