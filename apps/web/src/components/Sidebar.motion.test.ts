import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

/** Release momentum, legacy animations and visual-only edge elasticity on measured rows. */
import { createSidebarListMotion } from "./Sidebar.motion";
import { readOffset, offsetOf } from "../lib/motion/elementOffset";
import { setPhysicsEnabled } from "../lib/motion/preference";
import { installTestRaf } from "../lib/motion/testRaf";
import { createSidebarCollisionDetection, restrictSidebarDrag } from "./Sidebar.drag";
import type { Modifier } from "@dnd-kit/core";
import { Spring } from "../lib/motion/spring";

class TestAnimation {
  progress: number | null = 0;
  playState: AnimationPlayState = "running";
  effect = { getComputedTiming: () => ({ progress: this.progress }) };
  cancel = vi.fn(() => {
    this.playState = "idle";
  });
  private onFinish: (() => void) | undefined;
  addEventListener(_type: string, listener: () => void) {
    this.onFinish = listener;
  }
  finish() {
    this.playState = "finished";
    this.onFinish?.();
  }
}

class TestRow {
  offsetTop = 0;
  offsetLeft = 4;
  offsetWidth = 260;
  namespaceURI = "http://www.w3.org/1999/xhtml";
  dragTranslate = 0;
  style: Record<string, string> = {};
  inert = false;
  attributes: { name: string; value: string }[] = [];
  children: TestRow[] = [];
  clones: TestRow[] = [];
  remove = vi.fn();
  animations: TestAnimation[] = [];
  constructor(
    readonly name: string,
    public offsetHeight = 82,
  ) {}
  /** Return viewport geometry from layout, drag translation and live spring offset without browser layout. */
  getBoundingClientRect() {
    const offset = readOffset(this as unknown as HTMLElement);
    return {
      left: this.offsetLeft + offset.x,
      top: this.offsetTop + this.dragTranslate + offset.y,
      height: this.offsetHeight,
    };
  }
  setAttribute(name: string, value: string) {
    this.removeAttribute(name);
    this.attributes.push({ name, value });
  }
  removeAttribute(name: string) {
    this.attributes = this.attributes.filter((attribute) => attribute.name !== name);
  }
  querySelectorAll(_selector: string): TestRow[] {
    return this.children.flatMap((child) => [child, ...child.querySelectorAll("*")]);
  }
  cloneNode(_deep: boolean): TestRow {
    const clone = new TestRow(`${this.name} clone`, this.offsetHeight);
    clone.namespaceURI = this.namespaceURI;
    clone.style = { ...this.style };
    clone.attributes = this.attributes.map((attribute) => ({ ...attribute }));
    clone.children = this.children.map((child) => child.cloneNode(true));
    this.clones.push(clone);
    return clone;
  }
  animate = vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => {
    const animation = new TestAnimation();
    this.animations.push(animation);
    return animation;
  });
}

function fixture(rows: TestRow[]) {
  const media = { matches: false };
  const parent = {
    children: rows,
    ownerDocument: { defaultView: { matchMedia: () => media } },
    getBoundingClientRect: () => ({ top: 0 }),
    append(node: TestRow) {
      parent.children.push(node);
      node.remove.mockImplementation(() => {
        parent.children = parent.children.filter((child) => child !== node);
      });
    },
  };
  function layout(next: TestRow[]) {
    let top = 8;
    for (const row of next) {
      row.offsetTop = top;
      top += row.offsetHeight + 1;
    }
    parent.children = [
      ...next,
      ...parent.children.filter((row) => row.style.position === "absolute"),
    ];
  }
  layout(rows);
  const motion = createSidebarListMotion(parent as unknown as HTMLUListElement);
  return { motion, layout, media, parent };
}

function expectMove(row: TestRow, offset: number) {
  expect(row.animate).toHaveBeenLastCalledWith(
    [{ transform: `translateY(${offset}px)` }, { transform: "translateY(0px)" }],
    { duration: 150, easing: "ease-out" },
  );
}

beforeEach(() => vi.stubGlobal("HTMLElement", TestRow));
afterEach(() => {
  setPhysicsEnabled(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("sidebar list motion", () => {
  it("compresses edge travel once while collision ranking stays at the hard boundary", () => {
    setPhysicsEnabled(true);
    const rect = (top: number, height: number) => ({
      top,
      bottom: top + height,
      height,
      left: 0,
      right: 100,
      width: 100,
    });
    const active = {
      id: "source",
      data: { current: {} },
      rect: { current: { initial: rect(100, 40), translated: null } },
    };
    const args: Parameters<Modifier>[0] = {
      active,
      activatorEvent: null,
      activeNodeRect: rect(100, 40),
      draggingNodeRect: rect(100, 40),
      containerNodeRect: rect(0, 500),
      overlayNodeRect: null,
      over: null,
      scrollableAncestors: [],
      scrollableAncestorRects: [rect(0, 500)],
      windowRect: null,
      transform: { x: 0, y: 460, scaleX: 1, scaleY: 1 },
    };
    const small = restrictSidebarDrag(args, 32).y;
    const large = restrictSidebarDrag({ ...args, transform: { ...args.transform, y: 560 } }, 32).y;
    expect(small).toBeGreaterThan(360);
    expect(large).toBeGreaterThan(small);
    expect(large - small).toBeLessThan(small - 360);
    expect(large).toBeLessThan(860);
    const detector = createSidebarCollisionDetection(() => true);
    const targets = [rect(460, 40), rect(540, 40)];
    const collisions = detector({
      active,
      collisionRect: rect(100 + large, 40),
      pointerCoordinates: { x: 20, y: 680 },
      droppableRects: new Map([
        ["last", targets[0]!],
        ["past-edge", targets[1]!],
      ]),
      droppableContainers: targets.map((target, i) => ({
        id: i === 0 ? "last" : "past-edge",
        key: String(i),
        disabled: false,
        data: { current: {} },
        node: { current: null },
        rect: { current: target },
      })),
    });
    expect(collisions[0]?.id).toBe("last");
    const top = restrictSidebarDrag({ ...args, transform: { ...args.transform, y: -168 } }, 32).y;
    expect(top).toBeLessThan(-68);
    expect(top).toBeGreaterThan(-168);
    setPhysicsEnabled(false);
    expect(restrictSidebarDrag(args, 32).y).toBe(360);
    expect(restrictSidebarDrag({ ...args, transform: { ...args.transform, y: -168 } }, 32).y).toBe(
      -68,
    );
  });
  it("hands release momentum to a fling spring while peers settle even with reduced motion", () => {
    installTestRaf();
    setPhysicsEnabled(true);
    const [a, b, c] = [new TestRow("a"), new TestRow("b"), new TestRow("c")];
    const { motion, layout, media } = fixture([a, b, c]);
    motion.update(true);
    media.matches = true;
    const useToken = vi.spyOn(Spring.prototype, "use");
    a.dragTranslate = 130;
    c.dragTranslate = 16;
    motion.release({ x: 0, y: 600 }, a as unknown as HTMLElement);
    layout([b, a, c]);
    a.dragTranslate = c.dragTranslate = 0;
    motion.update(true);
    expect(a.style.transform).toBe("translate(0.00px, 47.00px)");
    const source = offsetOf(a as unknown as HTMLElement);
    const peer = offsetOf(c as unknown as HTMLElement);
    expect(source.y.velocity).toBe(600);
    expect(peer.y.velocity).toBe(0);
    expect(
      useToken.mock.calls.findLast((_, index) => useToken.mock.contexts[index] === source.y),
    ).toEqual([{ response: 0.46, damping: 0.8 }]);
    expect(
      useToken.mock.calls.findLast((_, index) => useToken.mock.contexts[index] === peer.y),
    ).toEqual([{ response: 0.4, damping: 1 }]);
    // One real integration step distinguishes fling damping from settle.
    source.y.step(0.016);
    peer.y.step(0.016);
    expect(source.y.value).toBeGreaterThan(50);
    expect(peer.y.value).toBeLessThan(16);
    expect(a.animate).not.toHaveBeenCalled();
    motion.dispose();
  });
  it("moves a retained Active row into Settled with its displaced peers", () => {
    const pinnedHeader = new TestRow("Pinned", 0);
    const pinned = new TestRow("pin");
    const divider = new TestRow("Active", 0);
    const a = new TestRow("a");
    const b = new TestRow("b");
    const settledHeader = new TestRow("Settled", 32);
    const settled = new TestRow("settled", 36);
    const rows = [pinnedHeader, pinned, divider, a, b, settledHeader, settled];
    const { motion, layout } = fixture(rows);
    motion.update(true);
    expect(rows.every((row) => row.animations.length === 0)).toBe(true);

    a.offsetHeight = 36;
    layout([pinnedHeader, pinned, divider, b, settledHeader, settled, a]);
    motion.update(true);
    expectMove(a, -153);
    expectMove(b, 83);
    expectMove(settledHeader, 83);
    expectMove(settled, 83);
    expect(pinned.animate).not.toHaveBeenCalled();
    expect(divider.animate).not.toHaveBeenCalled();
  });

  it("refreshes the drop baseline without replay and animates the next ordinary move", () => {
    const [a, b, c] = [new TestRow("a"), new TestRow("b"), new TestRow("c")];
    const { motion, layout } = fixture([a, b, c]);
    motion.update(true);
    motion.suspend();
    a.dragTranslate = 300;
    b.dragTranslate = -83;
    motion.update(false);
    motion.suspend();
    layout([b, a, c]);
    a.dragTranslate = b.dragTranslate = 0;
    motion.update(true);
    expect([a, b, c].every((row) => row.animations.length === 0)).toBe(true);

    layout([c, b, a]);
    motion.update(true);
    expectMove(c, 166);
    expectMove(b, -83);
    expectMove(a, -83);
  });

  it("glides every row from its released position into its committed slot", () => {
    const [a, b, c] = [new TestRow("a"), new TestRow("b"), new TestRow("c")];
    const { motion, layout } = fixture([a, b, c]);
    motion.update(true);
    motion.suspend();
    // a is lifted 130px below its slot; b previews upward into a's place
    // and c holds a 16px label gap open below the divider.
    a.dragTranslate = 130;
    b.dragTranslate = -83;
    c.dragTranslate = 16;
    motion.update(false);
    motion.release();
    layout([b, a, c]);
    a.dragTranslate = b.dragTranslate = c.dragTranslate = 0;
    motion.update(true);
    // Lifted top 138, committed slot top 91: glide the remaining 47px.
    expectMove(a, 47);
    // b already sits where it lands; c closes its 16px gap.
    expect(b.animations).toHaveLength(0);
    expectMove(c, 16);
  });

  it("does not glide on release when motion is reduced", () => {
    const [a, b] = [new TestRow("a"), new TestRow("b")];
    const { motion, layout, media } = fixture([a, b]);
    motion.update(true);
    media.matches = true;
    a.dragTranslate = 100;
    motion.release();
    layout([b, a]);
    a.dragTranslate = 0;
    motion.update(true);
    expect(a.animations).toHaveLength(0);
    expect(b.animations).toHaveLength(0);
  });

  it("does not carry a canceled drag's transformed position into the next move", () => {
    const a = new TestRow("a");
    const b = new TestRow("b");
    const { motion, layout } = fixture([a, b]);
    motion.update(true);
    motion.suspend();
    a.dragTranslate = 500;
    b.dragTranslate = -83;
    motion.update(false);
    motion.suspend();
    a.dragTranslate = b.dragTranslate = 0;
    motion.update(true);
    expect(a.animate).not.toHaveBeenCalled();
    expect(b.animate).not.toHaveBeenCalled();

    layout([b, a]);
    motion.update(true);
    expectMove(a, -83);
    expectMove(b, 83);
  });

  it("retargets rapid changes from the current visual position", () => {
    const [a, b, c] = [new TestRow("a", 99), new TestRow("b", 99), new TestRow("c", 99)];
    const { motion, layout } = fixture([a, b, c]);
    motion.update(true);
    layout([b, c, a]);
    motion.update(true);
    expectMove(a, -200);
    const first = a.animations[0]!;
    first.progress = 0.25;

    layout([b, a, c]);
    motion.update(true);
    expect(first.cancel).toHaveBeenCalledOnce();
    expectMove(a, -50);
    first.finish();
    motion.suspend();
    expect(a.animations[1]!.cancel).toHaveBeenCalledOnce();
  });

  it("keeps an uninterrupted movement when the layout position does not change", () => {
    const a = new TestRow("a");
    const b = new TestRow("b");
    const { motion, layout } = fixture([a, b]);
    motion.update(true);
    layout([b, a]);
    motion.update(true);
    a.animations[0]!.progress = 0.5;
    motion.update(true);
    expect(a.animate).toHaveBeenCalledOnce();
    expect(a.animations[0]!.cancel).not.toHaveBeenCalled();
  });

  it("cancels owned motion on suspension and never animates a disposed list", () => {
    const a = new TestRow("a");
    const b = new TestRow("b");
    const { motion, layout } = fixture([a, b]);
    motion.update(true);
    layout([b, a]);
    motion.update(true);
    motion.suspend();
    expect(a.animations[0]!.cancel).toHaveBeenCalledOnce();
    expect(b.animations[0]!.cancel).toHaveBeenCalledOnce();
    motion.update(false);
    layout([a, b]);
    motion.update(true);
    motion.dispose();
    expect(a.animations[1]!.cancel).toHaveBeenCalledOnce();
    layout([b, a]);
    motion.update(true);
    expect(a.animate).toHaveBeenCalledTimes(2);
  });

  it("fades a collapsed-shelf exit at its current visual box and a new wake in", () => {
    const a = new TestRow("a");
    const b = new TestRow("b");
    const fresh = new TestRow("new");
    a.setAttribute("data-thread-item", "a");
    a.children = [new TestRow("button")];
    a.children[0]!.setAttribute("id", "thread-control");
    a.children[0]!.setAttribute("data-testid", "thread-control");
    a.children[0]!.setAttribute("data-state", "open");
    const icon = new TestRow("provider icon");
    icon.namespaceURI = "http://www.w3.org/2000/svg";
    icon.setAttribute("id", "provider-mask");
    icon.setAttribute("mask", "url(#provider-mask)");
    a.children.push(icon);
    const { motion, layout, parent } = fixture([a, b]);
    motion.update(true);
    layout([b, a]);
    motion.update(true);
    a.animations[0]!.progress = 0.5;
    layout([b, fresh]);
    motion.update(true);
    expect(a.animations[0]!.cancel).toHaveBeenCalledOnce();
    expect(fresh.animate).toHaveBeenLastCalledWith(
      [
        { opacity: 0, transform: "translateY(83px)" },
        { opacity: 1, transform: "translateY(0px)" },
      ],
      {
        duration: 150,
        easing: "ease-out",
      },
    );
    const clone = a.clones[0]!;
    expect(clone.style).toMatchObject({
      position: "absolute",
      top: "49.5px",
      left: "4px",
      width: "260px",
      height: "82px",
      transform: "none",
      pointerEvents: "none",
    });
    expect(clone.inert).toBe(true);
    expect(clone.attributes).toEqual([{ name: "aria-hidden", value: "true" }]);
    expect(clone.children[0]!.attributes).toEqual([{ name: "data-state", value: "open" }]);
    expect(clone.children[1]!.attributes).toEqual(icon.attributes);
    expect(clone.animate).toHaveBeenCalledWith(
      [
        { opacity: 1, transform: "translateY(0px)" },
        { opacity: 0, transform: "translateY(-83px)" },
      ],
      {
        duration: 150,
        easing: "ease-out",
      },
    );
    expect(parent.children.includes(clone)).toBe(true);
    motion.update(true);
    expect(clone.animations).toHaveLength(1);
    expect(clone.clones).toHaveLength(0);
    clone.animations[0]!.finish();
    expect(parent.children.includes(clone)).toBe(false);
  });

  it("rides entering rows on the shelf displacement so an opened shelf moves as one block", () => {
    const a = new TestRow("a", 40);
    const header = new TestRow("header", 32);
    const x = new TestRow("x", 36);
    const y = new TestRow("y", 36);
    const z = new TestRow("z", 36);
    const { motion, layout } = fixture([a, header, x]);
    motion.update(true);
    // The shelf is anchored below the list, so two revealed rows lift the
    // header and its existing rows by the same 72px.
    layout([a, header, x, y, z]);
    for (const row of [header, x, y, z]) row.offsetTop -= 72;
    motion.update(true);
    expectMove(header, 72);
    expectMove(x, 72);
    expect(a.animate).not.toHaveBeenCalled();
    expect(y.animate).toHaveBeenLastCalledWith(
      [
        { opacity: 0, transform: "translateY(72px)" },
        { opacity: 1, transform: "translateY(0px)" },
      ],
      { duration: 150, easing: "ease-out" },
    );
    expect(z.animate).toHaveBeenLastCalledWith(
      [
        { opacity: 0, transform: "translateY(72px)" },
        { opacity: 1, transform: "translateY(0px)" },
      ],
      { duration: 150, easing: "ease-out" },
    );
  });

  it("rides new rows on a retained header's unfinished travel", () => {
    const header = new TestRow("header", 32);
    const above = new TestRow("above", 39);
    const incoming = new TestRow("incoming", 36);
    const { motion, layout } = fixture([header]);
    motion.update(true);
    layout([above, header]);
    motion.update(true);
    header.animations[0]!.progress = 0.25;
    layout([above, header, incoming]);
    motion.update(true);
    expect(incoming.animate).toHaveBeenLastCalledWith(
      [
        { opacity: 0, transform: "translateY(-30px)" },
        { opacity: 1, transform: "translateY(0px)" },
      ],
      { duration: 150, easing: "ease-out" },
    );
  });

  it("cancels in-flight row travel when a bulk update skips animation", () => {
    const a = new TestRow("a");
    const b = new TestRow("b");
    const { motion, layout } = fixture([a, b]);
    motion.update(true);
    layout([b, a]);
    motion.update(true);
    const first = a.animations[0]!;
    first.progress = 0.4;
    const incoming = Array.from({ length: 41 }, (_, index) => new TestRow(`new-${index}`));
    layout(incoming);
    motion.update(true);
    expect(first.cancel).toHaveBeenCalledOnce();
    expect(incoming.every((row) => row.animate.mock.calls.length === 0)).toBe(true);
  });

  it("keeps in-flight shelf entry travel when the shelf closes mid-animation", () => {
    const a = new TestRow("a", 40);
    const header = new TestRow("header", 32);
    const x = new TestRow("x", 36);
    const y = new TestRow("y", 36);
    const { motion, layout } = fixture([a, header, x]);
    motion.update(true);
    layout([a, header, x, y]);
    for (const row of [header, x, y]) row.offsetTop -= 36;
    motion.update(true);
    const entry = y.animations[0]!;
    header.animations[0]!.progress = 0.25;
    x.animations[0]!.progress = 0.25;
    entry.progress = 0.25;
    layout([a, header, x]);
    motion.update(true);
    expect(entry.cancel).toHaveBeenCalledOnce();
    const clone = y.clones[0]!;
    // Remaining entry travel (36 * 0.75) is baked into the clone's box so the
    // fade starts from the row's current visual top instead of jumping to 0.
    expect(clone.style.top).toBe("110px");
    expect(clone.animate).toHaveBeenCalledWith(
      [
        { opacity: 0.25, transform: "translateY(0px)" },
        { opacity: 0, transform: "translateY(9px)" },
      ],
      { duration: 150, easing: "ease-out" },
    );
    expectMove(header, -9);
    expectMove(x, -9);
  });

  it("clears exit clones on pickup and does not fade the release commit", () => {
    const [a, b, c] = [new TestRow("a"), new TestRow("b"), new TestRow("c")];
    const { motion, layout, parent } = fixture([a, b]);
    motion.update(false);
    layout([b]);
    motion.update(true);
    const clone = a.clones[0]!;
    motion.suspend();
    expect(clone.animations[0]!.cancel).toHaveBeenCalledOnce();
    expect(parent.children.includes(clone)).toBe(false);
    motion.update(false);
    motion.suspend();
    layout([c]);
    motion.update(true);
    expect(b.clones).toHaveLength(0);
    expect(c.animations).toHaveLength(0);
    layout([c, a]);
    motion.update(true);
    expect(a.animate).toHaveBeenCalledWith(
      [
        { opacity: 0, transform: "translateY(0px)" },
        { opacity: 1, transform: "translateY(0px)" },
      ],
      {
        duration: 150,
        easing: "ease-out",
      },
    );
    motion.dispose();
    expect(a.animations.at(-1)!.cancel).toHaveBeenCalledOnce();
  });

  it("carries entry opacity into a quick exit and removes artifacts on a silent update", () => {
    const a = new TestRow("a");
    const marker = new TestRow("boundary", 0);
    const { motion, layout, parent } = fixture([marker]);
    motion.update(false);
    layout([marker, a]);
    motion.update(true);
    a.animations[0]!.progress = 0.4;
    layout([]);
    motion.update(true);
    expect(marker.clones).toHaveLength(0);
    const clone = a.clones[0]!;
    expect(clone.animate).toHaveBeenCalledWith(
      [
        { opacity: 0.4, transform: "translateY(0px)" },
        { opacity: 0, transform: "translateY(40px)" },
      ],
      {
        duration: 150,
        easing: "ease-out",
      },
    );
    motion.update(false);
    expect(parent.children).toEqual([]);
    expect(clone.animations[0]!.cancel).toHaveBeenCalledOnce();
  });

  it("retargets an in-flight entry when a later layout shift moves the row", () => {
    const a = new TestRow("a", 40);
    const header = new TestRow("header", 32);
    const x = new TestRow("x", 36);
    const y = new TestRow("y", 36);
    const { motion, layout } = fixture([a, header, x]);
    motion.update(true);
    layout([a, header, x, y]);
    for (const row of [header, x, y]) row.offsetTop -= 36;
    motion.update(true);
    const entry = y.animations[0]!;
    entry.progress = 0.25;
    for (const row of [header, x, y]) row.offsetTop += 40;
    motion.update(true);
    expect(entry.cancel).not.toHaveBeenCalled();
    // Remaining 27px of the 36px entry plus the new 40px shift.
    expectMove(y, -13);
  });

  it("skips fades when a large list change would clone too many rows", () => {
    const rows = Array.from({ length: 41 }, (_, index) => new TestRow(`row-${index}`));
    const { motion, layout, parent } = fixture(rows);
    motion.update(true);
    layout([]);
    motion.update(true);
    expect(rows.every((row) => row.clones.length === 0)).toBe(true);
    expect(parent.children).toHaveLength(0);
    const entering = Array.from({ length: 41 }, (_, index) => new TestRow(`new-${index}`));
    layout(entering);
    motion.update(true);
    expect(entering.every((row) => row.animate.mock.calls.length === 0)).toBe(true);
  });

  it("still slides rows when one removal displaces a large list", () => {
    const rows = Array.from({ length: 60 }, (_, index) => new TestRow(`row-${index}`));
    const { motion, layout } = fixture(rows);
    motion.update(true);
    const [removed, ...rest] = rows;
    layout(rest);
    motion.update(true);
    expect(removed!.clones).toHaveLength(1);
    expect(rest.every((row) => row.animations.length === 1)).toBe(true);
  });

  it("respects reduced motion while keeping the next baseline fresh", () => {
    const a = new TestRow("a");
    const b = new TestRow("b");
    const { motion, layout, media } = fixture([a, b]);
    motion.update(true);
    media.matches = true;
    layout([b, a]);
    motion.update(true);
    expect(a.animate).not.toHaveBeenCalled();
    media.matches = false;
    layout([a, b]);
    motion.update(true);
    expectMove(a, 83);
    expectMove(b, -83);
  });
});
