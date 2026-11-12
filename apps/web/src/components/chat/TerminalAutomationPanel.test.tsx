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
import { TerminalAutomationController } from "../../terminal/automationController";
import { TerminalAutomationPanel } from "./TerminalAutomationPanel";

const store = vi.hoisted(() => ({
  controller: undefined as TerminalAutomationController | undefined,
}));
vi.mock("../../state/terminal", () => ({
  getTerminalAutomation: () => store.controller,
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
  const controller = new TerminalAutomationController({
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
    resume: async (): Promise<TerminalAutomationStatus> => ({
      version: 1,
      candidateVersion: 1,
      candidates: [],
      state: { status: "bound", binding },
    }),
  });
  store.controller = controller;
  controller.start();
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
    replies,
    binding,
    target,
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
