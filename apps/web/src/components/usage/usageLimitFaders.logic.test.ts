/** Guards the requested account/window layout, independent of visual markup. */
import { ProviderDriverKind, type ServerProviderUsageWindow } from "@t3tools/contracts";
import { collectLimitPools, type LimitAccount } from "@t3tools/shared/usageLimits";
import { expect, it } from "vite-plus/test";
import { limitFaderGroups, resetCreditAction, limitExtraCards } from "./usageLimitFaders.logic";

const session: ServerProviderUsageWindow = {
  id: "session",
  kind: "session",
  label: "Session",
  usedPercent: 20,
  resetsAt: "2026-10-20T12:00:00.000Z",
};
const weekly: ServerProviderUsageWindow = {
  id: "weekly",
  kind: "weekly",
  label: "Weekly",
  usedPercent: 40,
};
const monthly: ServerProviderUsageWindow = {
  id: "monthly",
  kind: "monthly",
  label: "Monthly",
  usedPercent: 60,
};

/** Build real pool inputs; only account identity and quota samples vary. */
function account(key: string, windows: readonly ServerProviderUsageWindow[]): LimitAccount {
  return {
    key,
    driver: ProviderDriverKind.make("codex"),
    displayName: key,
    email: undefined,
    plan: undefined,
    accentColor: undefined,
    environments: [],
    sourceLabel: null,
    redeem: null,
    limits: { checkedAt: "2026-10-20T10:00:00.000Z", windows },
  };
}

/** Use the production pool boundary so resets and missing columns remain realistic. */
function groups(accounts: readonly LimitAccount[]) {
  const pool = collectLimitPools(accounts, Date.parse("2026-10-20T10:00:00.000Z"))[0]!;
  return limitFaderGroups(pool);
}

it("shows two account faders and the shared remainder for one window", () => {
  const result = groups([account("a", [session]), account("b", [{ ...session, usedPercent: 80 }])]);
  expect(result).toHaveLength(1);
  expect(result[0]!.sharedRemaining).toBe(50);
  expect(
    result[0]!.faders.map((fader) => [fader.nameSource, fader.usedPercent, fader.remainingPercent]),
  ).toEqual([
    ["account", 20, 80],
    ["account", 80, 20],
  ]);
  expect(result[0]!.faders[0]!.reset?.restoresPercent).toBe(10);
});

it("names a single account's three faders by window", () => {
  const result = groups([account("a", [session, weekly, monthly])]);
  expect(result.map((group) => group.faders.map((fader) => fader.nameSource))).toEqual([
    ["window"],
    ["window"],
    ["window"],
  ]);
  expect(result.map((group) => group.sharedRemaining)).toEqual([null, null, null]);
});

it("collapses six account samples into three shared window faders", () => {
  const result = groups([
    account("a", [session, weekly, monthly]),
    account("b", [{ ...session, usedPercent: 80 }, weekly, monthly]),
  ]);
  expect(
    result.map((group) => group.faders.map((fader) => [fader.nameSource, fader.remainingPercent])),
  ).toEqual([[["window", 50]], [["window", 60]], [["window", 40]]]);
  expect(result[0]!.faders[0]!.members.map((member) => member.account.key)).toEqual(["a", "b"]);
});

it("keeps four account faders across two windows", () => {
  const result = groups([account("a", [session, weekly]), account("b", [session, weekly])]);
  expect(result.map((group) => group.faders.map((fader) => fader.nameSource))).toEqual([
    ["account", "account"],
    ["account", "account"],
  ]);
});

it("omits missing windows and keeps exactly five real samples uncollapsed", () => {
  const result = groups([
    account("a", [session, weekly, monthly]),
    account("b", [session, weekly]),
  ]);
  expect(result.map((group) => group.faders.map((fader) => fader.members[0]!.account.key))).toEqual(
    [["a", "b"], ["a", "b"], ["a"]],
  );
  expect(result[2]!.sharedRemaining).toBeNull();
  expect(result.map((group) => group.showWindowTitle)).toEqual([true, true, true]);
});

it("uses Cursor display order and excludes its redundant total window", () => {
  const source = account("a", [
    { ...monthly, id: "apiPercentUsed" },
    { ...monthly, id: "totalPercentUsed" },
    { ...monthly, id: "autoPercentUsed" },
  ]);
  const result = groups([{ ...source, driver: ProviderDriverKind.make("cursor") }]);
  expect(result.map((group) => group.window.id)).toEqual(["autoPercentUsed", "apiPercentUsed"]);
  expect(result.map((group) => group.faders.length)).toEqual([1, 1]);
});

it.each([
  { counts: [0, 0], expected: { kind: "hidden" } },
  { counts: [0, 2], expected: { kind: "confirm", key: "b", count: 2 } },
  { counts: [0, 2, 3], expected: { kind: "details", key: "b", count: 5 } },
])("routes header reset credits for $counts", ({ counts, expected }) => {
  const accounts = counts.map((count, index) => {
    const source = account(["a", "b", "c"][index]!, [session]);
    return { ...source, limits: { ...source.limits, resetCredits: { availableCount: count } } };
  });
  const action = resetCreditAction(accounts);
  expect(
    action.kind === "hidden"
      ? action
      : { kind: action.kind, key: action.account.key, count: action.count },
  ).toEqual(expected);
});

it("merges the ChatGPT sharing destination and repeated notices without dropping other cards", () => {
  expect(
    limitExtraCards(
      ["Read failed", "Read failed"],
      ["desktop"],
      [
        { url: "https://chatgpt.com/#settings/Usage", label: "ChatGPT" },
        { url: "https://example.com/usage", label: "Other" },
      ],
      { url: "https://chatgpt.com/#settings/Usage", label: "Shared usage" },
    ),
  ).toEqual([
    { kind: "notice", notice: "Read failed" },
    { kind: "cursor", environments: ["desktop"] },
    { kind: "link", link: { url: "https://chatgpt.com/#settings/Usage", label: "Shared usage" } },
    { kind: "link", link: { url: "https://example.com/usage", label: "Other" } },
  ]);
});

it("returns no cards when all notice sources are empty", () => {
  expect(limitExtraCards([], [], [], null)).toEqual([]);
});

it("keeps sharing reachable when no provider supplies an external link", () => {
  expect(
    limitExtraCards([], [], [], { url: "https://chatgpt.com/#settings/Usage", label: "Shared" }),
  ).toEqual([
    { kind: "link", link: { url: "https://chatgpt.com/#settings/Usage", label: "Shared" } },
  ]);
});
