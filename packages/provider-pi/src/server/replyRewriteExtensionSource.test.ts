import { assert, it } from "@effect/vitest";
import * as NodeVM from "node:vm";

import { PI_REPLY_REWRITE_EXTENSION_SOURCE } from "./replyRewriteExtensionSource.ts";

it("uses RPC notifications after stdout takeover and emits only whitelisted metadata", () => {
  const context = {
    ui: {
      notify: (message: string, notifyType: string) =>
        lines.push(
          JSON.stringify({
            type: "extension_ui_request",
            method: "notify",
            message,
            notifyType,
          }),
        ),
    },
  };
  const handlers = new Map<string, (event: unknown, ctx: typeof context) => unknown>();
  const lines: string[] = [];
  const stderr: string[] = [];
  NodeVM.runInNewContext(
    `${PI_REPLY_REWRITE_EXTENSION_SOURCE.replace("export default ", "")}\nreplyRewriteExtension(pi);`,
    {
      pi: {
        on: (name: string, handler: (event: unknown, ctx: typeof context) => unknown) =>
          handlers.set(name, handler),
      },
      process: {
        env: { T3_PI_REPLY_REWRITE_TIER: "priority" },
        stdout: { write: (line: string) => stderr.push(line) },
      },
    },
  );
  handlers.get("session_start")!({ type: "session_start" }, context);
  const payload = { model: "configured-model", input: "private source", tools: [] };
  const result = handlers.get("before_provider_request")!({ payload }, context);
  assert.equal(JSON.stringify(result), JSON.stringify({ ...payload, service_tier: "priority" }));
  assert.notProperty(payload, "service_tier");
  handlers.get("provider_stream_event")!(
    {
      data: { type: "response.output_text.delta", delta: "private source" },
    },
    context,
  );
  handlers.get("provider_stream_event")!(
    {
      data: {
        type: "response.completed",
        response: {
          model: "served-model",
          service_tier: "default",
          output: "private source",
          secret: "private credential",
          usage: {
            input_tokens: 11,
            output_tokens: 7,
            total_tokens: 18,
            secret: "private credential",
          },
        },
      },
    },
    context,
  );
  assert.deepEqual(
    lines.map((line) => {
      const event = JSON.parse(line);
      assert.equal(event.type, "extension_ui_request");
      assert.equal(event.method, "notify");
      assert.equal(event.notifyType, "info");
      return JSON.parse(event.message);
    }),
    [
      { namespace: "t3.pi.reply-rewrite", version: 1, kind: "ready" },
      { namespace: "t3.pi.reply-rewrite", version: 1, kind: "request" },
      {
        namespace: "t3.pi.reply-rewrite",
        version: 1,
        kind: "response",
        status: "response.completed",
        model: "served-model",
        actualServiceTier: "default",
        usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
      },
    ],
  );
  assert.isEmpty(stderr);
  assert.notInclude(lines.join(""), "private");
});
