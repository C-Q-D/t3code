/** @vitest-environment jsdom */
/** Real tree rows, selection, portal and motion verify the drag bridge; layout, DataTransfer and rAF are browser fixtures. */
import { FileTree } from "@pierre/trees";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { ComposerThrowToken } from "../chat/ComposerThrowToken";
import { makeComposerMentionDragHandlers } from "../chat/composerMentionDrag";
import { activeJobs } from "../../lib/motion/loop";
import { setPhysicsEnabled } from "../../lib/motion/preference";
import { installTestRaf } from "../../lib/motion/testRaf";
import { createFileTreeDragMentionController } from "./fileTreeDragMention";
import { installFileTreeDrag } from "./fileTreeDrag";

let clock: ReturnType<typeof installTestRaf>;
let root: Root;
let panel: HTMLDivElement;
let form: HTMLFormElement;
let tree: FileTree;
let controller: ReturnType<typeof createFileTreeDragMentionController>;
let dispose: () => void;
let received: unknown[];
let opened: string[];
let time: number;
const mentionType = "application/x-t3code-composer-mention";

/** Create composed pointer samples so the real shadow boundary participates; timestamps are fixed milliseconds. */
function pointer(type: string, x: number, y: number, timestamp: number) {
  const event = new MouseEvent(type, {
    bubbles: true,
    composed: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    timeStamp: { value: timestamp },
  });
  return event;
}

/** Provide a writable native data store; the actual tree and bridge populate it during dispatch. */
function drag(
  type: string,
  transfer = {
    data: new Map<string, string>(),
    get types() {
      return [...this.data.keys()];
    },
    setData(format: string, value: string) {
      this.data.set(format, value);
    },
    getData(format: string) {
      return this.data.get(format) ?? "";
    },
    setDragImage: vi.fn(),
    effectAllowed: "all",
    dropEffect: "none",
  },
) {
  return Object.assign(
    new MouseEvent(type, {
      bubbles: true,
      composed: true,
      cancelable: true,
      clientX: 60,
      clientY: 240,
    }),
    { dataTransfer: transfer },
  );
}

/** Locate a rendered third-party row, using deterministic viewport layout for pickup geometry. */
function row(path = "app.ts") {
  const element = tree
    .getFileTreeContainer()!
    .shadowRoot!.querySelector<HTMLElement>(`[data-item-path="${path}"]`)!;
  expect(element).not.toBeNull();
  element.getBoundingClientRect = () => new DOMRect(20, 220, 200, 28);
  return element;
}

/** Cross the native drag threshold after recording pointerdown; this does not fake any pointer follow-up. */
function start(path = "app.ts") {
  const source = row(path);
  source.dispatchEvent(pointer("pointerdown", 30, 240, 0));
  const event = drag("dragstart");
  act(() => source.dispatchEvent(event));
  return event;
}

/** Drain actual motion jobs at 60Hz with a bounded ten-second simulation, without wall-clock sleeps. */
function settle() {
  act(() => {
    for (let frame = 0; frame < 600 && clock.pending.size; frame++) {
      time += 1000 / 60;
      clock.advance(time);
    }
  });
  expect(activeJobs()).toBe(0);
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  clock = installTestRaf();
  time = 0;
  setPhysicsEnabled(true);
  received = [];
  opened = [];
  panel = document.createElement("div");
  document.body.append(panel);
  controller = createFileTreeDragMentionController({
    deselect: (path) => tree.getItem(path)?.deselect(),
  });
  tree = new FileTree({
    paths: ["app.ts", "docs/guide.md"],
    initialExpansion: "open",
    flattenEmptyDirectories: false,
    dragAndDrop: { canDrop: () => false },
    onSelectionChange: (paths) => {
      controller.handleSelectionChange(paths);
      if (!controller.isDragInProgress()) {
        const path = paths.at(-1);
        if (path && !path.endsWith("/")) opened.push(path);
      }
    },
  });
  await act(async () => tree.render({ containerWrapper: panel }));
  form = document.createElement("form");
  form.setAttribute("data-thread-context-drop", "true");
  form.getBoundingClientRect = () => new DOMRect(400, 200, 200, 100);
  form.addEventListener("t3:composer-mention-throw", (event) =>
    received.push((event as CustomEvent).detail),
  );
  document.body.append(form);
  root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(ComposerThrowToken, { channel: "mention:files-test" })));
  dispose = installFileTreeDrag(panel, controller, "mention:files-test");
});

afterEach(() => {
  act(() => {
    dispose();
    root.unmount();
    tree.cleanUp();
    setPhysicsEnabled(false);
  });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it("cancels native start across the shadow root and lands all selected file and folder mentions once", () => {
  tree.getItem("app.ts")!.select();
  tree.getItem("docs/")!.select();
  const nativeRowStart = vi.fn();
  row().addEventListener("dragstart", nativeRowStart);
  const event = start();
  expect(event.defaultPrevented).toBe(true);
  expect(nativeRowStart).not.toHaveBeenCalled();
  const token = document.querySelector<HTMLElement>("[data-composer-throw-token]")!;
  expect(token.textContent).toBe("[app.ts](app.ts) [docs](docs)");
  expect(token.style.transform).toContain("translate(20px, 220px)");
  document.dispatchEvent(pointer("pointermove", 450, 240, 40));
  document.dispatchEvent(pointer("pointerup", 450, 240, 40));
  expect(received).toEqual([]);
  settle();
  expect(received).toEqual([{ text: "[app.ts](app.ts) [docs](docs) " }]);
  expect(tree.getSelectedPaths()).toEqual([]);
});

it.each([
  { destination: "hit", x: 450, expected: [{ text: "[docs](docs) [app.ts](app.ts) " }] },
  { destination: "miss", x: -100, expected: [] },
])(
  "$destination release clears selection without opening files and suppresses only the drag's click",
  ({ x, expected }) => {
    tree.getItem("docs/")!.select();
    tree.getItem("app.ts")!.select();
    opened = [];
    start();
    document.dispatchEvent(pointer("pointermove", x, 240, 40));
    document.dispatchEvent(pointer("pointerup", x, 240, 40));
    const trailingClick = new MouseEvent("click", {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail: 1,
    });
    row().dispatchEvent(trailingClick);
    settle();
    expect(trailingClick.defaultPrevented).toBe(true);
    expect(tree.getSelectedPaths()).toEqual([]);
    expect(opened).toEqual([]);
    expect(received).toEqual(expected);
    expect(document.querySelector("[data-composer-throw-token]")).toBeNull();
    // A subsequent real click remains a normal request to open this file.
    row().dispatchEvent(pointer("pointerdown", 30, 240, 80));
    row().dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, detail: 1 }));
    expect(opened).toEqual(["app.ts"]);
  },
);

it.each([false, true])(
  "disabled physics preserves native data and drop insertion (enable mid-drag: %s)",
  (enableDuringDrag) => {
    setPhysicsEnabled(false);
    const event = start("docs/");
    expect(event.defaultPrevented).toBe(false);
    expect(event.dataTransfer.getData(mentionType)).toBe("[docs](docs)");
    expect(event.dataTransfer.getData("text/plain")).toBe("docs/");
    expect(event.dataTransfer.effectAllowed).toBe("move");
    document.dispatchEvent(pointer("pointercancel", 60, 240, 20));
    expect(controller.isDragInProgress()).toBe(true);
    setPhysicsEnabled(enableDuringDrag);
    expect(document.querySelector("[data-composer-throw-token]")).toBeNull();
    const inserted: string[] = [];
    const handlers = makeComposerMentionDragHandlers({
      insertMentionAtEnd: (text) => {
        inserted.push(text);
        return true;
      },
      setDragActive: () => {},
      onInsertRejected: () => {
        throw new Error("unexpected rejection");
      },
    });
    const drop = drag("drop", event.dataTransfer);
    form.addEventListener("drop", () =>
      handlers.onDrop({
        dataTransfer: drop.dataTransfer,
        nativeEvent: drop,
        preventDefault: () => drop.preventDefault(),
        stopPropagation: () => drop.stopPropagation(),
      }),
    );
    form.dispatchEvent(drop);
    row("docs/").dispatchEvent(drag("dragend", event.dataTransfer));
    expect(inserted).toEqual(["[docs](docs) "]);
    expect(tree.getSelectedPaths()).toEqual([]);
    expect(activeJobs()).toBe(0);
  },
);

it.each(["Escape", "pointercancel", "blur", "physics off", "dispose"] as const)(
  "%s clears a pointer gesture's selection and cannot insert on a later pointerup",
  (reason) => {
    tree.getItem("docs/")!.select();
    tree.getItem("app.ts")!.select();
    opened = [];
    start();
    document.dispatchEvent(pointer("pointermove", 450, 240, 40));
    act(() => {
      switch (reason) {
        case "Escape":
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
          break;
        case "pointercancel":
          document.dispatchEvent(pointer("pointercancel", 450, 240, 40));
          break;
        case "blur":
          window.dispatchEvent(new Event("blur"));
          break;
        case "physics off":
          setPhysicsEnabled(false);
          break;
        case "dispose":
          dispose();
          dispose();
          break;
      }
    });
    document.dispatchEvent(pointer("pointerup", 450, 240, 60));
    settle();
    expect(tree.getSelectedPaths()).toEqual([]);
    expect(opened).toEqual([]);
    expect(controller.isDragInProgress()).toBe(false);
    expect(received).toEqual([]);
    expect(document.querySelector("[data-composer-throw-token]")).toBeNull();
  },
);

it("regrabbing a file flight postpones insertion until its next pointer release lands", () => {
  start();
  document.dispatchEvent(pointer("pointermove", 450, 240, 40));
  document.dispatchEvent(pointer("pointerup", 450, 240, 40));
  const token = document.querySelector<HTMLElement>("[data-composer-throw-token]")!;
  act(() => token.dispatchEvent(pointer("pointerdown", 450, 240, 60)));
  settle();
  expect(received).toEqual([]);
  document.dispatchEvent(pointer("pointermove", 460, 250, 80));
  document.dispatchEvent(pointer("pointerup", 460, 250, 80));
  settle();
  expect(received).toEqual([{ text: "[app.ts](app.ts) " }]);
});

it("rejects a physical start with no matching pointerdown without retaining selection or a card", () => {
  tree.getItem("app.ts")!.select();
  opened = [];
  const event = drag("dragstart");
  act(() => row().dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(tree.getSelectedPaths()).toEqual([]);
  expect(controller.isDragInProgress()).toBe(false);
  expect(document.querySelector("[data-composer-throw-token]")).toBeNull();
  expect(opened).toEqual([]);
});
