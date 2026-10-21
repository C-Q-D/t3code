import { assert, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as McpProviderSessions from "./McpProviderSessions.ts";

it.effect("keeps uncapped and capped HTML pages distinct and consumes each match once", () =>
  Effect.gen(function* () {
    const sessions = yield* McpProviderSessions.McpProviderSessions;
    const threadId = ThreadId.make("html-height-contract");
    const input = { title: "Report", html: "<p>Report</p>" };
    const uncapped = { attachmentId: "uncapped", title: "Report" };
    const capped = { attachmentId: "capped", title: "Report", height: 600 };
    yield* sessions.recordHtmlRender(threadId, input, uncapped);
    yield* sessions.recordHtmlRender(threadId, { ...input, maxHeight: 600 }, capped);

    assert.isUndefined(yield* sessions.takeHtmlRender(threadId, { ...input, maxHeight: 300 }));
    assert.deepEqual(yield* sessions.takeHtmlRender(threadId, input), uncapped);
    assert.isUndefined(yield* sessions.takeHtmlRender(threadId, input));
    assert.deepEqual(
      yield* sessions.takeHtmlRender(threadId, { ...input, maxHeight: "600" }),
      capped,
    );
    assert.isUndefined(yield* sessions.takeHtmlRender(threadId, { ...input, maxHeight: 600 }));
  }).pipe(Effect.provide(McpProviderSessions.layer)),
);
