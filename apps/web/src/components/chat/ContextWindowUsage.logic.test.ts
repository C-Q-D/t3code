/** Protects U6's real quota values, account boundaries, and unavailable-data handling. */
import { ProviderDriverKind, type UsageLimitsReport } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { contextWindowUsageAccounts } from "./ContextWindowUsage.logic";

const ACCOUNT: UsageLimitsReport["accounts"][number] = {
  id: "work",
  driver: ProviderDriverKind.make("codex"),
  label: "Work",
  limits: {
    checkedAt: "2026-10-17T00:00:00Z",
    windows: [
      { id: "session", kind: "session", label: "Session", usedPercent: 28 },
      { id: "weekly", kind: "weekly", label: "Weekly", usedPercent: 93 },
    ],
  },
};
/** Wraps supplied account fixtures in the public report contract without deriving expected results. */
function report(accounts: UsageLimitsReport["accounts"]): UsageLimitsReport {
  return { createdAt: "2026-10-17T00:00:00Z", accounts, notices: [] };
}

describe("contextWindowUsageAccounts", () => {
  it("hides missing reports and accounts without quota data or a management link", () => {
    expect(contextWindowUsageAccounts(null)).toEqual([]);
    expect(
      contextWindowUsageAccounts(
        report([{ ...ACCOUNT, limits: { ...ACCOUNT.limits, windows: [] } }]),
      ),
    ).toEqual([]);
  });
  it("keeps accounts and windows separate and reports remaining rather than spent quota", () => {
    expect(
      contextWindowUsageAccounts(
        report([
          ACCOUNT,
          {
            ...ACCOUNT,
            id: "personal",
            label: "Personal",
            limits: {
              ...ACCOUNT.limits,
              externalUsage: { label: "Manage", url: "https://example.com/usage" },
              windows: [{ id: "monthly", kind: "monthly", label: "Monthly", usedPercent: 40.4 }],
            },
          },
        ]),
      ),
    ).toEqual([
      {
        id: "work",
        label: "Work",
        managementUrl: null,
        windows: [
          { id: "session", label: "Session", usedPercent: 28, remainingPercent: 72 },
          { id: "weekly", label: "Weekly", usedPercent: 93, remainingPercent: 7 },
        ],
      },
      {
        id: "personal",
        label: "Personal",
        managementUrl: "https://example.com/usage",
        windows: [{ id: "monthly", label: "Monthly", usedPercent: 40.4, remainingPercent: 60 }],
      },
    ]);
  });
  it("suppresses unavailable windows while retaining the provider management link", () => {
    expect(
      contextWindowUsageAccounts(
        report([
          {
            ...ACCOUNT,
            limits: {
              ...ACCOUNT.limits,
              unavailable: { reason: "probeFailed" },
              externalUsage: { label: "Manage", url: "https://example.com/usage" },
            },
          },
        ]),
      ),
    ).toEqual([
      { id: "work", label: "Work", managementUrl: "https://example.com/usage", windows: [] },
    ]);
  });
  it("preserves exhausted and unused windows as real zero and full remaining quota", () => {
    const accounts = contextWindowUsageAccounts(
      report([
        {
          ...ACCOUNT,
          limits: {
            ...ACCOUNT.limits,
            windows: [
              { id: "empty", kind: "session", label: "Empty", usedPercent: 100 },
              { id: "full", kind: "weekly", label: "Full", usedPercent: 0 },
            ],
          },
        },
      ]),
    );
    expect(accounts[0]?.windows).toEqual([
      { id: "empty", label: "Empty", usedPercent: 100, remainingPercent: 0 },
      { id: "full", label: "Full", usedPercent: 0, remainingPercent: 100 },
    ]);
  });
});
