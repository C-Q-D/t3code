/** Exercises theme import persistence and cancellation across dialog lifetimes. */
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { act, render } from "../../../test/render";
import {
  CUSTOM_THEMES_STORAGE_KEY,
  getCustomThemes,
  installCustomTheme,
  invalidateCustomThemes,
  parseThemeFile,
  THEME_FILE_VERSION,
} from "../../themePalette";
import type { OpenVsxThemeExtension } from "../../openVsxThemes";
import { ThemeImportDialog } from "./ThemeImportDialog";

type InputModule = typeof import("../ui/input");

const { searchOpenVsxThemes, importOpenVsxThemeExtension } = vi.hoisted(() => ({
  searchOpenVsxThemes: vi.fn(),
  importOpenVsxThemeExtension: vi.fn(),
}));

vi.mock("../../state/server", async () => {
  const { Atom } = await import("effect/reactivity");
  return { primaryServerEnvironmentThemesAtom: Atom.make([]) };
});

// Theme imports do not use composer drafts; utils only needs its ID constructor.
vi.mock("../../composerDraftStore", async () => {
  const Schema = await import("effect/Schema");
  return { DraftId: Schema.String.pipe(Schema.brand("DraftId")) };
});

// These tests exercise import cancellation, not the unrelated field-validation adapter.
vi.mock("../ui/input", async (importOriginal) => {
  const actual = await importOriginal<InputModule>();
  return {
    ...actual,
    Input: (props: React.ComponentProps<typeof actual.Input>) => (
      <actual.Input {...props} nativeInput />
    ),
  };
});

vi.mock("../../openVsxThemes", () => ({
  searchOpenVsxThemes,
  importOpenVsxThemeExtension,
}));

const extension: OpenVsxThemeExtension = {
  id: "acme.nightfall",
  collectionId: "acme.nightfall",
  name: "Nightfall",
  publisher: "acme",
  description: "A dark theme",
  downloadCount: 10,
  iconUrl: null,
  sourceUrl: null,
  manifestUrl: "https://example.test/manifest",
  sha256Url: "https://example.test/sha256",
  vsixUrl: "https://example.test/vsix",
  version: "1.0.0",
  license: "MIT",
};

describe("ThemeImportDialog", () => {
  // StrictMode replays ref attach/detach on mount, which must not end the session.
  it("searches Open VSX under StrictMode", async () => {
    searchOpenVsxThemes.mockReset();
    searchOpenVsxThemes.mockResolvedValue([extension]);
    await using _screen = await render(
      <StrictMode>
        <ThemeImportDialog
          open
          onOpenChange={() => {}}
          onImported={() => true}
          onImportedMany={() => {}}
        />
      </StrictMode>,
    );

    await userEvent.type(page.getByLabelText("Search Open VSX themes"), "night");

    await expect.element(page.getByRole("heading", { name: "Nightfall" })).toBeVisible();
    expect(searchOpenVsxThemes).toHaveBeenCalledWith(
      "night",
      expect.objectContaining({ sortBy: "downloadCount" }),
    );
  });
});

const theme = (name: string, accent = "#3b82f6") => ({
  version: THEME_FILE_VERSION,
  name,
  appearance: "dark",
  colors: { accent },
});

const themeFile = (name: string, accent?: string) =>
  new File([JSON.stringify(theme(name, accent))], `${name}.json`, { type: "application/json" });

/** Lets a test finish external file or extension I/O only after the dialog leaves. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

it.each(["parent close", "unmount"] as const)(
  "discards a delayed Open VSX install after %s",
  async (leave) => {
    searchOpenVsxThemes.mockReset().mockResolvedValue([extension]);
    const pending = deferred<ReturnType<typeof parseThemeFile>[]>();
    importOpenVsxThemeExtension.mockReset().mockReturnValue(pending.promise);
    using _themes = {
      [Symbol.dispose]() {
        window.localStorage.removeItem(CUSTOM_THEMES_STORAGE_KEY);
        invalidateCustomThemes();
      },
    };
    const onImported = vi.fn(() => true);
    const onImportedMany = vi.fn();
    const props = { onOpenChange: vi.fn(), onImported, onImportedMany };
    await using screen = await render(<ThemeImportDialog open {...props} />);
    await userEvent.type(page.getByLabelText("Search Open VSX themes"), "night");
    await page.getByRole("button", { name: "Install Nightfall", exact: true }).click();
    await expect.element(page.getByRole("button", { name: "Installing Nightfall" })).toBeVisible();

    if (leave === "unmount") await screen.unmount();
    else await screen.rerender(<ThemeImportDialog open={false} {...props} />);
    await act(async () => {
      pending.resolve([
        parseThemeFile({
          ...theme("Nightfall"),
          collection: { id: extension.collectionId, label: "Nightfall" },
        }),
      ]);
      await pending.promise;
    });

    expect(getCustomThemes()).toEqual([]);
    expect(onImported).not.toHaveBeenCalled();
    expect(onImportedMany).not.toHaveBeenCalled();
  },
);

it.each(["parent close", "unmount"] as const)(
  "discards a delayed file batch after %s",
  async (leave) => {
    searchOpenVsxThemes.mockReset().mockResolvedValue([]);
    using _themes = {
      [Symbol.dispose]() {
        window.localStorage.removeItem(CUSTOM_THEMES_STORAGE_KEY);
        invalidateCustomThemes();
      },
    };
    const pending = deferred<string>();
    const onImported = vi.fn(() => true);
    const onImportedMany = vi.fn();
    const props = { onOpenChange: vi.fn(), onImported, onImportedMany };
    await using screen = await render(<ThemeImportDialog open {...props} />);
    using _read = vi
      .spyOn(File.prototype, "text")
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(JSON.stringify(theme("Dawn")));
    await userEvent.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, [
      themeFile("Nightfall"),
      themeFile("Dawn"),
    ]);

    if (leave === "unmount") await screen.unmount();
    else await screen.rerender(<ThemeImportDialog open={false} {...props} />);
    await act(async () => {
      pending.resolve(JSON.stringify(theme("Nightfall")));
      await pending.promise;
    });

    expect(getCustomThemes()).toEqual([]);
    expect(onImported).not.toHaveBeenCalled();
    expect(onImportedMany).not.toHaveBeenCalled();
  },
);

it.each(["Update existing", "Keep both"])(
  "keeps batch failures visible after %s",
  async (choice) => {
    using _themes = {
      [Symbol.dispose]() {
        window.localStorage.removeItem(CUSTOM_THEMES_STORAGE_KEY);
        invalidateCustomThemes();
      },
    };
    installCustomTheme(parseThemeFile(theme("Dusk")));
    const onOpenChange = vi.fn();
    await using _screen = await render(
      <ThemeImportDialog
        open
        onOpenChange={onOpenChange}
        onImported={() => true}
        onImportedMany={() => {}}
      />,
    );
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(input, [
      themeFile("Dawn"),
      themeFile("Dusk", "#f97316"),
      new File(["{"], "broken.json", { type: "application/json" }),
    ]);

    await expect.element(page.getByText("Already installed")).toBeVisible();
    await expect.element(page.getByText(/^broken\.json:/)).toBeVisible();
    expect(getCustomThemes().map((theme) => theme.label)).toContain("Dawn");
    await page.getByRole("button", { name: choice }).click();
    invalidateCustomThemes();
    const label = choice === "Update existing" ? "Dusk" : "Dusk (1)";
    expect(getCustomThemes().find((theme) => theme.label === label)?.colors).toEqual(
      parseThemeFile(theme("Dusk", "#f97316")).colors,
    );
    await expect.element(page.getByText(/^broken\.json:/)).toBeVisible();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  },
);
