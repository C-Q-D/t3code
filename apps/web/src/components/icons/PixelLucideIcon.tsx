/** Bridges fixed-color pixel sprites to existing Lucide component slots without changing their types. */
import { forwardRef } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";
import { cn } from "../../lib/utils";
import { getPixelIconSymbolId, type PixelIconName } from "./pixelSprites";

/**
 * Creates a module-scoped icon with Lucide's size, SVG props, and ref contract.
 * @param name Shared sprite name; the artwork keeps its own colors rather than using currentColor.
 * @returns A stable component accepting numeric or CSS sizes, defaulting to 16px.
 */
function createPixelLucideIcon(name: PixelIconName): LucideIcon {
  const symbolId = getPixelIconSymbolId(name);
  const Icon = forwardRef<SVGSVGElement, LucideProps>(function PixelCharacter(
    { size = 16, className, children, absoluteStrokeWidth, ...props },
    ref,
  ) {
    // Fixed-color rectangles have no Lucide stroke to scale; keep this flag off the DOM.
    void absoluteStrokeWidth;
    // Match lucide-react's hasA11yProp presence check, including empty or undefined values.
    const hasA11yProp = Object.keys(props).some(
      (key) => key.startsWith("aria-") || key === "role" || key === "title",
    );
    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox="0 0 16 16"
        shapeRendering="crispEdges"
        focusable="false"
        {...(!children && !hasA11yProp ? { "aria-hidden": "true" as const } : {})}
        className={cn("inline-block shrink-0", className)}
        {...props}
      >
        <use href={`#${symbolId}`} />
        {children}
      </svg>
    );
  });
  Icon.displayName = `PixelIcon(${name})`;
  return Icon;
}

export const PixelCodexIcon = createPixelLucideIcon("codex");
export const PixelClaudeIcon = createPixelLucideIcon("claude");
export const PixelAgentIcon = createPixelLucideIcon("agent");
export const PixelSubagentIcon = createPixelLucideIcon("subagent");
export const PixelThinkIcon = createPixelLucideIcon("think");
export const PixelSparkIcon = createPixelLucideIcon("spark");
