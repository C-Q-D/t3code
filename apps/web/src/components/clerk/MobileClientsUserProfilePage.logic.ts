/** Localized clerk presentation and existing interaction behavior. */
import { t } from "~/i18n";
import type { RelayClientDeviceRecord } from "@t3tools/contracts/relay";

const mobileClientUpdatedAtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const NOTIFICATION_PREFERENCES = [
  ["notifyOnApproval", t.account.clerk.approvals],
  ["notifyOnInput", t.account.clerk.inputRequests],
  ["notifyOnCompletion", t.account.clerk.completions],
  ["notifyOnFailure", t.account.clerk.failures],
] as const satisfies ReadonlyArray<
  readonly [keyof RelayClientDeviceRecord["notifications"], string]
>;

export function mobileClientPlatformLabel(device: RelayClientDeviceRecord): string {
  const platform =
    device.platform === "android"
      ? "Android"
      : device.iosMajorVersion === null
        ? "iOS"
        : `iOS ${device.iosMajorVersion}`;
  return `${platform}${device.appVersion ? ` · T3 Code ${device.appVersion}` : ""}`;
}

/** Describes the supplied device's enabled notification preferences; reports disabled notifications or an empty selection explicitly. */
export function mobileClientNotificationDetail(device: RelayClientDeviceRecord): string {
  if (!device.notifications.enabled) {
    return t.account.clerk.pushDisabled;
  }

  const enabledPreferences = NOTIFICATION_PREFERENCES.flatMap(([preference, label]) =>
    device.notifications[preference] ? [label] : [],
  );
  return enabledPreferences.length > 0
    ? t.account.clerk.alertsEnabled(enabledPreferences.join(", "))
    : t.account.clerk.noAlertTypes;
}

/** Formats updatedAt for display, returning an unavailable label when the timestamp is invalid. */
export function mobileClientUpdatedAtLabel(updatedAt: string): string {
  const date = new Date(updatedAt);
  return Number.isNaN(date.getTime())
    ? t.account.clerk.updateTimeUnavailable
    : t.account.clerk.updatedAt(mobileClientUpdatedAtFormatter.format(date));
}
