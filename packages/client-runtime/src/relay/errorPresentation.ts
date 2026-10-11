import { englishRelayMessages, type RelayMessages } from "./messages.ts";
import type { DpopFailureReason } from "@t3tools/contracts";
import type { RelayEnvironmentStatusResponse, RelayProtectedError } from "@t3tools/contracts/relay";

export const DPOP_CLOCK_HINT = englishRelayMessages.clockHint;
/** Older servers may omit the DPoP category; the hint must not imply a confirmed clock issue. */
export const DPOP_UNKNOWN_HINT = englishRelayMessages.unknownHint;
export const DPOP_RETRY_HINT = englishRelayMessages.retryHint;

/** Selects recovery advice from a typed proof failure, retaining uncertainty for older servers. */
function dpopFailureHint(reason: DpopFailureReason | undefined, messages: RelayMessages): string {
  if (reason === "time_window") return messages.clockHint;
  if (reason === undefined) return messages.unknownHint;
  return messages.retryHint;
}

/** Appends the appropriate localized recovery hint while preserving the supplied diagnostic message. */
export function dpopFailureMessage(
  message: string,
  reason: DpopFailureReason | undefined,
  messages: RelayMessages = englishRelayMessages,
): string {
  return messages.withHint(message, dpopFailureHint(reason, messages));
}

/** Presents a typed relay failure using optional locale text and unmodified reason identifiers. */
export function relayProtectedErrorMessage(
  error: RelayProtectedError,
  messages: RelayMessages = englishRelayMessages,
): string {
  switch (error._tag) {
    case "RelayAuthInvalidError":
      switch (error.reason) {
        case "missing_bearer":
        case "invalid_bearer":
          return messages.rejectedToken;
        case "invalid_dpop":
          return dpopFailureMessage(messages.rejectedProof, error.dpopFailureReason, messages);
        case "not_authorized":
          return messages.rejectedRequest;
      }
    case "RelayEnvironmentLinkProofExpiredError":
      return messages.expiredLinkProof;
    case "RelayEnvironmentLinkProofInvalidError":
      return messages.invalidLinkProof(error.reason);
    case "RelayEnvironmentConnectNotAuthorizedError":
      // "Not authorized" covers non-auth causes too; surface the reason so a
      // missing link does not read as a credential problem.
      if (error.reason === "environment_link_not_found") {
        return messages.missingLink;
      }
      return messages.rejectedConnection(error.reason);
    case "RelayEnvironmentEndpointUnavailableError":
      return messages.endpointUnavailable(error.reason);
    case "RelayEnvironmentEndpointTimedOutError":
      return messages.endpointTimeout;
    case "RelayEnvironmentLinkFailedError":
      return messages.linkFailed(error.reason);
    case "RelayEnvironmentLinkUnavailableError":
      return messages.linkUnavailable(error.reason);
    case "RelayEnvironmentLinkLimitExceededError":
      return messages.linkLimit(error.maxTunnels);
    case "RelayAgentActivityPublishProofExpiredError":
      return messages.expiredActivityProof;
    case "RelayAgentActivityPublishProofInvalidError":
      return messages.invalidActivityProof(error.reason);
    case "RelayInternalError":
      return messages.internalError(error.reason);
  }
}

// A host with a current build gets a new tunnel on its own within minutes of
// coming back, which clears this reason. While it is still reported, the host
// is either still off or running a build too old to do that.
export const RELAY_TUNNEL_RELEASED_MESSAGE = englishRelayMessages.tunnelReleased;

/** User-facing text for an offline status, or null when the relay gave no known reason. */
export function relayOfflineReasonMessage(
  status: Pick<RelayEnvironmentStatusResponse, "offlineReason">,
  messages: RelayMessages = englishRelayMessages,
): string | null {
  switch (status.offlineReason) {
    case "tunnel_released":
      return messages.tunnelReleased;
    case undefined:
      return null;
  }
}
