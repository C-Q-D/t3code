// @vitest-environment jsdom
/** Exercises the patched search widget with real document queries and localized controls. */
import { afterEach, expect, it, vi } from "vite-plus/test";
import { git as chineseGit } from "~/i18n/locales/zh-CN/git";

const packageUrl = import.meta.resolve("@pierre/diffs");
const { SearchPanelWidget } = await import(
  /* @vite-ignore */ new URL("./editor/searchPanel.js", packageUrl).href
);
const { TextDocument } = await import(
  /* @vite-ignore */ new URL("./editor/textDocument.js", packageUrl).href
);
const { CodeView } = await import(
  /* @vite-ignore */ new URL("./components/CodeView.js", packageUrl).href
);

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("keeps localized search controls when opened by the viewer keyboard shortcut", () => {
  vi.stubGlobal("requestAnimationFrame", () => 0);
  const host = document.createElement("div");
  document.body.append(host);
  const viewer = new CodeView({ searchMessages: chineseGit.diffSearch });
  vi.spyOn(viewer, "getContainerElement").mockReturnValue(host);
  host.addEventListener("keydown", viewer.search.handleKeyDown);
  host.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }));
  const panel = host.querySelector("[data-diffs-search]")!.shadowRoot!;
  expect(panel.querySelector<HTMLInputElement>("input[data-search]")!.placeholder).toBe("查找");
  expect(panel.querySelector("[data-matches]")!.textContent).toBe("无结果");
  viewer.closeSearch();
  viewer.cleanUp();
});

it.each([false, true])("searches, navigates and clears matches with Chinese=%s", (chinese) => {
  vi.stubGlobal("requestAnimationFrame", () => 0);
  const anchor = document.createElement("div");
  document.body.append(anchor);
  const selected: number[][] = [];
  const messages = chinese ? chineseGit.diffSearch : undefined;
  const widget = new SearchPanelWidget({
    textDocument: new TextDocument("file:///search.txt", "Alpha alpha"),
    containerElement: anchor,
    defaultQuery: "",
    allowReplace: false,
    messages,
    scrollToMatch: (range: number[]) => selected.push(range),
    applyReplace: () => {},
    onUpdate: () => undefined,
    onClose: () => {},
  });
  const input = document.querySelector<HTMLInputElement>("input[data-search]")!;
  const count = document.querySelector("[data-matches]")!;
  expect(input.placeholder).toBe(chinese ? "查找" : "Search");
  input.value = "alpha";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  expect(count.textContent).toBe(chinese ? "2 个结果" : "2 results");
  const button = (label: string) =>
    document.querySelector<HTMLButtonElement>(`button[title="${label}"]`)!;
  button(chinese ? "下一个" : "Next").click();
  expect(selected.at(-1)).toEqual([0, 5]);
  expect(count.textContent).toBe(chinese ? "第 1 项，共 2 项" : "1 of 2");
  button(chinese ? "下一个" : "Next").click();
  expect(selected.at(-1)).toEqual([6, 11]);
  button(chinese ? "上一个" : "Previous").click();
  expect(selected.at(-1)).toEqual([0, 5]);
  button(chinese ? "区分大小写" : "Match Case").click();
  expect(count.textContent).toBe(chinese ? "1 个结果" : "1 results");
  input.value = "missing";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  expect(count.textContent).toBe(chinese ? "无结果" : "No results");
  expect(button(chinese ? "下一个" : "Next").disabled).toBe(true);
  button(chinese ? "关闭" : "Close").click();
  expect(document.querySelector("[data-search-panel]")).toBeNull();
  widget.cleanup();
});
