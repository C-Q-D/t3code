/** Verifies panel preference gates and route-paint suppression through real React hooks. */
import { act, useLayoutEffect } from "react";
import { DEFAULT_CLIENT_SETTINGS, type ClientSettings } from "@t3tools/contracts/settings";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  PanelAnimationSuppressionProvider,
  usePanelAnimationSettings,
  usePanelNavigationSuppression,
} from "./panelAnimations";
import { MOTION_SETTLE_DURATION_MS } from "./lib/motion/springToLinear";

const preferences = vi.hoisted(() => ({
  settings: null as ClientSettings | null,
  hydrated: true,
  reduced: true,
}));
vi.mock("./hooks/useSettings", () => ({
  useClientSettings: (select: (settings: ClientSettings) => unknown) =>
    select(preferences.settings!),
  useClientSettingsHydrated: () => preferences.hydrated,
}));

let panelSettings: ReturnType<typeof usePanelAnimationSettings> | undefined;

/** Captures the public hook result after React commits the supplied preference. */
function SettingsProbe() {
  const settings = usePanelAnimationSettings();
  useLayoutEffect(() => {
    panelSettings = settings;
  }, [settings]);
  return null;
}

let renderer: ReactTestRenderer | null = null;
let pendingFrames: FrameRequestCallback[] = [];
let observed: boolean[] = [];

function SuppressionProbe({ navigationKey }: { navigationKey: string }) {
  const suppressed = usePanelNavigationSuppression(navigationKey);
  useLayoutEffect(() => {
    observed.push(suppressed);
  }, [suppressed]);
  return null;
}

beforeEach(() => {
  preferences.settings = { ...DEFAULT_CLIENT_SETTINGS };
  preferences.hydrated = true;
  preferences.reduced = true;
  panelSettings = undefined;
  pendingFrames = [];
  observed = [];
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    matchMedia: () => ({
      matches: preferences.reduced,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      pendingFrames.push(callback);
      return pendingFrames.length;
    }),
    cancelAnimationFrame: vi.fn(),
  });
});

describe("usePanelAnimationSettings", () => {
  it("uses the shared physics curve even when the system reduces motion", async () => {
    await act(() => {
      renderer = create(<SettingsProbe />);
    });
    expect(panelSettings).toEqual({
      active: true,
      physics: true,
      durationMs: MOTION_SETTLE_DURATION_MS,
      easing: "var(--ease-settle)",
    });
  });

  it.each([
    ["off", 0, false, false],
    ["off", 200, false, true],
    ["off", 200, true, false],
    ["system", 0, true, false],
    ["system", 200, true, false],
  ] as const)(
    "mode %s duration %s reduced %s retains legacy active=%s",
    async (mode, duration, reduced, active) => {
      preferences.settings = {
        ...DEFAULT_CLIENT_SETTINGS,
        physicsMotion: mode,
        panelAnimationDurationMs: duration,
      };
      preferences.reduced = reduced;
      await act(() => {
        renderer = create(<SettingsProbe />);
      });
      expect(panelSettings).toEqual({
        active,
        physics: false,
        durationMs: duration,
        easing: "var(--ease-out)",
      });
    },
  );

  it("keeps physics inactive while the route suppresses panel transitions", async () => {
    await act(() => {
      renderer = create(
        <PanelAnimationSuppressionProvider value={true}>
          <SettingsProbe />
        </PanelAnimationSuppressionProvider>,
      );
    });
    expect(panelSettings).toMatchObject({ active: false, physics: true });
  });
});

afterEach(async () => {
  await act(() => renderer?.unmount());
  vi.unstubAllGlobals();
});

async function paintPendingFrame() {
  const callback = pendingFrames.shift();
  await act(() => callback?.(0));
}

describe("usePanelNavigationSuppression", () => {
  it("suppresses initial and navigated panel state until each route has painted", async () => {
    await act(() => {
      renderer = create(<SuppressionProbe navigationKey="/thread/one" />);
    });
    expect(observed.at(-1)).toBe(true);

    await paintPendingFrame();
    expect(observed.at(-1)).toBe(true);
    await paintPendingFrame();
    expect(observed.at(-1)).toBe(false);

    await act(() => {
      renderer?.update(<SuppressionProbe navigationKey="/thread/two" />);
    });
    expect(observed.at(-1)).toBe(true);

    await paintPendingFrame();
    expect(observed.at(-1)).toBe(true);
    await paintPendingFrame();
    expect(observed.at(-1)).toBe(false);
  });
});
