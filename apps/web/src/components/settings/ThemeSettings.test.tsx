/**
 * Exercises collection variant accessibility and independent appearance writes through the real menu.
 * @vitest-environment jsdom
 */
import { act, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { T3_CHAT_THEME, type ThemeDefinition, type ThemeHalves } from "../../themePalette";

vi.mock("../../hooks/useEnvironmentTheme", () => ({ useEnvironmentThemeDefinitions: () => [] }));
vi.mock("./ThemeImportDialog", () => ({ ThemeImportDialog: () => null }));
// Scope/navigation is outside this contract; the theme library and all menu primitives stay real.
vi.mock("./settingsLayout", () => ({
  SettingsRow: ({ children, control }: { children?: ReactNode; control?: ReactNode }) => (
    <div>
      {control}
      {children}
    </div>
  ),
}));

import { ThemeLibrary } from "./ThemeSettings";

const themes: ThemeDefinition[] = [
  {
    ...T3_CHAT_THEME,
    id: "calm",
    label: "Set Calm",
    appearance: "light",
    variants: { dark: T3_CHAT_THEME.colors },
    collection: { id: "set", label: "Set" },
  },
  {
    ...T3_CHAT_THEME,
    id: "bold",
    label: "Set Bold",
    appearance: "light",
    variants: { dark: T3_CHAT_THEME.colors },
    collection: { id: "set", label: "Set" },
  },
];

/** Holds the persisted halves at the public library boundary and exposes their observable values. */
function ThemeFixture() {
  const [halves, setHalves] = useState<ThemeHalves>({ light: "bold", dark: "bold" });
  return (
    <>
      <output data-testid="halves">{JSON.stringify(halves)}</output>
      <ThemeLibrary
        theme="system"
        appearanceMode="dark"
        initialAppearance="dark"
        customThemes={themes}
        themeHalves={halves}
        isImportOpen={false}
        setTheme={() => {
          throw new Error("A variant must not replace the whole theme");
        }}
        setAppearanceMode={() => true}
        refreshTheme={() => {}}
        onImportOpenChange={() => {}}
        setThemeHalf={(mode, themeId) => {
          setHalves((current) => ({ ...current, [mode]: themeId }));
          return true;
        }}
      />
    </>
  );
}

/** Finds the action by its explicit accessible name; a missing label is the regression under test. */
function namedAction(name: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[aria-label="${name}"]`);
  expect(element, `Missing accessible action: ${name}`).not.toBeNull();
  return element!;
}

afterEach(() => vi.unstubAllGlobals());

it("distinguishes same-name light/dark variants, reports selection, and changes only the chosen half", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ThemeFixture />));
    await act(async () => namedAction("Set: Theme actions").click());
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(
      [...document.querySelectorAll('[role^="menuitem"]')].filter(
        (item) => item.textContent === "Calm",
      ),
    ).toHaveLength(2);
    const light = namedAction("Use Calm for light mode");
    const dark = namedAction("Use Calm for dark mode");
    expect(light).not.toBe(dark);
    expect(light.getAttribute("role")).toBe("menuitemradio");
    expect(light.getAttribute("aria-checked")).toBe("false");
    expect(
      namedAction("Use Bold for light mode, currently active").getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      namedAction("Use Bold for dark mode, currently active").getAttribute("aria-checked"),
    ).toBe("true");
    await act(async () => light.click());
    expect(container.querySelector("output")?.textContent).toBe('{"light":"calm","dark":"bold"}');
    await act(async () => namedAction("Set: Theme actions").click());
    expect(
      namedAction("Use Calm for light mode, currently active").getAttribute("aria-checked"),
    ).toBe("true");
    expect(namedAction("Use Calm for dark mode").getAttribute("aria-checked")).toBe("false");
    await act(async () => namedAction("Use Calm for dark mode").click());
    expect(container.querySelector("output")?.textContent).toBe('{"light":"calm","dark":"calm"}');
  } finally {
    await act(() => root.unmount());
    container.remove();
  }
});
