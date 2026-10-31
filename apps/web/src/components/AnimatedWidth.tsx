/** Keeps inline content measurable while its outer width transitions between values. */
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";

/** Animate children to their observed width; className controls the outer inline container. */
export function AnimatedWidth({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const contentRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- observes the content element's width before paint to animate width
  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    return observeResize(element, (entries) => {
      const nextWidth = Math.ceil(entries.at(-1)?.contentRect.width ?? 0);
      if (nextWidth > 0) setWidth(nextWidth);
    });
  }, []);

  return (
    <span
      data-slot="animated-width"
      className={cn(
        "inline-block overflow-hidden transition-[width] legacy:duration-150 legacy:ease-out legacy:motion-reduce:transition-none physics:duration-(--motion-settle-duration) physics:ease-(--ease-settle)",
        className,
      )}
      style={width === null ? undefined : { width }}
    >
      <span ref={contentRef} className="block w-max whitespace-nowrap">
        {children}
      </span>
    </span>
  );
}
