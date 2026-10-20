/** Maps provider pools to fader groups without owning rendering or account state. */
import {
  displayLimitWindows,
  remainingPercent,
  type LimitPool,
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
