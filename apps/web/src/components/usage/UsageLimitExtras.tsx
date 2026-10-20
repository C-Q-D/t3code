/** Groups subscription-related actions below the first-screen usage and limits columns. */
import { t } from "~/i18n";
import type { EnvironmentId, UsageProviderKind } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { usesChatGptSharing } from "@t3tools/shared/usageLimits";
import { environmentPresentations } from "../../state/presentation";
import type { EnvironmentUsageStatus } from "../../state/usage";
import { ChatGptUsageButton } from "../settings/ChatGptUsageButton";
import { CursorEnableLimits } from "./UsageCursorEnable";

/** Filters shared usage links and provides Cursor environments requiring explicit opt-in. */
export interface UsageLimitExtrasProps {
  readonly selectedEnvironmentIds: ReadonlySet<EnvironmentId> | null;
  readonly hiddenProviders: ReadonlySet<UsageProviderKind>;
  readonly cursorEnvironments: readonly EnvironmentUsageStatus[];
  readonly onCursorEnabled: () => void;
}
/** Returns no layout box when neither shared usage nor Cursor opt-in is available. */
export function UsageLimitExtras({
  selectedEnvironmentIds,
  hiddenProviders,
  cursorEnvironments,
  onCursorEnabled,
}: UsageLimitExtrasProps) {
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const sharedUsage =
    !hiddenProviders.has("codex") &&
    [...presentations].some(
      ([id, presentation]) =>
        (selectedEnvironmentIds === null || selectedEnvironmentIds.has(id)) &&
        presentation.serverConfig?.providers.some(usesChatGptSharing),
    );
  if (!sharedUsage && cursorEnvironments.length === 0) return null;
  return (
    <div className="flex flex-col gap-4">
      {sharedUsage ? (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{t.tools.usage.chatgptSharedUsage}</span>
          <ChatGptUsageButton size="xs" />
        </div>
      ) : null}
      {cursorEnvironments.length > 0 ? (
        <CursorEnableLimits environments={cursorEnvironments} onEnabled={onCursorEnabled} />
      ) : null}
    </div>
  );
}
