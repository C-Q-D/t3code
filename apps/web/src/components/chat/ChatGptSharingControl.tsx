/** Displays ChatGPT plan usage and its usage settings action. */
import { t } from "~/i18n";
import { usesChatGptSharing } from "@t3tools/shared/usageLimits";
import type { ServerProvider } from "@t3tools/contracts";
import { OpenAI } from "../Icons";
import { ChatGptUsageButton } from "../settings/ChatGptUsageButton";

/**
 * Renders the ChatGPT plan indicator and its usage-settings action for a compatible provider.
 * @param props - provider is the selected server provider, or null when none is selected.
 * @returns Sharing controls, or null when the provider does not support ChatGPT sharing.
 */
export function ChatGptSharingControl({ provider }: { provider: ServerProvider | null }) {
  if (!usesChatGptSharing(provider)) return null;
  return (
    <div className="flex items-center justify-between gap-4 border-t px-3 py-2">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <OpenAI className="size-3.5" aria-hidden="true" />
        {t.chat.providerStatus.usingChatGPTPlan}
      </span>
      <ChatGptUsageButton size="xs" />
    </div>
  );
}
