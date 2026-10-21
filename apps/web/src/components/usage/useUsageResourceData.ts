/** Own foreground resource subscriptions and timestamped history independently of card presentation. */
import type {
  EnvironmentId,
  HostResourcesSnapshot,
  ResourceTelemetrySnapshot,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";
import { useResourceTelemetry } from "../../lib/resourceTelemetryState";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import {
  emptyUsageCpuHistory,
  groupUsageResources,
  pushUsageCpuHistory,
} from "./usageResource.logic";

/** Subscribe to visibility changes without polling the browser. */
function subscribeVisibility(listener: () => void) {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

/** Visibility remains authoritative before React commits its next render. */
function isVisible() {
  return !document.hidden;
}

/**
 * Read an already-authorized environment. The caller remounts on host changes.
 * Hidden pages release both queries and retain their last visible data without appending samples.
 */
export function useUsageResourceData(environmentId: EnvironmentId) {
  const visible = useSyncExternalStore(subscribeVisibility, isVisible, () => false);
  const telemetry = useResourceTelemetry(visible ? environmentId : null);
  const hostQuery = useEnvironmentQuery(
    visible ? serverEnvironment.hostResources({ environmentId, input: {} }) : null,
  );
  const [host, setHost] = useState<HostResourcesSnapshot | null>(null);
  const [sample, setSample] = useState(() => ({
    snapshot: null as ResourceTelemetrySnapshot | null,
    history: emptyUsageCpuHistory(),
  }));

  const refreshHost = useEffectEvent(() => {
    if (!document.hidden && !hostQuery.isPending) hostQuery.refresh();
  });
  useEffect(() => {
    if (!visible) return;
    // hostResources has a five-second RPC timeout. Skip in-flight calls instead of restarting them.
    // Telemetry is pushed with idleTtlMs=0; it needs no polling or retry loop here.
    const timer = setInterval(refreshHost, 2000);
    return () => clearInterval(timer);
  }, [visible]);

  // These guarded updates derive an immutable local cache from external query results.
  // Doing this before commit avoids painting one sample with the previous sample's history.
  if (visible && !document.hidden) {
    if (hostQuery.data && hostQuery.data !== host) setHost(hostQuery.data);
    const snapshot = telemetry.data;
    if (snapshot && snapshot !== sample.snapshot) {
      const at = DateTime.toEpochMillis(snapshot.readAt);
      const history = pushUsageCpuHistory(
        sample.history,
        groupUsageResources(snapshot.processes),
        at,
      );
      if (history !== sample.history) setSample({ snapshot, history });
    }
  }
  return { visible, telemetry, hostQuery, host, sample };
}
