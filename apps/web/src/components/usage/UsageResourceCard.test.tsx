/** Exercise permission and foreground collection boundaries with real React lifecycle and fake RPC results. */
import { act, createElement, useLayoutEffect } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

const state = vi.hoisted(() => ({
  telemetry: vi.fn(),
  query: vi.fn(),
  hostRefresh: vi.fn(),
  telemetryRefresh: vi.fn(),
  environment: vi.fn(),
  scope: vi.fn(),
  hostResources: vi.fn(),
}));
vi.mock("../../lib/resourceTelemetryState", () => ({ useResourceTelemetry: state.telemetry }));
vi.mock("../../state/query", () => ({ useEnvironmentQuery: state.query }));
vi.mock("../../state/server", () => ({
  serverEnvironment: { hostResources: state.hostResources },
}));
vi.mock("../../state/environments", () => ({ usePrimaryEnvironment: state.environment }));
vi.mock("../../state/session", () => ({ useEnvironmentScope: state.scope }));
vi.mock("../../hooks/usePhysicsMotion", () => ({
  usePhysicsMotion: () => ({ enabled: false, mode: "off" }),
}));

import { useUsageResourceData } from "./useUsageResourceData";
import { UsageResourceCard } from "./UsageResourceCard";
import { usageCpuFrames } from "./usageResource.logic";

let renderer: ReactTestRenderer | undefined;
let latest: ReturnType<typeof useUsageResourceData> | undefined;
const environmentId = EnvironmentId.make("resource-test");

/** Observe the production data hook's public output, without rendering or inspecting SVG attributes. */
function Probe() {
  const value = useUsageResourceData(environmentId);
  useLayoutEffect(() => {
    latest = value;
  }, [value]);
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  latest = undefined;
  state.hostResources.mockReturnValue("host-query");
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each(["no environment", "no diagnostics grant"])(
  "does not render or subscribe with %s",
  (reason) => {
    state.environment.mockReturnValue(
      reason === "no environment" ? null : { environmentId, label: "Desktop" },
    );
    state.scope.mockReturnValue(reason !== "no diagnostics grant");
    act(() => {
      renderer = create(createElement(UsageResourceCard));
    });
    expect(renderer?.toJSON()).toBeNull();
    expect(state.telemetry).not.toHaveBeenCalled();
    expect(state.hostResources).not.toHaveBeenCalled();
  },
);

it("polls only in the foreground, ignores hidden samples, resumes, and releases its timer", () => {
  const page = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal("document", page);
  let snapshot = { readAt: DateTime.makeUnsafe(1000), processes: [] };
  let pending = false;
  const host = {
    sampledAt: 1000,
    cpuCount: 8,
    cpuUtilization: 0.25,
    availableMemoryBytes: 1024,
    totalMemoryBytes: 4096,
  };
  // Even after detachment this boundary can return a stale/in-flight value: the hook must reject it.
  state.telemetry.mockImplementation(() => ({
    data: snapshot,
    error: null,
    isPending: false,
    refresh: state.telemetryRefresh,
  }));
  state.query.mockImplementation(() => ({
    data: host,
    error: null,
    isPending: pending,
    refresh: state.hostRefresh,
  }));
  act(() => {
    renderer = create(createElement(Probe));
  });
  expect(latest?.host).toEqual(host);
  expect(usageCpuFrames(latest!.sample.history).map((frame) => frame.at)).toEqual([1000]);
  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(state.hostRefresh).toHaveBeenCalledTimes(1);
  expect(state.telemetryRefresh).not.toHaveBeenCalled();

  act(() => {
    page.hidden = true;
    page.dispatchEvent(new Event("visibilitychange"));
  });
  expect(state.telemetry).toHaveBeenLastCalledWith(null);
  expect(state.query).toHaveBeenLastCalledWith(null);
  snapshot = { readAt: DateTime.makeUnsafe(5000), processes: [] };
  act(() => {
    renderer!.update(createElement(Probe));
    vi.advanceTimersByTime(4000);
  });
  expect(state.hostRefresh).toHaveBeenCalledTimes(1);
  expect(usageCpuFrames(latest!.sample.history).map((frame) => frame.at)).toEqual([1000]);

  snapshot = { readAt: DateTime.makeUnsafe(7000), processes: [] };
  act(() => {
    page.hidden = false;
    page.dispatchEvent(new Event("visibilitychange"));
  });
  expect(state.telemetry).toHaveBeenLastCalledWith(environmentId);
  expect(usageCpuFrames(latest!.sample.history).map((frame) => frame.at)).toEqual([1000, 7000]);
  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(state.hostRefresh).toHaveBeenCalledTimes(2);
  pending = true;
  act(() => {
    renderer!.update(createElement(Probe));
  });
  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(state.hostRefresh).toHaveBeenCalledTimes(2);
  act(() => {
    renderer!.unmount();
  });
  renderer = undefined;
  expect(vi.getTimerCount()).toBe(0);
});
