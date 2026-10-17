/** Displays conversation errors and their dismissal action. */
import { t } from "~/i18n";
import type { OrchestrationV2ProviderFailureClass } from "@t3tools/contracts";
import { memo } from "react";
import { Alert, AlertAction, AlertDescription } from "../ui/alert";
import { CircleXIcon } from "lucide-react";
import { TimelineBannerDismiss } from "./TimelineStatusBanners";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { OpenAI } from "../Icons";
import { ChatGptUsageButton } from "../settings/ChatGptUsageButton";

export function getThreadErrorBannerKey(threadKey: string, error: string | null): string | null {
  return error === null ? null : `${threadKey}\u0000${error}`;
}

export function shouldShowThreadErrorBanner(
  threadKey: string,
  error: string | null,
  isDismissed: boolean,
): boolean {
  return getThreadErrorBannerKey(threadKey, error) !== null && !isDismissed;
}

// Session-scoped (module-level so it survives ChatView remounts, e.g. route
// changes between threads). Mirrors the branch-mismatch banner: a dismissal
// is remembered per thread key plus message, so navigating away to a thread
// with no error cannot resurrect the banner, while a different error message
// on the same thread still appears.
const sessionDismissedThreadErrorBannerKeys = new Set<string>();

export function dismissThreadErrorBannerForSession(bannerKey: string | null): void {
  if (bannerKey !== null) {
    sessionDismissedThreadErrorBannerKeys.add(bannerKey);
  }
}

export function isThreadErrorBannerDismissedForSession(bannerKey: string | null): boolean {
  return bannerKey !== null && sessionDismissedThreadErrorBannerKeys.has(bannerKey);
}

/** Shows a real error or usage-limit explanation with the caller's existing recovery and dismissal. */
export const ThreadErrorBanner = memo(function ThreadErrorBanner({
  error,
  onDismiss,
  chatGptUsageLimit = false,
}: {
  error: string | null;
  errorClass?: OrchestrationV2ProviderFailureClass | null;
  onDismiss?: () => void;
  chatGptUsageLimit?: boolean;
}) {
  if (!error) return null;
  return (
    <div className="pointer-events-auto">
      <Alert variant="sand" size="status-bar" surface="glass" controlAlignment="first-line">
        {chatGptUsageLimit ? <OpenAI aria-hidden="true" /> : <CircleXIcon aria-hidden="true" />}
        <AlertDescription>
          {chatGptUsageLimit ? (
            <div className="space-y-1">
              <p className="font-medium">{t.chat.providerStatus.chatGPTUsageLimitReached}</p>
              <p>{t.chat.providerStatus.reviewYourUsageSettingsInChatGPTTo}</p>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger render={<div className="line-clamp-3" />}>{error}</TooltipTrigger>
              <TooltipPopup side="top" className="whitespace-pre-wrap">
                {error}
              </TooltipPopup>
            </Tooltip>
          )}
        </AlertDescription>
        {(chatGptUsageLimit || onDismiss) && (
          <AlertAction>
            {chatGptUsageLimit ? <ChatGptUsageButton variant="default" size="md" /> : null}
            {onDismiss ? (
              <TimelineBannerDismiss
                label={t.chat.providerStatus.dismissError}
                onDismiss={onDismiss}
              />
            ) : null}
          </AlertAction>
        )}
      </Alert>
    </div>
  );
});
