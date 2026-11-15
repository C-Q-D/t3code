/** Exercises wire boundaries that protect canonical text and separate failed attempts from successful display bodies. */
import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { clientRpcRequiredScopes } from "./clientRpcPermissions.ts";
import {
  ReplyRewriteCancelInput,
  ReplyRewriteGetDetailInput,
  ReplyRewriteRecord,
  ReplyRewriteRequestInput,
  REPLY_REWRITE_WS_METHODS,
} from "./replyRewrite.ts";

const targetInput = { threadId: "thread-1", runId: "run-2", messageId: "message-3" };
const configSnapshot = {
  binaryPath: "pi",
  provider: "openai-codex",
  modelId: "gpt-6.1-terra",
  thinkingLevel: "max",
  requestedServiceTier: "priority",
  customPrompt: "  Keep quoted text.\n",
};
const target = { ...targetInput, sourceHash: "a".repeat(64) };
const identity = { target, configHash: "b".repeat(64), configSnapshot };
const completedAt = "2026-11-15T01:00:00.000Z";
const decodeRequest = Schema.decodeSync(ReplyRewriteRequestInput);
const decodeCancel = Schema.decodeSync(ReplyRewriteCancelInput);
const decodeDetailInput = Schema.decodeSync(ReplyRewriteGetDetailInput);
const decodeRecord = Schema.decodeUnknownSync(ReplyRewriteRecord);
const encodeRecord = Schema.encodeSync(ReplyRewriteRecord);

describe("reply rewrite boundaries", () => {
  it.each(["sourceText", "sourceHash", "text", "configSnapshot"])(
    "discards client-supplied %s instead of trusting it as source material",
    (field) => {
      const input = { ...targetInput, requestId: "request-1", [field]: "replacement" };
      expect(decodeRequest(input)).toEqual({
        ...targetInput,
        requestId: "request-1",
      });
      expect(decodeCancel(input)).toEqual({
        ...targetInput,
        requestId: "request-1",
      });
      expect(
        decodeDetailInput({
          ...targetInput,
          [field]: "replacement",
        }),
      ).toEqual(targetInput);
    },
  );

  it.each(["failed", "interrupted", "cancelled"])(
    "retains a previous success when the current request is %s",
    (status) => {
      const lastSuccess = {
        ...identity,
        requestId: "successful-request",
        generation: 1,
        text: "  Selected rewrite.\n",
        model: "gpt-6.1-terra",
        requestedServiceTier: "priority",
        actualServiceTier: "default",
        usage: { inputTokens: 50, outputTokens: 10 },
        completedAt,
      };
      const currentAttempt = {
        ...identity,
        requestId: "replacement-request",
        generation: 2,
        status,
        requestedAt: completedAt,
        startedAt: completedAt,
        finishedAt: completedAt,
        error: status === "cancelled" ? null : { code: "interrupted", message: "Result unknown" },
      };
      const wire = { target, currentAttempt, lastSuccess };
      const decoded = decodeRecord(wire);
      expect(encodeRecord(decoded)).toEqual(wire);
      expect(decoded.lastSuccess?.text).toBe("  Selected rewrite.\n");
      expect(decoded.lastSuccess?.actualServiceTier).toBe("default");
    },
  );

  it.each([
    [REPLY_REWRITE_WS_METHODS.getDetail, "orchestration:read"],
    [REPLY_REWRITE_WS_METHODS.request, "orchestration:operate"],
    [REPLY_REWRITE_WS_METHODS.cancel, "orchestration:operate"],
  ])("requires destination authority for %s", (method, scope) => {
    expect(clientRpcRequiredScopes(method, targetInput)).toEqual([scope]);
  });
});
