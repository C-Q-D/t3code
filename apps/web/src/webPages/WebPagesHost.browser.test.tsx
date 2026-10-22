/** Exercises personal-page lifetimes through real settings, sessions and leases with a desktop IPC fake. */
import {
  DEFAULT_CLIENT_SETTINGS,
  type ClientSettings,
  type DesktopPreviewBridge,
  type DesktopPreviewTabState,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { act, fakeTimers, render } from "../../test/render";

const mocks = vi.hoisted(() => ({
  getClientSettings: vi.fn<() => Promise<ClientSettings | null>>(),
  setClientSettings: vi.fn<(settings: ClientSettings) => Promise<void>>(),
  createTab: vi.fn<DesktopPreviewBridge["createTab"]>(),
  closeTab: vi.fn<DesktopPreviewBridge["closeTab"]>(),
  registerWebview: vi.fn<DesktopPreviewBridge["registerWebview"]>(),
  getPreviewConfig: vi.fn<DesktopPreviewBridge["getPreviewConfig"]>(),
  onStateChange: vi.fn<DesktopPreviewBridge["onStateChange"]>(),
  onOpenLink: vi.fn<DesktopPreviewBridge["onOpenLink"]>(),
  openExternal: vi.fn<(url: string) => Promise<void>>(),
}));
vi.mock(import("~/env"), async (original) => ({ ...(await original()), isElectron: true }));
vi.mock(import("~/localApi"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    ensureLocalApi: () => ({ ...actual.ensureLocalApi(), persistence: mocks as never }),
    readLocalApi: () => ({
      ...actual.ensureLocalApi(),
      shell: { ...actual.ensureLocalApi().shell, openExternal: mocks.openExternal },
    }),
  };
});
vi.mock(import("~/components/preview/previewBridge"), () => ({ previewBridge: mocks as never }));

import {
  __resetClientSettingsPersistenceForTests,
  ensureClientSettingsHydrated,
  updateClientSettings,
} from "~/hooks/useSettings";
import { AppAtomRegistryProvider } from "~/rpc/atomRegistry";
import { useWebPageRuntimeStore } from "./webPageRuntimeStore";
import {
  forgetWebPageSession,
  readWebPageFavicon,
  rememberWebPageUrl,
  resolveWebPageStartUrl,
} from "./webPageSession";
import { WebPagesHost } from "./WebPagesHost";

const chat = { id: "l2-chat", name: "Chat", url: "https://chatgpt.com/" };
const deep = { id: "l2-deep", name: "Deep", url: "https://chat.deepseek.com/" };

/** Resets IPC and local state; each test owns only its two session hints. */
function setup(): Disposable {
  __resetClientSettingsPersistenceForTests();
  useWebPageRuntimeStore.setState({ activeId: null, opened: {}, navById: {}, faviconById: {} });
  forgetWebPageSession(chat.id);
  forgetWebPageSession(deep.id);
  mocks.getClientSettings
    .mockReset()
    .mockResolvedValue({ ...DEFAULT_CLIENT_SETTINGS, webPages: [deep, chat] });
  mocks.setClientSettings.mockReset().mockResolvedValue(undefined);
  mocks.createTab.mockReset().mockResolvedValue(undefined);
  mocks.closeTab.mockReset().mockResolvedValue(undefined);
  mocks.registerWebview.mockReset().mockResolvedValue(undefined);
  mocks.getPreviewConfig.mockReset().mockResolvedValue({
    partition: "persist:web-pages-test",
    webPreferences: "contextIsolation=yes",
    preloadUrl: "file:///page-preload.js",
  });
  mocks.onStateChange.mockReset().mockReturnValue(() => undefined);
  mocks.onOpenLink.mockReset().mockReturnValue(() => undefined);
  mocks.openExternal.mockReset().mockResolvedValue(undefined);
  return {
    [Symbol.dispose]() {
      __resetClientSettingsPersistenceForTests();
      useWebPageRuntimeStore.setState({ activeId: null, opened: {}, navById: {}, faviconById: {} });
      forgetWebPageSession(chat.id);
      forgetWebPageSession(deep.id);
    },
  };
}

/** Unmounts before draining lease-close timers, even when a browser assertion fails. */
async function renderHost() {
  await using stack = new AsyncDisposableStack();
  const screen = stack.use(
    await render(
      <AppAtomRegistryProvider>
        <WebPagesHost />
      </AppAtomRegistryProvider>,
    ),
  );
  stack.defer(async () => {
    using _timers = fakeTimers();
    await screen.unmount();
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(() => ensureClientSettingsHydrated());
  const lifetime = stack.move();
  return { container: screen.container, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

/** Desktop state fixture leaves each test's navigation transition explicit. */
function desktopState(navStatus: DesktopPreviewTabState["navStatus"]): DesktopPreviewTabState {
  return {
    tabId: "web-page:l2-chat",
    webContentsId: 42,
    navStatus,
    canGoBack: true,
    canGoForward: false,
    zoomFactor: 1,
    pictureInPicture: false,
    colorScheme: "system",
    audioMuted: false,
    audible: false,
    controller: "human",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("WebPagesHost", () => {
  it("creates only opened saved pages, with local-only tabs and the personal partition", async () => {
    using _state = setup();
    rememberWebPageUrl(chat, "https://chatgpt.com/c/saved");
    useWebPageRuntimeStore.getState().open(chat.id);
    useWebPageRuntimeStore.getState().open("missing");
    await using screen = await renderHost();
    await vi.waitFor(() => expect(screen.container.querySelectorAll("webview")).toHaveLength(1));
    expect(mocks.createTab).toHaveBeenCalledExactlyOnceWith("web-page:l2-chat", {
      zoomFactor: 1,
      colorScheme: "system",
    });
    expect(mocks.getPreviewConfig).toHaveBeenCalledWith("web-pages", "web-pages");
    const guest = screen.container.querySelector("webview")!;
    expect(guest.getAttribute("src")).toBe("https://chatgpt.com/c/saved");
    expect(guest.getAttribute("partition")).toBe("persist:web-pages-test");
    expect(guest.getAttribute("webpreferences")).toBe("contextIsolation=yes");
    expect(guest.getAttribute("preload")).toBe("file:///page-preload.js");
    expect(guest.getAttribute("allowpopups")).toBe("true");
    Object.defineProperty(guest, "getWebContentsId", { value: () => 42 });
    guest.dispatchEvent(new Event("did-attach"));
    await vi.waitFor(() =>
      expect(mocks.registerWebview).toHaveBeenCalledWith("web-page:l2-chat", 42),
    );
  });

  it("closes a paused page and recreates it at its last visited address", async () => {
    using _state = setup();
    useWebPageRuntimeStore.getState().open(chat.id);
    await using screen = await renderHost();
    await vi.waitFor(() => expect(screen.container.querySelectorAll("webview")).toHaveLength(1));
    const original = screen.container.querySelector("webview");
    await act(() =>
      mocks.onStateChange.mock.calls[0]![0](
        "web-page:l2-chat",
        desktopState({ kind: "Success", url: "https://chatgpt.com/c/latest", title: "Latest" }),
      ),
    );
    using _timers = fakeTimers();
    await act(() => useWebPageRuntimeStore.getState().pause(chat.id));
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.container.querySelectorAll("webview")).toHaveLength(0);
    expect(mocks.closeTab).toHaveBeenCalledExactlyOnceWith("web-page:l2-chat");
    await act(() => useWebPageRuntimeStore.getState().open(chat.id));
    expect(mocks.createTab).toHaveBeenCalledTimes(2);
    expect(screen.container.querySelector("webview")).not.toBe(original);
    expect(screen.container.querySelector("webview")?.getAttribute("src")).toBe(
      "https://chatgpt.com/c/latest",
    );
  });

  it("sends only personal-page new-tab links to the system browser without navigating the guest", async () => {
    using _state = setup();
    useWebPageRuntimeStore.getState().open(chat.id);
    await using screen = await renderHost();
    await vi.waitFor(() => expect(screen.container.querySelectorAll("webview")).toHaveLength(1));
    const emit = mocks.onOpenLink.mock.calls[0]![0];
    await act(() =>
      emit({ tabId: "thread-tab", url: "https://example.com/ignored", background: false }),
    );
    expect(mocks.openExternal).not.toHaveBeenCalled();
    await act(() =>
      emit({ tabId: "web-page:l2-chat", url: "https://example.com/external", background: true }),
    );
    expect(mocks.openExternal).toHaveBeenCalledExactlyOnceWith("https://example.com/external");
    expect(screen.container.querySelector("webview")?.getAttribute("src")).toBe(
      "https://chatgpt.com/",
    );
  });

  it("projects events into navigation and favicon state without duplicate updates or storage writes", async () => {
    using _state = setup();
    useWebPageRuntimeStore.getState().open(chat.id);
    await using screen = await renderHost();
    await vi.waitFor(() => expect(screen.container.querySelectorAll("webview")).toHaveLength(1));
    const emit = mocks.onStateChange.mock.calls[0]![0];
    const state = {
      ...desktopState({ kind: "Loading", url: "https://chatgpt.com/c/new", title: "New" }),
      favicon: {
        pageUrl: "https://chatgpt.com/",
        dataUrl: "data:image/png;base64,YQ==",
        capturedAt: 1,
      },
    };
    await act(() => emit("thread-tab", state));
    await act(() => emit("web-page:missing", state));
    expect(useWebPageRuntimeStore.getState().navById).toEqual({});
    await act(() => emit("web-page:l2-chat", state));
    expect(useWebPageRuntimeStore.getState().navById[chat.id]).toEqual({
      url: "https://chatgpt.com/c/new",
      title: "New",
      loading: true,
      failure: null,
      canGoBack: true,
      canGoForward: false,
    });
    expect(useWebPageRuntimeStore.getState().faviconById[chat.id]).toBe(
      "data:image/png;base64,YQ==",
    );
    expect(readWebPageFavicon(chat.id)).toBe("data:image/png;base64,YQ==");
    expect(resolveWebPageStartUrl(chat)).toBe("https://chatgpt.com/c/new");
    const previous = useWebPageRuntimeStore.getState();
    using writes = vi.spyOn(Storage.prototype, "setItem");
    await act(() => emit("web-page:l2-chat", { ...state }));
    expect(useWebPageRuntimeStore.getState()).toBe(previous);
    expect(writes).not.toHaveBeenCalled();
  });

  it("preserves guest identity and mount-time URLs when entries reorder or change", async () => {
    using _state = setup();
    useWebPageRuntimeStore.getState().open(chat.id);
    useWebPageRuntimeStore.getState().open(deep.id);
    await using screen = await renderHost();
    await vi.waitFor(() => expect(screen.container.querySelectorAll("webview")).toHaveLength(2));
    const before = [...screen.container.querySelectorAll("webview")];
    expect(before.map((node) => node.getAttribute("data-web-page-tab"))).toEqual([
      "web-page:l2-chat",
      "web-page:l2-deep",
    ]);
    const removed: Node[] = [];
    const observer = new MutationObserver((records) => {
      removed.push(...records.flatMap((record) => [...record.removedNodes]));
    });
    observer.observe(screen.container, { childList: true, subtree: true });
    try {
      await act(() =>
        updateClientSettings({
          webPages: [{ ...chat, name: "Edited", url: "https://example.com/" }, deep],
        }),
      );
      expect([...screen.container.querySelectorAll("webview")][0]).toBe(before[0]);
      expect([...screen.container.querySelectorAll("webview")][1]).toBe(before[1]);
      removed.push(...observer.takeRecords().flatMap((record) => [...record.removedNodes]));
      expect(removed).toEqual([]);
      expect(before[0]!.getAttribute("src")).toBe("https://chatgpt.com/");
      expect(mocks.onStateChange).toHaveBeenCalledTimes(1);
      expect(mocks.onOpenLink).toHaveBeenCalledTimes(1);
      await act(() =>
        mocks.onStateChange.mock.calls[0]![0](
          "web-page:l2-chat",
          desktopState({ kind: "Success", url: "https://example.com/new", title: "New base" }),
        ),
      );
      expect(resolveWebPageStartUrl({ ...chat, url: "https://example.com/" })).toBe(
        "https://example.com/new",
      );
    } finally {
      observer.disconnect();
    }
  });
});
