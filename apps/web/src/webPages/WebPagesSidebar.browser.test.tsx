/** Exercises saved-page interactions against real settings and runtime stores with an isolated persistence boundary. */
import "../index.css";
import {
  DEFAULT_CLIENT_SETTINGS,
  type ClientSettings,
  type WebPageEntry,
} from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { act, render } from "../../test/render";
import { t } from "../i18n";

const mocks = vi.hoisted(() => ({
  getClientSettings: vi.fn<() => Promise<ClientSettings | null>>(),
  setClientSettings: vi.fn<(settings: ClientSettings) => Promise<void>>(),
  confirm: vi.fn<(message: string) => Promise<boolean>>(),
  navigate: vi.fn<(id: string, url: string) => Promise<void>>(),
}));
vi.mock("~/localApi", () => ({
  ensureLocalApi: () => ({ persistence: mocks }),
  readLocalApi: () => ({ dialogs: { confirm: mocks.confirm } }),
}));
vi.mock("~/components/preview/previewBridge", () => ({
  previewBridge: { navigate: mocks.navigate },
}));
vi.mock(import("~/env"), async (original) => ({ ...(await original()), isElectron: true }));

import {
  __resetClientSettingsPersistenceForTests,
  ensureClientSettingsHydrated,
  getClientSettings,
  persistClientSettingsUpdate,
} from "../hooks/useSettings";
import { useWebPageRuntimeStore } from "./webPageRuntimeStore";
import { WebPagesSidebar } from "./WebPagesSidebar";
import { WebPagesPage } from "./WebPagesPage";

const entries: WebPageEntry[] = [
  { id: "assistant", name: "My assistant", url: "https://chatgpt.com/" },
  { id: "research", name: "Research", url: "https://chat.deepseek.com/" },
];

/** Blocks the next real settings write; disposal drains accepted edits before test state resets. */
function blockNextSave() {
  let release!: () => void;
  let reject!: (error: Error) => void;
  const gate = new Promise<void>((resolve, rejectSave) => {
    release = resolve;
    reject = rejectSave;
  });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  mocks.setClientSettings.mockImplementationOnce(async () => {
    entered();
    await gate;
  });
  return {
    started,
    release,
    reject,
    async [Symbol.asyncDispose]() {
      release();
      await persistClientSettingsUpdate((settings) => settings);
    },
  };
}

it("keeps the current page until an added entry is persisted, then selects the new page", async () => {
  using _state = setup();
  await ensureClientSettingsHydrated();
  useWebPageRuntimeStore.getState().select("assistant");
  await using screen = await render(
    <>
      <WebPagesSidebar />
      <WebPagesPage />
    </>,
  );
  await using saving = blockNextSave();
  const originalSlot = screen.container.querySelector(
    '[data-browser-surface-slot="web-page:assistant"]',
  );
  expect(originalSlot).not.toBeNull();
  await screen.getByRole("button", { name: t.webPages.add, exact: true }).click();
  await page.getByRole("textbox", { name: t.webPages.url, exact: true }).fill("new.example");
  await page.getByRole("button", { name: t.webPages.save, exact: true }).click();
  await saving.started;
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  expect(getClientSettings().webPages).toEqual(entries);
  expect(useWebPageRuntimeStore.getState().activeId).toBe("assistant");
  await expect
    .element(screen.getByRole("textbox", { name: t.webPages.currentAddress }))
    .toHaveValue("https://chatgpt.com/");
  expect(screen.container.querySelector('[data-browser-surface-slot="web-page:assistant"]')).toBe(
    originalSlot,
  );
  await act(async () => {
    saving.release();
    await persistClientSettingsUpdate((settings) => settings);
  });
  await expect
    .element(screen.getByRole("textbox", { name: t.webPages.currentAddress }))
    .toHaveValue("https://new.example/");
  const saved = getClientSettings().webPages.find((entry) => entry.url === "https://new.example/");
  expect(saved).toBeDefined();
  expect(useWebPageRuntimeStore.getState().activeId).toBe(saved!.id);
  expect(useWebPageRuntimeStore.getState().opened[saved!.id]).toBe(true);
});

it("keeps the current selection and surface when adding fails to persist", async () => {
  using _state = setup();
  await ensureClientSettingsHydrated();
  useWebPageRuntimeStore.getState().select("assistant");
  await using screen = await render(
    <>
      <WebPagesSidebar />
      <WebPagesPage />
    </>,
  );
  using errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  await using saving = blockNextSave();
  const originalSlot = screen.container.querySelector(
    '[data-browser-surface-slot="web-page:assistant"]',
  );
  expect(originalSlot).not.toBeNull();
  await screen.getByRole("button", { name: t.webPages.add, exact: true }).click();
  await page.getByRole("textbox", { name: t.webPages.url, exact: true }).fill("failed.example");
  await page.getByRole("button", { name: t.webPages.save, exact: true }).click();
  await saving.started;
  await act(async () => {
    saving.reject(new Error("disk failed"));
    await persistClientSettingsUpdate((settings) => settings);
  });
  expect(errors).toHaveBeenCalledWith(
    "[CLIENT_SETTINGS] persist failed",
    expect.objectContaining({ operation: "persist" }),
  );
  expect(getClientSettings().webPages).toEqual(entries);
  expect(useWebPageRuntimeStore.getState().activeId).toBe("assistant");
  await expect
    .element(screen.getByRole("textbox", { name: t.webPages.currentAddress }))
    .toHaveValue("https://chatgpt.com/");
  expect(screen.container.querySelector('[data-browser-surface-slot="web-page:assistant"]')).toBe(
    originalSlot,
  );
});

it.each([
  {
    scenario: "navigates a running page when its URL changes",
    running: true,
    field: "url",
    value: "new.example",
    navigates: true,
    expectedName: "My assistant",
    expectedUrl: "https://new.example/",
  },
  {
    scenario: "does not navigate when only its name changes",
    running: true,
    field: "name",
    value: "Renamed",
    navigates: false,
    expectedName: "Renamed",
    expectedUrl: "https://chatgpt.com/",
  },
  {
    scenario: "does not navigate a paused page when its URL changes",
    running: false,
    field: "url",
    value: "new.example",
    navigates: false,
    expectedName: "My assistant",
    expectedUrl: "https://new.example/",
  },
])("$scenario", async ({ running, field, value, navigates, expectedName, expectedUrl }) => {
  using _state = setup();
  await ensureClientSettingsHydrated();
  useWebPageRuntimeStore.setState({ opened: running ? { assistant: true } : {} });
  await using screen = await render(<WebPagesSidebar />);
  await screen.getByRole("button", { name: t.webPages.moreActions("My assistant") }).click();
  await page.getByRole("menuitem", { name: t.webPages.edit, exact: true }).click();
  await page
    .getByRole("textbox", { name: field === "url" ? t.webPages.url : t.webPages.name, exact: true })
    .fill(value);
  await page.getByRole("button", { name: t.webPages.save, exact: true }).click();
  await act(() => persistClientSettingsUpdate((settings) => settings));
  expect(getClientSettings().webPages[0]).toEqual({
    id: "assistant",
    name: expectedName,
    url: expectedUrl,
  });
  expect(mocks.navigate.mock.calls).toEqual(
    navigates ? [["web-page:assistant", "https://new.example/"]] : [],
  );
});

/** Resets only this test's in-memory stores; persistence and confirmation never reach the desktop. */
function setup(pages: WebPageEntry[] = entries): Disposable {
  __resetClientSettingsPersistenceForTests();
  useWebPageRuntimeStore.setState({ activeId: null, opened: {}, navById: {}, faviconById: {} });
  mocks.getClientSettings
    .mockReset()
    .mockResolvedValue({ ...DEFAULT_CLIENT_SETTINGS, webPages: pages });
  mocks.setClientSettings.mockReset().mockResolvedValue(undefined);
  mocks.confirm.mockReset().mockResolvedValue(true);
  mocks.navigate.mockReset().mockResolvedValue(undefined);
  return {
    [Symbol.dispose]() {
      __resetClientSettingsPersistenceForTests();
      useWebPageRuntimeStore.setState({ activeId: null, opened: {}, navById: {}, faviconById: {} });
    },
  };
}

it("renders saved entries and filters by name and hostname, including no matches", async () => {
  using _state = setup();
  await ensureClientSettingsHydrated();
  await using screen = await render(<WebPagesSidebar />);
  await expect
    .element(screen.getByRole("button", { name: "My assistant chatgpt.com", exact: true }))
    .toBeVisible();
  const search = screen.getByRole("searchbox", { name: t.webPages.search });
  await search.fill("assistant");
  await expect.element(screen.getByText("Research", { exact: true })).not.toBeInTheDocument();
  await search.fill("DEEPSEEK");
  await expect.element(screen.getByText("Research", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("My assistant", { exact: true })).not.toBeInTheDocument();
  await search.fill("nothing-matches");
  await expect.element(screen.getByRole("status")).toHaveTextContent(t.webPages.noMatches);
});

it("selects and opens a saved page and exposes its running status", async () => {
  using _state = setup();
  await ensureClientSettingsHydrated();
  await using screen = await render(<WebPagesSidebar />);
  await screen.getByRole("button", { name: "My assistant chatgpt.com", exact: true }).click();
  expect(useWebPageRuntimeStore.getState().activeId).toBe("assistant");
  expect(useWebPageRuntimeStore.getState().opened).toEqual({ assistant: true });
  await expect.element(screen.getByText(t.webPages.running, { exact: true })).toBeInTheDocument();
});

it("offers pause only for a running page and unloads it without losing selection", async () => {
  using _state = setup();
  await ensureClientSettingsHydrated();
  useWebPageRuntimeStore.getState().select("assistant");
  await using screen = await render(<WebPagesSidebar />);
  await screen.getByRole("button", { name: t.webPages.moreActions("Research") }).click();
  await expect
    .element(page.getByRole("menuitem", { name: t.webPages.pause }))
    .not.toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  await screen.getByRole("button", { name: t.webPages.moreActions("My assistant") }).click();
  await page.getByRole("menuitem", { name: t.webPages.pause }).click();
  expect(useWebPageRuntimeStore.getState().opened).toEqual({});
  expect(useWebPageRuntimeStore.getState().activeId).toBe("assistant");
  await expect
    .element(screen.getByText(t.webPages.running, { exact: true }))
    .not.toBeInTheDocument();
});

it("removes a page from settings only after confirmation", async () => {
  using _state = setup();
  let confirmRemoval!: (confirmed: boolean) => void;
  mocks.confirm.mockReturnValue(
    new Promise<boolean>((resolve) => {
      confirmRemoval = resolve;
    }),
  );
  await ensureClientSettingsHydrated();
  await using screen = await render(<WebPagesSidebar />);
  await screen.getByRole("button", { name: t.webPages.moreActions("My assistant") }).click();
  await page.getByRole("menuitem", { name: t.webPages.remove, exact: true }).click();
  expect(mocks.confirm).toHaveBeenCalledWith(t.webPages.confirmDelete("My assistant"));
  expect(getClientSettings().webPages).toHaveLength(2);
  await act(() => confirmRemoval(true));
  await expect.element(screen.getByText("My assistant", { exact: true })).not.toBeInTheDocument();
  expect(getClientSettings().webPages.map((entry) => entry.id)).toEqual(["research"]);
});

it("does not flash an empty state or enable adding before settings have loaded", async () => {
  using _state = setup([]);
  let loadSettings!: (settings: ClientSettings) => void;
  mocks.getClientSettings.mockReturnValue(
    new Promise<ClientSettings>((resolve) => {
      loadSettings = resolve;
    }),
  );
  await using screen = await render(<WebPagesSidebar />);
  await expect
    .element(screen.getByRole("button", { name: t.webPages.add, exact: true }))
    .toBeDisabled();
  await expect.element(screen.getByText(t.webPages.emptyTitle)).not.toBeInTheDocument();
  await act(async () => {
    loadSettings({ ...DEFAULT_CLIENT_SETTINGS, webPages: [] });
    await ensureClientSettingsHydrated();
  });
  await expect.element(screen.getByText(t.webPages.emptyTitle)).toBeVisible();
});
