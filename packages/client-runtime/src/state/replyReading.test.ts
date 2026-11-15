/** Exercises display selection against identity, source changes and retained successful versions. */
import { describe, expect, it } from "vite-plus/test";
import { AtomRegistry } from "effect/reactivity";
import {
  DEFAULT_REPLY_REWRITE_SETTINGS,
  EnvironmentId,
  MessageId,
  RunId,
  ThreadId,
  type ReplyRewriteRecord,
} from "@t3tools/contracts";
import {
  replyReadingPreferenceAtom,
  resolveReplyCitationSource,
  resolveReplyReading,
} from "./replyReading.ts";

const identity = {
  environmentId: EnvironmentId.make("environment"),
  threadId: ThreadId.make("thread"),
  runId: RunId.make("run"),
  messageId: MessageId.make("message"),
};
const target = {
  threadId: identity.threadId,
  runId: identity.runId,
  messageId: identity.messageId,
  sourceHash: "a".repeat(64),
};
const success = {
  requestId: "success-1",
  generation: 1,
  target,
  configHash: "b".repeat(64),
  configSnapshot: DEFAULT_REPLY_REWRITE_SETTINGS,
  text: "A readable response.",
  model: "gpt-6.1-terra",
  requestedServiceTier: "priority" as const,
  actualServiceTier: "default",
  usage: null,
  completedAt: "2026-11-15T00:00:00.000Z",
};
const record: ReplyRewriteRecord = { target, currentAttempt: null, lastSuccess: success };
const input = {
  identity,
  sourceText: "Canonical response.",
  detail: { environmentId: identity.environmentId, sourceText: "Canonical response.", record },
  preference: null,
};

describe("reply reading", () => {
  it("defaults to success, honors explicit original and preserves the canonical text", () => {
    expect(resolveReplyReading(input)).toEqual({
      text: success.text,
      source: "rewrite",
      rewriteRequestId: "success-1",
      successAvailable: true,
    });
    expect(resolveReplyReading({ ...input, preference: "original" })).toEqual({
      text: input.sourceText,
      source: "original",
      successAvailable: true,
    });
    expect(input.sourceText).toBe("Canonical response.");
  });

  it.each(["running", "failed", "interrupted", "cancelled"] as const)(
    "retains the old success while a newer attempt is %s",
    (status) => {
      const currentAttempt = {
        ...success,
        requestId: "next",
        generation: 2,
        status,
        requestedAt: success.completedAt,
        startedAt: null,
        finishedAt: null,
        error: null,
      };
      expect(
        resolveReplyReading({
          ...input,
          detail: {
            environmentId: identity.environmentId,
            sourceText: input.sourceText,
            record: { ...record, currentAttempt },
          },
        }).text,
      ).toBe(success.text);
    },
  );

  it.each([
    { ...input, sourceText: "Changed canonical response." },
    { ...input, identity: { ...identity, environmentId: EnvironmentId.make("other") } },
    { ...input, identity: { ...identity, messageId: MessageId.make("other") } },
    { ...input, identity: { ...identity, runId: RunId.make("other") } },
    { ...input, identity: { ...identity, threadId: ThreadId.make("other") } },
    {
      ...input,
      detail: {
        environmentId: identity.environmentId,
        sourceText: input.sourceText,
        record: { ...record, target: { ...target, sourceHash: "c".repeat(64) } },
      },
    },
    {
      ...input,
      detail: {
        ...input.detail,
        record: {
          ...record,
          currentAttempt: {
            ...success,
            generation: 2,
            status: "failed" as const,
            requestedAt: success.completedAt,
            startedAt: null,
            finishedAt: success.completedAt,
            error: { code: "source_changed" as const, message: "Source changed" },
          },
        },
      },
    },
  ])("revokes a rewrite after source or target changes", (changed) => {
    expect(resolveReplyReading(changed)).toEqual({
      text: changed.sourceText,
      source: "original",
      successAvailable: false,
    });
  });

  it("keeps choices scoped and resolves only the retained rewrite version", () => {
    const registry = AtomRegistry.make();
    const otherIdentity = { ...identity, environmentId: EnvironmentId.make("other") };
    try {
      registry.set(replyReadingPreferenceAtom(identity), "original");
      registry.set(replyReadingPreferenceAtom(otherIdentity), "rewrite");
      expect(registry.get(replyReadingPreferenceAtom({ ...identity }))).toBe("original");
      expect(registry.get(replyReadingPreferenceAtom(otherIdentity))).toBe("rewrite");
      registry.set(replyReadingPreferenceAtom(identity), null);
      expect(registry.get(replyReadingPreferenceAtom(identity))).toBeNull();
      expect(registry.get(replyReadingPreferenceAtom(otherIdentity))).toBe("rewrite");
    } finally {
      registry.dispose();
    }
    const citation = {
      version: 2 as const,
      ...identity,
      source: "rewrite" as const,
      rewriteRequestId: "success-1",
      text: "readable",
      start: 2,
      end: 10,
      prefix: "A ",
      suffix: " response.",
    };
    const reading = resolveReplyReading(input);
    expect(resolveReplyCitationSource(citation, reading)).toBe("rewrite");
    expect(resolveReplyCitationSource({ ...citation, rewriteRequestId: "expired" }, reading)).toBe(
      "unavailable",
    );
    expect(resolveReplyCitationSource({ ...citation, version: 1 }, reading)).toBe("original");
  });
});
