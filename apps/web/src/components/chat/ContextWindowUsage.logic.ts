/** Derives U6 quota rows from the existing report without pooling unrelated accounts or windows. */
import type { UsageLimitsReport } from "@t3tools/contracts";
import { remainingPercent } from "@t3tools/shared/usageLimits";

/**
 * Keeps reported account/window order and management links; absent reports produce no section.
 * Unavailable reports retain their management link but suppress stale windows, matching the banner.
 * @param report Current provider report, or null/undefined before usage data is available.
 * @returns Accounts with usable windows or a management link; U6 fills spent quota and labels quota left.
 */
export function contextWindowUsageAccounts(report: UsageLimitsReport | null | undefined) {
  return (report?.accounts ?? []).flatMap((account) => {
    const windows = account.limits.unavailable ? [] : account.limits.windows;
    const managementUrl = account.limits.externalUsage?.url ?? null;
    if (windows.length === 0 && managementUrl === null) return [];
    return [
      {
        id: account.id,
        label: account.label,
        managementUrl,
        windows: windows.map((window) => ({
          id: window.id,
          label: window.label,
          usedPercent: window.usedPercent,
          remainingPercent: remainingPercent(window),
        })),
      },
    ];
  });
}
