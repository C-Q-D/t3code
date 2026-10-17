/**
 * Verifies integration entry behavior, O1 ordering and real profile selection.
 * @vitest-environment jsdom
 */
import {
  DEFAULT_CLIENT_SETTINGS,
  DEFAULT_UNIFIED_SETTINGS,
  type DeviceServiceState,
} from "@t3tools/contracts";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { t } from "~/i18n";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

type SettingsModule = typeof import("../../hooks/useSettings");
type LayoutModule = typeof import("./settingsLayout");

const { listBrowserImportSources, updateSettings } = vi.hoisted(() => ({
  updateSettings: vi.fn(),
  listBrowserImportSources: vi.fn().mockResolvedValue([]),
}));

vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ render, children }: { render: ReactNode; children: ReactNode }) => (
    <>
      {render}
      {children}
    </>
  ),
  TooltipPopup: () => null,
}));
vi.mock("../preview/previewBridge", () => ({
  previewBridge: { listBrowserImportSources },
}));
vi.mock("../../env", () => ({ isElectron: true }));
vi.mock("../../state/environments", () => ({
  useEnvironments: () => ({ environments: [], isReady: true }),
  usePrimaryEnvironment: () => null,
  // Settings rows resolve the primary grant before rendering server controls.
  usePrimaryEnvironmentId: () => null,
}));
vi.mock("../../hooks/useSettings", async (importOriginal) => ({
  ...(await importOriginal<SettingsModule>()),
  PRIMARY_SETTINGS_UNAVAILABLE_MESSAGE: "Connect to an environment",
  useClientSettings: (selector?: (settings: typeof DEFAULT_CLIENT_SETTINGS) => unknown) =>
    selector ? selector(profileSettings) : profileSettings,
  useClientSettingsHydrated: () => true,
  usePrimarySettingsAvailable: () => true,
  usePrimarySettings: () => DEFAULT_UNIFIED_SETTINGS,
  useUpdatePrimarySettings: () => updateSettings,
}));
vi.mock("./settingsLayout", async (importOriginal) => ({
  ...(await importOriginal<LayoutModule>()),
  SettingsPageContainer: ({ children }: { children: ReactNode }) => children,
}));
// The scoped agent-access rows need the settings layout's scope provider;
// this test covers the device-local browser sections only.
vi.mock("./ProjectDefaultsSettings", () => ({ ProjectDefaultsSettings: () => null }));
vi.mock("./SettingsScopeContext", () => ({
  useSettingsScope: () => ({
    scope: { kind: "all", environmentIds: [] },
    search: {},
    environment: null,
    environments: [],
    target: null,
    connectedEnvironments: [],
    targets: [],
  }),
  useOptionalSettingsScope: () => null,
}));

import { IntegrationsSettingsPanel } from "./IntegrationsSettings";
import { platformSetupStatus } from "../device/DeviceSetup";

let renderer: ReactTestRenderer | undefined;
let domRoot: Root | undefined;
let profileSettings = { ...DEFAULT_CLIENT_SETTINGS };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  listBrowserImportSources.mockClear();
  updateSettings.mockClear();
  profileSettings = { ...DEFAULT_CLIENT_SETTINGS };
});

afterEach(async () => {
  await act(() => renderer?.unmount());
  await act(() => domRoot?.unmount());
  domRoot = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function openSettings() {
  const router = createRouter({
    routeTree: createRootRoute({ component: IntegrationsSettingsPanel }),
    history: createMemoryHistory(),
  });
  await router.load();
  await act(() => {
    renderer = create(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );
  });
  expect(renderer!.root.findByType(IntegrationsSettingsPanel)).toBeDefined();
}

describe("Integrations browser discovery", () => {
  it("does not scan browser files when entering or revisiting settings", async () => {
    await openSettings();
    expect(listBrowserImportSources).not.toHaveBeenCalled();

    await act(() => renderer?.unmount());
    await openSettings();
    expect(listBrowserImportSources).not.toHaveBeenCalled();
  });

  it("selects a real browser profile and writes its id as the default", async () => {
    profileSettings = {
      ...DEFAULT_CLIENT_SETTINGS,
      browserProfiles: [{ id: "profile-work", name: "Work", kind: "persistent" }],
    };
    const container = document.createElement("div");
    document.body.append(container);
    domRoot = createRoot(container);
    const router = createRouter({
      routeTree: createRootRoute({ component: IntegrationsSettingsPanel }),
      history: createMemoryHistory(),
    });
    await router.load();
    await act(() => domRoot!.render(<RouterProvider router={router} />));

    const trigger = document.querySelector<HTMLButtonElement>(
      `button[aria-label="${t.settings.rows.browserDefaultProfile.title}"]`,
    );
    expect(trigger).not.toBeNull();
    await act(() => trigger!.click());
    const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (element) => element.textContent === "Work",
    );
    expect(option).toBeDefined();
    await act(() => option!.click());
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
      browserDefaultProfileId: "profile-work",
    });
  });

  it("places devices before browser profiles, recording and links as specified by O1", async () => {
    await openSettings();
    const sections = renderer!.root
      .findAll((node) => node.type === "section")
      .map((node) => node.props.id)
      .filter(Boolean);
    // O1: browser access (mocked above), devices, profiles, recording, links.
    expect(sections).toEqual(["devices", "browser", "browser-recording", "browser-links"]);
  });
});

const deviceState = (overrides: Partial<DeviceServiceState> = {}): DeviceServiceState => ({
  hosts: [
    {
      id: "local",
      kind: "local",
      label: "This machine",
      hubInstalled: false,
      agentDeviceInstalled: false,
      platforms: [
        { platform: "ios", available: true },
        { platform: "android", available: true },
      ],
    },
  ],
  hostStatus: "ready",
  hostStatuses: {},
  devices: [],
  sessions: [],
  onboardingCompleted: false,
  agentAccessEnabled: false,
  hubBasePath: "/api/device-hub",
  revision: 0,
  ...overrides,
});

describe("device setup guidance", () => {
  it("directs users to install an iOS runtime and create an Android virtual device", () => {
    expect(platformSetupStatus(deviceState(), "ios").message).toContain("Xcode Settings");
    expect(platformSetupStatus(deviceState(), "android").message).toContain("Device Manager");
  });

  it("preserves a specific missing-tool explanation from the server", () => {
    const state = deviceState({
      hosts: [
        {
          ...deviceState().hosts[0]!,
          platforms: [
            { platform: "ios", available: true },
            { platform: "android", available: false, reason: "Android Emulator is missing." },
          ],
        },
      ],
    });
    expect(platformSetupStatus(state, "android").message).toBe("Android Emulator is missing.");
  });
});
