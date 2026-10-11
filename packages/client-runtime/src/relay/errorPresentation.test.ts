import { englishRelayMessages } from "./messages.ts";
import { RelayAuthInvalidError } from "@t3tools/contracts/relay";
import { describe, expect, it } from "@effect/vitest";

import {
  DPOP_CLOCK_HINT,
  DPOP_RETRY_HINT,
  DPOP_UNKNOWN_HINT,
  relayProtectedErrorMessage,
  relayOfflineReasonMessage,
} from "./errorPresentation.ts";

describe("relayProtectedErrorMessage", () => {
  it("presents clock skew as one possible cause when the relay omits the reason", () => {
    const error = new RelayAuthInvalidError({
      code: "auth_invalid",
      reason: "invalid_dpop",
      traceId: "trace-1",
    });

    expect(relayProtectedErrorMessage(error)).toBe(
      `Relay rejected the DPoP proof. ${DPOP_UNKNOWN_HINT}`,
    );
  });

  it("keeps the clock hint for a relay that confirms a time-window failure", () => {
    const error = new RelayAuthInvalidError({
      code: "auth_invalid",
      reason: "invalid_dpop",
      dpopFailureReason: "time_window",
      traceId: "trace-1",
    });

    expect(relayProtectedErrorMessage(error)).toContain(DPOP_CLOCK_HINT);
  });

  it("does not blame the clock when the relay identifies another proof failure", () => {
    const error = new RelayAuthInvalidError({
      code: "auth_invalid",
      reason: "invalid_dpop",
      dpopFailureReason: "key_mismatch",
      traceId: "trace-1",
    });

    expect(relayProtectedErrorMessage(error)).toBe(
      `Relay rejected the DPoP proof. ${DPOP_RETRY_HINT}`,
    );
  });

  it("preserves the existing message for other authentication failures", () => {
    const error = new RelayAuthInvalidError({
      code: "auth_invalid",
      reason: "invalid_bearer",
      traceId: "trace-1",
    });

    expect(relayProtectedErrorMessage(error)).toBe("Relay rejected the cloud session token.");
  });
});

it("localizes a structured DPoP failure and the offline tunnel explanation", () => {
  const messages = {
    ...englishRelayMessages,
    rejectedProof: "中继拒绝了 DPoP 证明。",
    clockHint: "请检查两台设备的自动时间设置。",
    tunnelReleased: "长期离线，隧道已移除。",
  };
  const error = new RelayAuthInvalidError({
    code: "auth_invalid",
    reason: "invalid_dpop",
    dpopFailureReason: "time_window",
    traceId: "trace-1",
  });
  expect(relayProtectedErrorMessage(error, messages)).toBe(
    "中继拒绝了 DPoP 证明。 请检查两台设备的自动时间设置。",
  );
  expect(relayOfflineReasonMessage({ offlineReason: "tunnel_released" }, messages)).toBe(
    "长期离线，隧道已移除。",
  );
  expect(relayOfflineReasonMessage({}, messages)).toBeNull();
});
