// @effect-diagnostics-next-line nodeBuiltinImport:off -- IDs are assigned inside synchronous state transitions.
import * as NodeCrypto from "node:crypto";
import * as A from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Manager from "./Manager.ts";

/** All fields come from the authenticated transport, never model arguments. */
export interface Caller {
  readonly scope: A.TerminalAutomationScope;
  readonly callerId: string;
  readonly selectionConnectionId: string;
}

type Message = A.TerminalAutomationSelectionRequest | A.TerminalAutomationClientRequest;
type Failure = A.TerminalAutomationError;
interface Connection {
  readonly scope: A.TerminalAutomationScope;
  readonly messages: Queue.Queue<Message>;
  views: ReadonlyArray<A.TerminalAutomationCandidate>;
}
interface Owner {
  caller: Caller;
  state: A.TerminalAutomationState;
  connectionId?: string;
  humanInputEpoch?: number;
}
interface Receipt {
  readonly payload: string;
  readonly done: Deferred.Deferred<A.TerminalAutomationInputResult>;
  result?: A.TerminalAutomationInputResult;
}
interface Pending {
  readonly connectionId: string;
  readonly request: A.TerminalAutomationClientRequest;
  readonly done: Deferred.Deferred<A.TerminalAutomationClientReply, Failure>;
}
const sameScope = (a: A.TerminalAutomationScope, b: A.TerminalAutomationScope) =>
  a.environmentId === b.environmentId && a.threadId === b.threadId;
const sameTarget = (a: A.TerminalAutomationTarget, b: A.TerminalAutomationTarget) =>
  a.terminalId === b.terminalId &&
  a.terminalInstanceId === b.terminalInstanceId &&
  a.viewId === b.viewId;
const ownerKey = (caller: Caller) =>
  JSON.stringify([caller.scope.environmentId, caller.scope.threadId, caller.callerId]);
const failure = (code: A.TerminalAutomationErrorCode): Failure => ({ code });
const fingerprint = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const decode = <S extends Schema.Top>(schema: S, value: unknown) =>
  Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError(() => failure("stale_request")));

/** Owns view bindings and bounded bridge receipts; transports supply authenticated scope and caller identity.
 * resumeConfirmed is a user-confirmation entry point and must never be exposed as model approval.
 */
export class TerminalAutomationService extends Context.Service<
  TerminalAutomationService,
  {
    readonly connect: (
      scope: A.TerminalAutomationScope,
      connectionId: string,
    ) => Effect.Effect<Queue.Dequeue<Message>, Failure, Scope.Scope>;
    readonly disconnect: (connectionId: string) => Effect.Effect<void>;
    readonly input: (
      caller: Caller,
      input: A.TerminalAutomationInput,
      authorize: Effect.Effect<void, Failure>,
    ) => Effect.Effect<A.TerminalAutomationInputResult, Failure>;
    readonly read: (
      caller: Caller,
      input: A.TerminalAutomationReadInput,
      authorize: Effect.Effect<void, Failure>,
    ) => Effect.Effect<A.TerminalAutomationReadResult, Failure>;
    readonly replyBridge: (
      connectionId: string,
      input: A.TerminalAutomationClientReply,
    ) => Effect.Effect<void, Failure>;
    readonly registerViews: (
      connectionId: string,
      input: A.TerminalAutomationRegistration,
    ) => Effect.Effect<void, Failure>;
    readonly status: (
      caller: Caller,
      input?: A.TerminalAutomationStatusInput,
    ) => Effect.Effect<A.TerminalAutomationStatus, Failure>;
    readonly bind: (
      caller: Caller,
      input: A.TerminalAutomationBindInput,
    ) => Effect.Effect<A.TerminalAutomationStatus, Failure>;
    readonly replySelection: (
      connectionId: string,
      input: A.TerminalAutomationSelectionReply,
    ) => Effect.Effect<void, Failure>;
    readonly reportEvent: (
      connectionId: string,
      input: A.TerminalAutomationClientEvent,
    ) => Effect.Effect<void, Failure>;
    readonly resumeConfirmed: (
      caller: Caller,
      bindingId: string,
    ) => Effect.Effect<A.TerminalAutomationStatus, Failure>;
    readonly release: (
      caller: Caller,
      input: A.TerminalAutomationReleaseInput,
    ) => Effect.Effect<A.TerminalAutomationReleaseResult, Failure>;
  }
>()("t3/terminal/AutomationService/TerminalAutomationService") {}

const make = Effect.gen(function* () {
  const manager = yield* Manager.TerminalManager;
  const connections = new Map<string, Connection>();
  const owners = new Map<string, Owner>();
  // Retain every accepted ID for this service lifetime; full tables reject new work.
  const receipts = new Map<string, Map<string, Receipt>>();
  const pending = new Map<string, Pending>();
  let candidateVersion = 0;
  const getOwner = (caller: Caller): Owner | undefined => owners.get(ownerKey(caller));
  const ensureOwner = (caller: Caller) =>
    Effect.suspend(() => {
      const existing = getOwner(caller);
      if (existing) return Effect.succeed(existing);
      if (owners.size >= 128) return Effect.fail(failure("budget_exceeded"));
      const owner: Owner = { caller, state: { status: "unbound" } };
      owners.set(ownerKey(caller), owner);
      return Effect.succeed(owner);
    });
  const connection = (id: string) =>
    Effect.suspend(() => {
      const found = connections.get(id);
      return found ? Effect.succeed(found) : Effect.fail(failure("client_unavailable"));
    });
  const inspect = Effect.fn("TerminalAutomation.inspect")(function* (
    scope: A.TerminalAutomationScope,
    target: A.TerminalAutomationTarget,
  ) {
    const current = yield* manager
      .inspectExisting({ threadId: scope.threadId, terminalId: target.terminalId })
      .pipe(Effect.mapError(() => failure("target_invalid")));
    if (current.terminalInstanceId !== target.terminalInstanceId)
      return yield* Effect.fail(failure("target_invalid"));
    return current;
  });
  const refresh = Effect.fn("TerminalAutomation.refresh")(function* (owner: Owner) {
    const state = owner.state;
    if (state.status !== "bound" && state.status !== "paused") return;
    const client = owner.connectionId ? connections.get(owner.connectionId) : undefined;
    if (!client) {
      owner.state = { status: "invalid", binding: state.binding, reason: "client_unavailable" };
      return;
    }
    if (
      !client.views.some(
        (view) =>
          sameTarget(view.target, state.binding.target) &&
          view.readiness === "ready" &&
          view.capabilities.read &&
          view.capabilities.input &&
          view.capabilities.show,
      )
    ) {
      owner.state = { status: "invalid", binding: state.binding, reason: "target_invalid" };
      return;
    }
    const current = yield* inspect(owner.caller.scope, state.binding.target).pipe(Effect.result);
    if (current._tag === "Failure") {
      owner.state = { status: "invalid", binding: state.binding, reason: "target_invalid" };
    } else if (current.success.humanInputEpoch !== owner.humanInputEpoch) {
      owner.humanInputEpoch = current.success.humanInputEpoch;
      owner.state = {
        status: "paused",
        binding: { ...state.binding, inputEpoch: state.binding.inputEpoch + 1 },
        reason: "human_intervened",
      };
    }
  });
  const candidates = Effect.fn("TerminalAutomation.candidates")(function* (
    scope: A.TerminalAutomationScope,
  ) {
    const found: Array<A.TerminalAutomationCandidate> = [];
    for (const client of connections.values()) {
      if (!sameScope(scope, client.scope)) continue;
      for (const view of client.views) {
        if (
          view.readiness !== "ready" ||
          !view.capabilities.read ||
          !view.capabilities.input ||
          !view.capabilities.show
        )
          continue;
        const valid = yield* inspect(scope, view.target).pipe(Effect.result);
        if (valid._tag === "Success") found.push(view);
      }
    }
    return found;
  });
  const status = Effect.fn("TerminalAutomation.status")(function* (
    caller: Caller,
    input: A.TerminalAutomationStatusInput = {},
  ) {
    yield* decode(A.TerminalAutomationStatusInput, input);
    const owner = yield* ensureOwner(caller);
    yield* refresh(owner);
    const receipt = input.receipt
      ? receipts
          .get(ownerKey(caller))
          ?.get(fingerprint([input.receipt.bindingId, input.receipt.requestId]))?.result
      : undefined;
    return {
      ...(receipt ? { inputResult: receipt } : {}),
      version: 1 as const,
      candidateVersion,
      candidates: yield* candidates(caller.scope),
      state: owner.state,
    };
  });
  const disconnect = Effect.fn("TerminalAutomation.disconnect")(function* (id: string) {
    const client = connections.get(id);
    if (!client) return;
    connections.delete(id);
    for (const entry of pending.values())
      if (entry.connectionId === id)
        yield* Deferred.fail(entry.done, failure("client_unavailable"));
    candidateVersion += 1;
    for (const owner of owners.values())
      if (owner.state.status === "selection_required") owner.state = { status: "unbound" };
    for (const owner of owners.values()) {
      if (owner.connectionId === id && "binding" in owner.state)
        owner.state = {
          status: "invalid",
          binding: owner.state.binding,
          reason: "client_unavailable",
        };
      if (owner.caller.selectionConnectionId === id && owner.state.status === "selection_required")
        owner.state = { status: "unbound" };
    }
    yield* Queue.shutdown(client.messages);
  });
  const connect = Effect.fn("TerminalAutomation.connect")(function* (
    scope: A.TerminalAutomationScope,
    id: string,
  ) {
    if (connections.has(id)) return yield* Effect.fail(failure("request_conflict"));
    if (connections.size >= 128) return yield* Effect.fail(failure("budget_exceeded"));
    const messages = yield* Queue.bounded<Message>(128);
    const client: Connection = { scope, messages, views: [] };
    connections.set(id, client);
    yield* Effect.addFinalizer(() =>
      connections.get(id) === client ? disconnect(id) : Effect.void,
    );
    return messages;
  });
  const registerViews = Effect.fn("TerminalAutomation.registerViews")(function* (
    id: string,
    raw: A.TerminalAutomationRegistration,
  ) {
    const input = yield* decode(A.TerminalAutomationRegistration, raw);
    const client = yield* connection(id);
    const views: Array<A.TerminalAutomationCandidate> = [];
    for (const view of input.views) {
      yield* inspect(client.scope, view.target);
      const previous = client.views.find((old) => sameTarget(old.target, view.target));
      views.push({ ...view, candidateId: previous?.candidateId ?? NodeCrypto.randomUUID() });
    }
    const otherCount = [...connections.values()]
      .filter((other) => other !== client && sameScope(client.scope, other.scope))
      .reduce((count, other) => count + other.views.length, 0);
    if (views.length + otherCount > 64) return yield* Effect.fail(failure("budget_exceeded"));
    if (connections.get(id) !== client) return yield* Effect.fail(failure("client_unavailable"));
    client.views = views;
    candidateVersion += 1;
    for (const owner of owners.values())
      if (owner.state.status === "selection_required") owner.state = { status: "unbound" };
    for (const owner of owners.values())
      if (sameScope(client.scope, owner.caller.scope)) yield* refresh(owner);
  });
  const select = Effect.fn("TerminalAutomation.select")(function* (
    owner: Owner,
    candidate: A.TerminalAutomationCandidate,
  ) {
    const previousState = owner.state;
    const entry = [...connections.entries()].find(
      ([, client]) =>
        sameScope(client.scope, owner.caller.scope) &&
        client.views.some((view) => view.candidateId === candidate.candidateId),
    );
    if (!entry) return yield* Effect.fail(failure("target_invalid"));
    const current = yield* inspect(owner.caller.scope, candidate.target);
    if (owner.state !== previousState) return yield* Effect.fail(failure("stale_request"));
    if (connections.get(entry[0]) !== entry[1])
      return yield* Effect.fail(failure("client_unavailable"));
    owner.connectionId = entry[0];
    owner.humanInputEpoch = current.humanInputEpoch;
    owner.state = {
      status: "bound",
      binding: {
        bindingId: NodeCrypto.randomUUID(),
        target: candidate.target,
        alias: "terminal",
        inputEpoch: 0,
      },
    };
  });
  const bind = Effect.fn("TerminalAutomation.bind")(function* (
    caller: Caller,
    raw: A.TerminalAutomationBindInput,
  ) {
    const input = yield* decode(A.TerminalAutomationBindInput, raw);
    const owner = yield* ensureOwner(caller);
    yield* refresh(owner);
    if (input.mode === "resume") return yield* Effect.fail(failure("human_intervened"));
    if (owner.state.status !== "unbound") return yield* status(caller);
    owner.caller = caller;
    const previousState = owner.state;
    const available = yield* candidates(caller.scope);
    if (owner.state !== previousState) return yield* Effect.fail(failure("stale_request"));
    if (available.length === 0) return yield* Effect.fail(failure("not_ready"));
    if (available.length === 1 && input.mode === "auto") yield* select(owner, available[0]!);
    else {
      const client = yield* connection(caller.selectionConnectionId);
      if (!sameScope(client.scope, caller.scope))
        return yield* Effect.fail(failure("client_unavailable"));
      const selectionRequestId = NodeCrypto.randomUUID();
      const request: A.TerminalAutomationSelectionRequest = {
        version: 1,
        selectionRequestId,
        candidateVersion,
        candidates: available,
      };
      if (!Queue.offerUnsafe(client.messages, request))
        return yield* Effect.fail(failure("budget_exceeded"));
      owner.state = { status: "selection_required", selectionRequestId, candidateVersion };
    }
    return yield* status(caller);
  });
  const replySelection = Effect.fn("TerminalAutomation.replySelection")(function* (
    id: string,
    raw: A.TerminalAutomationSelectionReply,
  ) {
    const input = yield* decode(A.TerminalAutomationSelectionReply, raw);
    const client = yield* connection(id);
    const owner = [...owners.values()].find(
      (item) =>
        item.caller.selectionConnectionId === id &&
        sameScope(item.caller.scope, client.scope) &&
        item.state.status === "selection_required" &&
        item.state.selectionRequestId === input.selectionRequestId,
    );
    if (
      !owner ||
      owner.state.status !== "selection_required" ||
      owner.state.candidateVersion !== input.candidateVersion ||
      candidateVersion !== input.candidateVersion
    )
      return yield* Effect.fail(failure("stale_request"));
    if (input.choice.status === "cancelled") {
      owner.state = { status: "unbound" };
      return;
    }
    const candidateId = input.choice.candidateId;
    const previousState = owner.state;
    const candidate = (yield* candidates(owner.caller.scope)).find(
      (view) => view.candidateId === candidateId,
    );
    if (!candidate) return yield* Effect.fail(failure("target_invalid"));
    if (owner.state !== previousState || candidateVersion !== input.candidateVersion)
      return yield* Effect.fail(failure("stale_request"));
    yield* select(owner, candidate);
  });
  const reportEvent = Effect.fn("TerminalAutomation.reportEvent")(function* (
    id: string,
    raw: A.TerminalAutomationClientEvent,
  ) {
    const input = yield* decode(A.TerminalAutomationClientEvent, raw);
    const client = yield* connection(id);
    if (!client.views.some((view) => sameTarget(view.target, input.target)))
      return yield* Effect.fail(failure("target_invalid"));
    for (const owner of owners.values()) {
      const state = owner.state;
      if (
        owner.connectionId !== id ||
        !("binding" in state) ||
        !sameTarget(state.binding.target, input.target)
      )
        continue;
      if (
        input.event === "human_intervened" &&
        (state.status === "bound" || state.status === "paused")
      ) {
        const current = yield* inspect(client.scope, input.target).pipe(Effect.result);
        if (current._tag === "Success") owner.humanInputEpoch = current.success.humanInputEpoch;
        owner.state = {
          status: "paused",
          binding: { ...state.binding, inputEpoch: state.binding.inputEpoch + 1 },
          reason: "human_intervened",
        };
      } else if (input.event !== "human_intervened")
        owner.state = { status: "invalid", binding: state.binding, reason: "target_invalid" };
    }
    if (input.event !== "human_intervened") {
      client.views = client.views.filter((view) => !sameTarget(view.target, input.target));
      candidateVersion += 1;
    }
  });
  const resumeConfirmed = Effect.fn("TerminalAutomation.resumeConfirmed")(function* (
    caller: Caller,
    bindingId: string,
  ) {
    const owner = yield* ensureOwner(caller);
    yield* refresh(owner);
    if (owner.state.status !== "paused" || owner.state.binding.bindingId !== bindingId)
      return yield* Effect.fail(failure("stale_request"));
    owner.state = { status: "bound", binding: owner.state.binding };
    return yield* status(caller);
  });
  const release = Effect.fn("TerminalAutomation.release")(function* (
    caller: Caller,
    raw: A.TerminalAutomationReleaseInput,
  ) {
    const input = yield* decode(A.TerminalAutomationReleaseInput, raw);
    const owner = getOwner(caller);
    if (!owner || !("binding" in owner.state) || owner.state.binding.bindingId !== input.bindingId)
      return yield* Effect.fail(failure("target_invalid"));
    owner.state = { status: "unbound" };
    delete owner.connectionId;
    return { status: "released" as const };
  });
  const requireBinding = Effect.fn("TerminalAutomation.requireBinding")(function* (
    caller: Caller,
    bindingId: string,
    epoch?: number,
  ) {
    const owner = getOwner(caller);
    if (!owner) return yield* Effect.fail(failure("target_invalid"));
    yield* refresh(owner);
    if (owner.state.status === "paused") return yield* Effect.fail(failure("human_intervened"));
    if (owner.state.status !== "bound" || owner.state.binding.bindingId !== bindingId)
      return yield* Effect.fail(failure("target_invalid"));
    if (epoch !== undefined && owner.state.binding.inputEpoch !== epoch)
      return yield* Effect.fail(failure("stale_request"));
    return { owner, binding: owner.state.binding, connectionId: owner.connectionId! };
  });
  const bridge = Effect.fn("TerminalAutomation.bridge")(function* (
    connectionId: string,
    request: A.TerminalAutomationClientRequest,
  ) {
    const client = yield* connection(connectionId);
    if (pending.size >= 1024) return yield* Effect.fail(failure("budget_exceeded"));
    const done = yield* Deferred.make<A.TerminalAutomationClientReply, Failure>();
    pending.set(request.bridgeRequestId, { connectionId, request, done });
    return yield* Effect.gen(function* () {
      if (!Queue.offerUnsafe(client.messages, request))
        return yield* Effect.fail(failure("budget_exceeded"));
      return yield* Deferred.await(done);
    }).pipe(Effect.ensuring(Effect.sync(() => pending.delete(request.bridgeRequestId))));
  });
  const replyBridge = Effect.fn("TerminalAutomation.replyBridge")(function* (
    id: string,
    raw: A.TerminalAutomationClientReply,
  ) {
    const reply = yield* decode(A.TerminalAutomationClientReply, raw);
    const entry = pending.get(reply.bridgeRequestId);
    if (!entry || entry.connectionId !== id || !connections.has(id))
      return yield* Effect.fail(failure("stale_request"));
    const expected = entry.request;
    if (
      reply.binding.bindingId !== expected.binding.bindingId ||
      reply.binding.inputEpoch !== expected.binding.inputEpoch ||
      !sameTarget(reply.binding.target, expected.binding.target) ||
      reply.result.operation !== expected.operation
    )
      return yield* Effect.fail(failure("stale_request"));
    const owner = [...owners.values()].find(
      (item) =>
        item.connectionId === id &&
        "binding" in item.state &&
        item.state.binding.bindingId === expected.binding.bindingId,
    );
    if (!owner) return yield* Effect.fail(failure("stale_request"));
    yield* requireBinding(owner.caller, expected.binding.bindingId, expected.binding.inputEpoch);
    if (pending.get(reply.bridgeRequestId) !== entry)
      return yield* Effect.fail(failure("stale_request"));
    const result = reply.result;
    if (!("error" in result)) {
      if (
        (expected.operation === "prepare_input" || expected.operation === "encode_input") &&
        (!("inputRequestId" in result) || result.inputRequestId !== expected.inputRequestId)
      )
        return yield* Effect.fail(failure("stale_request"));
      if (
        expected.operation === "encode_input" &&
        (!("frameRevision" in result) || result.frameRevision !== expected.frameRevision)
      )
        return yield* Effect.fail(failure("stale_request"));
    }
    pending.delete(reply.bridgeRequestId);
    if ("error" in result) yield* Deferred.fail(entry.done, result.error);
    else yield* Deferred.succeed(entry.done, reply);
  });
  const input = Effect.fn("TerminalAutomation.input")(function* (
    caller: Caller,
    raw: A.TerminalAutomationInput,
    authorize: Effect.Effect<void, Failure>,
  ) {
    const request = yield* decode(A.TerminalAutomationInput, raw);
    yield* ensureOwner(caller);
    const key = fingerprint([request.bindingId, request.requestId]);
    const payload = fingerprint(request.action);
    const table = receipts.get(ownerKey(caller)) ?? new Map<string, Receipt>();
    receipts.set(ownerKey(caller), table);
    const old = table.get(key);
    if (old) {
      if (old.payload !== payload)
        return {
          status: "not_sent" as const,
          requestId: request.requestId,
          error: failure("request_conflict"),
        };
      return old.result ?? (yield* Deferred.await(old.done));
    }
    if (table.size >= 256 || receipts.size > 128)
      return {
        status: "not_sent" as const,
        requestId: request.requestId,
        error: failure("budget_exceeded"),
      };
    const receipt: Receipt = {
      payload,
      done: Deferred.makeUnsafe<A.TerminalAutomationInputResult>(),
    };
    table.set(key, receipt);
    let attempted = false;
    const operation = Effect.gen(function* () {
      yield* authorize;
      const initial = yield* requireBinding(caller, request.bindingId);
      const binding = initial.binding;
      const fields = { version: 1 as const, binding };
      const shown = yield* bridge(initial.connectionId, {
        ...fields,
        bridgeRequestId: NodeCrypto.randomUUID(),
        operation: "show",
      });
      if (shown.result.operation !== "show" || !("status" in shown.result))
        return yield* Effect.fail(failure("not_ready"));
      yield* requireBinding(caller, request.bindingId, binding.inputEpoch);
      const prepared = yield* bridge(initial.connectionId, {
        ...fields,
        bridgeRequestId: NodeCrypto.randomUUID(),
        operation: "prepare_input",
        inputRequestId: request.requestId,
      });
      if (prepared.result.operation !== "prepare_input" || !("frame" in prepared.result))
        return yield* Effect.fail(failure("stale_request"));
      const frame = prepared.result.frame;
      if (
        request.action.type === "mouse" &&
        (request.action.position.column >= frame.cols || request.action.position.row >= frame.rows)
      )
        return yield* Effect.fail(failure("stale_request"));
      yield* requireBinding(caller, request.bindingId, binding.inputEpoch);
      const encoded = yield* bridge(initial.connectionId, {
        ...fields,
        bridgeRequestId: NodeCrypto.randomUUID(),
        operation: "encode_input",
        inputRequestId: request.requestId,
        frameRevision: frame.frameRevision,
        action: request.action,
      });
      if (
        encoded.result.operation !== "encode_input" ||
        !("encodedText" in encoded.result) ||
        !encoded.result.encodedText.length
      )
        return yield* Effect.fail(failure("not_ready"));
      const encodedText = encoded.result.encodedText;
      yield* authorize;
      const current = yield* requireBinding(caller, request.bindingId, binding.inputEpoch);
      // No interruptible step separates the final binding/permission check from the synchronous PTY write.
      yield* Effect.uninterruptible(
        Effect.gen(function* () {
          attempted = true;
          yield* manager
            .writeAutomation({
              threadId: caller.scope.threadId,
              terminalId: binding.target.terminalId,
              terminalInstanceId: binding.target.terminalInstanceId,
              humanInputEpoch: current.owner.humanInputEpoch!,
              canWrite: () =>
                current.owner.state.status === "bound" &&
                current.owner.state.binding.bindingId === binding.bindingId &&
                current.owner.state.binding.inputEpoch === binding.inputEpoch &&
                connections
                  .get(initial.connectionId)
                  ?.views.some(
                    (view) => sameTarget(view.target, binding.target) && view.readiness === "ready",
                  ) === true,
              data: encodedText,
            })
            .pipe(
              Effect.mapError((error) => {
                if (error._tag !== "TerminalWriteError") attempted = false;
                return failure(
                  error._tag === "TerminalWriteError" ? "client_unavailable" : "target_invalid",
                );
              }),
            );
          receipt.result = {
            status: "written",
            requestId: request.requestId,
            writtenBytes: Buffer.byteLength(encodedText, "utf8"),
          };
        }),
      );
      return receipt.result!;
    }).pipe(
      Effect.timeoutOrElse({
        duration: "10 seconds",
        orElse: () => Effect.fail(failure("client_unavailable")),
      }),
      Effect.catch((error) =>
        Effect.succeed<A.TerminalAutomationInputResult>(
          receipt.result ??
            (attempted
              ? { status: "unknown", requestId: request.requestId }
              : { status: "not_sent", requestId: request.requestId, error }),
        ),
      ),
    );
    return yield* operation.pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          receipt.result = result;
        }),
      ),
      Effect.ensuring(
        Effect.gen(function* () {
          receipt.result ??= attempted
            ? { status: "unknown", requestId: request.requestId }
            : { status: "not_sent", requestId: request.requestId, error: failure("stale_request") };
          yield* Deferred.succeed(receipt.done, receipt.result);
        }),
      ),
    );
  });
  const read = Effect.fn("TerminalAutomation.read")(function* (
    caller: Caller,
    raw: A.TerminalAutomationReadInput,
    authorize: Effect.Effect<void, Failure>,
  ) {
    const request = yield* decode(A.TerminalAutomationReadInput, raw);
    return yield* Effect.gen(function* () {
      yield* authorize;
      const initial = yield* requireBinding(caller, request.bindingId);
      const response = yield* bridge(initial.connectionId, {
        version: 1,
        bridgeRequestId: NodeCrypto.randomUUID(),
        binding: initial.binding,
        operation: "read",
        query: request.query,
      });
      yield* authorize;
      yield* requireBinding(caller, request.bindingId, initial.binding.inputEpoch);
      if (response.result.operation !== "read" || !("read" in response.result))
        return yield* Effect.fail(failure("stale_request"));
      const result = response.result.read;
      const query = request.query;
      const range = result.returnedRange;
      const textLines =
        result.text.length === 0
          ? 0
          : result.text.split("\n").length - (result.text.endsWith("\n") ? 1 : 0);
      if (
        result.source !== query.source ||
        result.text.length > query.budget.maxCodeUnits ||
        textLines > query.budget.maxLines ||
        (range && range.endLineExclusive - range.startLine > query.budget.maxLines)
      )
        return yield* Effect.fail(failure("budget_exceeded"));
      if (
        range &&
        (range.startLine < result.frame.retainedRange.startLine ||
          range.endLineExclusive > result.frame.retainedRange.endLineExclusive)
      )
        return yield* Effect.fail(failure("stale_request"));
      if (
        query.source === "history" &&
        (result.frame.activeScreen !== query.activeScreen ||
          (query.frameRevision !== undefined &&
            result.frame.frameRevision !== query.frameRevision) ||
          (range &&
            (range.startLine < query.range.startLine ||
              range.endLineExclusive > query.range.endLineExclusive)))
      )
        return yield* Effect.fail(failure("stale_request"));
      return result;
    }).pipe(
      Effect.timeoutOrElse({
        duration: "10 seconds",
        orElse: () => Effect.fail(failure("client_unavailable")),
      }),
    );
  });
  yield* Effect.addFinalizer(() =>
    Effect.forEach([...connections.keys()], disconnect, { discard: true }),
  );
  return TerminalAutomationService.of({
    connect,
    disconnect,
    registerViews,
    status,
    bind,
    replySelection,
    reportEvent,
    resumeConfirmed,
    release,
    input,
    read,
    replyBridge,
  });
});

export const layer = Layer.effect(TerminalAutomationService, make);
