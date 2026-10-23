/** Exercises quota gates and reply races through a fake RPC command, without a server. */
import { RegistryProvider } from "@effect/atom-react";
import {
  EnvironmentId,
  RunId,
  RuntimeRequestId,
  ThreadId,
  type ComposerSuggestResult,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { AsyncResult } from "effect/reactivity";
import { StrictMode } from "react";
import { expect, it, vi } from "vite-plus/test";
import { act, render } from "../../../test/render";
import { useComposerSuggestion } from "./useComposerSuggestion";

const rpc = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock(import("../../state/composerAssist"), async (original) => {
  const actual = await original();
  return {
    composerAssistEnvironment: {
      ...actual.composerAssistEnvironment,
      suggestNext: { ...actual.composerAssistEnvironment.suggestNext, run: rpc.run },
    },
  };
});

type Input = Parameters<typeof useComposerSuggestion>[0];
const runId = RunId.make("run-2");
const target = {
  environmentId: EnvironmentId.make("suggestion-test"),
  threadId: ThreadId.make("thread-a"),
};
const suggested: ComposerSuggestResult = {
  _tag: "Suggested",
  requestId: "request-a",
  runId,
  text: "跑一下测试",
};

/** Resets only the fake boundary; registry ownership isolates request deduplication per test. */
function setup(): Input {
  rpc.run.mockReset().mockResolvedValue(AsyncResult.success(suggested));
  return {
    target,
    shell: {
      latestRunId: runId,
      status: "idle",
      activeRunId: null,
      interactionMode: "default",
      pendingRuntimeRequest: null,
      lastErrorClass: null,
      usageLimitResetAt: null,
    },
    enabled: true,
    connected: true,
    composerEmpty: true,
    driver: "claudeAgent",
    completedRuns: 2,
    lastTurnCompletedAt: "2026-10-23T10:00:00.000Z",
    promptCacheExpiresAt: null,
  };
}

/** Renders the hook's visible result; the fake supplies transport results, not gate decisions. */
function Probe({ input }: { input: Input }) {
  const { suggestion } = useComposerSuggestion(input);
  return <output aria-label="prediction">{suggestion ?? "none"}</output>;
}

/** Preserves the client registry across rerenders, including StrictMode effect replay. */
function view(input: Input) {
  return (
    <RegistryProvider>
      <StrictMode>
        <Probe input={input} />
      </StrictMode>
    </RegistryProvider>
  );
}

it.each(["claudeAgent", "codex"])(
  "requests once when %s finishes and never retries the run",
  async (driver) => {
    const input = { ...setup(), driver };
    using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
    await using screen = await render(
      view({ ...input, shell: { ...input.shell!, status: "running", activeRunId: runId } }),
    );
    expect(rpc.run).not.toHaveBeenCalled();
    await screen.rerender(view(input));
    await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("跑一下测试");
    expect(rpc.run).toHaveBeenCalledTimes(1);
    expect(rpc.run.mock.calls[0]?.[1]).toEqual({
      environmentId: target.environmentId,
      input: { threadId: target.threadId, runId },
    });
    await screen.rerender(view({ ...input, composerEmpty: false }));
    await screen.rerender(view(input));
    await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("none");
    expect(rpc.run).toHaveBeenCalledTimes(1);
  },
);

it.each([
  ["setting off", { enabled: false }],
  ["unsupported provider", { driver: "cursor" }],
  ["draft text, attachment or reference", { composerEmpty: false }],
  ["disconnected", { connected: false }],
  ["early conversation", { completedRuns: 1 }],
  ["expired Claude cache", { promptCacheExpiresAt: "2026-10-23T09:00:00Z" }],
  ["expired Codex cache", { driver: "codex", lastTurnCompletedAt: "2026-10-23T09:00:00Z" }],
] satisfies Array<[string, Partial<Input>]>)(
  "does not spend quota with %s",
  async (_name, override) => {
    const input = setup();
    using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
    await using screen = await render(view({ ...input, ...override }));
    expect(rpc.run).not.toHaveBeenCalled();
    await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("none");
    await screen.rerender(view(input));
    await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("跑一下测试");
  },
);

it.each([
  ["plan", { interactionMode: "plan" }],
  [
    "pending approval",
    {
      pendingRuntimeRequest: {
        id: RuntimeRequestId.make("approval"),
        kind: "command",
        createdAt: DateTime.makeUnsafe("2026-10-23T10:00:00Z"),
      },
    },
  ],
  [
    "pending question",
    {
      pendingRuntimeRequest: {
        id: RuntimeRequestId.make("question"),
        kind: "user_input",
        createdAt: DateTime.makeUnsafe("2026-10-23T10:00:00Z"),
      },
    },
  ],
  ["running status", { status: "running" }],
  ["active run", { activeRunId: runId }],
  ["last error", { lastErrorClass: "provider_error" }],
  ["quota error", { lastErrorClass: "usage_limit" }],
  ["quota reset in future", { usageLimitResetAt: "2026-10-23T11:00:00Z" }],
] satisfies Array<[string, Partial<NonNullable<Input["shell"]>>]>)(
  "does not spend quota with shell %s",
  async (_name, override) => {
    const input = setup();
    using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
    await using screen = await render(view({ ...input, shell: { ...input.shell!, ...override } }));
    expect(rpc.run).not.toHaveBeenCalled();
    await screen.rerender(view(input));
    await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("跑一下测试");
  },
);

it.each([
  { _tag: "Suppressed", requestId: "s", reason: "pending_request" },
  { _tag: "Filtered", requestId: "f", reason: "empty" },
  { _tag: "Failed", requestId: "e", reason: "provider_error" },
] satisfies ComposerSuggestResult[])(
  "silently retires a $_tag response without retry",
  async (result) => {
    const input = setup();
    using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
    rpc.run.mockResolvedValue(AsyncResult.success(result));
    await using screen = await render(view(input));
    await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("none");
    await screen.rerender(view({ ...input, composerEmpty: false }));
    await screen.rerender(view(input));
    expect(rpc.run).toHaveBeenCalledTimes(1);
  },
);

it("does not retry or report a transport rejection", async () => {
  const input = setup();
  using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
  using warn = vi.spyOn(console, "warn");
  using error = vi.spyOn(console, "error");
  rpc.run.mockRejectedValue(new Error("transport closed"));
  await using screen = await render(view(input));
  await screen.rerender(view({ ...input, composerEmpty: false }));
  await screen.rerender(view(input));
  await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("none");
  expect(rpc.run).toHaveBeenCalledTimes(1);
  expect(warn).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
});

it("rejects a Suggested response belonging to another run", async () => {
  const input = setup();
  using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
  rpc.run.mockResolvedValue(AsyncResult.success({ ...suggested, runId: RunId.make("wrong-run") }));
  await using screen = await render(view(input));
  await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("none");
  expect(rpc.run).toHaveBeenCalledTimes(1);
});

it("retires the previous suggestion and requests the next completed run once", async () => {
  const input = setup();
  using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
  await using screen = await render(view(input));
  await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("跑一下测试");
  const next = { ...input, shell: { ...input.shell!, latestRunId: RunId.make("run-3") } };
  rpc.run.mockResolvedValue(
    AsyncResult.success({ ...suggested, runId: RunId.make("run-3"), text: "继续实现" }),
  );
  await screen.rerender(
    view({
      ...next,
      shell: { ...next.shell, status: "running", activeRunId: RunId.make("run-3") },
    }),
  );
  await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("none");
  await screen.rerender(view(next));
  await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("继续实现");
  expect(rpc.run).toHaveBeenCalledTimes(2);
});

it.each(["thread", "run", "draft"])(
  "discards a late reply after the %s changes",
  async (change) => {
    const input = setup();
    using _clock = vi.spyOn(Date, "now").mockReturnValue(1792749900000);
    let resolve!: (value: ReturnType<typeof AsyncResult.success<ComposerSuggestResult>>) => void;
    const reply = new Promise<ReturnType<typeof AsyncResult.success<ComposerSuggestResult>>>(
      (done) => {
        resolve = done;
      },
    );
    rpc.run.mockReturnValue(reply);
    await using screen = await render(view(input));
    const next =
      change === "thread"
        ? { ...input, target: { ...target, threadId: ThreadId.make("thread-b") }, enabled: false }
        : change === "run"
          ? {
              ...input,
              shell: {
                ...input.shell!,
                latestRunId: RunId.make("run-3"),
                status: "running" as const,
              },
            }
          : { ...input, composerEmpty: false };
    await screen.rerender(view(next));
    await screen.rerender(view(input));
    await act(async () => {
      resolve(AsyncResult.success(suggested));
      await reply;
    });
    await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("none");
    await screen.rerender(view(input));
    await expect.element(screen.getByLabelText("prediction")).toHaveTextContent("none");
  },
);
