import { expect, it, vi } from "vite-plus/test";
import type * as A from "@t3tools/contracts";
import { terminalCanUnmount } from "./mountRetention";
import {
  TerminalAutomationController,
  type TerminalAutomationTransport,
  type TerminalAutomationView,
} from "./automationController";

const target = { terminalId: "term", terminalInstanceId: "instance", viewId: "view" };
const binding = { bindingId: "binding", target, alias: "terminal", inputEpoch: 0 };
const paused: A.TerminalAutomationConnectionState = {
  version: 1,
  bindings: [{ status: "paused", binding, reason: "human_intervened" }],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function setup() {
  let emit: (event: typeof A.TerminalAutomationRpcEvent.Type) => void = () => {};
  let start = () => {};
  let end = () => {};
  let fail = (_error: unknown) => {};
  const reply = deferred<A.TerminalAutomationClientReply>();
  const registered = deferred<void>();
  const synchronized = deferred<void>();
  const transport: TerminalAutomationTransport = {
    subscribe: (s, e, receive, failed) => {
      start = s;
      end = e;
      emit = receive;
      fail = failed ?? (() => {});
      start();
      return end;
    },
    registerViews: vi.fn(async () => {
      registered.resolve();
    }),
    replyBridge: async (value) => {
      reply.resolve(value);
    },
    replySelection: async () => {},
    reportEvent: async () => {},
    getConnectionState: async () => ({ version: 1, bindings: [{ status: "bound", binding }] }),
    resume: vi.fn(async (): Promise<A.TerminalAutomationStatus> => ({
      version: 1,
      candidateVersion: 1,
      candidates: [],
      state: { status: "bound", binding },
    })),
  };
  const view: TerminalAutomationView = {
    candidate: {
      candidateId: "local",
      target,
      title: "Terminal",
      clientKind: "web",
      visible: false,
      readiness: "ready",
      capabilities: { read: true, show: true, input: true },
    },
    canOperate: () => true,
    invalidate: vi.fn(),
    perform: async () => ({ operation: "show", status: "visible" }),
  };
  const controller = new TerminalAutomationController(transport);
  controller.start();
  controller.setView(view);
  const initial = controller.getSnapshot().bindings;
  controller.subscribe(() => {
    if (controller.getSnapshot().bindings !== initial) synchronized.resolve();
  });
  return {
    controller,
    transport,
    view,
    ready: async () => {
      emit({ type: "ready" });
      await synchronized.promise;
    },
    emit: (event: typeof A.TerminalAutomationRpcEvent.Type) => emit(event),
    end: () => end(),
    fail: (error: unknown) => fail(error),
    start: () => start(),
    reply,
    registered,
  };
}

it("preserves subscription failure in the controller snapshot and invalidates ready", async () => {
  const f = setup();
  await f.ready();
  await f.controller.synchronize();
  const query = deferred<A.TerminalAutomationConnectionState>();
  f.transport.getConnectionState = () => query.promise;
  f.emit({ type: "state_changed", revision: 1 });
  const pending = f.controller.synchronize();
  const error = { code: "client_unavailable" };
  f.fail(error);
  expect(f.controller.getSnapshot()).toMatchObject({ ready: false, bindings: [], error });
  query.resolve({ version: 1, revision: 1, bindings: [], selections: [] });
  await expect(pending).rejects.toThrow("stale_request");
  expect(f.controller.getSnapshot()).toMatchObject({ ready: false, bindings: [], error });
  f.controller.dispose();
});

it("retains ready candidate resources even when a snapshot has no binding, until the connection ends", async () => {
  const harness = setup();
  await harness.ready();
  expect(await terminalCanUnmount(harness.controller)).toBe(false);
  harness.transport.getConnectionState = async () => {
    throw new Error("offline query");
  };
  await expect(harness.controller.refreshState()).rejects.toThrow("offline query");
  expect(await terminalCanUnmount(harness.controller)).toBe(false);
  harness.transport.getConnectionState = async () => ({ version: 1, bindings: [] });
  await harness.controller.refreshState();
  expect(harness.controller.getSnapshot().bindings).toEqual([]);
  expect(await terminalCanUnmount(harness.controller)).toBe(false);
  harness.controller.dispose();
  expect(await terminalCanUnmount(harness.controller)).toBe(true);
});

it("registers mounted instances only after ready and re-registers on reconnect", async () => {
  const f = setup();
  expect(f.transport.registerViews).not.toHaveBeenCalled();
  await f.ready();
  await f.registered.promise;
  expect(f.transport.registerViews).toHaveBeenCalledWith([f.view.candidate]);
  f.end();
  f.start();
  await f.ready();
  expect(f.transport.registerViews).toHaveBeenCalledTimes(2);
  f.controller.dispose();
});

it.each(["registration", "synchronization", "completion"] as const)(
  "sends final view changes received during %s without another manual registration",
  async (stage) => {
    const f = setup();
    const entered = deferred<void>();
    const proceed = deferred<void>();
    const queried = deferred<void>();
    let first = true;
    let registered: readonly A.TerminalAutomationCandidate[] = [];
    f.transport.registerViews = async (views) => {
      if (stage === "registration" && first) {
        first = false;
        entered.resolve();
        await proceed.promise;
      }
      registered = views;
    };
    f.transport.getConnectionState = async () => {
      if (stage !== "registration" && first) {
        first = false;
        entered.resolve();
        await proceed.promise;
      }
      queried.resolve();
      return { version: 1, bindings: [] };
    };
    const ready = f.ready();
    await entered.promise;
    const second = {
      ...f.view,
      candidate: { ...f.view.candidate, target: { ...target, viewId: "second" } },
    };
    const update = () => {
      f.controller.setView(second);
      f.controller.removeView(target);
      f.controller.setView({
        ...f.view,
        candidate: { ...f.view.candidate, title: "updated", visible: true },
      });
    };
    const updated = stage === "completion" ? f.controller.synchronize().then(update) : update();
    proceed.resolve();
    await updated;
    await queried.promise;
    await ready;
    await f.controller.synchronize();
    expect(registered.map((candidate) => candidate.target.viewId).sort()).toEqual([
      "second",
      "view",
    ]);
    expect(registered.find((candidate) => candidate.target.viewId === "view")).toMatchObject({
      title: "updated",
      visible: true,
    });
    f.controller.dispose();
  },
);

it("stops a failed registration even when views change while it waits", async () => {
  const f = setup();
  const proceed = deferred<void>();
  const failed = deferred<void>();
  const error = new Error("registration failed");
  f.transport.registerViews = vi.fn(async () => {
    await proceed.promise;
    throw error;
  });
  const stop = f.controller.subscribe(() => {
    if (f.controller.getSnapshot().error === error) failed.resolve();
  });
  f.emit({ type: "ready" });
  f.controller.setView({ ...f.view, candidate: { ...f.view.candidate, visible: true } });
  proceed.resolve();
  await failed.promise;
  expect(f.transport.registerViews).toHaveBeenCalledTimes(1);
  stop();
  f.controller.dispose();
});

it.each(["waiting", "completion"] as const)(
  "sends the latest views after an obsolete invalid registration fails during %s",
  async (stage) => {
    const f = setup();
    const second = {
      ...f.view,
      candidate: { ...f.view.candidate, target: { ...target, viewId: "closing" } },
    };
    f.controller.setView(second);
    await f.ready();
    await f.controller.synchronize();
    const proceed = deferred<void>();
    const settled = deferred<void>();
    let accepted: readonly A.TerminalAutomationCandidate[] = [];
    let first = true;
    const update = () => f.controller.removeView(second.candidate.target);
    f.transport.registerViews = vi.fn((views) => {
      if (first) {
        first = false;
        if (stage === "completion") void proceed.promise.catch(() => {}).then(update);
        return proceed.promise;
      }
      accepted = views;
      return Promise.resolve();
    });
    const stop = f.controller.subscribe(() => {
      if (f.controller.getSnapshot().error || accepted.length > 0) settled.resolve();
    });
    f.controller.setView({ ...f.view, candidate: { ...f.view.candidate, visible: true } });
    if (stage === "waiting") update();
    proceed.reject({ code: "target_invalid" });
    await settled.promise;
    await f.controller.synchronize();
    expect(accepted).toEqual([{ ...f.view.candidate, visible: true }]);
    expect(f.transport.registerViews).toHaveBeenCalledTimes(2);
    expect(f.transport.registerViews).toHaveBeenLastCalledWith(accepted);
    stop();
    f.controller.dispose();
  },
);

it.each(["unchanged", "permission", "connection", "ended", "disposed"] as const)(
  "does not resend a rejected registration when %s",
  async (mode) => {
    const f = setup();
    await f.ready();
    await f.controller.synchronize();
    const proceed = deferred<void>();
    const settled = deferred<void>();
    const error =
      mode === "permission"
        ? { _tag: "EnvironmentAuthorizationError" }
        : { code: mode === "connection" ? "client_unavailable" : "target_invalid" };
    f.transport.registerViews = vi.fn(() => proceed.promise);
    const stop = f.controller.subscribe(() => {
      if (f.controller.getSnapshot().error === error) settled.resolve();
    });
    f.controller.setView(f.view);
    if (mode !== "unchanged")
      f.controller.setView({ ...f.view, candidate: { ...f.view.candidate, visible: true } });
    if (mode === "ended") f.end();
    if (mode === "disposed") f.controller.dispose();
    proceed.reject(error);
    if (mode === "ended" || mode === "disposed")
      await proceed.promise.catch(() => {}).then(() => {});
    else await settled.promise;
    expect(f.transport.registerViews).toHaveBeenCalledTimes(1);
    stop();
    f.controller.dispose();
  },
);

it("stops after the latest registration also rejects its target", async () => {
  const f = setup();
  await f.ready();
  await f.controller.synchronize();
  const proceed = deferred<void>();
  const settled = deferred<void>();
  const error = { code: "target_invalid" };
  f.transport.registerViews = vi
    .fn()
    .mockImplementationOnce(() => proceed.promise)
    .mockRejectedValue(error);
  const stop = f.controller.subscribe(() => {
    if (f.controller.getSnapshot().error === error) settled.resolve();
  });
  f.controller.setView(f.view);
  f.controller.setView({ ...f.view, candidate: { ...f.view.candidate, visible: true } });
  proceed.reject(error);
  await settled.promise;
  expect(f.transport.registerViews).toHaveBeenCalledTimes(2);
  expect(f.transport.registerViews).toHaveBeenLastCalledWith([
    { ...f.view.candidate, visible: true },
  ]);
  stop();
  f.controller.dispose();
});

it("preserves a synchronous registration failure", async () => {
  const f = setup();
  await f.ready();
  await f.controller.synchronize();
  const failed = deferred<void>();
  const error = new Error("send failed synchronously");
  f.transport.registerViews = vi.fn(() => {
    throw error;
  });
  const stop = f.controller.subscribe(() => {
    if (f.controller.getSnapshot().error) failed.resolve();
  });
  f.controller.setView(f.view);
  await failed.promise;
  expect(f.controller.getSnapshot().error).toBe(error);
  expect(f.transport.registerViews).toHaveBeenCalledTimes(1);
  stop();
  f.controller.dispose();
});

it("accepts a new binding after pre-binding human input while rejecting interrupted old work", async () => {
  const f = setup();
  f.transport.getConnectionState = async () => ({ version: 1, bindings: [] });
  await f.ready();
  await f.controller.humanInput(target);
  f.transport.getConnectionState = async () => ({
    version: 1,
    bindings: [{ status: "bound", binding }],
  });
  f.emit({ version: 1, operation: "show", bridgeRequestId: "first-bind", binding });
  expect((await f.reply.promise).result).toEqual({ operation: "show", status: "visible" });
  f.controller.dispose();
});

it("keeps a replacement paused binding blocked after release refresh until explicit user resume", async () => {
  const f = setup();
  await f.ready();
  await f.controller.humanInput(target);
  f.transport.getConnectionState = async () => ({ version: 1, bindings: [] });
  await f.controller.synchronize();
  const rebound = { ...binding, bindingId: "rebound" };
  f.transport.getConnectionState = async () => ({
    version: 1,
    bindings: [{ status: "paused", binding: rebound, reason: "human_intervened" }],
  });
  await f.controller.synchronize();
  f.emit({ version: 1, operation: "show", bridgeRequestId: "blocked-rebound", binding: rebound });
  expect((await f.reply.promise).result).toMatchObject({ error: { code: "human_intervened" } });
  f.transport.resume = vi.fn(async (): Promise<A.TerminalAutomationStatus> => ({
    version: 1,
    candidateVersion: 1,
    candidates: [],
    state: { status: "bound", binding: rebound },
  }));
  await f.controller.resume(rebound.bindingId, rebound.inputEpoch);
  expect(f.controller.getSnapshot().bindings).toEqual([{ status: "bound", binding: rebound }]);
  f.controller.dispose();
});

it("rejects old instances and human input interleaved with asynchronous surface work", async () => {
  const f = setup();
  const entered = deferred<void>();
  const release = deferred<void>();
  f.view.perform = async (_request, guard) => {
    entered.resolve();
    await release.promise;
    guard();
    return { operation: "show", status: "visible" };
  };
  await f.ready();
  f.emit({ version: 1, operation: "show", bridgeRequestId: "request", binding });
  await entered.promise;
  await f.controller.humanInput(target);
  release.resolve();
  expect((await f.reply.promise).result).toEqual({
    operation: "show",
    error: { code: "human_intervened" },
  });
  f.controller.dispose();
});

it("old query responses cannot replace newer state and never clear the local input barrier", async () => {
  const f = setup();
  await f.ready();
  await f.registered.promise;
  const old = deferred<A.TerminalAutomationConnectionState>();
  f.transport.getConnectionState = () => old.promise;
  const stale = f.controller.refreshState();
  f.transport.getConnectionState = async () => paused;
  await f.controller.refreshState();
  old.resolve({ version: 1, bindings: [] });
  await expect(stale).rejects.toMatchObject({ code: "stale_request" });
  expect(f.controller.getSnapshot().bindings).toEqual(paused.bindings);
  await f.controller.humanInput(target);
  await f.controller.refreshState();
  f.emit({ version: 1, operation: "show", bridgeRequestId: "after-query", binding });
  expect((await f.reply.promise).result).toMatchObject({ error: { code: "human_intervened" } });
  expect(f.transport.resume).not.toHaveBeenCalled();
  f.controller.dispose();
});

it("late resume success cannot clear a newer human pause", async () => {
  const f = setup();
  await f.ready();
  f.transport.getConnectionState = async () => paused;
  await f.controller.humanInput(target);
  const entered = deferred<void>();
  const resumed = deferred<A.TerminalAutomationStatus>();
  f.transport.resume = () => {
    entered.resolve();
    return resumed.promise;
  };
  const work = f.controller.resume("binding", binding.inputEpoch);
  await entered.promise;
  await f.controller.humanInput(target);
  resumed.resolve({
    version: 1,
    candidateVersion: 1,
    candidates: [],
    state: { status: "bound", binding },
  });
  await expect(work).rejects.toMatchObject({ code: "stale_request" });
  f.emit({ version: 1, operation: "show", bridgeRequestId: "after-resume", binding });
  expect((await f.reply.promise).result).toMatchObject({ error: { code: "human_intervened" } });
  f.controller.dispose();
});

it("resumes only the explicitly confirmed owner recovered from a connection snapshot", async () => {
  const f = setup();
  await f.ready();
  const first = { ...binding, inputEpoch: 1 };
  const other = { ...first, bindingId: "other-owner" };
  let state: A.TerminalAutomationConnectionState = {
    version: 1,
    bindings: [
      { status: "paused", binding: first, reason: "human_intervened" },
      { status: "paused", binding: other, reason: "human_intervened" },
    ],
  };
  f.transport.getConnectionState = async () => state;
  const reported = f.controller.humanInput(target);
  expect(f.controller.getSnapshot().localPausedTargets).toEqual([target]);
  await reported;
  expect(f.transport.resume).not.toHaveBeenCalled();
  f.transport.resume = vi.fn(async (id: string): Promise<A.TerminalAutomationStatus> => {
    expect(id).toBe("binding");
    state = { ...state, bindings: [{ status: "bound", binding: first }, state.bindings[1]!] };
    return {
      version: 1,
      candidateVersion: 1,
      candidates: [],
      state: { status: "bound", binding: first },
    };
  });
  await expect(f.controller.resume("binding", 0)).rejects.toMatchObject({ code: "stale_request" });
  expect(f.transport.resume).not.toHaveBeenCalled();
  await f.controller.resume("binding", first.inputEpoch);
  f.emit({ version: 1, operation: "show", bridgeRequestId: "chosen", binding: first });
  expect((await f.reply.promise).result).toEqual({ operation: "show", status: "visible" });
  const denied = deferred<A.TerminalAutomationClientReply>();
  f.transport.replyBridge = async (reply) => {
    denied.resolve(reply);
  };
  f.emit({ version: 1, operation: "show", bridgeRequestId: "other", binding: other });
  expect((await denied.promise).result).toMatchObject({ error: { code: "human_intervened" } });
  expect(f.transport.resume).toHaveBeenCalledTimes(1);
  f.controller.dispose();
});

it("does not authorize resume when a new human input follows snapshot publication", async () => {
  const f = setup();
  await f.ready();
  f.transport.getConnectionState = async () => paused;
  let injected = false;
  let reported: ReturnType<TerminalAutomationController["humanInput"]>;
  const unsubscribe = f.controller.subscribe(() => {
    if (!injected && f.controller.getSnapshot().bindings === paused.bindings) {
      injected = true;
      reported = f.controller.humanInput(target);
    }
  });
  const work = f.controller.resume("binding", binding.inputEpoch);
  await expect(work).rejects.toMatchObject({ code: "stale_request" });
  expect(f.transport.resume).not.toHaveBeenCalled();
  await reported;
  expect(f.controller.getSnapshot().localPausedTargets).toEqual([target]);
  unsubscribe();
  f.controller.dispose();
});

it("reports invalid instances and cleans stale selection invitations", async () => {
  const f = setup();
  await f.ready();
  f.emit({
    version: 1,
    operation: "show",
    bridgeRequestId: "wrong-instance",
    binding: { ...binding, target: { ...target, terminalInstanceId: "old" } },
  });
  expect((await f.reply.promise).result).toMatchObject({ error: { code: "target_invalid" } });
  f.emit({
    version: 1,
    selectionRequestId: "selection",
    candidateVersion: 1,
    candidates: [f.view.candidate],
  });
  f.transport.replySelection = async () => {
    throw { code: "stale_request" };
  };
  await expect(f.controller.submitSelection("selection", "local")).rejects.toMatchObject({
    code: "stale_request",
  });
  expect(f.controller.getSnapshot().selections).toEqual([]);
  f.controller.dispose();
});

it("keeps a selection retryable after a transport failure", async () => {
  const f = setup();
  await f.ready();
  f.emit({
    version: 1,
    selectionRequestId: "retry",
    candidateVersion: 7,
    candidates: [f.view.candidate],
  });
  f.transport.replySelection = async () => {
    throw new Error("connection lost");
  };
  await expect(f.controller.submitSelection("retry", null)).rejects.toThrow("connection lost");
  expect(
    f.controller.getSnapshot().selections.map((request) => request.selectionRequestId),
  ).toEqual(["retry"]);
  f.controller.dispose();
});

it.each([null, "local"])(
  "reconciles acknowledged selection %s when a notification supersedes its query",
  async (choice) => {
    const f = setup();
    await f.ready();
    await f.controller.synchronize();
    f.emit({
      version: 1,
      selectionRequestId: "acknowledged",
      candidateVersion: 7,
      candidates: [f.view.candidate],
    });
    const entered = deferred<void>();
    const old = deferred<A.TerminalAutomationConnectionState>();
    f.transport.replySelection = vi.fn(async () => {});
    f.transport.getConnectionState = () => {
      entered.resolve();
      return old.promise;
    };
    const submitted = f.controller.submitSelection("acknowledged", choice);
    const outcome = submitted.then(
      () => "success",
      (error: unknown) => error,
    );
    await entered.promise;
    const bindings: A.TerminalAutomationConnectionState["bindings"] =
      choice === null ? [] : [{ status: "bound", binding }];
    f.transport.getConnectionState = async () => ({
      version: 1,
      revision: 1,
      selections: [],
      bindings,
    });
    f.emit({ type: "state_changed", revision: 1 });
    old.resolve({ version: 1, revision: 0, bindings: [], selections: [] });
    expect(await outcome).toBe("success");
    expect(f.controller.getSnapshot()).toMatchObject({ bindings, selections: [], error: null });
    expect(f.transport.replySelection).toHaveBeenCalledTimes(1);
    f.controller.dispose();
  },
);

it("keeps a current selection query failure observable without replaying the reply", async () => {
  const f = setup();
  await f.ready();
  await f.controller.synchronize();
  f.emit({
    version: 1,
    selectionRequestId: "query-failure",
    candidateVersion: 7,
    candidates: [f.view.candidate],
  });
  const error = new Error("query failed");
  f.transport.replySelection = vi.fn(async () => {});
  f.transport.getConnectionState = vi.fn(async () => {
    throw error;
  });
  await expect(f.controller.submitSelection("query-failure", null)).rejects.toBe(error);
  expect(f.transport.replySelection).toHaveBeenCalledTimes(1);
  expect(f.transport.getConnectionState).toHaveBeenCalledTimes(1);
  expect(f.controller.getSnapshot().selections).toEqual([]);
  f.controller.dispose();
});

it.each(["reply", "query"] as const)(
  "rejects a selection interrupted by reconnect during %s",
  async (stage) => {
    const f = setup();
    await f.ready();
    await f.controller.synchronize();
    f.emit({
      version: 1,
      selectionRequestId: "reconnect",
      candidateVersion: 7,
      candidates: [f.view.candidate],
    });
    const entered = deferred<void>();
    const proceed = deferred<void>();
    f.transport.replySelection = vi.fn(async () => {
      if (stage === "reply") {
        entered.resolve();
        await proceed.promise;
      }
    });
    f.transport.getConnectionState = async () => {
      entered.resolve();
      await proceed.promise;
      return { version: 1, bindings: [], selections: [] };
    };
    const outcome = f.controller
      .submitSelection("reconnect", null)
      .catch((error: unknown) => error);
    await entered.promise;
    f.end();
    f.start();
    f.transport.getConnectionState = async () => ({ version: 1, bindings: [], selections: [] });
    f.emit({ type: "ready" });
    proceed.resolve();
    expect(await outcome).toMatchObject({ code: "stale_request" });
    expect(f.transport.replySelection).toHaveBeenCalledTimes(1);
    f.controller.dispose();
  },
);

it("rejects duplicate resume while the original confirmation is pending", async () => {
  const f = setup();
  await f.ready();
  f.transport.getConnectionState = async () => paused;
  await f.controller.humanInput(target);
  const entered = deferred<void>();
  const firstReply = deferred<A.TerminalAutomationStatus>();
  const result: A.TerminalAutomationStatus = {
    version: 1,
    candidateVersion: 1,
    candidates: [],
    state: { status: "bound", binding },
  };
  f.transport.resume = vi
    .fn()
    .mockImplementationOnce(() => {
      entered.resolve();
      return firstReply.promise;
    })
    .mockResolvedValue(result);
  const first = f.controller.resume("binding", 0).catch((error: unknown) => error);
  await entered.promise;
  const second = await f.controller.resume("binding", 0).then(
    () => "accepted",
    (error: unknown) => error,
  );
  firstReply.resolve(result);
  await first;
  expect(second).toMatchObject({ code: "request_conflict" });
  expect(f.controller.getSnapshot().resumingBindingIds).toEqual([]);
  f.controller.dispose();
});

it("does not resume an old displayed epoch while newer manual input is still being reported", async () => {
  const f = setup();
  await f.ready();
  f.transport.getConnectionState = async () => paused;
  await f.controller.refreshState();
  const reported = deferred<void>();
  f.transport.reportEvent = () => reported.promise;
  const input = f.controller.humanInput(target);
  const resume = f.controller.resume("binding", 0).catch((error: unknown) => error);
  const result = await resume;
  reported.resolve();
  await input;
  expect(f.transport.resume).not.toHaveBeenCalled();
  expect(result).toMatchObject({ code: "human_intervened" });
  f.controller.dispose();
});

it("refreshes automatic bindings and release from revision notifications without bridge work", async () => {
  const f = setup();
  f.transport.getConnectionState = async () => ({
    version: 1,
    revision: 0,
    bindings: [],
    selections: [],
  });
  await f.ready();
  const bound = deferred<void>();
  const stop = f.controller.subscribe(() => {
    if (f.controller.getSnapshot().bindings.length === 1) bound.resolve();
  });
  f.transport.getConnectionState = async () => ({
    version: 1,
    revision: 1,
    bindings: [{ status: "bound", binding }],
    selections: [],
  });
  f.emit({ type: "state_changed", revision: 1 });
  await bound.promise;
  stop();
  const released = deferred<void>();
  const stopReleased = f.controller.subscribe(() => {
    if (f.controller.getSnapshot().bindings.length === 0) released.resolve();
  });
  f.transport.getConnectionState = async () => ({
    version: 1,
    revision: 2,
    bindings: [],
    selections: [],
  });
  f.emit({ type: "state_changed", revision: 2 });
  await released.promise;
  stopReleased();
  f.controller.dispose();
});

it.each(["lost reply", "parallel query", "failed query"])(
  "reconciles the explicit resume confirmation after %s",
  async (mode) => {
    const f = setup();
    await f.ready();
    let state = paused;
    f.transport.getConnectionState = async () => state;
    await f.controller.humanInput(target);
    f.transport.resume = async () => {
      state = { version: 1, bindings: [{ status: "bound", binding }] };
      if (mode === "lost reply") throw new Error("lost reply");
      return {
        version: 1,
        candidateVersion: 1,
        candidates: [],
        state: { status: "bound", binding },
      };
    };
    if (mode === "parallel query") {
      const query = deferred<A.TerminalAutomationConnectionState>();
      let count = 0;
      f.transport.getConnectionState = () => {
        count += 1;
        if (count === 2) {
          void f.controller.refreshState().then(() => query.resolve(state));
          return query.promise;
        }
        return Promise.resolve(state);
      };
    }
    await f.controller.resume("binding", 0).catch(() => {});
    if (mode === "failed query") {
      f.transport.getConnectionState = async () => {
        throw new Error("query failed");
      };
      await expect(f.controller.synchronize()).rejects.toThrow("query failed");
      expect(f.controller.getSnapshot().bindings).toEqual([{ status: "bound", binding }]);
      expect(f.controller.getSnapshot().localPausedTargets).toEqual([]);
      f.transport.getConnectionState = async () => state;
    }
    await f.controller.synchronize();
    expect(f.controller.getSnapshot().localPausedTargets).toEqual([]);
    f.emit({ version: 1, operation: "show", bridgeRequestId: "confirmed", binding });
    expect((await f.reply.promise).result).toEqual({ operation: "show", status: "visible" });
    f.controller.dispose();
  },
);

it("keeps pause state separate for bindings sharing one target", async () => {
  const f = setup();
  await f.ready();
  const other = { ...binding, bindingId: "other" };
  f.transport.getConnectionState = async () => ({
    version: 1,
    bindings: [
      { status: "paused", binding, reason: "human_intervened" },
      { status: "paused", binding: other, reason: "human_intervened" },
    ],
  });
  await f.controller.refreshState();
  await f.controller.humanInput(target);
  await f.controller.resume("binding", 0);
  expect(f.controller.isBindingLocallyPaused(binding)).toBe(false);
  expect(f.controller.isBindingLocallyPaused(other)).toBe(true);
  f.controller.dispose();
});

it("rejects a paused query started before the successful resume reply", async () => {
  const f = setup();
  await f.ready();
  f.transport.getConnectionState = async () => paused;
  await f.controller.humanInput(target);
  const entered = deferred<void>();
  const response = deferred<A.TerminalAutomationStatus>();
  f.transport.resume = () => {
    entered.resolve();
    return response.promise;
  };
  const resume = f.controller.resume("binding", 0);
  await entered.promise;
  const old = deferred<A.TerminalAutomationConnectionState>();
  f.transport.getConnectionState = () => old.promise;
  const query = f.controller.refreshState().catch((error: unknown) => error);
  response.resolve({
    version: 1,
    candidateVersion: 1,
    candidates: [],
    state: { status: "bound", binding },
  });
  await resume;
  old.resolve(paused);
  expect(await query).toMatchObject({ code: "stale_request" });
  expect(f.controller.getSnapshot().localPausedTargets).toEqual([]);
  f.controller.dispose();
});

it("consumes a newer notification after the pending query fails once", async () => {
  const f = setup();
  await f.ready();
  await f.controller.synchronize();
  const failed = deferred<void>();
  let calls = 0;
  f.transport.getConnectionState = async () => {
    calls += 1;
    if (calls === 1) {
      await failed.promise;
      throw new Error("offline");
    }
    return { version: 1, revision: 2, selections: [], bindings: [] };
  };
  f.emit({ type: "state_changed", revision: 1 });
  const pending = f.controller.synchronize().catch(() => {});
  f.emit({ type: "state_changed", revision: 2 });
  failed.resolve();
  await pending;
  expect(calls).toBe(2);
  await f.controller.synchronize();
  expect(f.controller.getSnapshot().bindings).toEqual([]);
  f.controller.dispose();
});

it("cannot use a lost confirmation to authorize bound state after newer manual input", async () => {
  const f = setup();
  await f.ready();
  f.transport.getConnectionState = async () => paused;
  await f.controller.humanInput(target);
  f.transport.resume = async () => {
    throw new Error("lost reply");
  };
  await expect(f.controller.resume("binding", 0)).rejects.toThrow("lost reply");
  expect(f.controller.getSnapshot().unverifiedResumeBindingIds).toEqual(["binding"]);
  await f.controller.humanInput(target);
  f.transport.getConnectionState = async () => ({
    version: 1,
    bindings: [{ status: "bound", binding }],
  });
  await f.controller.synchronize();
  expect(f.controller.getSnapshot().unverifiedResumeBindingIds).toEqual([]);
  expect(f.controller.getSnapshot().localPausedTargets).toEqual([target]);
  f.emit({ version: 1, operation: "show", bridgeRequestId: "new-input", binding });
  expect((await f.reply.promise).result).toMatchObject({ error: { code: "human_intervened" } });
  f.controller.dispose();
});

it("rejects a query older than a notification and ignores an already invalidated invitation arriving late", async () => {
  const f = setup();
  f.transport.getConnectionState = async () => ({
    version: 1,
    revision: 0,
    bindings: [],
    selections: [],
  });
  await f.ready();
  const old = deferred<A.TerminalAutomationConnectionState>();
  f.transport.getConnectionState = () => old.promise;
  const oldQuery = f.controller.refreshState().catch((error: unknown) => error);
  const published = deferred<void>();
  const stop = f.controller.subscribe(() => {
    if (f.controller.getSnapshot().bindings[0]?.binding.bindingId === "new") published.resolve();
  });
  f.transport.getConnectionState = async () => ({
    version: 1,
    revision: 2,
    bindings: [{ status: "bound", binding: { ...binding, bindingId: "new" } }],
    selections: [],
  });
  f.emit({ type: "state_changed", revision: 2 });
  await published.promise;
  old.resolve({
    version: 1,
    revision: 1,
    bindings: [{ status: "bound", binding }],
    selections: [],
  });
  expect(await oldQuery).toMatchObject({ code: "stale_request" });
  f.emit({
    version: 1,
    selectionRequestId: "expired",
    candidateVersion: 1,
    candidates: [f.view.candidate],
  });
  await f.controller.synchronize();
  expect(f.controller.getSnapshot().bindings[0]?.binding.bindingId).toBe("new");
  expect(f.controller.getSnapshot().selections).toEqual([]);
  stop();
  f.controller.dispose();
});
