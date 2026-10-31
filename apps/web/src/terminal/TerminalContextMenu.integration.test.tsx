/**
 * Exercises canvas selection and real menu actions through TerminalViewport and the shipped Ghostty WASM.
 * Only browser geometry/drawing, clipboard and server transport are replaced.
 * @vitest-environment jsdom
 */
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { nextTerminalAttachSeedState } from "@t3tools/client-runtime/state/terminal";
import { AsyncResult } from "effect/reactivity";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { TerminalViewport } from "~/components/ThreadTerminalDrawer";
import { t } from "~/i18n";
import { GhosttyTerminalSurface } from "./ghostty/surface";

const transport = vi.hoisted(() => ({ write: vi.fn(), other: vi.fn() }));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => null, useAtomMount: () => {} }));
vi.mock("~/hooks/useSettings", () => ({
  useClientSettings: (select: (settings: typeof DEFAULT_CLIENT_SETTINGS) => unknown) =>
    select({ ...DEFAULT_CLIENT_SETTINGS, fontSizeCode: 12 }),
}));
vi.mock("~/editorPreferences", () => ({ useOpenInPreferredEditor: () => transport.other }));
vi.mock("~/localApi", () => ({ readLocalApi: () => null }));
vi.mock("~/state/server", () => ({ serverEnvironment: { configValueAtom: () => null } }));
vi.mock("~/state/preview", () => ({ previewEnvironment: { open: "open" } }));
vi.mock("~/state/terminal", () => ({ terminalEnvironment: { resize: "resize", write: "write" } }));
vi.mock("~/state/use-atom-command", () => ({
  useAtomCommand: (command: string) => (command === "write" ? transport.write : transport.other),
}));
vi.mock("~/state/session", () => ({
  useEnvironmentScope: () => true,
  readEnvironmentScope: () => true,
}));
vi.mock("~/state/terminalSessions", async () => {
  const { Atom } = await import("effect/reactivity");
  return { attachedTerminalSessionAtom: () => Atom.make(session) };
});
vi.mock("./ghostty/vendor/ghostty-vt.wasm?url", async () => {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const bytes = await readFile(resolve(import.meta.dirname, "ghostty/vendor/ghostty-vt.wasm"));
  return { default: `data:application/wasm;base64,${bytes.toString("base64")}` };
});
vi.mock("./ghostty/vendor/ghostty-write-pty.wasm?url&no-inline", async () => {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const bytes = await readFile(
    resolve(import.meta.dirname, "ghostty/vendor/ghostty-write-pty.wasm"),
  );
  return { default: `data:application/wasm;base64,${bytes.toString("base64")}` };
});

const threadRef = {
  environmentId: EnvironmentId.make("menu-integration"),
  threadId: ThreadId.make("thread"),
};
const session = { ...nextTerminalAttachSeedState(), status: "running" as const, version: 1 };
const addContext = vi.fn();
const clipboard = {
  readText: vi.fn<() => Promise<string>>(),
  writeText: vi.fn<(text: string) => Promise<void>>(),
};
let clipboardText = "";
let root: Root;
let container: HTMLDivElement;
let terminal: GhosttyTerminalSurface;
let nextFrame = 0;
const frames = new Map<number, FrameRequestCallback>();
const captures = new WeakMap<Element, Set<number>>();
const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

/** jsdom has no layout engine; this fixture uses fixed dimensions and does not emit resize events. */
class FixedGeometryResizeObserver {
  /** Accept a subscription without scheduling layout work for the fixed geometry. */
  observe() {}
  /** No subscription resources are allocated by this browser-boundary fixture. */
  unobserve() {}
  /** Match browser teardown; there are no queued notifications to release. */
  disconnect() {}
}

/** Flush a browser paint explicitly; no wall-clock sleeps or polling are needed. */
async function paint() {
  await act(async () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(0));
  });
}

/** Send a primary mouse pointer gesture through the actual DOM event listeners. */
function pointer(target: Element, type: string, x: number, y: number, button = 0) {
  target.dispatchEvent(
    Object.assign(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button,
        buttons: type === "pointerup" ? 0 : button === 2 ? 2 : 1,
      }),
      { pointerId: 1, pointerType: "mouse", isPrimary: true },
    ),
  );
}

/** Select the first five cells of the first output row using canvas drag events. */
async function selectAlpha() {
  await act(async () => {
    terminal.write("alpha beta\r\nsecond line");
  });
  await paint();
  await act(async () => {
    // Fixed browser geometry: 8px cells, 19px rows, 4px padding and a 2px bottom-alignment remainder.
    pointer(terminal.canvas, "pointerdown", 5, 8);
    pointer(terminal.canvas, "pointermove", 37, 8);
    pointer(terminal.canvas, "pointerup", 37, 8);
  });
  expect(terminal.getSelection()).toBe("alpha");
}

/** Open the real React menu through the terminal canvas's right-click handler. */
async function openMenu() {
  await act(async () => {
    pointer(terminal.canvas, "pointerdown", 37, 8, 2);
    terminal.canvas.dispatchEvent(
      new MouseEvent("contextmenu", {
        clientX: 37,
        clientY: 8,
        button: 2,
        bubbles: true,
        cancelable: true,
      }),
    );
    pointer(terminal.canvas, "pointerup", 37, 8, 2);
  });
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
}

/** Click an accessible action, including the pointer/focus events observed by selection dismissal. */
async function choose(label: string) {
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (candidate) => candidate.textContent === label,
  );
  expect(item, `menu action ${label}`).toBeDefined();
  await act(async () => {
    pointer(item!, "pointerdown", 40, 20);
    item!.focus();
    pointer(item!, "pointerup", 40, 20);
    item!.click();
  });
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  frames.clear();
  nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("matchMedia", () => Object.assign(new EventTarget(), { matches: false }));
  vi.stubGlobal("ResizeObserver", FixedGeometryResizeObserver);
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: Object.assign(new EventTarget(), { load: async () => [], add() {} }),
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 640, 200),
  );
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: {
      configurable: true,
      value: function (this: Element, id: number) {
        captures.set(this, new Set([id]));
      },
    },
    hasPointerCapture: {
      configurable: true,
      value: function (this: Element, id: number) {
        return captures.get(this)?.has(id) ?? false;
      },
    },
    releasePointerCapture: {
      configurable: true,
      value: function (this: Element, id: number) {
        captures.get(this)?.delete(id);
      },
    },
  });
  // Ghostty uses the 2D overload; Vitest otherwise infers the last (WebGPU) overload.
  const canvas2dPrototype: {
    getContext(contextId: "2d"): CanvasRenderingContext2D | null;
  } = HTMLCanvasElement.prototype;
  vi.spyOn(canvas2dPrototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    return {
      canvas: this,
      beginPath() {},
      clip() {},
      rect() {},
      resetTransform() {},
      restore() {},
      save() {},
      setTransform() {},
      clearRect() {},
      fillRect() {},
      strokeRect() {},
      fillText() {},
      getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }),
      measureText: (text: string) => ({
        width: text.length * 8,
        actualBoundingBoxAscent: 9,
        actualBoundingBoxDescent: 3,
      }),
    } as unknown as CanvasRenderingContext2D;
  });
  clipboardText = "";
  clipboard.readText.mockReset().mockImplementation(async () => clipboardText);
  clipboard.writeText.mockReset().mockImplementation(async (text) => {
    clipboardText = text;
  });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
  transport.write.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  transport.other.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  addContext.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  // This spy observes the public factory result without replacing its implementation or options.
  const created = vi.spyOn(GhosttyTerminalSurface, "create");
  await act(async () =>
    root.render(
      <TerminalViewport
        advancedTypography={false}
        threadRef={threadRef}
        threadId={threadRef.threadId}
        terminalId="term-1"
        cwd="/repo"
        onSessionExited={transport.other}
        onAddTerminalContext={addContext}
        autoFocus={false}
        visible={true}
        keybindings={[]}
      />,
    ),
  );
  expect(created, container.textContent ?? "terminal setup").toHaveBeenCalledOnce();
  await act(async () => {
    terminal = await created.mock.results[0]!.value;
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30);
  });
  await paint();
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  frames.clear();
  if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
  else Reflect.deleteProperty(document, "fonts");
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  for (const method of ["setPointerCapture", "hasPointerCapture", "releasePointerCapture"])
    Reflect.deleteProperty(HTMLElement.prototype, method);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("preserves the canvas selection while opening the menu and copies its text", async () => {
  await selectAlpha();
  await openMenu();
  expect(terminal.getSelection()).toBe("alpha");
  await choose(t.common.threadActions.copy);
  expect(clipboardText).toBe("alpha");
  expect(terminal.getSelection()).toBe("alpha");
});

it("pastes clipboard text through Ghostty encoding into the PTY", async () => {
  await act(async () => terminal.write("\x1b[?2004h"));
  clipboardText = "echo one\necho two";
  await openMenu();
  await choose(t.tools.terminal.paste);
  expect(transport.write).toHaveBeenCalledExactlyOnceWith({
    environmentId: threadRef.environmentId,
    input: {
      threadId: threadRef.threadId,
      terminalId: "term-1",
      data: "\x1b[200~echo one\necho two\x1b[201~",
    },
  });
});

it("selects all output rather than only the previous canvas selection", async () => {
  await selectAlpha();
  await openMenu();
  await choose(t.tools.terminal.selectAll);
  expect(terminal.getSelection()).toBe("alpha beta\nsecond line");
});

it("adds the selected terminal text and line range to the conversation", async () => {
  await selectAlpha();
  await openMenu();
  await choose(t.tools.terminal.addToChat);
  expect(addContext).toHaveBeenCalledExactlyOnceWith({
    terminalId: "term-1",
    terminalLabel: "Terminal 1",
    lineStart: 1,
    lineEnd: 1,
    text: "alpha",
  });
  expect(terminal.hasSelection()).toBe(false);
});

it("jumps from scrollback to the latest output through the menu", async () => {
  await act(async () =>
    terminal.write(Array.from({ length: 40 }, (_, i) => `row ${i}\r\n`).join("")),
  );
  await paint();
  await act(async () =>
    terminal.canvas.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -76, bubbles: true, cancelable: true }),
    ),
  );
  await paint();
  expect(terminal.isAtBottom()).toBe(false);
  await openMenu();
  await choose(t.tools.terminal.jumpToLatest);
  await paint();
  expect(terminal.isAtBottom()).toBe(true);
});

it("discards an asynchronous paste after a newer menu supersedes its request", async () => {
  let resolveRead!: (text: string) => void;
  const pendingRead = new Promise<string>((resolve) => {
    resolveRead = resolve;
  });
  clipboard.readText.mockReturnValueOnce(pendingRead);
  await openMenu();
  await choose(t.tools.terminal.paste);
  expect(clipboard.readText).toHaveBeenCalledOnce();
  await openMenu();
  await act(async () => {
    resolveRead("stale input");
    await pendingRead;
  });
  expect(transport.write).not.toHaveBeenCalled();
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
});

it("ignores a clicked action when a newer right-click supersedes it before dispatch", async () => {
  await selectAlpha();
  await openMenu();
  const copyItem = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent === t.common.threadActions.copy,
  )!;
  await act(async () => {
    // The menu promise resolves on click, but its continuation runs after this newer gesture.
    copyItem.click();
    terminal.canvas.dispatchEvent(
      new MouseEvent("contextmenu", {
        clientX: 37,
        clientY: 8,
        button: 2,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect(clipboard.writeText).not.toHaveBeenCalled();
  expect(terminal.getSelection()).toBe("alpha");
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
});
