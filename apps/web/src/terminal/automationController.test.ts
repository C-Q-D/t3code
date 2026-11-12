import { expect, it, vi } from "vite-plus/test";
import type * as A from "@t3tools/contracts";
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
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setup() {
  let emit: (event: typeof A.TerminalAutomationRpcEvent.Type) => void = () => {};
  let start = () => {};
  let end = () => {};
  const reply = deferred<A.TerminalAutomationClientReply>();
  const registered = deferred<void>();
  const synchronized = deferred<void>();
  const transport: TerminalAutomationTransport = {
    subscribe: (s, e, receive) => {
      start = s;
      end = e;
      emit = receive;
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
    getConnectionState: async () => ({ version: 1, bindings: [] }),
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
    start: () => start(),
    reply,
    registered,
  };
}

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
  const work = f.controller.resume("binding");
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
