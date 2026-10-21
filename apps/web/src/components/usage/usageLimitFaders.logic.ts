/** Maps provider pools to fader groups without owning rendering or account state. */
import {
  displayLimitWindows,
  remainingPercent,
  type LimitPool,
  type LimitAccount,
  type LimitPoolWindow,
} from "@t3tools/shared/usageLimits";

/** One displayed control; pooled controls retain all members for account inspection. */
export interface LimitFader {
  readonly key: string;
  readonly nameSource: "account" | "window";
  readonly usedPercent: number;
  readonly remainingPercent: number;
  readonly members: LimitPoolWindow["members"];
  readonly reset: LimitPoolWindow["resets"][number] | undefined;
  readonly poolWindow: LimitPoolWindow;
}

/** A time window with optional shared quota and its visible controls. */
export interface LimitFaderGroup {
  readonly window: LimitPoolWindow;
  readonly sharedRemaining: number | null;
  readonly showWindowTitle: boolean;
  readonly faders: readonly LimitFader[];
}

/** Preserve display-window order, omit missing samples, and collapse cards above five faders. */
export function limitFaderGroups(pool: LimitPool): readonly LimitFaderGroup[] {
  const windows = displayLimitWindows(pool);
  const count = windows.reduce(
    (sum, window) => sum + window.columns.filter((column) => column.window !== null).length,
    0,
  );
  const collapsed = count > 5;
  return windows.flatMap((window): LimitFaderGroup[] => {
    const members = window.columns.flatMap((column) =>
      column.window ? [{ account: column.account, window: column.window }] : [],
    );
    if (members.length === 0) return [];
    const key = `${window.kind}:${window.id}`;
    return [
      {
        window,
        showWindowTitle: !collapsed && pool.accounts.length > 1,
        sharedRemaining: !collapsed && members.length > 1 ? window.remainingPercent : null,
        faders: collapsed
          ? [
              {
                key,
                nameSource: "window",
                usedPercent: window.usedPercent,
                remainingPercent: window.remainingPercent,
                members,
                reset: window.resets[0],
                poolWindow: window,
              },
            ]
          : members.map((member) => ({
              key: `${key}:${member.account.key}`,
              nameSource: pool.accounts.length === 1 ? "window" : "account",
              usedPercent: member.window.usedPercent,
              remainingPercent: remainingPercent(member.window),
              members: [member],
              reset: window.resets.find((reset) => reset.member.account.key === member.account.key),
              poolWindow: window,
            })),
      },
    ];
  });
}

/** Header action derived from credit-bearing accounts in card order; permissions remain execution-owned. */
export function resetCreditAction(accounts: readonly LimitAccount[]) {
  const credited = accounts.filter(
    (account) => (account.limits.resetCredits?.availableCount ?? 0) > 0,
  );
  const account = credited[0];
  if (!account) return { kind: "hidden" } as const;
  const count = credited.reduce(
    (sum, item) => sum + (item.limits.resetCredits?.availableCount ?? 0),
    0,
  );
  return { kind: credited.length === 1 ? "confirm" : "details", account, count } as const;
}

/** Build notice cards in reading order, deduplicating messages and destinations; empty means no section. */
export function limitExtraCards<C>(
  notices: readonly string[],
  cursorEnvironments: readonly C[],
  links: readonly {
    readonly url: string;
    readonly label: string;
    readonly message?: string | undefined;
  }[],
  sharedLink: { readonly url: string; readonly label: string } | null,
) {
  const destinations = new Map(links.map((link) => [link.url, link]));
  if (sharedLink) {
    const existing = destinations.get(sharedLink.url);
    destinations.set(sharedLink.url, { ...existing, ...sharedLink });
  }
  return [
    ...[...new Set(notices)].map((notice) => ({ kind: "notice", notice }) as const),
    ...(cursorEnvironments.length
      ? [{ kind: "cursor", environments: cursorEnvironments } as const]
      : []),
    ...[...destinations.values()].map((link) => ({ kind: "link", link }) as const),
  ];
}
