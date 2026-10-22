/** Protects page lifecycle transitions and suppresses unchanged navigation notifications. */
import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  parseWebPageRuntimeTabId,
  useWebPageRuntimeStore as store,
  webPageRuntimeTabId,
  type WebPageNav,
} from "./webPageRuntimeStore";

const nav: WebPageNav = {
  url: "https://chatgpt.com/",
  title: "ChatGPT",
  loading: false,
  failure: null,
  canGoBack: false,
  canGoForward: false,
};

beforeEach(() => store.setState(store.getInitialState(), true));

describe("web-page runtime", () => {
  it("selects and opens a page without closing existing pages", () => {
    store.getState().open("other");
    store.getState().select("chat");
    expect(store.getState()).toMatchObject({
      activeId: "chat",
      opened: { chat: true, other: true },
    });
  });

  it("opens a background page without moving the current selection", () => {
    store.getState().select("chat");
    store.getState().open("other");
    expect(store.getState()).toMatchObject({
      activeId: "chat",
      opened: { chat: true, other: true },
    });
  });

  it("pauses a page while keeping its selection, icon and other pages", () => {
    store.setState({
      activeId: "chat",
      opened: { chat: true, other: true },
      navById: { chat: nav, other: nav },
      faviconById: { chat: "icon", other: "other-icon" },
    });
    store.getState().pause("chat");
    expect(store.getState()).toMatchObject({
      activeId: "chat",
      opened: { other: true },
      navById: { other: nav },
      faviconById: { chat: "icon", other: "other-icon" },
    });
    expect(Object.hasOwn(store.getState().opened, "chat")).toBe(false);
    expect(Object.hasOwn(store.getState().navById, "chat")).toBe(false);
  });

  it.each(["chat", "other"])("forgets all page state with %s selected", (activeId) => {
    store.setState({
      activeId,
      opened: { chat: true, other: true },
      navById: { chat: nav, other: nav },
      faviconById: { chat: "icon", other: "other-icon" },
    });
    store.getState().forget("chat");
    expect(store.getState().activeId).toBe(activeId === "chat" ? null : "other");
    expect(store.getState().opened).toEqual({ other: true });
    expect(store.getState().navById).toEqual({ other: nav });
    expect(store.getState().faviconById).toEqual({ other: "other-icon" });
  });

  it.each([null, { code: -105, description: "Name not resolved" }])(
    "retains the state reference for equal navigation, including failure %j",
    (failure) => {
      store.getState().applyNav("chat", { ...nav, failure });
      const previous = store.getState();
      store.getState().applyNav("chat", { ...nav, failure: failure ? { ...failure } : null });
      expect(store.getState()).toBe(previous);
    },
  );

  it.each([
    { url: "https://chatgpt.com/c/123" },
    { title: "New title" },
    { loading: true },
    { canGoBack: true },
    { canGoForward: true },
    { failure: { code: -105, description: "Name not resolved" } },
  ])("publishes navigation changes: %j", (patch) => {
    store.setState({ navById: { chat: nav, other: nav } });
    const next = { ...nav, ...patch };
    store.getState().applyNav("chat", next);
    expect(store.getState().navById).toEqual({ chat: next, other: nav });
  });

  it.each([
    null,
    { code: -106, description: "Name not resolved" },
    { code: -105, description: "Changed description" },
  ])("publishes a cleared or changed failure: %j", (failure) => {
    store.setState({
      navById: { chat: { ...nav, failure: { code: -105, description: "Name not resolved" } } },
    });
    store.getState().applyNav("chat", { ...nav, failure });
    expect(store.getState().navById.chat?.failure).toEqual(failure);
  });

  it("updates icons without dropping others and keeps the reference for repeated icons", () => {
    store.setState({ faviconById: { chat: "old", other: "other-icon" } });
    store.getState().applyFavicon("chat", "new");
    expect(store.getState().faviconById).toEqual({ chat: "new", other: "other-icon" });
    const previous = store.getState();
    store.getState().applyFavicon("chat", "new");
    expect(store.getState()).toBe(previous);
  });
});

describe("web-page tab ids", () => {
  it.each(["chat", "a:b", "", "__proto__"])("round-trips entry id %j", (id) => {
    expect(webPageRuntimeTabId(id)).toBe(`web-page:${id}`);
    expect(parseWebPageRuntimeTabId(webPageRuntimeTabId(id))).toBe(id);
  });

  it.each(["browser:chat", "chat", "prefix-web-page:chat", "web-page"])(
    "rejects unrelated tab id %s",
    (id) => {
      expect(parseWebPageRuntimeTabId(id)).toBeNull();
    },
  );
});
