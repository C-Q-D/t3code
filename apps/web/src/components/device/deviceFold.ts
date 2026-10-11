/** Localized device UI and interactions; preserves user data, commands, and protocol values. */
import { t } from "~/i18n";
import type { DeviceHubAccess } from "@t3tools/client-runtime/state/deviceHubAccess";
import { withDeviceHubQuery } from "@t3tools/client-runtime/state/deviceHubAccess";

export type AndroidFoldPosture = "closed" | "opened";

export interface AndroidFoldState {
  readonly supported: boolean;
  readonly posture: "closed" | "half_opened" | "opened" | "flipped" | "tent" | null;
  readonly hingeAngle: number | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Validates Android fold state received from the hub.
 * @param payload Unknown response body; must contain supported, posture, and a valid nullable hinge angle.
 * @returns Confirmed fold state; throws a localized response error for malformed fields.
 */
const parseFold = (payload: unknown): AndroidFoldState => {
  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.fold)) {
    throw new Error(t.tools.device.unexpectedFold);
  }
  const { supported, posture, hingeAngle } = payload.fold;
  if (
    typeof supported !== "boolean" ||
    (posture !== null &&
      posture !== "closed" &&
      posture !== "half_opened" &&
      posture !== "opened" &&
      posture !== "flipped" &&
      posture !== "tent") ||
    (hingeAngle !== null && (typeof hingeAngle !== "number" || !Number.isFinite(hingeAngle)))
  ) {
    throw new Error(t.tools.device.unexpectedFold);
  }
  return { supported, posture, hingeAngle };
};

/**
 * Reads or sets Android fold posture without changing the protocol payload.
 * @param access Authenticated hub endpoints and credential policy.
 * @param deviceId Original target device identifier.
 * @param posture Optional native posture to set; absence performs a read.
 * @param signal Optional caller cancellation signal; no additional timeout or retry is applied here.
 * @returns Promise for validated fold state; network, cancellation, and response failures reject.
 */
const foldRequest = async (
  access: DeviceHubAccess,
  deviceId: string,
  posture?: AndroidFoldPosture,
  signal?: AbortSignal,
): Promise<AndroidFoldState> => {
  const url = withDeviceHubQuery(
    `${access.httpBase}/vendor/serve-emu/api/fold?${new URLSearchParams({ device: deviceId })}`,
    access,
  );
  const response = await fetch(url, {
    method: posture ? "POST" : "GET",
    cache: "no-store",
    credentials: access.credentials ? "include" : "same-origin",
    ...(posture
      ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ posture }) }
      : {}),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const error = isRecord(payload) ? payload.error : null;
    throw new Error(
      typeof error === "string" ? error : t.tools.device.foldCommandFailed(response.status),
    );
  }
  return parseFold(await response.json());
};

export const readAndroidFold = (access: DeviceHubAccess, deviceId: string, signal?: AbortSignal) =>
  foldRequest(access, deviceId, undefined, signal);

export const setAndroidFold = (
  access: DeviceHubAccess,
  deviceId: string,
  posture: AndroidFoldPosture,
  signal?: AbortSignal,
) => foldRequest(access, deviceId, posture, signal);
