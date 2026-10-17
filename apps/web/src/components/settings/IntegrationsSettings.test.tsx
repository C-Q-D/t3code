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
import { act, StrictMode, useSyncExternalStore, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { t } from "~/i18n";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

type SettingsModule = typeof import("../../hooks/useSettings");
type LayoutModule = typeof import("./settingsLayout");

const { listBrowserImportSources, importBrowserCookies, updateSettings, availability } = vi.hoisted(
  () => ({
    availability: { hydrated: true, desktop: true },
    importBrowserCookies: vi.fn(),
    updateSettings: vi.fn(),
    listBrowserImportSources: vi.fn().mockResolvedValue([]),
  }),
);

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
  previewBridge: { listBrowserImportSources, importBrowserCookies },
}));
vi.mock("../../env", () => ({
  get isElectron() {
    return availability.desktop;
  },
}));
vi.mock("../../state/environments", () => ({
  useEnvironments: () => ({ environments: [], isReady: true }),
  usePrimaryEnvironment: () => ({ environmentId: "test-environment", label: "Test" }),
  // Settings rows resolve the primary grant before rendering server controls.
  usePrimaryEnvironmentId: () => null,
}));
vi.mock("../../hooks/useSettings", async (importOriginal) => ({
  ...(await importOriginal<SettingsModule>()),
  PRIMARY_SETTINGS_UNAVAILABLE_MESSAGE: "Connect to an environment",
  useClientSettings: (selector?: (settings: typeof DEFAULT_CLIENT_SETTINGS) => unknown) => {
    const settings = useSyncExternalStore(subscribeSettings, () => profileSettings);
    return selector ? selector(settings) : settings;
  },
  getClientSettings: () => profileSettings,
  useClientSettingsHydrated: () => availability.hydrated,
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
const settingsListeners = new Set<() => void>();

/** Subscribes the real DOM to the fake persistence boundary; updates preserve React state. */
function subscribeSettings(listener: () => void) {
  settingsListeners.add(listener);
  return () => {
    settingsListeners.delete(listener);
  };
}

/** Supplies an external settings update, including rename/deletion from another client. */
async function changeSettings(patch: Partial<typeof DEFAULT_CLIENT_SETTINGS>) {
  await act(() => {
    profileSettings = { ...profileSettings, ...patch };
    settingsListeners.forEach((listener) => listener());
  });
}

/** Mounts the production panel and UI primitives; only service boundaries are faked. */
async function openDomSettings() {
  const container = document.createElement("div");
  document.body.append(container);
  domRoot = createRoot(container);
  const router = createRouter({
    routeTree: createRootRoute({ component: IntegrationsSettingsPanel }),
    history: createMemoryHistory(),
  });
  await router.load();
  await act(() => domRoot!.render(<RouterProvider router={router} />));
}

/** Finds a visible control by its accessible label, failing when the required UI is absent. */
function labelledButton(label: string) {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  return button!;
}

/** Finds a rendered button or menu option by its visible text within the given surface. */
function textControl(text: string, scope: ParentNode = document) {
  const control = Array.from(
    scope.querySelectorAll<HTMLElement>('button, [role="menuitem"], [role="option"]'),
  ).find((element) => element.textContent?.trim() === text);
  expect(control).toBeDefined();
  return control!;
}

/** Opens the real default-profile picker and chooses a visible option. */
async function chooseProfile(name: string) {
  await act(() => labelledButton(t.settings.rows.browserDefaultProfile.title).click());
  const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(
    (element) => element.textContent === name,
  );
  expect(option).toBeDefined();
  await act(() => option!.click());
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  listBrowserImportSources.mockClear();
  updateSettings.mockReset();
  updateSettings.mockImplementation((patch: Partial<typeof DEFAULT_CLIENT_SETTINGS>) => {
    profileSettings = { ...profileSettings, ...patch };
    settingsListeners.forEach((listener) => listener());
  });
  availability.hydrated = true;
  availability.desktop = true;
  importBrowserCookies.mockReset();
  listBrowserImportSources.mockResolvedValue([]);
  profileSettings = { ...DEFAULT_CLIENT_SETTINGS };
});

afterEach(async () => {
  await act(() => renderer?.unmount());
  await act(() => domRoot?.unmount());
  domRoot = undefined;
  renderer = undefined;
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
    await openDomSettings();

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

describe("integration control behavior", () => {
  beforeEach(() => {
    profileSettings = {
      ...DEFAULT_CLIENT_SETTINGS,
      browserProfiles: [{ id: "profile-work", name: "Work", kind: "persistent" }],
    };
  });

  it.each(["not hydrated", "disabled"])(
    "does not change the default profile when %s",
    async (state) => {
      availability.hydrated = state !== "not hydrated";
      availability.desktop = state !== "disabled";
      await openDomSettings();
      const trigger = labelledButton(t.settings.rows.browserDefaultProfile.title);
      expect(trigger.disabled).toBe(true);
      await act(() => trigger.click());
      expect(document.querySelector('[role="option"]')).toBeNull();
      expect(updateSettings).not.toHaveBeenCalled();
    },
  );

  it("does not offer incognito as a default profile", async () => {
    await openDomSettings();
    await act(() => labelledButton(t.settings.rows.browserDefaultProfile.title).click());
    expect(
      Array.from(document.querySelectorAll('[role="option"]')).map((option) => option.textContent),
    ).toEqual(["Default", "Work"]);
  });

  it("restores the built-in default profile", async () => {
    profileSettings = { ...profileSettings, browserDefaultProfileId: "profile-work" };
    await openDomSettings();
    expect(labelledButton(t.settings.rows.browserDefaultProfile.title).textContent).toContain(
      "Work",
    );
    await act(() =>
      labelledButton(
        t.common.resetLabelToDefault(t.settings.rows.browserDefaultProfile.title),
      ).click(),
    );
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({ browserDefaultProfileId: "default" });
    expect(labelledButton(t.settings.rows.browserDefaultProfile.title).textContent).toContain(
      "Default",
    );
  });

  it("shows a renamed current profile and keeps writing its stable id", async () => {
    profileSettings = { ...profileSettings, browserDefaultProfileId: "profile-work" };
    await openDomSettings();
    await changeSettings({
      browserProfiles: [{ id: "profile-work", name: "Renamed", kind: "persistent" }],
    });
    expect(labelledButton(t.settings.rows.browserDefaultProfile.title).textContent).toContain(
      "Renamed",
    );
    await chooseProfile("Default");
    updateSettings.mockClear();
    await chooseProfile("Renamed");
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
      browserDefaultProfileId: "profile-work",
    });
    expect(labelledButton(t.settings.rows.browserDefaultProfile.title).textContent).toContain(
      "Renamed",
    );
  });

  it("falls back after the current profile is deleted and only writes an existing id", async () => {
    profileSettings = { ...profileSettings, browserDefaultProfileId: "profile-work" };
    await openDomSettings();
    await changeSettings({
      browserProfiles: [{ id: "profile-home", name: "Home", kind: "persistent" }],
    });
    expect(labelledButton(t.settings.rows.browserDefaultProfile.title).textContent).toContain(
      "Default",
    );
    await act(() => labelledButton(t.settings.rows.browserDefaultProfile.title).click());
    expect(
      Array.from(document.querySelectorAll('[role="option"]')).map((option) => option.textContent),
    ).toEqual(["Default", "Home"]);
    await act(() => textControl("Home").click());
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
      browserDefaultProfileId: "profile-home",
    });
    expect(labelledButton(t.settings.rows.browserDefaultProfile.title).textContent).toContain(
      "Home",
    );
  });

  it("keeps the default profile read-only during a real import", async () => {
    listBrowserImportSources.mockResolvedValue([
      { id: "helium", name: "Helium", profiles: [{ directory: "Default", name: "You" }] },
    ]);
    let finishImport!: (value: {
      imported: number;
      skipped: number;
      skippedDomains: string[];
    }) => void;
    importBrowserCookies.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishImport = resolve;
        }),
    );
    await openDomSettings();
    await act(() => textControl(t.settings.integrations.profiles.add).click());
    await act(() => textControl("Helium").click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    const target = Array.from(dialog.querySelectorAll("button")).find((button) =>
      button.textContent?.startsWith("Work"),
    );
    expect(target).toBeDefined();
    await act(() => target!.click());
    await act(() => textControl(t.settings.browserImportWizard.import, dialog).click());
    expect(importBrowserCookies).toHaveBeenCalledOnce();
    try {
      const trigger = labelledButton(t.settings.rows.browserDefaultProfile.title);
      expect(trigger.disabled).toBe(true);
      await act(() => trigger.click());
      expect(updateSettings).not.toHaveBeenCalled();
    } finally {
      await act(async () => finishImport({ imported: 0, skipped: 0, skippedDomains: [] }));
    }
    expect(labelledButton(t.settings.rows.browserDefaultProfile.title).disabled).toBe(false);
  });

  it("writes the selected appearance and keeps it selected on a second click", async () => {
    await openDomSettings();
    const row = document.getElementById("browser-default-appearance")!;
    const dark = textControl(t.settings.rows.browserDefaultAppearance.options.dark, row);
    await act(() => dark.click());
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({ browserDefaultAppearance: "dark" });
    expect(dark.getAttribute("aria-pressed")).toBe("true");
    updateSettings.mockClear();
    await act(() => dark.click());
    expect(dark.getAttribute("aria-pressed")).toBe("true");
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("does not change appearance when disabled", async () => {
    availability.desktop = false;
    await openDomSettings();
    const row = document.getElementById("browser-default-appearance")!;
    const dark = textControl(t.settings.rows.browserDefaultAppearance.options.dark, row);
    expect((dark as HTMLButtonElement).disabled).toBe(true);
    await act(() => dark.click());
    expect(updateSettings).not.toHaveBeenCalled();
    expect(
      textControl(t.settings.rows.browserDefaultAppearance.options.system, row).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
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
