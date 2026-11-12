import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import * as RpcSchema from "effect/rpc/RpcSchema";
import { WsRpcGroup, WS_METHODS } from "./rpc.ts";
import { clientRpcRequiredScopes } from "./clientRpcPermissions.ts";
import { TerminalAutomationRpcEvent } from "./terminalAutomationRpc.ts";
const decodeRpcEventJson = Schema.decodeSync(Schema.fromJsonString(TerminalAutomationRpcEvent));

const binding = {
  bindingId: "binding-a",
  target: { terminalId: "terminal-a", terminalInstanceId: "instance-a", viewId: "view-a" },
  alias: "original",
  inputEpoch: 2,
};

describe("terminal automation RPC wire", () => {
  it("connection queries reject identity fields and require only read permission", () => {
    const rpc = WsRpcGroup.requests.get(WS_METHODS.terminalAutomationGetConnectionState)!;
    const decode = Schema.decodeSync(Schema.fromJsonString(rpc.payloadSchema));
    expect(decode('{"threadId":"thread-a"}')).toEqual({ threadId: "thread-a" });
    for (const field of ["callerId", "clientId", "connectionId", "environmentId"]) {
      expect(() => decode(JSON.stringify({ threadId: "thread-a", [field]: "forged" }))).toThrow();
    }
    expect(clientRpcRequiredScopes(WS_METHODS.terminalAutomationGetConnectionState, {})).toEqual([
      "terminal:read",
    ]);
    const result = Schema.decodeSync(Schema.fromJsonString(rpc.successSchema));
    expect(
      result(
        JSON.stringify({
          version: 1,
          bindings: [{ status: "paused", binding, reason: "human_intervened" }],
        }),
      ),
    ).toMatchObject({ bindings: [{ binding }] });
    expect(() => result('{"version":1,"bindings":[{"status":"unbound"}]}')).toThrow();
    expect(() =>
      result(
        JSON.stringify({
          version: 1,
          bindings: Array.from({ length: 129 }, () => ({ status: "bound", binding })),
        }),
      ),
    ).toThrow();
  });
  it("resume confirms exactly one nonnegative epoch and rejects identity extras", () => {
    const rpc = WsRpcGroup.requests.get(WS_METHODS.terminalAutomationResume)!;
    const decode = Schema.decodeSync(Schema.fromJsonString(rpc.payloadSchema));
    expect(
      decode(JSON.stringify({ threadId: "thread", bindingId: "binding", inputEpoch: 2 })),
    ).toMatchObject({ inputEpoch: 2 });
    for (const input of [
      { threadId: "thread", bindingId: "binding" },
      { threadId: "thread", bindingId: "binding", inputEpoch: -1 },
      { threadId: "thread", bindingId: "binding", inputEpoch: 1, connectionId: "forged" },
    ])
      expect(() => decode(JSON.stringify(input))).toThrow();
  });
  it("preserves strict bridge replies and rejects forged identities", () => {
    const rpc = WsRpcGroup.requests.get(WS_METHODS.terminalAutomationReplyBridge)!;
    const wire = Schema.fromJsonString(rpc.payloadSchema);
    const input = {
      threadId: "thread-a",
      reply: {
        version: 1,
        bridgeRequestId: "bridge-a",
        binding,
        result: { operation: "apply_local", inputRequestId: "input-a", status: "local_applied" },
      },
    };
    const decoded = Schema.decodeSync(wire)(JSON.stringify(input));
    expect(Schema.decodeSync(wire)(Schema.encodeSync(wire)(decoded))).toEqual(input);
    expect(() =>
      Schema.decodeSync(wire)(JSON.stringify({ ...input, callerId: "forged" })),
    ).toThrow();
    expect(() =>
      Schema.decodeSync(wire)(JSON.stringify({ ...input, environmentId: "other" })),
    ).toThrow();
    expect(() =>
      Schema.decodeSync(wire)(JSON.stringify({ ...input, connectionId: "other" })),
    ).toThrow();
    expect(() =>
      Schema.decodeSync(wire)(
        JSON.stringify({
          ...input,
          reply: { ...input.reply, result: { ...input.reply.result, encodedText: "forged" } },
        }),
      ),
    ).toThrow();
  });
  it("preserves selection and apply events through the registered stream schema", () => {
    const rpc = WsRpcGroup.requests.get(WS_METHODS.terminalAutomationSubscribe)!;
    if (!RpcSchema.isStreamSchema(rpc.successSchema)) throw new Error("expected stream schema");
    const wire = Schema.fromJsonString(rpc.successSchema.success);
    const selection = {
      version: 1,
      selectionRequestId: "selection-a",
      candidateVersion: 3,
      candidates: [],
    };
    expect(
      Schema.decodeSync(wire)(
        Schema.encodeSync(wire)(Schema.decodeSync(wire)(JSON.stringify(selection))),
      ),
    ).toEqual(selection);
    const request = {
      version: 1,
      bridgeRequestId: "bridge-a",
      binding,
      operation: "apply_local",
      inputRequestId: "input-a",
      frameRevision: 7,
      localAction: { type: "scroll", deltaRows: -3 },
    };
    expect(
      Schema.decodeSync(wire)(
        Schema.encodeSync(wire)(Schema.decodeSync(wire)(JSON.stringify(request))),
      ),
    ).toEqual(request);
    expect(() =>
      Schema.decodeSync(wire)(JSON.stringify({ ...request, clientId: "forged" })),
    ).toThrow();
    expect(decodeRpcEventJson('{"type":"ready"}')).toEqual({ type: "ready" });
  });
  it("requires read for read replies and read plus operate for the full bridge subscription", () => {
    expect(clientRpcRequiredScopes(WS_METHODS.terminalAutomationSubscribe, {})).toEqual([
      "terminal:read",
      "terminal:operate",
    ]);
    expect(clientRpcRequiredScopes(WS_METHODS.terminalAutomationResume, {})).toEqual([
      "terminal:operate",
    ]);
    const input = {
      threadId: "thread-a",
      reply: {
        version: 1,
        bridgeRequestId: "bridge-a",
        binding,
        result: { operation: "read", error: { code: "stale_request" } },
      },
    };
    expect(clientRpcRequiredScopes(WS_METHODS.terminalAutomationReplyBridge, input)).toEqual([
      "terminal:read",
    ]);
  });
});
