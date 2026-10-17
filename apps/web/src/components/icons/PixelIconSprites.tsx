/** Registers graphite character symbols once; individual icons only reference these pixels. */
import {
  getPixelIconSymbolId,
  PIXEL_ICON_NAMES,
  PIXEL_PALETTE,
  PIXEL_SPRITES,
} from "./pixelSprites";

const palette: Readonly<Record<string, string>> = PIXEL_PALETTE;

// Build the shared artwork once rather than recreating thousands of rectangles on route renders.
const symbols = PIXEL_ICON_NAMES.map((name) => (
  <symbol
    id={getPixelIconSymbolId(name)}
    key={name}
    viewBox="0 0 16 16"
    shapeRendering="crispEdges"
  >
    {PIXEL_SPRITES[name].flatMap((row, y) =>
      Array.from(row, (pixel, x) => {
        const color = palette[pixel];
        const pixelId = `${name}-${x}-${y}`;
        return color ? <rect key={pixelId} x={x} y={y} width={1} height={1} fill={color} /> : null;
      }),
    )}
  </symbol>
));

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
