/** Protects draft validation and provider cache estimates shared by both clients and server. */
import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  ComposerOptimizeInput,
  composerCacheExpiresAt,
  composerCacheMaybeExpired,
} from "./composerAssist.ts";

describe("ComposerOptimizeInput", () => {
  it.each(["", " \n\t ", "x".repeat(20_001)])("rejects invalid draft %#", (draft) => {
    expect(() =>
      Schema.decodeUnknownSync(ComposerOptimizeInput)({
        threadId: "thread",
        draft,
        style: "default",
      }),
    ).toThrow();
  });
  it.each(["  improve this\n", "x".repeat(20_000)])("preserves valid draft %#", (draft) => {
    expect(
      Schema.decodeUnknownSync(ComposerOptimizeInput)({
        threadId: "thread",
        draft,
        style: "default",
      }).draft,
    ).toBe(draft);
  });
});

describe("composerCacheExpiresAt", () => {
  it.each([
    ["claudeAgent", "2026-01-01T00:00:00Z", "2026-01-01T00:30:00Z", 1767227400000],
    ["claudeAgent", null, "2026-01-01T00:30:00Z", 1767227400000],
    ["claudeAgent", "2026-01-01T00:00:00Z", null, 1767229200000],
    ["claudeAgent", "2026-01-01T00:00:00Z", undefined, 1767229200000],
    ["claudeAgent", "2026-01-01T00:00:00Z", "invalid", 1767229200000],
    ["claudeAgent", null, null, null],
    ["claudeAgent", "invalid", "invalid", null],
    ["codex", "2026-01-01T00:00:00Z", "2026-01-01T00:30:00Z", 1767226200000],
    ["codex", "2026-01-01T00:00:00Z", null, 1767226200000],
    ["codex", null, "2026-01-01T00:30:00Z", null],
    ["codex", "invalid", null, null],
    ["cursor", "2026-01-01T00:00:00Z", "2026-01-01T00:30:00Z", null],
  ] as const)(
    "estimates cache deadline %#",
    (driver, lastTurnCompletedAt, promptCacheExpiresAt, expected) => {
      expect(composerCacheExpiresAt({ driver, lastTurnCompletedAt, promptCacheExpiresAt })).toBe(
        expected,
      );
    },
  );
});

describe("composerCacheMaybeExpired", () => {
  it.each([
    [null, 101, false],
    [100, 99, false],
    [100, 100, false],
    [100, 101, true],
  ] as const)("compares expiry %#", (expiresAt, now, expected) => {
    expect(composerCacheMaybeExpired(expiresAt, now)).toBe(expected);
  });
});
