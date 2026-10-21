/** Localized cloud presentation and existing interaction behavior. */
import { t } from "~/i18n";
import {
  connectionStatusText,
  type EnvironmentConnectionPresentation,
} from "@t3tools/client-runtime/connection";

export interface SavedCloudEnvironmentConnectionPresentation {
  readonly buttonLabel: string;
  readonly statusText: string;
  readonly tone: "connected" | "connecting" | "error" | "idle";
}

export function presentSavedCloudEnvironmentConnection(
  connection: EnvironmentConnectionPresentation,
): SavedCloudEnvironmentConnectionPresentation {
  switch (connection.phase) {
    case "connected":
      return {
        buttonLabel: t.account.cloud.connected,
        statusText: connectionStatusText(connection, t.chat.workLog.shared.connection),
        tone: "connected",
      };
    case "connecting":
      return {
        buttonLabel: t.account.cloud.connecting,
        statusText: connectionStatusText(connection, t.chat.workLog.shared.connection),
        tone: "connecting",
      };
    case "reconnecting":
      return {
        buttonLabel: t.account.cloud.reconnecting,
        statusText: connectionStatusText(connection, t.chat.workLog.shared.connection),
        tone: "connecting",
      };
    case "unsupported":
      return {
        buttonLabel: t.account.cloud.unsupportedClient,
        statusText: connectionStatusText(connection, t.chat.workLog.shared.connection),
        tone: "idle",
      };
    case "error":
      return {
        buttonLabel: t.account.cloud.connectionFailed,
        statusText: connectionStatusText(connection, t.chat.workLog.shared.connection),
        tone: "error",
      };
    case "offline":
      return {
        buttonLabel: t.account.cloud.offline,
        statusText: connectionStatusText(connection, t.chat.workLog.shared.connection),
        tone: "idle",
      };
    case "available":
      return {
        buttonLabel: t.account.cloud.notConnected,
        statusText: connectionStatusText(connection, t.chat.workLog.shared.connection),
        tone: "idle",
      };
  }
}
