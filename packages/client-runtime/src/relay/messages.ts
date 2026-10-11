/** Relay presentation defaults are separate from transport state and authentication. */
export const englishRelayMessages = {
  clockHint: "Hint: Check that automatic date and time is enabled on both devices, then try again.",
  unknownHint:
    "Hint: Try again. If it still fails, clock skew may be the cause; check that automatic date and time is enabled on both devices.",
  retryHint: "Hint: Try again. If the problem continues, copy the trace ID.",
  withHint: (message: string, hint: string) => `${message} ${hint}`,
  rejectedToken: "Relay rejected the cloud session token.",
  rejectedProof: "Relay rejected the DPoP proof.",
  rejectedRequest: "Relay rejected the authenticated request.",
  expiredLinkProof: "Relay rejected an expired environment link proof.",
  invalidLinkProof: (reason: string) => `Relay rejected the environment link proof (${reason}).`,
  missingLink:
    "Relay has no active link for this environment. The environment server may not have re-established its link yet.",
  rejectedConnection: (reason?: string) =>
    reason
      ? `Relay rejected the environment connection request (${reason}).`
      : "Relay rejected the environment connection request.",
  endpointUnavailable: (reason: string) =>
    `Relay could not reach the environment endpoint (${reason}).`,
  endpointTimeout: "Relay timed out while contacting the environment endpoint.",
  linkFailed: (reason: string) => `Relay could not link the environment (${reason}).`,
  linkUnavailable: (reason: string) => `Relay cannot provision the managed endpoint (${reason}).`,
  linkLimit: (maxTunnels: number) =>
    `Relay refused the link: this account already has its maximum of ${maxTunnels} managed tunnels. Unlink an environment to free one up.`,
  expiredActivityProof: "Relay rejected an expired agent activity publish proof.",
  invalidActivityProof: (reason: string) =>
    `Relay rejected the agent activity publish proof (${reason}).`,
  internalError: (reason: string) => `Relay encountered an internal error (${reason}).`,
  tunnelReleased:
    "Offline for a while, so its T3 Connect tunnel was removed. Start T3 Code on that computer and update it to the latest version to reconnect.",
};
/** Complete relay failure and recovery phrases supplied by a client locale. */
export type RelayMessages = typeof englishRelayMessages;
