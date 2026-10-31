/**
 * @vitest-environment jsdom
 * Exercises snapshot sound through the real DOM switch and client-settings persistence path.
 * Only desktop I/O and route layout are replaced; React, settings hooks and controls stay real.
 */
import {
  DEFAULT_CLIENT_SETTINGS,
  type ClientSettings,
  type DesktopSnapShotState,
} from "@t3tools/contracts";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { t } from "~/i18n";

type AtomReactModule = typeof import("@effect/atom-react");

const persistence = vi.hoisted(() => ({
  saved: null as ClientSettings | null,
}));
vi.mock("~/localApi", () => ({
  ensureLocalApi: () => ({
    persistence: {
      getClientSettings: async () => persistence.saved,
      setClientSettings: async (settings: ClientSettings) => {
        persistence.saved = structuredClone(settings);
      },
    },
  }),
}));
// Capture availability is fixture data; the sound toggle still uses real settings persistence.
vi.mock("@effect/atom-react", async (importOriginal) => {
  const actual = await importOriginal<AtomReactModule>();
  const { desktopSnapShotAtom } = await import("../../state/desktopSnapShot");
  return {
    ...actual,
    useAtomValue: (atom: unknown) =>
      atom === desktopSnapShotAtom ? { state: desktopState, refreshError: null } : [],
  };
});
vi.mock("../../lib/desktopSnapShot", () => ({
  getDesktopSnapShotBridge: () => desktopBridge,
}));
vi.mock("./settingsLayout", () => ({
  /** Omits route context while retaining the actual page's controls and child content. */
  SettingsPageContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  /** Section decoration does not participate in saving sound preferences. */
  SettingsSection: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  /** This fixture supplies an available desktop; availability is decided by the real page. */
  SettingsUnavailableGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  /** Keeps the real control tree, including the sound selector, without environment-scope hooks. */
  SettingsRow: ({ control, children }: { control?: ReactNode; children?: ReactNode }) => (
    <div>
      {control}
      {children}
    </div>
  ),
}));

import { SnapShotSettings } from "./SnapShotSettings";
import {
  __resetClientSettingsPersistenceForTests,
  getClientSettings,
} from "../../hooks/useSettings";

const desktopState: DesktopSnapShotState = {
  mode: "direct",
  shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
  shortcutRegistered: true,
  shortcutMessage: null,
  message: null,
};
const desktopBridge = {
  getSnapShotState: async () => desktopState,
  setSnapShotShortcutSuppressed: async () => {},
  onSnapShotEvent: () => () => {},
};
let container: HTMLDivElement;
let root: Root;

/** Finds the sound switch by its public accessible name; missing controls fail before interaction. */
function soundSwitch(): HTMLElement {
  const element = container.querySelector<HTMLElement>(
    `[role="switch"][aria-label="${t.settings.rows.snapShotSound.title}"]`,
  );
  if (!element) throw new Error("Snapshot sound switch was not rendered");
  return element;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  __resetClientSettingsPersistenceForTests();
  persistence.saved = {
    ...DEFAULT_CLIENT_SETTINGS,
    snapShotEnabled: true,
    snapShotPlaySound: true,
    snapShotSound: "camera-shutter",
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  __resetClientSettingsPersistenceForTests();
  vi.unstubAllGlobals();
});

it("turns capture sound off and back on without replacing the selected sound", async () => {
  await act(async () => root.render(<SnapShotSettings />));
  expect(soundSwitch().getAttribute("aria-checked")).toBe("true");
  expect(getClientSettings().snapShotSound).toBe("camera-shutter");

  await act(async () => soundSwitch().click());
  expect(soundSwitch().getAttribute("aria-checked")).toBe("false");
  expect(getClientSettings().snapShotPlaySound).toBe(false);
  expect(getClientSettings().snapShotSound).toBe("camera-shutter");
  expect(persistence.saved?.snapShotPlaySound).toBe(false);
  expect(persistence.saved?.snapShotSound).toBe("camera-shutter");

  await act(async () => soundSwitch().click());
  expect(soundSwitch().getAttribute("aria-checked")).toBe("true");
  expect(getClientSettings().snapShotPlaySound).toBe(true);
  expect(getClientSettings().snapShotSound).toBe("camera-shutter");
  expect(persistence.saved?.snapShotPlaySound).toBe(true);
  expect(persistence.saved?.snapShotSound).toBe("camera-shutter");
});
