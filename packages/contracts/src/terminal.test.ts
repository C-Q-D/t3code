import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_TERMINAL_ID,
  TerminalError,
  TerminalOpenInput,
  TerminalProviderEnvironmentError,
  TerminalSessionSnapshot,
  TerminalSummary,
  TerminalWriteInput,
} from "./terminal.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

const encodeTerminalError = Schema.encodeUnknownSync(TerminalError);
const decodeTerminalError = Schema.decodeUnknownSync(TerminalError);
const decodeTerminalWrite = Schema.decodeUnknownSync(TerminalWriteInput);

it("requires exact same-instance protocol reply metadata while retaining ordinary human writes", () => {
  const write = { threadId: "thread", terminalId: "terminal", data: "\x1b[0n" };
  expect(decodeTerminalWrite(write)).toEqual(write);
  expect(
    decodeTerminalWrite({
      ...write,
      protocolReply: { terminalInstanceId: "instance" },
    }),
  ).toMatchObject({ protocolReply: { terminalInstanceId: "instance" } });
  for (const protocolReply of [
    {},
    { terminalInstanceId: "" },
    { terminalInstanceId: "instance", callerId: "forged" },
  ])
    expect(() => decodeTerminalWrite({ ...write, protocolReply })).toThrow();
});

function decodeSync<S extends Schema.Top>(schema: S, input: unknown): Schema.Schema.Type<S> {
  return Schema.decodeUnknownSync(schema as never)(input) as Schema.Schema.Type<S>;
}

describe("TerminalProviderEnvironmentError", () => {
  it("round-trips its required cause without exposing it in the message", () => {
    const cause = { operation: "read-secret", detail: "secret backend unavailable" };
    const error = new TerminalProviderEnvironmentError({
      providerInstanceId: ProviderInstanceId.make("codex_work"),
      cause,
    });
    const encoded = encodeTerminalError(error);
    const decoded = decodeTerminalError(encoded);

    expect(decoded).toMatchObject({
      _tag: "TerminalProviderEnvironmentError",
      providerInstanceId: "codex_work",
      cause,
    });
    expect(decoded.message).toBe(
      "Could not prepare the terminal environment for provider instance: codex_work",
    );
    expect(decoded.message).not.toContain("secret backend unavailable");
  });
});

describe("TerminalOpenInput", () => {
  it("drops invalid env keys while retaining valid overrides", () => {
    const parsed = decodeSync(TerminalOpenInput, {
      threadId: "thread-1",
      terminalId: DEFAULT_TERMINAL_ID,
      cwd: "/tmp/project",
      env: { "bad-key": "1", GOOD_KEY: "2" },
    });
    expect(parsed.env).toEqual({ GOOD_KEY: "2" });
  });
});

it.each([TerminalSessionSnapshot, TerminalSummary])(
  "accepts older terminal records and preserves instance identity when supplied",
  (schema) => {
    const record = {
      threadId: "thread",
      terminalId: "terminal",
      cwd: "/workspace",
      worktreePath: null,
      status: "running",
      pid: 12,
      history: "",
      exitCode: null,
      exitSignal: null,
      hasRunningSubprocess: false,
      label: "terminal",
      updatedAt: "2026-11-11T00:00:00Z",
    };
    expect(decodeSync(schema, record)).not.toHaveProperty("terminalInstanceId");
    expect(decodeSync(schema, { ...record, terminalInstanceId: "instance" })).toMatchObject({
      terminalInstanceId: "instance",
    });
  },
);
