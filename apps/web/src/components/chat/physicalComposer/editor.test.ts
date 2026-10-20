/** Runs real Tiptap transactions and IME events; geometry/highlight stubs supply missing jsdom platform APIs. */
// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { bindPhysicalRenderer, capturePhysicalSend, physicalTypingExtension } from "./editor";
import { PhysicalComposerRenderer } from "./renderer";
import { setPhysicsEnabled } from "../../../lib/motion/preference";
import { installTestRaf } from "../../../lib/motion/testRaf";

let editor: Editor;
let renderer: PhysicalComposerRenderer;
let surface: HTMLDivElement;
let layer: HTMLDivElement;
let highlights: Map<string, Set<Range>>;
let clock: ReturnType<typeof installTestRaf>;
const originalRangeRect = Object.getOwnPropertyDescriptor(Range.prototype, "getBoundingClientRect");
const originalRangeRects = Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");

beforeEach(() => {
  clock = installTestRaf();
  setPhysicsEnabled(true);
  highlights = new Map();
  vi.stubGlobal("CSS", { highlights });
  vi.stubGlobal(
    "Highlight",
    /** Emulate the browser range collection, without simulating editor or renderer behavior. */
    class extends Set<Range> {
      /** Accept browser-style variadic ranges in jsdom. */
      constructor(...ranges: Range[]) {
        super(ranges);
      }
    },
  );
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 768, 84));
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: function (this: Range) {
      return new DOMRect(
        20 + this.startOffset * 10,
        20,
        Math.max(1, this.endOffset - this.startOffset) * 10,
        20,
      );
    },
  });
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: function (this: Range) {
      return [this.getBoundingClientRect()];
    },
  });
  surface = document.createElement("div");
  layer = document.createElement("div");
  const mount = document.createElement("div");
  surface.append(layer, mount);
  document.body.append(surface);
  renderer = new PhysicalComposerRenderer(surface, layer);
  editor = new Editor({
    element: mount,
    extensions: [StarterKit, physicalTypingExtension()],
    content: "<p>abcd</p>",
  });
  bindPhysicalRenderer(editor, renderer);
});
afterEach(() => {
  editor?.destroy();
  renderer?.dispose();
  surface?.remove();
  setPhysicsEnabled(false);
  vi.restoreAllMocks();
  if (originalRangeRect)
    Object.defineProperty(Range.prototype, "getBoundingClientRect", originalRangeRect);
  else Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
  if (originalRangeRects)
    Object.defineProperty(Range.prototype, "getClientRects", originalRangeRects);
  else Reflect.deleteProperty(Range.prototype, "getClientRects");
  vi.unstubAllGlobals();
});

/** Dispatch browser intent before the transaction that ProseMirror would produce for it. */
function input(type: string, text: string, from: number, to = from) {
  editor.view.dom.dispatchEvent(
    new InputEvent("beforeinput", { inputType: type, data: text, bubbles: true }),
  );
  editor.view.dispatch(editor.state.tr.insertText(text, from, to));
}

it("animates a middle insertion while preserving editor text, caret and undo", () => {
  input("insertText", "X", 3);
  expect(editor.getText()).toBe("abXcd");
  expect(
    [...layer.querySelectorAll("[data-physical-glyph]")].map((node) => node.textContent),
  ).toContain("X");
  expect(highlights.get("physical-composer-glyph")?.size).toBeGreaterThan(0);
  editor.commands.setTextSelection(2);
  expect(editor.state.selection.from).toBe(2);
  editor.commands.undo();
  expect(editor.getText()).toBe("abcd");
  expect(layer.querySelectorAll("[data-physical-glyph]")).toHaveLength(0);
});

it("defers an entire committed IME word until compositionend", async () => {
  editor.commands.setTextSelection(3);
  editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  input("insertCompositionText", "pin", 3);
  expect(layer.querySelectorAll("[data-physical-glyph]")).toHaveLength(0);
  input("insertCompositionText", "拼音", 3, 6);
  expect(layer.querySelectorAll("[data-physical-glyph]")).toHaveLength(0);
  editor.view.dom.dispatchEvent(
    new CompositionEvent("compositionend", { bubbles: true, data: "拼音" }),
  );
  await Promise.resolve();
  expect(editor.getText()).toBe("ab拼音cd");
  const shadows = [...layer.querySelectorAll("[data-physical-glyph]")].map(
    (node) => node.textContent,
  );
  expect(shadows).toContain("拼");
  expect(shadows).toContain("音");
  expect(shadows).not.toContain("p");
});

it("shatters only the removed middle glyph and leaves paste/programmatic changes as edge pulses", async () => {
  input("deleteContentBackward", "", 2, 3);
  expect(editor.getText()).toBe("acd");
  expect(renderer.model.bits.filter((bit) => bit.active)).toHaveLength(7);
  expect(layer.querySelectorAll("[data-physical-glyph]")).toHaveLength(0);
  await Promise.resolve();
  input("insertFromPaste", "PASTE", 2);
  expect(layer.querySelectorAll("[data-physical-glyph]")).toHaveLength(0);
  await Promise.resolve();
  editor.commands.setContent("<p>restored draft</p>");
  expect(layer.querySelectorAll("[data-physical-glyph]")).toHaveLength(0);
  expect(editor.getText()).toBe("restored draft");
});

it("does not hide text when global physics is off and clears active highlights on scroll", () => {
  setPhysicsEnabled(false);
  input("insertText", "X", 3);
  expect(layer.querySelectorAll("[data-physical-glyph]")).toHaveLength(0);
  expect(highlights.get("physical-composer-glyph")?.size ?? 0).toBe(0);
  setPhysicsEnabled(true);
  input("insertText", "Y", 4);
  expect(highlights.get("physical-composer-glyph")?.size).toBeGreaterThan(0);
  editor.view.dom.dispatchEvent(new Event("scroll"));
  expect(highlights.get("physical-composer-glyph")?.size ?? 0).toBe(0);
  expect(editor.getText()).toBe("abXYcd");
});

it("uses transaction positions when inserting a character identical to its neighbors", () => {
  editor.commands.setContent("<p>aaa</p>");
  input("insertText", "a", 2);
  expect(editor.getText()).toBe("aaaa");
  expect(renderer.model.glyphs.filter((glyph) => glyph.y < 0).map((glyph) => glyph.x)).toEqual([
    35,
  ]);
});

it("lands an IME commit at its composition anchor beside identical text", async () => {
  editor.commands.setContent("<p>ab音cd</p>");
  editor.commands.setTextSelection(3);
  editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  input("insertCompositionText", "y", 3);
  input("insertCompositionText", "音", 3, 4);
  editor.view.dom.dispatchEvent(
    new CompositionEvent("compositionend", { bubbles: true, data: "音" }),
  );
  await Promise.resolve();
  expect(editor.getText()).toBe("ab音音cd");
  expect(renderer.model.glyphs.filter((glyph) => glyph.y < 0).map((glyph) => glyph.x)).toEqual([
    45,
  ]);
});

it("keeps a sent snapshot independent from immediate editor clearing and the next input", () => {
  const play = capturePhysicalSend(editor);
  editor.commands.clearContent();
  expect(editor.getText()).toBe("");
  play?.();
  input("insertText", "新", 1);
  expect(editor.getText()).toBe("新");
  expect(
    [...layer.querySelectorAll("[data-physical-send]")].map((node) => node.textContent).join(""),
  ).toBe("abcd");
});

it("keeps typing intent until ProseMirror observes the native DOM mutation", async () => {
  editor.commands.setTextSelection(3);
  editor.view.dom.dispatchEvent(
    new InputEvent("beforeinput", { inputType: "insertText", data: "X", bubbles: true }),
  );
  const text = editor.view.dom.querySelector("p")!.firstChild!;
  text.textContent = "abXcd";
  editor.view.dom.dispatchEvent(
    new InputEvent("input", { inputType: "insertText", data: "X", bubbles: true }),
  );
  await Promise.resolve();
  expect(editor.getText()).toBe("abXcd");
  expect(
    [...layer.querySelectorAll("[data-physical-glyph]")].map((node) => node.textContent),
  ).toContain("X");
});

it("captures the last deleted glyph before native DOM removal changes its range", async () => {
  editor.commands.setTextSelection(5);
  editor.view.dom.dispatchEvent(
    new InputEvent("beforeinput", { inputType: "deleteContentBackward", bubbles: true }),
  );
  editor.view.dom.querySelector("p")!.firstChild!.textContent = "abc";
  editor.view.dom.dispatchEvent(
    new InputEvent("input", { inputType: "deleteContentBackward", bubbles: true }),
  );
  await Promise.resolve();
  expect(editor.getText()).toBe("abc");
  expect(renderer.model.bits.filter((bit) => bit.active)).toHaveLength(7);
});

it("keeps the previous falling glyph in motion when another character is typed", () => {
  input("insertText", "X", 3);
  clock.advance(16);
  expect(renderer.model.glyphs.find((glyph) => glyph.x === 45)?.y).toBeLessThan(0);
  input("insertText", "Y", 4);
  expect(editor.getText()).toBe("abXYcd");
  expect(renderer.model.glyphs.find((glyph) => glyph.x === 45)?.y).toBeLessThan(0);
  for (let time = 32; time <= 640; time += 16) clock.advance(time);
  expect(renderer.model.bits.filter((bit) => bit.active)).toHaveLength(6);
});
