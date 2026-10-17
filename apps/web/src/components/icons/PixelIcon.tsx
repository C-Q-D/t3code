/** Renders shared graphite pixel artwork without copying its rectangles into every instance. */
import { cn } from "../../lib/utils";
import { getPixelIconSymbolId, type PixelIconName } from "./pixelSprites";

/** Pixel character selection, output size in CSS pixels, and optional accessible name. */
export interface PixelIconProps {
  name: PixelIconName;
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Displays one shared character; unknown runtime names render nothing.
 * @param props Character name, size (default 16px), layout classes, and optional accessible title.
 * @returns An SVG with one use node, or null for an unknown name.
 */
export function PixelIcon({ name, size = 16, className, title }: PixelIconProps) {
  const symbolId = getPixelIconSymbolId(name);
  if (!symbolId) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={cn("inline-block shrink-0", className)}
      focusable="false"
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
    >
      <use href={`#${symbolId}`} />
    </svg>
  );
}
