/** @vitest-environment jsdom */
/** Native capture dispatch, real velocity/projection and token arrival protect file insertion. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { ComposerThrowToken } from "./ComposerThrowToken";
import { installComposerMentionThrow } from "./composerMentionThrow";
import { makeComposerMentionDragHandlers } from "./composerMentionDrag";
import { setPhysicsEnabled } from "../../lib/motion/preference";
import { installTestRaf } from "../../lib/motion/testRaf";
import { activeJobs } from "../../lib/motion/loop";

let clock: ReturnType<typeof installTestRaf>;
let root: Root;
let form: HTMLFormElement;
let controller: ReturnType<typeof installComposerMentionThrow>;
let received: unknown[];
let time: number;
const mentionType = "application/x-t3code-composer-mention";
const text = "[index.ts](src/index.ts)";

/** Native DataTransfer boundary fixture; browsers expose types during dragover and data on drop. */
function drag(type: string, x: number, types = [mentionType]) {
  return Object.assign(
    new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 250 }),
    {
      dataTransfer: {
        types,
        getData: (format: string) => (format === mentionType ? text : ""),
        dropEffect: "none",
        setDragImage: vi.fn(),
      },
    },
  );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  clock = installTestRaf();
  time = 0;
  vi.spyOn(performance, "now").mockImplementation(() => time);
  setPhysicsEnabled(true);
  form = document.createElement("form");
  form.setAttribute("data-thread-context-drop", "true");
  form.getBoundingClientRect = () => new DOMRect(400, 200, 200, 100);
  document.body.append(form);
  received = [];
  form.addEventListener("t3:composer-mention-throw", (event) =>
    received.push((event as CustomEvent).detail),
  );
  root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(ComposerThrowToken, { channel: "mention" })));
  controller = installComposerMentionThrow();
});
afterEach(() => {
  act(() => {
    controller.dispose();
    setPhysicsEnabled(false);
    root.unmount();
  });
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Sample an outward native drag fast enough for its projection to cross the composer. */
function aim() {
  document.body.dispatchEvent(drag("dragover", 0));
  time = 20;
  document.body.dispatchEvent(drag("dragover", 100));
}

/** Drain actual spring jobs at 60 Hz and require rest, without wall-clock waits. */
function settle() {
  act(() => {
    for (let frame = 0; frame < 600 && clock.pending.size; frame++)
      clock.advance((frame * 1000) / 60);
  });
  expect(activeJobs()).toBe(0);
}

it.each([
  [mentionType, true],
  ["Files", false],
  ["text/plain", false],
] as const)("only intercepts mention dragover: %s", (type, prevented) => {
  const event = drag("dragover", 100, [type]);
  document.body.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(prevented);
});

it("claims a path hit before editor handlers and dispatches mention text only on landing", () => {
  const inserted: string[] = [];
  const legacyEvent = drag("drop", 100);
  makeComposerMentionDragHandlers({
    insertMentionAtEnd: (value) => {
      inserted.push(value);
      return true;
    },
    setDragActive: () => {},
    onInsertRejected: () => {
      throw new Error("mention insertion rejected");
    },
  }).onDrop({
    dataTransfer: legacyEvent.dataTransfer,
    nativeEvent: legacyEvent,
    preventDefault: () => legacyEvent.preventDefault(),
    stopPropagation: () => legacyEvent.stopPropagation(),
  });
  expect(inserted).toEqual(["[index.ts](src/index.ts) "]);
  aim();
  const editor = vi.fn();
  form.addEventListener("drop", editor);
  const event = drag("drop", 100);
  act(() => form.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(editor).not.toHaveBeenCalled();
  expect(received).toEqual([]);
  act(() => clock.advance(0));
  expect(received).toEqual([]);
  settle();
  expect(received).toEqual(inserted.map((value) => ({ text: value })));
});

it("lets a missed drop reach its original recipient and inserts nothing", () => {
  const recipient = document.createElement("div");
  document.body.append(recipient);
  const fallback = vi.fn();
  recipient.addEventListener("drop", fallback);
  const event = drag("drop", 50);
  act(() => recipient.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(false);
  expect(fallback).toHaveBeenCalledOnce();
  settle();
  expect(received).toEqual([]);
});

it("dragend discards old velocity so the next session cannot inherit its projected hit", () => {
  aim();
  document.body.dispatchEvent(new Event("dragend", { bubbles: true }));
  const event = drag("drop", 100);
  act(() => document.body.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(false);
  settle();
  expect(received).toEqual([]);
});

it("disabled physics installs no document listeners and leaves native drops alone", () => {
  controller.dispose();
  act(() => setPhysicsEnabled(false));
  const listen = vi.spyOn(document, "addEventListener");
  controller = installComposerMentionThrow();
  expect(listen).not.toHaveBeenCalled();
  const event = drag("drop", 450);
  document.body.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(received).toEqual([]);
});

it("uses the native setDragImage capability and cleans its preview at dragend", () => {
  const event = drag("dragstart", 50);
  controller.start(event as unknown as DragEvent);
  expect(event.dataTransfer.setDragImage).toHaveBeenCalledOnce();
  expect(document.querySelector("[data-composer-mention-preview]")?.textContent).toContain(
    "src/index.ts",
  );
  document.body.dispatchEvent(new Event("dragend", { bubbles: true }));
  expect(document.querySelector("[data-composer-mention-preview]")).toBeNull();
});

it("a regrabbed file uses pointer release and still inserts exactly once after landing", () => {
  aim();
  act(() => document.body.dispatchEvent(drag("drop", 100)));
  const token = document.querySelector("[data-composer-throw-token]");
  expect(token).not.toBeNull();
  act(() =>
    token!.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, clientY: 250 }),
    ),
  );
  settle();
  expect(received).toEqual([]);
  act(() => {
    document.dispatchEvent(new MouseEvent("pointermove", { clientX: 450, clientY: 250 }));
    document.dispatchEvent(new MouseEvent("pointerup", { clientX: 450, clientY: 250 }));
  });
  expect(received).toEqual([]);
  settle();
  expect(received).toEqual([{ text: "[index.ts](src/index.ts) " }]);
});
