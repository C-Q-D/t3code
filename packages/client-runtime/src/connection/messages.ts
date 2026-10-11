/** Default client connection labels; callers may supply a locale without changing connection state. */
export const englishConnectionMessages = {
  available: "Available",
  offline: "Offline",
  connecting: "Connecting...",
  reconnecting: "Reconnecting...",
  reconnectingAfterFailure: "Failed to connect. Reconnecting...",
  connected: "Connected",
  unsupported: "Client not supported",
  failed: "Connection failed",
  failedWithReason: (reason: string) => `Connection failed. Reason: ${reason}`,
  reconnectingWithReason: (reason: string) =>
    `Failed to connect. Reconnecting... Reason: ${reason}`,
};
/** String and formatter contract supplied by a client locale for connection status displays. */
export type ConnectionMessages = typeof englishConnectionMessages;
