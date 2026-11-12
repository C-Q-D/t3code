// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  EnvironmentId,
  ThreadId,
  type TerminalAutomationSelectionReply,
  type TerminalAutomationRpcEvent,
  type TerminalAutomationConnectionState,
  type TerminalAutomationStatus,
} from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import {
  TerminalAutomationController,
  type TerminalAutomationTransport,
} from "../../terminal/automationController";
import { TerminalAutomationPanel } from "./TerminalAutomationPanel";

const store = vi.hoisted(() => ({
  controller: undefined as TerminalAutomationController | undefined,
}));
vi.mock("../../state/terminal", () => ({
  getTerminalAutomation: (ref: { environmentId: string; threadId: string }) =>
    ref.environmentId === "environment" && ref.threadId === "thread" ? store.controller : undefined,
  subscribeTerminalAutomation: (listener: () => void) => store.controller!.subscribe(listener),
  terminalAutomationRevision: () => store.controller!.getSnapshot(),
}));

async function setup() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const target = { terminalId: "terminal-2", terminalInstanceId: "instance-2", viewId: "right-2" };
  const binding = { bindingId: "binding", target, alias: "Original shell", inputEpoch: 3 };
  let state: TerminalAutomationConnectionState = { version: 1, bindings: [] };
  let emit!: (event: typeof TerminalAutomationRpcEvent.Type) => void;
  const replies: TerminalAutomationSelectionReply[] = [];
  const resumes: Array<{ bindingId: string; epoch: number }> = [];
  const transport: TerminalAutomationTransport = {
    subscribe: (_start, _end, receive) => {
      emit = receive;
      return () => {};
    },
    registerViews: async () => {},
    replyBridge: async () => {},
    replySelection: async (reply) => {
      replies.push(reply);
    },
    reportEvent: async () => {},
    getConnectionState: async () => state,
    resume: async (bindingId, epoch): Promise<TerminalAutomationStatus> => {
      resumes.push({ bindingId, epoch });
      state = { version: 1, bindings: [{ status: "bound", binding }] };
      return {
        version: 1,
        candidateVersion: 1,
        candidates: [],
        state: { status: "bound", binding },
      };
    },
  };
  const controller = new TerminalAutomationController(transport);
  store.controller = controller;
  controller.start();
  controller.setView({
    candidate: {
      candidateId: "second",
      target,
      title: "Original shell",
      clientKind: "web",
      visible: true,
      readiness: "ready",
      capabilities: { read: true, input: true, show: true },
    },
    canOperate: () => true,
    invalidate: () => {},
    perform: async () => ({ operation: "show", status: "visible" }),
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const ref = {
    environmentId: EnvironmentId.make("environment"),
    threadId: ThreadId.make("thread"),
  };
  await act(async () => {
    root.render(<TerminalAutomationPanel threadRef={ref} />);
    emit({ type: "ready" });
  });
  return {
    controller,
    transport,
    replies,
    resumes,
    binding,
    target,
    showThread: async (environmentId: string, threadId: string) =>
      act(async () =>
        root.render(
          <TerminalAutomationPanel
            key={`${environmentId}:${threadId}`}
            threadRef={{
              environmentId: EnvironmentId.make(environmentId),
              threadId: ThreadId.make(threadId),
            }}
          />,
        ),
      ),
    setState: async (next: TerminalAutomationConnectionState) => {
      state = next;
      await act(async () => {
        await controller.refreshState();
      });
    },
    invite: async () =>
      act(async () =>
        emit({
          version: 1,
          selectionRequestId: "choose",
          candidateVersion: 4,
          candidates: [
            {
              candidateId: "first",
              target: { ...target, terminalId: "terminal-1" },
              title: "Build shell",
              clientKind: "web",
              visible: true,
              readiness: "ready",
              capabilities: { read: true, input: true, show: true },
            },
            {
              candidateId: "second",
              target,
              title: "SSH production shell",
              clientKind: "windows_desktop",
              visible: false,
              readiness: "ready",
              capabilities: { read: true, input: true, show: true },
            },
          ],
        }),
      ),
    async [Symbol.asyncDispose]() {
      await act(async () => root.unmount());
      container.remove();
      controller.dispose();
      store.controller = undefined;
      vi.unstubAllGlobals();
    },
  };
}

async function click(text: string) {
  const button = [...document.querySelectorAll("button")].find((node) => node.textContent === text);
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

it("sends only the terminal explicitly chosen and confirmed, and removes the invitation", async () => {
  await using f = await setup();
  await f.invite();
  expect(f.controller.getSnapshot().ready).toBe(true);
  expect(f.controller.getSnapshot().selections).toHaveLength(1);
  await vi.waitFor(() => expect(document.body.textContent).toContain("SSH production shell"));
  expect(document.body.textContent).toContain("instance-2");
  expect(f.replies).toEqual([]);
  expect(document.querySelector<HTMLButtonElement>("button:disabled")?.textContent).toBe(
    "Use selected terminal",
  );
  await act(async () => document.querySelectorAll<HTMLElement>('[role="radio"]')[1]!.click());
  expect(f.replies).toEqual([]);
  await click("Use selected terminal");
  expect(f.replies).toEqual([
    {
      version: 1,
      selectionRequestId: "choose",
      candidateVersion: 4,
      choice: { status: "selected", candidateId: "second" },
    },
  ]);
  expect(f.controller.getSnapshot().selections).toEqual([]);
});

it("cancels without selecting", async () => {
  await using f = await setup();
  await f.invite();
  await vi.waitFor(() => expect(document.body.textContent).toContain("SSH production shell"));
  await click("Cancel");
  expect(f.replies[0]?.choice).toEqual({ status: "cancelled" });
  expect(document.body.textContent).toContain("Terminal selection cancelled.");
});

it("resumes the displayed pause epoch and shows authoritative bound state without offering invalid targets", async () => {
  await using f = await setup();
  await f.setState({
    version: 1,
    bindings: [{ status: "paused", binding: f.binding, reason: "human_intervened" }],
  });
  expect(document.body.textContent).toContain("AI paused after manual input");
  await click("Resume AI operation");
  expect(f.resumes).toEqual([{ bindingId: "binding", epoch: 3 }]);
  expect(document.body.textContent).toContain("AI terminal bound");
  expect(document.body.textContent).not.toContain("Resume AI operation");
  await f.setState({
    version: 1,
    bindings: [{ status: "invalid", binding: f.binding, reason: "target_invalid" }],
  });
  expect(document.body.textContent).toContain("AI terminal target is no longer valid");
  expect(document.body.textContent).not.toContain("Resume AI operation");
});

it("removes an expired selection and reports expiry instead of selection success", async () => {
  await using f = await setup();
  await f.invite();
  f.transport.replySelection = async () => {
    throw { code: "stale_request" };
  };
  await click("Cancel");
  expect(f.controller.getSnapshot().selections).toEqual([]);
  expect(document.body.textContent).toContain("This request has expired");
  expect(document.body.textContent).not.toContain("Terminal choice sent.");
});

it("does not confirm a newer input epoch discovered after the displayed pause", async () => {
  await using f = await setup();
  await f.setState({
    version: 1,
    bindings: [{ status: "paused", binding: f.binding, reason: "human_intervened" }],
  });
  f.transport.getConnectionState = async () => ({
    version: 1,
    bindings: [
      { status: "paused", binding: { ...f.binding, inputEpoch: 4 }, reason: "human_intervened" },
    ],
  });
  await click("Resume AI operation");
  expect(f.resumes).toEqual([]);
  expect(document.body.textContent).toContain("Manual input changed or the confirmation expired");
  expect(document.body.textContent).toContain("Resume AI operation");
  expect(document.body.textContent).not.toContain("AI terminal bound");
});

it("hides other environment and thread requests, and never reopens a completed invitation on return", async () => {
  await using f = await setup();
  await f.invite();
  await f.showThread("other-environment", "thread");
  expect(document.body.textContent).not.toContain("SSH production shell");
  await f.showThread("environment", "other-thread");
  expect(document.body.textContent).not.toContain("SSH production shell");
  expect(f.replies).toEqual([]);
  await f.showThread("environment", "thread");
  await click("Cancel");
  await f.showThread("other-environment", "thread");
  await f.showThread("environment", "thread");
  expect(document.body.textContent).not.toContain("SSH production shell");
  expect(f.replies).toHaveLength(1);
});

it("checks a cached invitation before displaying it on foreground return", async () => {
  await using f = await setup();
  await f.invite();
  await f.showThread("other-environment", "thread");
  let resolve!: (state: TerminalAutomationConnectionState) => void;
  const query = new Promise<TerminalAutomationConnectionState>((done) => {
    resolve = done;
  });
  f.transport.getConnectionState = () => query;
  await f.showThread("environment", "thread");
  expect(document.body.textContent).not.toContain("SSH production shell");
  await act(async () => {
    resolve({ version: 1, revision: 1, bindings: [], selections: [] });
    await f.controller.synchronize();
  });
  expect(document.body.textContent).not.toContain("SSH production shell");
  expect(f.controller.getSnapshot().selections).toEqual([]);
});

it("verifies a lost resume response without sending a second resume", async () => {
  await using f = await setup();
  let remote: TerminalAutomationConnectionState = {
    version: 1,
    bindings: [{ status: "paused", binding: f.binding, reason: "human_intervened" }],
  };
  await f.setState(remote);
  let attempts = 0;
  f.transport.getConnectionState = async () => remote;
  f.transport.resume = async () => {
    attempts += 1;
    remote = { version: 1, bindings: [{ status: "bound", binding: f.binding }] };
    throw new Error("reply lost");
  };
  await click("Resume AI operation");
  expect(document.body.textContent).toContain("Verify status");
  await click("Verify status");
  expect(document.body.textContent).toContain("AI terminal bound");
  expect(document.body.textContent).not.toContain("AI paused after manual input");
  expect(attempts).toBe(1);
});
