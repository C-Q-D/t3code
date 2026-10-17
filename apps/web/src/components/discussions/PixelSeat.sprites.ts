/** Ports px-seat.js's six 12×12 sprites into one reference-counted SVG sheet per document. */
import type { DiscussionPersonaAvatar } from "@t3tools/contracts";

/** Fixed identity artwork from the 8a handoff; outfit colors are inherited at each use. */
export const PIXEL_SEAT_SPRITES = {
  architect: [
    "....yyyy....",
    "...yyyyyy...",
    "..yyyyyyyy..",
    ".YYYYYYYYYY.",
    "..ssssssss..",
    "..skssssks..",
    "..ssssssss..",
    "...ssmmss...",
    "....ssss....",
    "..ccwwwwcc..",
    ".cccwwwwccc.",
    ".ccccwwcccc.",
  ],
  opponent: [
    ".r........r.",
    ".rr......rr.",
    "..rhhhhhhr..",
    "..hhhhhhhh..",
    "..hksssskh..",
    "..skssssks..",
    "..ssssssss..",
    "..sssssmms..",
    "...ssssss...",
    "..cccccccc..",
    ".cccccccccc.",
    ".cccccccccc.",
  ],
  implementer: [
    "...hhhhhh...",
    "..hhhhhhhh..",
    "..cccccccc..",
    "..hssssssh..",
    "..ssssssss..",
    "..skssssks..",
    "..ssssssss..",
    "...smmmms...",
    "....ssss...g",
    "..cdccccdc.g",
    ".ccdccccdcgg",
    ".cccccccccg.",
  ],
  reviewer: [
    "...hhhhhh...",
    "..hhhhhhhh..",
    "..hssssssh..",
    "..ssssssss..",
    ".kkkkskkkkk.",
    ".kwkkskkwkk.",
    "..ssssssss..",
    "...ssmmss...",
    "....ssss....",
    "..cccccccc..",
    ".cccccccccc.",
    ".cccccccccc.",
  ],
  product: [
    "............",
    "...cccccc...",
    "..cccccccc..",
    ".ddddddddd..",
    "..ssssssss..",
    "..skssssks..",
    "..ssssssss..",
    "...smmmms...",
    "....ssss....",
    "..wwccccww..",
    ".wwccccccww.",
    ".wccccccccww",
  ],
  user: [
    "..y..yy..y..",
    "..yyyyyyyy..",
    "..yryyyyry..",
    "..hhhhhhhh..",
    "..hssssssh..",
    "..skssssks..",
    "..ssssssss..",
    "...smmmms...",
    "....ssss....",
    "..nnnnnnnn..",
    ".nnnnnnnnnn.",
    ".nnnnnnnnnn.",
  ],
} as const satisfies Record<DiscussionPersonaAvatar | "user", readonly string[]>;

const PIXEL_FILLS: Readonly<Record<string, string>> = {
  s: "var(--color-discussion-pixel-skin)",
  k: "var(--color-discussion-pixel-ink)",
  h: "var(--color-discussion-pixel-hair)",
  m: "var(--color-discussion-pixel-mouth)",
  y: "var(--color-discussion-pixel-gold)",
  Y: "var(--color-discussion-pixel-gold-shade)",
  w: "var(--color-discussion-pixel-white)",
  r: "var(--color-discussion-pixel-red)",
  g: "var(--color-discussion-pixel-metal)",
  n: "var(--color-discussion-pixel-neutral)",
  c: "var(--discussion-seat-color)",
  d: "color-mix(in srgb, var(--discussion-seat-color) 60%, var(--color-discussion-pixel-black))",
};
const SVG_NS = "http://www.w3.org/2000/svg";
const sheets = new WeakMap<Document, { svg: SVGSVGElement; users: number }>();

/**
 * Uses a stable prefix so each seat references the document's shared identity symbol.
 * @param role A resolved avatar identity.
 * @returns Document-local SVG fragment id, without a leading hash.
 */
export function pixelSeatSymbolId(role: DiscussionPersonaAvatar | "user") {
  return `t3-discussion-pixel-seat-${role}`;
}

/**
 * Acquires one shared sheet before paint; the last seat's cleanup removes it.
 * @param host Document that owns the seat. Defaults to the current rendering document.
 * @returns Release callback for useInsertionEffect; no browser globals are read during SSR render.
 */
export function acquirePixelSeatSprites(host: Document = document) {
  let sheet = sheets.get(host);
  if (!sheet) {
    const svg = host.createElementNS(SVG_NS, "svg");
    svg.setAttribute("data-discussion-seat-sprites", "");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.position = "absolute";
    svg.style.overflow = "hidden";
    svg.style.pointerEvents = "none";
    const defs = host.createElementNS(SVG_NS, "defs");
    for (const [role, rows] of Object.entries(PIXEL_SEAT_SPRITES)) {
      const symbol = host.createElementNS(SVG_NS, "symbol");
      // Object.entries loses the literal key type; these keys come only from the typed map above.
      symbol.id = pixelSeatSymbolId(role as keyof typeof PIXEL_SEAT_SPRITES);
      symbol.setAttribute("viewBox", "0 0 12 12");
      symbol.setAttribute("shape-rendering", "crispEdges");
      rows.forEach((row, y) => {
        [...row].forEach((pixel, x) => {
          const fill = PIXEL_FILLS[pixel];
          if (!fill) return;
          const rect = host.createElementNS(SVG_NS, "rect");
          rect.setAttribute("x", String(x));
          rect.setAttribute("y", String(y));
          rect.setAttribute("width", "1");
          rect.setAttribute("height", "1");
          rect.setAttribute("fill", fill);
          symbol.append(rect);
        });
      });
      defs.append(symbol);
    }
    svg.append(defs);
    host.body.prepend(svg);
    sheet = { svg, users: 0 };
    sheets.set(host, sheet);
  }
  sheet.users += 1;
  const acquired = sheet;
  return () => {
    acquired.users -= 1;
    if (acquired.users === 0) {
      acquired.svg.remove();
      sheets.delete(host);
    }
  };
}
