import { assert, it } from "@effect/vitest";
import * as NodeVM from "node:vm";

import { PI_REPLY_REWRITE_EXTENSION_SOURCE } from "./replyRewriteExtensionSource.ts";

it("changes only the tier and emits only whitelisted response metadata", () => {
  const handlers = new Map<string, (event?: unknown) => unknown>();
  const lines: string[] = [];
  NodeVM.runInNewContext(
    `${PI_REPLY_REWRITE_EXTENSION_SOURCE.replace("export default ", "")}\nreplyRewriteExtension(pi);`,
    {
      pi: {
        on: (name: string, handler: (event?: unknown) => unknown) => handlers.set(name, handler),
      },
      process: {
        env: { T3_PI_REPLY_REWRITE_TIER: "priority" },
        stdout: { write: (line: string) => lines.push(line) },
      },
    },
  );
  handlers.get("session_start")!();
  const payload = { model: "configured-model", input: "private source", tools: [] };
  const result = handlers.get("before_provider_request")!({ payload });
  assert.equal(JSON.stringify(result), JSON.stringify({ ...payload, service_tier: "priority" }));
  assert.notProperty(payload, "service_tier");
  handlers.get("provider_stream_event")!({
    data: { type: "response.output_text.delta", delta: "private source" },
  });
  handlers.get("provider_stream_event")!({
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
  });
  assert.deepEqual(
    lines.map((line) => JSON.parse(line)),
    [
      { type: "t3_reply_rewrite", kind: "ready", version: 1 },
      { type: "t3_reply_rewrite", kind: "request" },
      {
        type: "t3_reply_rewrite",
        kind: "response",
        status: "response.completed",
        model: "served-model",
        actualServiceTier: "default",
        usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
      },
    ],
  );
  assert.notInclude(lines.join(""), "private");
});
