/** Maps editor transactions to decorative motion without changing document or selection transactions. */
import { Extension, type Editor } from "@tiptap/core";
import type { Node as DocumentNode } from "@tiptap/pm/model";
import { Plugin, type Transaction } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";
import type { EditorView } from "@tiptap/pm/view";
import { isPhysicsEnabled } from "../../../lib/motion/preference";
import { withComposerImpactLayout } from "../composerImpact";
import type { GlyphSnapshot, PhysicalComposerRenderer } from "./renderer";

/** A measured grapheme with ProseMirror offsets; atom nodes are never split into text shadows. */
interface MeasuredGlyph extends GlyphSnapshot {
  from: number;
  to: number;
  range: Range;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const renderers = new WeakMap<Editor, PhysicalComposerRenderer>();

/** Bind a mounted React overlay to an existing editor; cleanup releases only that binding. */
export function bindPhysicalRenderer(editor: Editor, renderer: PhysicalComposerRenderer | null) {
  if (renderer) renderers.set(editor, renderer);
  else renderers.delete(editor);
  return () => {
    if (renderers.get(editor) === renderer) {
      renderer?.clearGlyphs();
      renderers.delete(editor);
    }
  };
}

/** Locate a minimal changed document interval, including insertions before identical suffixes. */
function difference(before: DocumentNode, after: DocumentNode) {
  const start = before.content.findDiffStart(after.content);
  const end = before.content.findDiffEnd(after.content);
  if (start === null || !end) return null;
  // Repeated characters can make the common prefix and suffix overlap.
  const overlap = start - Math.min(end.a, end.b);
  return {
    start,
    newStart: start,
    oldEnd: end.a + Math.max(0, overlap),
    newEnd: end.b + Math.max(0, overlap),
  };
}

/** Use step maps rather than text equality to preserve the edited position among repeated glyphs. */
function transactionDifference(transaction: Transaction) {
  let start = Infinity;
  let oldEnd = 0;
  let newStart = Infinity;
  let newEnd = 0;
  transaction.mapping.maps.forEach((map, index) => {
    map.forEach((a, b, c, d) => {
      const preceding = new Mapping(transaction.mapping.maps.slice(0, index)).invert();
      const following = transaction.mapping.slice(index + 1);
      start = Math.min(start, preceding.map(a, -1));
      oldEnd = Math.max(oldEnd, preceding.map(b, 1));
      newStart = Math.min(newStart, following.map(c, -1));
      newEnd = Math.max(newEnd, following.map(d, 1));
    });
  });
  return Number.isFinite(start)
    ? { start, oldEnd, newStart, newEnd }
    : difference(transaction.before, transaction.doc);
}
/** Measure visible text graphemes in a document interval, in untransformed surface coordinates. */
export function measureGlyphs(
  view: EditorView,
  renderer: PhysicalComposerRenderer,
  from: number,
  to: number,
): MeasuredGlyph[] {
  return withComposerImpactLayout(renderer.surface, () => {
    const origin = renderer.surface.getBoundingClientRect();
    const viewport = view.dom.getBoundingClientRect();
    renderer.clip(
      viewport.left - origin.left,
      viewport.top - origin.top,
      viewport.right - origin.left,
      viewport.bottom - origin.top,
    );
    const result: MeasuredGlyph[] = [];
    view.state.doc.nodesBetween(
      Math.max(0, from),
      Math.min(view.state.doc.content.size, to),
      (node, pos) => {
        if (!node.isText || !node.text) return !node.isAtom;
        for (const { segment, index } of segmenter.segment(node.text)) {
          const start = pos + index;
          const end = start + segment.length;
          if (end <= from || start >= to) continue;
          const a = view.domAtPos(start);
          const b = view.domAtPos(end);
          const range = document.createRange();
          range.setStart(a.node, a.offset);
          range.setEnd(b.node, b.offset);
          const rect = range.getBoundingClientRect();
          if (
            rect.width <= 0 ||
            rect.height <= 0 ||
            rect.bottom <= viewport.top ||
            rect.top >= viewport.bottom ||
            rect.right <= viewport.left ||
            rect.left >= viewport.right
          )
            continue;
          const parent = a.node instanceof Element ? a.node : a.node.parentElement;
          const style = getComputedStyle(parent ?? view.dom);
          result.push({
            text: segment,
            x: rect.left - origin.left,
            y: rect.top - origin.top,
            width: rect.width,
            height: rect.height,
            font: style.font || `${style.fontSize} ${style.fontFamily}`,
            from: start,
            to: end,
            range,
          });
        }
        return false;
      },
    );
    return result;
  });
}

/** Hide only measured real glyphs, retaining their DOM nodes, selection and undo history. */
function hideGlyphs(glyphs: MeasuredGlyph[]): GlyphSnapshot[] | null {
  if (typeof Highlight === "undefined" || typeof CSS === "undefined" || !CSS.highlights)
    return null;
  const highlight = CSS.highlights.get("physical-composer-glyph") ?? new Highlight();
  CSS.highlights.set("physical-composer-glyph", highlight);
  return glyphs.map((glyph) => {
    highlight.add(glyph.range);
    return {
      ...glyph,
      restore: () => {
        highlight.delete(glyph.range);
      },
    };
  });
}

/** Own browser intent/IME lifetime; transactions remain entirely controlled by Tiptap. */
class PhysicalTypingBridge {
  private intent = "";
  private intentVersion = 0;
  private composing = false;
  private compositionBase: DocumentNode | null = null;
  private compositionFrom = 0;
  private committedText: string | null = null;
  private disposed = false;

  /** Attach read-only DOM listeners; lookup supplies the currently mounted optional overlay. */
  constructor(
    private readonly view: EditorView,
    private readonly renderer: () => PhysicalComposerRenderer | null,
  ) {
    view.dom.addEventListener("beforeinput", this.beforeInput, true);
    view.dom.addEventListener("keydown", this.keyDown, true);
    view.dom.addEventListener("paste", this.paste, true);
    view.dom.addEventListener("compositionstart", this.compositionStart, true);
    view.dom.addEventListener("compositionend", this.compositionEnd, true);
    view.dom.addEventListener("scroll", this.scroll, true);
  }

  /** Keep intent only within the browser event turn, so a later store rewrite never becomes typing. */
  private remember(intent: string) {
    this.intent = intent;
    const version = ++this.intentVersion;
    queueMicrotask(() => {
      if (this.intentVersion === version) this.intent = "";
    });
  }

  /** Capture inputType before ProseMirror applies the browser edit. */
  private beforeInput = (event: InputEvent) => {
    this.remember(event.inputType);
  };

  /** Cover desktop deletion paths that ProseMirror handles before native beforeinput fires. */
  private keyDown = (event: KeyboardEvent) => {
    if (event.isComposing) return;
    this.remember(
      event.key === "Backspace"
        ? "deleteContentBackward"
        : event.key === "Delete"
          ? "deleteContentForward"
          : "",
    );
  };

  /** Tag paste before the existing application handler dispatches its transaction. */
  private paste = () => {
    this.remember("insertFromPaste");
  };

  /** Save the pre-composition document and restore any previous shadows before IME owns the DOM. */
  private compositionStart = () => {
    this.composing = true;
    this.committedText = null;
    this.compositionBase = this.view.state.doc;
    this.compositionFrom = this.view.state.selection.from;
    this.renderer()?.clearGlyphs();
  };

  /** Wait through the same event turn for the final IME transaction, without an animation frame or timer. */
  private compositionEnd = (event: CompositionEvent) => {
    this.composing = false;
    this.committedText = event.data;
    queueMicrotask(() => {
      if (!this.disposed && !this.composing) this.finishComposition();
    });
  };

  /** Cancel text shadows on scroll; actual content immediately remains visible at its new position. */
  private scroll = () => {
    this.renderer()?.clearGlyphs();
  };

  /** Animate a completed composition once; an outstanding final DOM transaction may finish it later. */
  private finishComposition() {
    const base = this.compositionBase;
    const renderer = this.renderer();
    if (!base || !renderer || this.committedText === null) return;
    const from = Math.min(this.compositionFrom, this.view.state.doc.content.size);
    const to = Math.min(from + this.committedText.length, this.view.state.doc.content.size);
    if (this.committedText && this.view.state.doc.textBetween(from, to, "") !== this.committedText)
      return;
    const changed = !base.eq(this.view.state.doc) && to > from;
    this.compositionBase = null;
    this.committedText = null;
    if (changed && isPhysicsEnabled()) this.animateInsertion(renderer, from, to);
  }

  /** Measure the changed text plus at most three graphemes per side, then hide only those shadows. */
  private animateInsertion(renderer: PhysicalComposerRenderer, from: number, to: number) {
    const around = measureGlyphs(
      this.view,
      renderer,
      Math.max(0, from - 12),
      Math.min(this.view.state.doc.content.size, to + 12),
    );
    const first = around.findIndex((glyph) => glyph.to > from);
    const last = around.findLastIndex((glyph) => glyph.from < to);
    if (first < 0 || last < first) {
      this.pulse(renderer, from);
      return;
    }
    const visible = around.slice(Math.max(0, first - 3), last + 4);
    const snapshots = hideGlyphs(visible);
    if (!snapshots) {
      this.pulse(renderer, from);
      return;
    }
    const changed = new Set(
      visible.flatMap((glyph, index) => (glyph.to > from && glyph.from < to ? [index] : [])),
    );
    renderer.insert(snapshots, changed);
  }

  /** Measure an insertion boundary under the impact-layout guard and pulse without hiding text. */
  private pulse(renderer: PhysicalComposerRenderer, position: number) {
    withComposerImpactLayout(renderer.surface, () => {
      const rect = this.view.coordsAtPos(Math.min(this.view.state.doc.content.size, position));
      renderer.pulse(rect.left - renderer.surface.getBoundingClientRect().left);
    });
  }

  /** Capture deleted glyphs before next mutates DOM, then decorate only the final committed document. */
  dispatch(transaction: Transaction, next: (transaction: Transaction) => void) {
    const renderer = this.renderer();
    const before = this.view.state.doc;
    const diff = transaction.docChanged ? transactionDifference(transaction) : null;
    const deletion = this.intent.startsWith("delete");
    const removed =
      renderer && diff && deletion && !this.composing && isPhysicsEnabled()
        ? measureGlyphs(this.view, renderer, diff.start, diff.oldEnd)
        : [];
    if (transaction.docChanged) renderer?.clearGlyphs();
    next(transaction);
    if (!renderer || !diff || this.composing || !isPhysicsEnabled()) return;
    if (this.compositionBase && this.committedText !== null) {
      this.finishComposition();
      return;
    }
    if (deletion) {
      renderer.remove(removed);
      return;
    }
    const finalDiff = transaction.doc.eq(this.view.state.doc)
      ? diff
      : difference(before, this.view.state.doc);
    if (!finalDiff) return;
    const inserted = this.view.state.doc.textBetween(
      finalDiff.newStart,
      finalDiff.newEnd,
      "\n",
      "\uFFFC",
    );
    // Multi-character pastes, atom insertion, history and controlled rewrites only disturb the edge.
    if (
      this.intent === "insertText" &&
      Array.from(segmenter.segment(inserted)).length === 1 &&
      !inserted.includes("\uFFFC") &&
      inserted !== "\n"
    ) {
      this.animateInsertion(renderer, finalDiff.newStart, finalDiff.newEnd);
    } else this.pulse(renderer, finalDiff.newStart);
    this.intent = "";
  }

  /** Remove listeners and restore real text on editor destruction or mode remount. */
  destroy() {
    this.disposed = true;
    this.renderer()?.clearGlyphs();
    this.view.dom.removeEventListener("beforeinput", this.beforeInput, true);
    this.view.dom.removeEventListener("keydown", this.keyDown, true);
    this.view.dom.removeEventListener("paste", this.paste, true);
    this.view.dom.removeEventListener("compositionstart", this.compositionStart, true);
    this.view.dom.removeEventListener("compositionend", this.compositionEnd, true);
    this.view.dom.removeEventListener("scroll", this.scroll, true);
  }
}

/** Create an optional Tiptap decoration bridge; renderer lookup follows React context changes. */
export function physicalTypingExtension() {
  return Extension.create<Record<string, never>, { bridge: PhysicalTypingBridge | null }>({
    name: "physical-typing",
    addStorage() {
      return { bridge: null };
    },
    addProseMirrorPlugins() {
      return [
        new Plugin({
          view: (view) => {
            const bridge = new PhysicalTypingBridge(view, () => renderers.get(this.editor) ?? null);
            this.storage.bridge = bridge;
            return {
              destroy: () => {
                bridge.destroy();
                this.storage.bridge = null;
              },
            };
          },
        }),
      ];
    },
    dispatchTransaction({ transaction, next }) {
      if (this.storage.bridge) this.storage.bridge.dispatch(transaction, next);
      else next(transaction);
    },
  });
}
