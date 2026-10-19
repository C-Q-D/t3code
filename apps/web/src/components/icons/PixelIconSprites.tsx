/** Registers graphite character symbols once; individual icons only reference these pixels. */
import {
  getPixelIconSymbolId,
  PIXEL_ICON_NAMES,
  PIXEL_PALETTE,
  PIXEL_SPRITES,
} from "./pixelSprites";

const palette: Readonly<Record<string, string>> = PIXEL_PALETTE;

// Fixed-color artwork does not need document styles. An SVG image keeps the
// original pixel rectangles (including fractional-scale rasterization) without
// thousands of live nodes and their <use> shadow copies participating in style
// recalculation on navigation. Encode once; repeated icons share the image URL.
const symbols = PIXEL_ICON_NAMES.map((name) => {
  const pixels = PIXEL_SPRITES[name]
    .flatMap((row, y) =>
      Array.from(row, (pixel, x) => {
        const color = palette[pixel];
        return color ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>` : "";
      }),
    )
    .join("");
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges">${pixels}</svg>`;
  return (
    <symbol
      id={getPixelIconSymbolId(name)}
      key={name}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
    >
      <image width={16} height={16} href={`data:image/svg+xml,${encodeURIComponent(source)}`} />
    </symbol>
  );
});

/**
 * Mount once at the app root so all routes and portals can resolve pixel icon references.
 * @returns An inaccessible zero-size SVG containing the 20 shared character symbols.
 */
export function PixelIconSprites() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={0}
      height={0}
      className="pointer-events-none absolute"
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
    >
      <defs>{symbols}</defs>
    </svg>
  );
}
