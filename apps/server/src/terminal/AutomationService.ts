// @effect-diagnostics-next-line nodeBuiltinImport:off -- IDs are assigned inside synchronous state transitions.
import * as NodeCrypto from "node:crypto";
import * as A from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Clock from "effect/Clock";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Manager from "./Manager.ts";
import type { DispatchAuthorization } from "../auth/DispatchAuthorization.ts";

export type Authorization =
  | Effect.Effect<void, A.TerminalAutomationError>
  | (DispatchAuthorization & {
      readonly check: Effect.Effect<void, A.TerminalAutomationError>;
    });
const checkAuthorization = (authorization: Authorization) =>
  Effect.isEffect(authorization) ? authorization : authorization.check;
const canDispatch = (authorization: Authorization) =>
  Effect.isEffect(authorization) || authorization.isValid();

/** All fields come from the authenticated transport, never model arguments. */
export interface Caller {
  readonly scope: A.TerminalAutomationScope;
  readonly callerId: string;
  readonly selectionConnectionId?: string;
  readonly credentialAuthorization?: DispatchAuthorization;
  readonly authorizeSelection?: (
    select: (authorization: Authorization) => Effect.Effect<void, A.TerminalAutomationError>,
  ) => Effect.Effect<void, A.TerminalAutomationError>;
}

type Message = A.TerminalAutomationSelectionRequest | A.TerminalAutomationClientRequest;
type Failure = A.TerminalAutomationError;
interface Connection {
  readonly scope: A.TerminalAutomationScope;
  readonly messages: Queue.Queue<Message>;
  views: ReadonlyArray<A.TerminalAutomationCandidate>;
  version: number;
  revision: number;
  readonly changes: Queue.Queue<A.TerminalAutomationStateChanged>;
}
interface Owner {
  caller: Caller;
  busy: number;
  state: A.TerminalAutomationState;
  connectionId?: string;
  humanInputEpoch?: number;
  pauseTarget?: A.TerminalAutomationTarget;
  invited?: ReadonlySet<string>;
  selection?: A.TerminalAutomationSelectionRequest;
  readonly released: Deferred.Deferred<void>;
}
interface Receipt {
  readonly payload: string;
  readonly requestId: string;
  readonly deadline: number;
  readonly done: Deferred.Deferred<A.TerminalAutomationInputResult>;
  dispatched: boolean;
  result?: A.TerminalAutomationInputResult;
}
interface BindingWork {
  readonly ownerKey: string;
  readonly receipts: Map<string, Receipt>;
  readonly stop: Deferred.Deferred<never, Failure>;
  retiredAt?: number;
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
    readonly getConnectionState: (
      connectionId: string,
    ) => Effect.Effect<A.TerminalAutomationConnectionState, Failure>;
    readonly watchState: (
      connectionId: string,
    ) => Effect.Effect<Queue.Dequeue<A.TerminalAutomationStateChanged>, Failure>;
    readonly revoke: (caller: Caller, bindingId: string) => Effect.Effect<void, Failure>;
    readonly input: (
      caller: Caller,
      input: A.TerminalAutomationInput,
      authorize: Authorization,
    ) => Effect.Effect<A.TerminalAutomationInputResult, Failure>;
    readonly read: (
      caller: Caller,
      input: A.TerminalAutomationReadInput,
      authorize: Authorization,
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
      authorize?: Authorization,
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
    readonly resumeFromConnection: (
      connectionId: string,
      bindingId: string,
      inputEpoch: number,
    ) => Effect.Effect<A.TerminalAutomationStatus, Failure>;
    readonly release: (
      caller: Caller,
      input: A.TerminalAutomationReleaseInput,
    ) => Effect.Effect<A.TerminalAutomationReleaseResult, Failure>;
  }
>()("t3/terminal/AutomationService/TerminalAutomationService") {}

const make = Effect.gen(function* () {
  const manager = yield* Manager.TerminalManager;
  const serviceScope = yield* Scope.Scope;
  const connections = new Map<string, Connection>();
  const owners = new Map<string, Owner>();
  const clock = yield* Clock.Clock;
  const bindings = new Map<string, BindingWork>();
  // Retired bindings cannot execute; receipt eviction never makes their IDs executable again.
  const retired = new Map<string, BindingWork>();
  const pending = new Map<string, Pending>();
  const notify = (client: Connection) => {
    client.revision += 1;
    Queue.offerUnsafe(client.changes, { type: "state_changed", revision: client.revision });
  };
  const setState = (owner: Owner, state: A.TerminalAutomationState) => {
    if (owner.state === state) return;
    if (
      owner.state.status === "invalid" &&
      state.status === "invalid" &&
      owner.state.binding === state.binding &&
      owner.state.reason === state.reason
    )
      return;
    owner.state = state;
    if (state.status !== "selection_required") delete owner.selection;
    for (const [id, client] of connections)
      if (
        sameScope(client.scope, owner.caller.scope) &&
        (owner.connectionId === id || owner.invited?.has(id))
      )
        notify(client);
  };
  const deleteOwner = (key: string) => {
    const owner = owners.get(key);
    const client = owner?.connectionId ? connections.get(owner.connectionId) : undefined;
    if (client) notify(client);
    if (owner) Deferred.doneUnsafe(owner.released, Effect.void);
    owners.delete(key);
  };
  const versionFor = (scope: A.TerminalAutomationScope) =>
    Math.max(
      0,
      ...[...connections.values()]
        .filter((client) => sameScope(client.scope, scope))
        .map((client) => client.version),
    );
  const clearSelection = Effect.fn("TerminalAutomation.clearSelection")(function* (
    requestId: string,
    invited: ReadonlySet<string> | undefined,
  ) {
    for (const id of invited ?? []) {
      const client = connections.get(id);
      if (!client) continue;
      notify(client);
      const messages = yield* Queue.clear(client.messages);
      for (const message of messages)
        if (!("selectionRequestId" in message) || message.selectionRequestId !== requestId)
          Queue.offerUnsafe(client.messages, message);
    }
  }, Effect.uninterruptible);
  const changeCandidates = Effect.fn("TerminalAutomation.changeCandidates")(function* (
    scope: A.TerminalAutomationScope,
  ) {
    const version = versionFor(scope) + 1;
    for (const client of connections.values())
      if (sameScope(client.scope, scope)) client.version = version;
    for (const owner of owners.values())
      if (sameScope(owner.caller.scope, scope) && owner.state.status === "selection_required") {
        const requestId = owner.state.selectionRequestId;
        const invited = owner.invited;
        delete owner.invited;
        setState(owner, { status: "unbound" });
        if (owner.busy === 0) deleteOwner(ownerKey(owner.caller));
        yield* clearSelection(requestId, invited);
      }
  });
  const pruneRetired = () => {
    const now = clock.currentTimeMillisUnsafe();
    for (const [id, work] of retired) if (now - work.retiredAt! >= 300_000) retired.delete(id);
    while (retired.size > 128) retired.delete(retired.keys().next().value!);
  };
  const complete = Effect.fn("TerminalAutomation.complete")(function* (
    receipt: Receipt,
    error: Failure,
  ) {
    receipt.result ??= receipt.dispatched
      ? { status: "unknown", requestId: receipt.requestId }
      : { status: "not_sent", requestId: receipt.requestId, error };
    yield* Deferred.succeed(receipt.done, receipt.result);
  });
  const retire = Effect.fn("TerminalAutomation.retire")(function* (
    bindingId: string,
    error: Failure,
  ) {
    const work = bindings.get(bindingId);
    if (!work) return;
    bindings.delete(bindingId);
    work.retiredAt = clock.currentTimeMillisUnsafe();
    retired.set(bindingId, work);
    pruneRetired();
    yield* Deferred.fail(work.stop, error);
    for (const receipt of work.receipts.values()) yield* complete(receipt, error);
    for (const [id, entry] of pending)
      if (entry.request.binding.bindingId === bindingId) {
        pending.delete(id);
        yield* Deferred.fail(entry.done, error);
      }
    for (const client of connections.values()) {
      const messages = yield* Queue.clear(client.messages);
      for (const message of messages)
        if (!("binding" in message) || message.binding.bindingId !== bindingId)
          Queue.offerUnsafe(client.messages, message);
    }
  }, Effect.uninterruptible);
  const getOwner = (caller: Caller): Owner | undefined => owners.get(ownerKey(caller));
  const ensureOwner = Effect.fn("TerminalAutomation.ensureOwner")(function* (
    caller: Caller,
    reserve = false,
  ) {
    // Released bindings do not own the human-confirmation barrier; the live instance does.
    for (const [key, owner] of owners) {
      if (owner.busy !== 0 || !owner.pauseTarget || owner.state.status !== "unbound") continue;
      const state = owner.state;
      const live = yield* inspect(owner.caller.scope, owner.pauseTarget).pipe(Effect.result);
      if (
        live._tag === "Failure" &&
        owners.get(key) === owner &&
        owner.state === state &&
        owner.busy === 0
      )
        deleteOwner(key);
    }
    const existing = getOwner(caller);
    if (existing) {
      if (reserve) existing.busy += 1;
      return existing;
    }
    if (owners.size >= 128)
      for (const [key, owner] of owners)
        if (
          owner.busy === 0 &&
          !owner.pauseTarget &&
          (owner.state.status === "unbound" ||
            (owner.state.status === "invalid" && !bindings.has(owner.state.binding.bindingId)))
        )
          deleteOwner(key);
    if (owners.size >= 128) return yield* Effect.fail(failure("budget_exceeded"));
    const owner: Owner = {
      caller,
      busy: reserve ? 1 : 0,
      state: { status: "unbound" },
      released: Deferred.makeUnsafe<void>(),
    };
    owners.set(ownerKey(caller), owner);
    if (caller.credentialAuthorization)
      return yield* Effect.raceFirst(
        caller.credentialAuthorization.invalidated.pipe(Effect.as(true)),
        Deferred.await(owner.released).pipe(Effect.as(false)),
      ).pipe(
        Effect.flatMap((invalidated) => (invalidated ? refresh(owner) : Effect.void)),
        Effect.forkIn(serviceScope),
        Effect.as(owner),
      );
    return owner;
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
    if (
      state.status === "selection_required" &&
      owner.caller.credentialAuthorization?.isValid() === false
    ) {
      const invited = owner.invited;
      delete owner.invited;
      setState(owner, { status: "unbound" });
      deleteOwner(ownerKey(owner.caller));
      yield* clearSelection(state.selectionRequestId, invited);
      return;
    }
    if ("binding" in state && owner.caller.credentialAuthorization?.isValid() === false) {
      setState(owner, { status: "invalid", binding: state.binding, reason: "target_invalid" });
      yield* retire(state.binding.bindingId, failure("target_invalid"));
      return;
    }
    if (state.status === "invalid") {
      yield* retire(state.binding.bindingId, failure(state.reason));
      return;
    }
    if (state.status !== "bound" && state.status !== "paused") return;
    const client = owner.connectionId ? connections.get(owner.connectionId) : undefined;
    if (!client) {
      setState(owner, { status: "invalid", binding: state.binding, reason: "client_unavailable" });
      yield* retire(state.binding.bindingId, failure("client_unavailable"));
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
      setState(owner, { status: "invalid", binding: state.binding, reason: "target_invalid" });
      yield* retire(state.binding.bindingId, failure("target_invalid"));
      return;
    }
    const current = yield* inspect(owner.caller.scope, state.binding.target).pipe(Effect.result);
    if (
      owner.state !== state ||
      owners.get(ownerKey(owner.caller)) !== owner ||
      connections.get(owner.connectionId!) !== client
    )
      return;
    if (current._tag === "Failure") {
      setState(owner, { status: "invalid", binding: state.binding, reason: "target_invalid" });
      yield* retire(state.binding.bindingId, failure("target_invalid"));
    } else if (current.success.humanInputEpoch !== owner.humanInputEpoch) {
      owner.pauseTarget = state.binding.target;
      owner.humanInputEpoch = current.success.humanInputEpoch;
      setState(owner, {
        status: "paused",
        binding: { ...state.binding, inputEpoch: state.binding.inputEpoch + 1 },
        reason: "human_intervened",
      });
    }
  });
  const getConnectionState = Effect.fn("TerminalAutomation.getConnectionState")(function* (
    id: string,
  ) {
    const client = yield* connection(id);
    const owned = () =>
      [...owners.entries()].filter(
        ([, owner]) =>
          owner.connectionId === id &&
          sameScope(client.scope, owner.caller.scope) &&
          "binding" in owner.state,
      );
    for (const [key, owner] of owned()) {
      yield* refresh(owner);
      if (connections.get(id) !== client) return yield* Effect.fail(failure("client_unavailable"));
      if (
        owners.get(key) !== owner ||
        owner.connectionId !== id ||
        !sameScope(client.scope, owner.caller.scope)
      )
        continue;
    }
    for (const owner of owners.values())
      if (sameScope(owner.caller.scope, client.scope) && owner.invited?.has(id))
        yield* refresh(owner);
    if (connections.get(id) !== client) return yield* Effect.fail(failure("client_unavailable"));
    return {
      version: 1 as const,
      revision: client.revision,
      selections: [...owners.values()].flatMap((owner) =>
        sameScope(owner.caller.scope, client.scope) &&
        owner.invited?.has(id) &&
        owner.state.status === "selection_required" &&
        owner.selection
          ? [owner.selection]
          : [],
      ),
      bindings: owned().flatMap(([, owner]) => ("binding" in owner.state ? [owner.state] : [])),
    };
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
    const owner = getOwner(caller) ?? {
      caller,
      busy: 0,
      state: { status: "unbound" as const },
      released: Deferred.makeUnsafe<void>(),
    };
    yield* refresh(owner);
    pruneRetired();
    const work = input.receipt
      ? (bindings.get(input.receipt.bindingId) ?? retired.get(input.receipt.bindingId))
      : undefined;
    if (
      input.receipt &&
      (!work || work.ownerKey !== ownerKey(caller) || !work.receipts.has(input.receipt.requestId))
    )
      return yield* Effect.fail(failure("stale_request"));
    const receipt = input.receipt ? work?.receipts.get(input.receipt.requestId)?.result : undefined;
    return {
      ...(receipt ? { inputResult: receipt } : {}),
      version: 1 as const,
      candidateVersion: versionFor(caller.scope),
      candidates: yield* candidates(caller.scope),
      state: owner.state,
    };
  });
  const disconnect = Effect.fn("TerminalAutomation.disconnect")(function* (id: string) {
    const client = connections.get(id);
    if (!client) return;
    yield* changeCandidates(client.scope);
    connections.delete(id);
    for (const entry of pending.values())
      if (entry.connectionId === id)
        yield* Deferred.fail(entry.done, failure("client_unavailable"));
    for (const owner of owners.values()) {
      if (owner.connectionId === id && "binding" in owner.state) {
        setState(owner, {
          status: "invalid",
          binding: owner.state.binding,
          reason: "client_unavailable",
        });
        yield* retire(owner.state.binding.bindingId, failure("client_unavailable"));
      }
      if (owner.caller.selectionConnectionId === id && owner.state.status === "selection_required")
        setState(owner, { status: "unbound" });
    }
    yield* Queue.shutdown(client.messages);
    yield* Queue.shutdown(client.changes);
  }, Effect.uninterruptible);
  const connect = Effect.fn("TerminalAutomation.connect")(function* (
    scope: A.TerminalAutomationScope,
    id: string,
  ) {
    const client = yield* Effect.acquireRelease(
      Effect.gen(function* () {
        if (connections.has(id)) return yield* Effect.fail(failure("request_conflict"));
        if (connections.size >= 128) return yield* Effect.fail(failure("budget_exceeded"));
        const messages = yield* Queue.bounded<Message>(128);
        // Revisions coalesce in one slot; the query always returns the complete current state.
        const changes = yield* Queue.sliding<A.TerminalAutomationStateChanged>(1);
        const created: Connection = {
          scope,
          messages,
          changes,
          revision: 0,
          views: [],
          version: versionFor(scope),
        };
        connections.set(id, created);
        return created;
      }),
      (created) => (connections.get(id) === created ? disconnect(id) : Effect.void),
    );
    return client.messages;
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
    yield* changeCandidates(client.scope);
    for (const owner of owners.values())
      if (sameScope(client.scope, owner.caller.scope)) yield* refresh(owner);
  });
  const select = Effect.fn("TerminalAutomation.select")(function* (
    owner: Owner,
    candidate: A.TerminalAutomationCandidate,
    authorize?: Authorization,
    isCurrent?: () => boolean,
  ) {
    if (isCurrent?.() === false) return yield* Effect.fail(failure("stale_request"));
    const previousState = owner.state;
    const entry = [...connections.entries()].find(
      ([, client]) =>
        sameScope(client.scope, owner.caller.scope) &&
        client.views.some((view) => view.candidateId === candidate.candidateId),
    );
    if (!entry) return yield* Effect.fail(failure("target_invalid"));
    const inspected = yield* inspect(owner.caller.scope, candidate.target).pipe(Effect.result);
    if (isCurrent?.() === false || owner.state !== previousState)
      return yield* Effect.fail(failure("stale_request"));
    if (inspected._tag === "Failure") return yield* Effect.fail(inspected.failure);
    const current = inspected.success;
    if (owner.caller.credentialAuthorization?.isValid() === false)
      return yield* Effect.fail(failure("target_invalid"));
    if (authorize && !canDispatch(authorize)) return yield* Effect.fail(failure("target_invalid"));
    if (connections.get(entry[0]) !== entry[1])
      return yield* Effect.fail(failure("client_unavailable"));
    const selectionRequestId =
      previousState.status === "selection_required" ? previousState.selectionRequestId : undefined;
    const invited = owner.invited;
    if (isCurrent?.() === false) return yield* Effect.fail(failure("stale_request"));
    delete owner.invited;
    owner.connectionId = entry[0];
    owner.humanInputEpoch = current.humanInputEpoch;
    const paused =
      owner.pauseTarget?.terminalId === candidate.target.terminalId &&
      owner.pauseTarget.terminalInstanceId === candidate.target.terminalInstanceId;
    setState(owner, {
      ...(paused
        ? { status: "paused" as const, reason: "human_intervened" as const }
        : { status: "bound" as const }),
      binding: {
        bindingId: NodeCrypto.randomUUID(),
        target: candidate.target,
        alias: "terminal",
        inputEpoch: 0,
      },
    });
    if (!("binding" in owner.state)) return yield* Effect.fail(failure("stale_request"));
    bindings.set(owner.state.binding.bindingId, {
      ownerKey: ownerKey(owner.caller),
      receipts: new Map(),
      stop: Deferred.makeUnsafe<never, Failure>(),
    });
    if (selectionRequestId) yield* clearSelection(selectionRequestId, invited);
  });
  const bind = Effect.fn("TerminalAutomation.bind")(function* (
    caller: Caller,
    raw: A.TerminalAutomationBindInput,
    authorize?: Authorization,
  ) {
    const input = yield* decode(A.TerminalAutomationBindInput, raw);
    if (caller.credentialAuthorization?.isValid() === false)
      return yield* Effect.fail(failure("target_invalid"));
    return yield* Effect.acquireUseRelease(
      ensureOwner(caller, true),
      (owner) =>
        Effect.gen(function* () {
          yield* refresh(owner);
          if (input.mode === "resume") return yield* Effect.fail(failure("human_intervened"));
          if (owner.state.status !== "unbound") return yield* status(caller);
          owner.caller = caller;
          const previousState = owner.state;
          const candidateVersion = versionFor(caller.scope);
          const available = (yield* candidates(caller.scope)).filter(
            (candidate) =>
              !owner.pauseTarget ||
              (candidate.target.terminalId === owner.pauseTarget.terminalId &&
                candidate.target.terminalInstanceId === owner.pauseTarget.terminalInstanceId),
          );
          if (authorize && !canDispatch(authorize))
            return yield* Effect.fail(failure("target_invalid"));
          if (owner.state !== previousState || candidateVersion !== versionFor(caller.scope))
            return yield* Effect.fail(failure("stale_request"));
          if (available.length === 0) return yield* Effect.fail(failure("not_ready"));
          if (available.length === 1 && input.mode === "auto")
            yield* select(owner, available[0]!, authorize);
          else {
            const recipients = [...connections.entries()].filter(
              ([id, client]) =>
                (caller.selectionConnectionId === undefined ||
                  caller.selectionConnectionId === id) &&
                sameScope(client.scope, caller.scope) &&
                client.views.some((view) =>
                  available.some((candidate) => candidate.candidateId === view.candidateId),
                ),
            );
            if (recipients.length === 0) return yield* Effect.fail(failure("client_unavailable"));
            const selectionRequestId = NodeCrypto.randomUUID();
            const request: A.TerminalAutomationSelectionRequest = {
              version: 1,
              selectionRequestId,
              candidateVersion: versionFor(caller.scope),
              candidates: available,
            };
            setState(owner, {
              status: "selection_required",
              selectionRequestId,
              candidateVersion: request.candidateVersion,
            });
            const invited = new Set<string>();
            owner.selection = request;
            owner.invited = invited;
            for (const [id, client] of recipients) {
              if (!Queue.offerUnsafe(client.messages, request)) {
                delete owner.invited;
                setState(owner, { status: "unbound" });
                yield* clearSelection(selectionRequestId, invited);
                return yield* Effect.fail(failure("budget_exceeded"));
              }
              invited.add(id);
              notify(client);
            }
          }
          return yield* status(caller);
        }),
      (owner) =>
        Effect.sync(() => {
          owner.busy -= 1;
          if (
            owner.busy === 0 &&
            !owner.pauseTarget &&
            owner.state.status === "unbound" &&
            getOwner(caller) === owner
          )
            deleteOwner(ownerKey(caller));
        }),
    );
  });
  const replySelection = Effect.fn("TerminalAutomation.replySelection")(function* (
    id: string,
    raw: A.TerminalAutomationSelectionReply,
  ) {
    const input = yield* decode(A.TerminalAutomationSelectionReply, raw);
    const client = yield* connection(id);
    const owner = [...owners.values()].find(
      (item) =>
        item.invited?.has(id) === true &&
        sameScope(item.caller.scope, client.scope) &&
        item.state.status === "selection_required" &&
        item.state.selectionRequestId === input.selectionRequestId,
    );
    if (
      !owner ||
      owner.state.status !== "selection_required" ||
      owner.state.candidateVersion !== input.candidateVersion ||
      versionFor(client.scope) !== input.candidateVersion
    )
      return yield* Effect.fail(failure("stale_request"));
    if (input.choice.status === "cancelled") {
      const invited = owner.invited;
      delete owner.invited;
      setState(owner, { status: "unbound" });
      deleteOwner(ownerKey(owner.caller));
      yield* clearSelection(input.selectionRequestId, invited);
      return;
    }
    const candidateId = input.choice.candidateId;
    const previousState = owner.state;
    const caller = owner.caller;
    const invited = owner.invited;
    const isCurrent = () =>
      getOwner(caller) === owner &&
      owner.caller === caller &&
      owner.state === previousState &&
      previousState.selectionRequestId === input.selectionRequestId &&
      previousState.candidateVersion === input.candidateVersion &&
      versionFor(client.scope) === input.candidateVersion &&
      connections.get(id) === client &&
      owner.invited === invited &&
      invited?.has(id) === true;
    const candidate = (yield* candidates(owner.caller.scope)).find(
      (view) => view.candidateId === candidateId,
    );
    if (!isCurrent()) return yield* Effect.fail(failure("stale_request"));
    if (!candidate) return yield* Effect.fail(failure("target_invalid"));
    const selected = yield* (
      owner.caller.authorizeSelection
        ? owner.caller.authorizeSelection((authorization) =>
            select(owner, candidate, authorization, isCurrent),
          )
        : select(owner, candidate, undefined, isCurrent)
    ).pipe(Effect.result);
    if (selected._tag === "Failure") {
      if (!isCurrent()) return yield* Effect.fail(failure("stale_request"));
      delete owner.invited;
      setState(owner, { status: "unbound" });
      deleteOwner(ownerKey(caller));
      yield* clearSelection(input.selectionRequestId, invited);
      return yield* Effect.fail(selected.failure);
    }
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
        owner.pauseTarget = state.binding.target;
        setState(owner, {
          status: "paused",
          binding: { ...state.binding, inputEpoch: state.binding.inputEpoch + 1 },
          reason: "human_intervened",
        });
      } else if (input.event !== "human_intervened") {
        setState(owner, { status: "invalid", binding: state.binding, reason: "target_invalid" });
        yield* retire(state.binding.bindingId, failure("target_invalid"));
      }
    }
    if (input.event !== "human_intervened") {
      client.views = client.views.filter((view) => !sameTarget(view.target, input.target));
      yield* changeCandidates(client.scope);
    }
  });
  const resumeConfirmed = Effect.fn("TerminalAutomation.resumeConfirmed")(function* (
    caller: Caller,
    bindingId: string,
  ) {
    const owner = yield* ensureOwner(caller);
    const confirmedState = owner.state;
    yield* refresh(owner);
    if (
      owner.state !== confirmedState ||
      owner.state.status !== "paused" ||
      owner.state.binding.bindingId !== bindingId
    )
      return yield* Effect.fail(failure("stale_request"));
    delete owner.pauseTarget;
    setState(owner, { status: "bound", binding: owner.state.binding });
    return yield* status(caller);
  });
  const resumeFromConnection = Effect.fn("TerminalAutomation.resumeFromConnection")(function* (
    connectionId: string,
    bindingId: string,
    inputEpoch: number,
  ) {
    const work = bindings.get(bindingId);
    const owner = work ? owners.get(work.ownerKey) : undefined;
    const client = connections.get(connectionId);
    const confirmedState = owner?.state;
    const valid = () =>
      work !== undefined &&
      bindings.get(bindingId) === work &&
      owner !== undefined &&
      owner.state === confirmedState &&
      owners.get(work.ownerKey) === owner &&
      client !== undefined &&
      connections.get(connectionId) === client &&
      owner.connectionId === connectionId &&
      sameScope(owner.caller.scope, client.scope) &&
      owner.state.status === "paused" &&
      owner.state.binding.bindingId === bindingId &&
      owner.state.binding.inputEpoch === inputEpoch;
    if (!owner || !valid()) return yield* Effect.fail(failure("stale_request"));
    yield* refresh(owner);
    if (!valid() || owner.state.status !== "paused")
      return yield* Effect.fail(failure("stale_request"));
    delete owner.pauseTarget;
    setState(owner, { status: "bound", binding: owner.state.binding });
    return yield* status(owner.caller);
  });
  const release = Effect.fn("TerminalAutomation.release")(function* (
    caller: Caller,
    raw: A.TerminalAutomationReleaseInput,
  ) {
    const input = yield* decode(A.TerminalAutomationReleaseInput, raw);
    const owner = getOwner(caller);
    if (!owner || !("binding" in owner.state) || owner.state.binding.bindingId !== input.bindingId)
      return yield* Effect.fail(failure("target_invalid"));
    yield* refresh(owner);
    return yield* Effect.uninterruptible(
      Effect.gen(function* () {
        setState(owner, { status: "unbound" });
        delete owner.connectionId;
        if (!owner.pauseTarget) deleteOwner(ownerKey(caller));
        yield* retire(input.bindingId, failure("target_invalid"));
        return { status: "released" as const };
      }),
    );
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
    beforeDispatch?: () => boolean,
    onDispatch?: () => void,
  ) {
    const client = yield* connection(connectionId);
    if (pending.size >= 1024) return yield* Effect.fail(failure("budget_exceeded"));
    return yield* Effect.acquireUseRelease(
      Effect.sync(() => {
        const done = Deferred.makeUnsafe<A.TerminalAutomationClientReply, Failure>();
        pending.set(request.bridgeRequestId, { connectionId, request, done });
        return done;
      }),
      (done) =>
        Effect.suspend(() => {
          if (beforeDispatch?.() === false) return Effect.fail(failure("stale_request"));
          if (!Queue.offerUnsafe(client.messages, request))
            return Effect.fail(failure("budget_exceeded"));
          onDispatch?.();
          return Deferred.await(done);
        }),
      () => Effect.sync(() => pending.delete(request.bridgeRequestId)),
    );
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
    if (
      expected.operation === "apply_local" &&
      (!("inputRequestId" in result) || result.inputRequestId !== expected.inputRequestId)
    )
      return yield* Effect.fail(failure("stale_request"));
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
    if (expected.operation === "apply_local" && "error" in result) {
      const receipt = bindings
        .get(expected.binding.bindingId)
        ?.receipts.get(expected.inputRequestId);
      if (receipt && !receipt.result) receipt.dispatched = false;
    }
    if ("error" in result) yield* Deferred.fail(entry.done, result.error);
    else yield* Deferred.succeed(entry.done, reply);
  });
  const input = Effect.fn("TerminalAutomation.input")(function* (
    caller: Caller,
    raw: A.TerminalAutomationInput,
    authorize: Authorization,
  ) {
    const request = yield* decode(A.TerminalAutomationInput, raw);
    return yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        pruneRetired();
        const work = bindings.get(request.bindingId) ?? retired.get(request.bindingId);
        if (!work || work.ownerKey !== ownerKey(caller))
          return {
            status: "not_sent" as const,
            requestId: request.requestId,
            error: failure("target_invalid"),
          };
        const payload = fingerprint(request.action);
        const table = work.receipts;
        const old = table.get(request.requestId);
        if (old) {
          if (old.payload !== payload)
            return {
              status: "not_sent" as const,
              requestId: request.requestId,
              error: failure("request_conflict"),
            };
          return (
            old.result ??
            (yield* restore(
              Deferred.await(old.done).pipe(
                Effect.timeoutOrElse({
                  duration: Math.max(0, old.deadline - clock.currentTimeMillisUnsafe()),
                  orElse: () =>
                    complete(old, failure("client_unavailable")).pipe(
                      Effect.andThen(() => Effect.succeed(old.result!)),
                    ),
                }),
              ),
            ))
          );
        }
        if (!bindings.has(request.bindingId))
          return {
            status: "not_sent" as const,
            requestId: request.requestId,
            error: failure("target_invalid"),
          };
        if (table.size >= 256)
          return {
            status: "not_sent" as const,
            requestId: request.requestId,
            error: failure("budget_exceeded"),
          };
        const receipt: Receipt = {
          payload,
          requestId: request.requestId,
          deadline: clock.currentTimeMillisUnsafe() + 10_000,
          dispatched: false,
          done: Deferred.makeUnsafe<A.TerminalAutomationInputResult>(),
        };
        table.set(request.requestId, receipt);
        const operation = Effect.gen(function* () {
          yield* checkAuthorization(authorize);
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
            (request.action.frameRevision !== frame.frameRevision ||
              request.action.position.column >= frame.cols ||
              request.action.position.row >= frame.rows)
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
            encoded.result.operation === "encode_input" &&
            "status" in encoded.result &&
            encoded.result.status === "local_action"
          ) {
            const action = request.action;
            const plan = encoded.result.localAction;
            if (
              action.type !== "mouse" ||
              action.event !== "wheel" ||
              action.deltaColumns !== 0 ||
              plan.deltaRows !== action.deltaRows
            )
              return yield* Effect.fail(failure("stale_request"));
            yield* checkAuthorization(authorize);
            const current = yield* requireBinding(caller, request.bindingId, binding.inputEpoch);
            const applied = yield* bridge(
              initial.connectionId,
              {
                ...fields,
                bridgeRequestId: NodeCrypto.randomUUID(),
                operation: "apply_local",
                inputRequestId: request.requestId,
                frameRevision: frame.frameRevision,
                localAction: plan,
              },
              () =>
                canDispatch(authorize) &&
                caller.credentialAuthorization?.isValid() !== false &&
                current.owner.state.status === "bound" &&
                current.owner.state.binding.inputEpoch === binding.inputEpoch &&
                receipt.result === undefined &&
                bindings.get(binding.bindingId) === work,
              () => {
                receipt.dispatched = true;
              },
            );
            if (
              applied.result.operation !== "apply_local" ||
              !("status" in applied.result) ||
              applied.result.status !== "local_applied"
            )
              return yield* Effect.fail(failure("stale_request"));
            receipt.result ??= { status: "local_applied", requestId: request.requestId };
            return receipt.result;
          }
          if (
            encoded.result.operation !== "encode_input" ||
            !("encodedText" in encoded.result) ||
            !encoded.result.encodedText.length
          )
            return yield* Effect.fail(failure("not_ready"));
          const encodedText = encoded.result.encodedText;
          yield* checkAuthorization(authorize);
          const current = yield* requireBinding(caller, request.bindingId, binding.inputEpoch);
          // No interruptible step separates the final binding/permission check from the synchronous PTY write.
          yield* Effect.uninterruptible(
            Effect.gen(function* () {
              yield* manager
                .writeAutomation({
                  threadId: caller.scope.threadId,
                  terminalId: binding.target.terminalId,
                  terminalInstanceId: binding.target.terminalInstanceId,
                  humanInputEpoch: current.owner.humanInputEpoch!,
                  canWrite: () => {
                    const allowed =
                      canDispatch(authorize) &&
                      caller.credentialAuthorization?.isValid() !== false &&
                      current.owner.state.status === "bound" &&
                      receipt.result === undefined &&
                      bindings.get(binding.bindingId) === work &&
                      current.owner.state.binding.bindingId === binding.bindingId &&
                      current.owner.state.binding.inputEpoch === binding.inputEpoch &&
                      connections
                        .get(initial.connectionId)
                        ?.views.some(
                          (view) =>
                            sameTarget(view.target, binding.target) && view.readiness === "ready",
                        ) === true;
                    if (allowed) receipt.dispatched = true;
                    return allowed;
                  },
                  data: encodedText,
                })
                .pipe(
                  Effect.mapError((error) => {
                    if (error._tag !== "TerminalWriteError") receipt.dispatched = false;
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
          (effect) => Effect.raceFirst(effect, Deferred.await(work.stop)),
          (effect) =>
            Effect.isEffect(authorize)
              ? effect
              : Effect.raceFirst(
                  effect,
                  authorize.invalidated.pipe(
                    Effect.andThen(revoke(caller, request.bindingId)),
                    Effect.andThen(Effect.fail(failure("target_invalid"))),
                  ),
                ),
          Effect.timeoutOrElse({
            duration: Math.max(0, receipt.deadline - clock.currentTimeMillisUnsafe()),
            orElse: () => Effect.fail(failure("client_unavailable")),
          }),
          Effect.catch((error) =>
            Effect.succeed<A.TerminalAutomationInputResult>(
              receipt.result ??
                (receipt.dispatched
                  ? { status: "unknown", requestId: request.requestId }
                  : { status: "not_sent", requestId: request.requestId, error }),
            ),
          ),
        );
        return yield* restore(operation).pipe(
          Effect.tap((result) =>
            Effect.sync(() => {
              receipt.result ??= result;
            }),
          ),
          Effect.ensuring(complete(receipt, failure("stale_request"))),
        );
      }),
    );
  });
  const read = Effect.fn("TerminalAutomation.read")(function* (
    caller: Caller,
    raw: A.TerminalAutomationReadInput,
    authorize: Authorization,
  ) {
    const request = yield* decode(A.TerminalAutomationReadInput, raw);
    return yield* Effect.gen(function* () {
      yield* checkAuthorization(authorize);
      const initial = yield* requireBinding(caller, request.bindingId);
      const response = yield* bridge(
        initial.connectionId,
        {
          version: 1,
          bridgeRequestId: NodeCrypto.randomUUID(),
          binding: initial.binding,
          operation: "read",
          query: request.query,
        },
        () => canDispatch(authorize) && caller.credentialAuthorization?.isValid() !== false,
      );
      yield* checkAuthorization(authorize);
      if (!canDispatch(authorize)) return yield* Effect.fail(failure("target_invalid"));
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
        (query.source !== "history" && textLines > query.budget.maxLines) ||
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
      if (query.source === "history") {
        const next = result.nextCursor;
        const offset = query.codeUnitOffset ?? 0;
        if (
          result.continuity === "complete" &&
          query.range.startLine < query.range.endLineExclusive &&
          (!range ||
            range.startLine !== query.range.startLine ||
            (next === null &&
              (result.truncated || range.endLineExclusive !== query.range.endLineExclusive)))
        )
          return yield* Effect.fail(failure("stale_request"));
        if (!result.text.isWellFormed()) return yield* Effect.fail(failure("stale_request"));
        if (
          result.continuity === "complete" &&
          (query.range.startLine < result.frame.retainedRange.startLine ||
            query.range.endLineExclusive > result.frame.retainedRange.endLineExclusive)
        )
          return yield* Effect.fail(failure("stale_request"));
        if (next?.source === "history") {
          if (
            next.activeScreen !== query.activeScreen ||
            next.frameRevision !== result.frame.frameRevision ||
            next.nextLine < query.range.startLine ||
            next.nextLine >= query.range.endLineExclusive ||
            !range ||
            next.nextLine < range.startLine ||
            next.nextLine > range.endLineExclusive ||
            (next.codeUnitOffset > 0 && next.nextLine >= range.endLineExclusive)
          )
            return yield* Effect.fail(failure("stale_request"));
          if (
            next.nextLine === query.range.startLine &&
            (next.codeUnitOffset <= offset || next.codeUnitOffset - offset !== result.text.length)
          )
            return yield* Effect.fail(failure("stale_request"));
          if (next.nextLine > query.range.startLine && next.codeUnitOffset > result.text.length)
            return yield* Effect.fail(failure("stale_request"));
          if (
            range.endLineExclusive !== next.nextLine + (next.codeUnitOffset > 0 ? 1 : 0) ||
            result.softWrapAfterLines.some((line) => line >= next.nextLine)
          )
            return yield* Effect.fail(failure("stale_request"));
        }
      }
      return result;
    }).pipe(
      (effect) =>
        Effect.isEffect(authorize)
          ? effect
          : Effect.raceFirst(
              effect,
              authorize.invalidated.pipe(
                Effect.andThen(revoke(caller, request.bindingId)),
                Effect.andThen(Effect.fail(failure("target_invalid"))),
              ),
            ),
      Effect.timeoutOrElse({
        duration: "10 seconds",
        orElse: () => Effect.fail(failure("client_unavailable")),
      }),
    );
  });
  const revoke = Effect.fn("TerminalAutomation.revoke")(function* (
    caller: Caller,
    bindingId: string,
  ) {
    const owner = getOwner(caller);
    if (!owner || !("binding" in owner.state) || owner.state.binding.bindingId !== bindingId)
      return yield* Effect.fail(failure("target_invalid"));
    yield* Effect.uninterruptible(
      Effect.gen(function* () {
        if ("binding" in owner.state)
          setState(owner, {
            status: "invalid",
            binding: owner.state.binding,
            reason: "target_invalid",
          });
        yield* retire(bindingId, failure("target_invalid"));
      }),
    );
  });
  yield* Effect.addFinalizer(() =>
    Effect.forEach([...connections.keys()], disconnect, { discard: true }),
  );
  return TerminalAutomationService.of({
    connect,
    disconnect,
    getConnectionState,
    watchState: Effect.fn("TerminalAutomation.watchState")((id: string) =>
      connection(id).pipe(Effect.map((client) => client.changes)),
    ),
    registerViews,
    status,
    bind,
    replySelection,
    reportEvent,
    resumeConfirmed,
    resumeFromConnection,
    release,
    input,
    read,
    replyBridge,
    revoke,
  });
});

export const layer = Layer.effect(TerminalAutomationService, make);
