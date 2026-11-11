import { it } from "@effect/vitest";
import * as A from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
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
  const manager = {
    inspectExisting: (input: A.TerminalObserveInput) =>
      Effect.suspend(() => {
        const terminalInstanceId = instances.get(input.terminalId);
        return terminalInstanceId
          ? Effect.succeed({ terminalInstanceId, humanInputEpoch })
          : Effect.fail(new A.TerminalNotRunningError(input));
      }),
    writeAutomation: (
      input: A.TerminalWriteInput & { terminalInstanceId: string; humanInputEpoch: number },
    ) =>
      Effect.suspend(() => {
        if (
          instances.get(input.terminalId) !== input.terminalInstanceId ||
          humanInputEpoch !== input.humanInputEpoch
        )
          return Effect.fail(new A.TerminalNotRunningError(input));
        writes.push(input.data);
        return Effect.void;
      }),
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
  };
});

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
