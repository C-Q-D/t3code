/** Displays conversation errors and their dismissal action. */
import { t } from "~/i18n";
import type { OrchestrationV2ProviderFailureClass } from "@t3tools/contracts";
import {
  CHATGPT_USAGE_LIMIT_CODE,
  CHATGPT_WORKSPACE_ADMIN_REQUEST,
  CHATGPT_WORKSPACE_USAGE_LIMIT_CODE,
} from "@t3tools/shared/usageLimits";
import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { memo } from "react";
import { Alert, AlertAction, AlertDescription } from "../ui/alert";
import { CircleXIcon } from "lucide-react";
import { TimelineBannerDismiss } from "./TimelineStatusBanners";
import { OpenAI } from "../Icons";
import { ChatGptUsageButton } from "../settings/ChatGptUsageButton";
import { ExpandableText } from "../settings/ExpandableText";

/** Copies the fixed workspace-limit request and reports clipboard success or failure without retrying. */
function copyAdminRequest() {
  void writeTextToClipboard(CHATGPT_WORKSPACE_ADMIN_REQUEST, "admin request").then(
    () =>
      toastManager.add({
        type: "success",
        title: "Request copied",
        description: "Send it to your workspace admin.",
      }),
    () => toastManager.add({ type: "error", title: "Could not copy the request" }),
  );
}

export function getThreadErrorBannerMessage(error: string): string {
  let payload: unknown;
  try {
    payload = JSON.parse(error);
  } catch {
    return error;
  }
  if (typeof payload !== "object" || payload === null || !("error" in payload)) {
    return error;
  }
  const nestedError = payload.error;
  if (typeof nestedError !== "object" || nestedError === null || !("message" in nestedError)) {
    return error;
  }
  return typeof nestedError.message === "string" && nestedError.message.trim().length > 0
    ? nestedError.message
    : error;
}

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
  errorCode,
}: {
  error: string | null;
  errorClass?: OrchestrationV2ProviderFailureClass | null;
  onDismiss?: () => void;
  errorCode?: string | null;
}) {
  if (!error) return null;
  const workspaceLimit = errorCode === CHATGPT_WORKSPACE_USAGE_LIMIT_CODE;
  const chatGptLimit = workspaceLimit || errorCode === CHATGPT_USAGE_LIMIT_CODE;
  return (
    <div className="pointer-events-auto">
      <Alert variant="sand" size="status-bar" surface="glass" controlAlignment="first-line">
        {chatGptLimit ? <OpenAI aria-hidden="true" /> : <CircleXIcon aria-hidden="true" />}
        <AlertDescription>
          {chatGptLimit ? (
            <div className="space-y-1">
              <p className="font-medium">{t.chat.providerStatus.chatGPTUsageLimitReached}</p>
              <p>
                {workspaceLimit
                  ? "You've reached your workspace's limit for using your ChatGPT plan in other apps. Copy a request to ask your workspace admin for increased usage limits."
                  : t.chat.providerStatus.reviewYourUsageSettingsInChatGPTTo}
              </p>
            </div>
          ) : (
            <ExpandableText text={error} collapsedText={getThreadErrorBannerMessage(error)} />
          )}
        </AlertDescription>
        {(chatGptLimit || onDismiss) && (
          <AlertAction>
            {workspaceLimit ? (
              <Button variant="default" size="md" onClick={copyAdminRequest}>
                Copy request for admin
              </Button>
            ) : chatGptLimit ? (
              <ChatGptUsageButton variant="default" size="md" />
            ) : null}
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
