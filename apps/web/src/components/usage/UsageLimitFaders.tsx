/** Keeps subscription limits independent of usage diagnostics and loading. */
import type { EnvironmentId, UsageProviderKind } from "@t3tools/contracts";
import { UsageLimitsSection } from "./UsageLimits";

/** Selected environments and visible providers filter limits; now advances on refresh only. */
export interface UsageLimitFadersProps {
  readonly selectedEnvironmentIds: ReadonlySet<EnvironmentId> | null;
  readonly hiddenProviders: ReadonlySet<UsageProviderKind>;
  readonly now: number;
}
/** Preserves existing pooled limits until L2 replaces their presentation. */
export function UsageLimitFaders({
  selectedEnvironmentIds,
  hiddenProviders,
  now,
}: UsageLimitFadersProps) {
  return (
    <UsageLimitsSection
      selectedEnvironmentIds={selectedEnvironmentIds}
      hiddenProviders={hiddenProviders}
      now={now}
    />
  );
}
