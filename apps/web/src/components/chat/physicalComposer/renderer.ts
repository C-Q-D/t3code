/** Imperative overlay renderer; editor content, selection and dispatch remain outside this module. */
import { run } from "../../../lib/motion/loop";
import { observeResize } from "../../../lib/observeResize";
import { isPhysicsEnabled, onPhysicsChange } from "../../../lib/motion/preference";
import { withComposerImpactLayout } from "../composerImpact";
import {
  createGlyph,
  glyphResting,
  squash,
  TypingPhysics,
  type Glyph,
  type PhysicsConfig,
} from "./physics";

/** One visible grapheme measured in surface coordinates; restore releases its real-text highlight. */
export interface GlyphSnapshot {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  font: string;
  position?: number;
  restore?: () => void;
}

/** DOM and spring ownership for one shadow, with optional send-snapshot timing. */
interface Shadow {
  snapshot: GlyphSnapshot;
  glyph: Glyph;
  node: HTMLSpanElement;
  age: number;
  sendDelay: number | null;
}

const SVG_NS = "http://www.w3.org/2000/svg";
let nextGradient = 0;

/** Create a typed SVG element in the current document. */
function svgElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

/** Render a physical surface with one shared-clock job and a permanent 180-node particle pool. */
export class PhysicalComposerRenderer {
  readonly model: TypingPhysics;
  private readonly svg = svgElement("svg");
  private readonly face = svgElement("path");
  private readonly cap = svgElement("path");
  private readonly glow = svgElement("path");
  private readonly gradient = svgElement("linearGradient");
  private readonly stops = Array.from({ length: 4 }, () => svgElement("stop"));
  private readonly glyphLayer = document.createElement("div");
  private readonly sentLayer = document.createElement("div");
  private readonly particleLayer = document.createElement("div");
  private readonly particleNodes: HTMLSpanElement[] = [];
  private readonly thermometers = new Set<HTMLElement>();
  private readonly shadows: Shadow[] = [];
  private cancel: (() => void) | undefined;
  private readonly unsubscribe: () => void;
  private readonly themeObserver: MutationObserver;
  private readonly unobserveResize: () => void;
  private focused = false;
  private dark = false;
  private disposed = false;

  /** Mount into an empty decorative layer within surface; the caller owns both elements. */
  constructor(
    readonly surface: HTMLElement,
    readonly layer: HTMLElement,
    config: Partial<PhysicsConfig> = {},
  ) {
    this.model = new TypingPhysics(config);
    layer.setAttribute("aria-hidden", "true");
    Object.assign(layer.style, { position: "absolute", inset: "0", pointerEvents: "none" });
    Object.assign(this.svg.style, {
      position: "absolute",
      inset: "0",
      overflow: "visible",
      width: "100%",
      height: "100%",
      zIndex: "-1",
    });
    Object.assign(this.glyphLayer.style, { position: "absolute", inset: "0", zIndex: "2" });
    Object.assign(this.sentLayer.style, { position: "absolute", inset: "0", zIndex: "2" });
    Object.assign(this.particleLayer.style, { position: "absolute", inset: "0", zIndex: "3" });
    const id = `physical-composer-gradient-${nextGradient++}`;
    this.gradient.id = id;
    this.gradient.setAttribute("x2", "1");
    this.stops.forEach((stop, i) => {
      stop.setAttribute("offset", String(i / 3));
      this.gradient.append(stop);
    });
    const defs = svgElement("defs");
    defs.append(this.gradient);
    this.glow.setAttribute("fill", "none");
    this.glow.setAttribute("stroke", `url(#${id})`);
    this.glow.setAttribute("stroke-linejoin", "round");
    this.cap.setAttribute("transform", "translate(0 6)");
    this.face.setAttribute("stroke-linejoin", "round");
    this.svg.append(defs, this.glow, this.cap, this.face);
    for (let i = 0; i < 180; i++) {
      const node = document.createElement("span");
      node.dataset.physicalBit = "";
      Object.assign(node.style, {
        position: "absolute",
        left: "0",
        top: "0",
        width: "1px",
        height: "1px",
        borderRadius: "0.3px",
        opacity: "0",
        transformOrigin: "center",
      });
      this.particleNodes.push(node);
      this.particleLayer.append(node);
    }
    layer.append(this.svg, this.glyphLayer, this.sentLayer, this.particleLayer);
    this.unsubscribe = onPhysicsChange((enabled) => {
      if (!enabled) this.stop();
    });
    this.themeObserver = new MutationObserver(this.updateTheme);
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    this.unobserveResize = observeResize(surface, () => {
      const previousWidth = this.model.width;
      this.measure();
      // A width change can reflow old snapshots. Auto-height was already measured by insert().
      if (previousWidth !== this.model.width) this.clearGlyphs();
      this.render();
    });
    surface.addEventListener("focusin", this.onFocus);
    surface.addEventListener("focusout", this.onBlur);
    this.measure();
    this.updateTheme();
  }

  /** Refresh resting surface dimensions without inheriting throw feedback transforms. */
  private measure() {
    withComposerImpactLayout(this.surface, () => {
      const rect = this.surface.getBoundingClientRect();
      this.model.width = rect.width || this.surface.clientWidth || 768;
      this.model.height = rect.height || this.surface.clientHeight || 84;
    });
  }

  /** Follow the existing html.dark theme marker without adding a separate theme preference. */
  private updateTheme = () => {
    this.dark = document.documentElement.classList.contains("dark");
    this.render();
  };

  /** Paint focus without starting an otherwise idle frame clock. */
  private onFocus = () => {
    this.focused = true;
    this.render();
  };

  /** Keep focus while it moves between controls inside the same composer. */
  private onBlur = (event: FocusEvent) => {
    this.focused =
      event.relatedTarget instanceof Node && this.surface.contains(event.relatedTarget);
    this.render();
  };

  /** Animate visible inserted graphemes; neighbor snapshots receive only the landing impulse. */
  insert(
    snapshots: GlyphSnapshot[],
    changed: ReadonlySet<number>,
    continuing: ReadonlyMap<number, Glyph> = new Map(),
  ) {
    try {
      this.clearGlyphs();
      if (!isPhysicsEnabled() || this.disposed) {
        snapshots.forEach((snapshot) => snapshot.restore?.());
        return;
      }
      this.measure();
      for (const [index, snapshot] of snapshots.entries()) {
        const previous =
          snapshot.position === undefined ? undefined : continuing.get(snapshot.position);
        const glyph =
          previous ??
          createGlyph(
            snapshot.x + snapshot.width / 2,
            snapshot.y + snapshot.height,
            this.model.config,
          );
        glyph.x = snapshot.x + snapshot.width / 2;
        glyph.yBase = snapshot.y + snapshot.height;
        if (changed.has(index))
          glyph.r = (this.model.random() - 0.5) * 24 * this.model.config.wobble;
        else if (!previous) {
          glyph.y = 0;
          glyph.s = 1;
          glyph.landed = true;
        }
        this.addShadow(snapshot, glyph);
      }
      this.model.warm(changed.size);
      this.start();
    } catch (error) {
      this.recover(snapshots);
      throw error;
    }
  }

  /** Preserve ongoing springs across a document edit; deleted positions return null and are omitted. */
  captureMotion(mapPosition: (position: number) => number | null) {
    const continuing = new Map<number, Glyph>();
    for (const shadow of this.shadows) {
      if (
        shadow.sendDelay !== null ||
        shadow.snapshot.position === undefined ||
        glyphResting(shadow.glyph)
      )
        continue;
      const next = mapPosition(shadow.snapshot.position);
      if (next !== null) continuing.set(next, shadow.glyph);
    }
    return continuing;
  }

  /** Add a decorative glyph without ever moving or replacing the editor's text nodes. */
  private addShadow(snapshot: GlyphSnapshot, glyph: Glyph, sendDelay: number | null = null) {
    const node = document.createElement("span");
    node.dataset.physicalGlyph = "";
    node.textContent = snapshot.text;
    Object.assign(node.style, {
      position: "absolute",
      left: `${snapshot.x}px`,
      top: `${snapshot.y}px`,
      whiteSpace: "pre",
      font: snapshot.font,
      transformOrigin: "50% 100%",
    });
    if (sendDelay !== null) {
      node.dataset.physicalSend = "";
      this.sentLayer.append(node);
    } else this.glyphLayer.append(node);
    this.shadows.push({ node, glyph, snapshot, age: 0, sendDelay });
    this.model.glyphs.push(glyph);
  }

  /** Release all shadow ranges before document replacement, scrolling or a new measurement. */
  clearGlyphs(includeSent = false) {
    for (let index = this.shadows.length - 1; index >= 0; index--) {
      if (includeSent || this.shadows[index]!.sendDelay === null) this.releaseShadow(index);
    }
  }

  /** Release one shadow and its spring together, preserving index alignment for remaining glyphs. */
  private releaseShadow(index: number) {
    const shadow = this.shadows[index]!;
    shadow.snapshot.restore?.();
    shadow.node.remove();
    this.shadows.splice(index, 1);
    this.model.glyphs.splice(index, 1);
  }

  /** Clip text shadows to the editor's visible rectangle, in surface coordinates. */
  clip(left: number, top: number, right: number, bottom: number, width: number, height: number) {
    this.glyphLayer.style.clipPath = `inset(${top}px ${Math.max(0, width - right)}px ${Math.max(0, height - bottom)}px ${left}px)`;
  }

  /** Shatter deleted visible graphemes and pull the edges upward at their old positions. */
  remove(snapshots: GlyphSnapshot[]) {
    this.clearGlyphs();
    if (!isPhysicsEnabled() || this.disposed) return;
    this.model.warm(0, snapshots.length);
    for (const snapshot of snapshots) {
      const x = snapshot.x + snapshot.width / 2;
      this.model.impulse(this.model.bottom, x, -140 * this.model.config.wobble, 2.5);
      this.model.impulse(this.model.top, x, -90 * this.model.config.wobble, 2.5);
      if (snapshot.text.trim())
        this.model.burst(
          x,
          snapshot.y + snapshot.height / 2,
          Math.round(9 * this.model.config.confetti),
          this.model.hueAt(x),
          24,
          0.8,
        );
    }
    this.start();
  }

  /** Disturb edges at local x without animating text (paste, program changes and newline). */
  pulse(x: number) {
    if (!isPhysicsEnabled() || this.disposed) return;
    this.measure();
    this.model.impulse(this.model.top, x, 90 * this.model.config.wobble, 3);
    this.model.impulse(this.model.bottom, x, 140 * this.model.config.wobble, 2.5);
    this.start();
  }

  /** Animate a detached send snapshot; the caller retains sole ownership of actual submission. */
  send(snapshots: GlyphSnapshot[]) {
    if (!isPhysicsEnabled() || this.disposed) return;
    this.clearGlyphs();
    const ordered = [...snapshots].sort((a, b) => a.y - b.y || a.x - b.x);
    const interval = ordered.length > 20 ? 0.349 / Math.max(1, ordered.length - 1) : 0.03;
    ordered.forEach((snapshot, index) => {
      const glyph = createGlyph(
        snapshot.x + snapshot.width / 2,
        snapshot.y + snapshot.height,
        this.model.config,
      );
      glyph.y = 0;
      glyph.s = 1;
      glyph.landed = true;
      glyph.delay = 0.0001 + index * interval;
      glyph.pending = -240;
      this.addShadow(snapshot, glyph, glyph.delay);
      this.model.burst(
        glyph.x,
        glyph.yBase,
        Math.round(3 * this.model.config.confetti),
        null,
        0,
        1.15,
      );
    });
    this.model.heat = Math.min(1, this.model.heat + 0.15 * this.model.config.heatPerKey);
    this.wave();
  }

  /** Strike both edges from the left for newline and submission gestures. */
  wave() {
    if (!isPhysicsEnabled() || this.disposed) return;
    this.measure();
    const x = this.model.radius + 30;
    this.model.impulse(this.model.top, x, 450 * this.model.config.wobble, 3);
    this.model.impulse(this.model.bottom, x, 450 * this.model.config.wobble, 3);
    this.start();
  }

  /** Bind a toolbar fill element; updates use transform/opacity and cleanup leaves it static. */
  thermometer(element: HTMLElement) {
    this.thermometers.add(element);
    this.render();
    return () => {
      this.thermometers.delete(element);
    };
  }

  /** Start one shared-loop job only after an input event has created work. */
  private start() {
    try {
      this.render();
      if (this.cancel) return;
      this.cancel = run((dt) => {
        try {
          this.model.step(Math.min(dt, 1 / 30));
          for (let index = this.shadows.length - 1; index >= 0; index--) {
            const shadow = this.shadows[index]!;
            shadow.age += Math.min(dt, 1 / 30);
            if (shadow.sendDelay !== null && shadow.age >= shadow.sendDelay + 0.25)
              this.releaseShadow(index);
          }
          if (this.model.glyphs.every(glyphResting)) this.clearGlyphs();
          if (this.model.resting()) {
            this.cancel = undefined;
            this.model.reset();
            this.render();
            return false;
          }
          this.render();
          return true;
        } catch (error) {
          this.recover();
          throw error;
        }
      });
    } catch (error) {
      this.recover();
      throw error;
    }
  }

  /** Restore even snapshots not yet owned by a shadow; avoid repainting the failed rendering path. */
  private recover(pending: readonly GlyphSnapshot[] = []) {
    this.cancel?.();
    this.cancel = undefined;
    for (const snapshot of pending) snapshot.restore?.();
    this.clearGlyphs(true);
    this.model.reset();
    for (const node of this.particleNodes) node.style.opacity = "0";
    for (const fill of this.thermometers) {
      fill.style.transform = "scaleY(0.06)";
      fill.style.opacity = "0.4";
    }
  }

  /** Build rounded geometry using exactly 40 nodes on each horizontal edge. */
  private path() {
    const { width: w, height: h, radius: r, spacing, top, bottom } = this.model;
    let path = `M${r} 0`;
    for (let i = 1; i < 40; i++) path += ` L${r + i * spacing} ${top.u[i]}`;
    path += ` Q${w} 0 ${w} ${r} L${w} ${h - r} Q${w} ${h} ${w - r} ${h}`;
    for (let i = 38; i >= 0; i--) path += ` L${r + i * spacing} ${h + bottom.u[i]!}`;
    return `${path} Q0 ${h} 0 ${h - r} L0 ${r} Q0 0 ${r} 0Z`;
  }

  /** Paint the current model. Particle slots persist; only transform and opacity animate their boxes. */
  private render() {
    const { heat, hue } = this.model;
    const path = this.path();
    for (const edge of [this.glow, this.cap, this.face]) edge.setAttribute("d", path);
    this.cap.setAttribute("fill", this.dark ? "var(--physical-composer-cap, #25272D)" : "#C3C9D3");
    this.face.setAttribute(
      "fill",
      this.dark ? "var(--physical-composer-face, #24262C)" : "#FFFFFF",
    );
    this.stops.forEach((stop, i) =>
      stop.setAttribute(
        "stop-color",
        this.dark ? "#FFFFFF" : `hsl(${Math.round((hue + i * 90) % 360)}, 70%, 72%)`,
      ),
    );
    this.glow.setAttribute("stroke-opacity", String(Math.max(this.focused ? 0.12 : 0, heat * 0.3)));
    this.glow.setAttribute("stroke-width", String(4 + heat * 6));
    this.face.setAttribute(
      "stroke",
      this.focused ? `url(#${this.gradient.id})` : this.dark ? "#555861" : "#D5DAE1",
    );
    this.face.setAttribute("stroke-width", this.focused ? "2" : "1");
    for (const { node, glyph, sendDelay, age } of this.shadows) {
      const stretch = squash(glyph.vy);
      node.style.color = this.dark ? "#FFFFFF" : "#16181D";
      node.style.opacity =
        sendDelay === null
          ? "1"
          : String(Math.min(1, Math.max(0, (sendDelay + 0.25 - age) / 0.17)));
      node.style.transform = `translateY(${glyph.y + this.model.ride(glyph.x)}px) rotate(${glyph.r}deg) scale(${glyph.s * (1 - stretch * 0.6)},${glyph.s * (1 + stretch)})`;
    }
    for (const [index, bit] of this.model.bits.entries()) {
      const node = this.particleNodes[index]!;
      node.style.opacity = bit.active
        ? String(Math.max(0, Math.min(1, (bit.life - bit.age) / 0.35)) * 0.85)
        : "0";
      if (!bit.active) continue;
      node.style.backgroundColor = `hsl(${Math.round(bit.hue)}, 78%, 74%)`;
      node.style.transform = `translate(${bit.x}px,${bit.y}px) rotate(${bit.r}deg) scale(${bit.s},${bit.s * Math.cos(bit.f)})`;
    }
    for (const fill of this.thermometers) {
      fill.style.transform = `scaleY(${0.06 + heat * 0.94})`;
      fill.style.opacity = String(0.4 + heat * 0.6);
      fill.style.background = `linear-gradient(0deg,hsl(${Math.round(hue)},70%,70%),hsl(${Math.round((hue + 120) % 360)},70%,70%))`;
    }
  }

  /** Cancel immediately when global permission changes, restoring every hidden glyph. */
  private stop() {
    this.cancel?.();
    this.cancel = undefined;
    this.clearGlyphs(true);
    this.model.reset();
    this.render();
  }

  /** Release overlays, subscriptions and pending frame work. */
  dispose() {
    this.disposed = true;
    this.stop();
    this.unsubscribe();
    this.themeObserver.disconnect();
    this.unobserveResize();
    this.surface.removeEventListener("focusin", this.onFocus);
    this.surface.removeEventListener("focusout", this.onBlur);
    this.thermometers.clear();
    this.layer.replaceChildren();
  }
}
