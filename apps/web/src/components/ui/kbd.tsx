/** Shared, noninteractive shortcut keycaps and key sequences; labels come from callers. */
import type * as React from "react";

import { cn } from "~/lib/utils";

/** Renders the H5 standalone keycap and forwards native kbd props, including children. */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-5.5 min-w-5 select-none items-center justify-center gap-1 rounded-keycap bg-secondary px-2 font-mono text-meta font-normal text-code-foreground shadow-keycap [&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      data-slot="kbd"
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn("inline-flex items-center gap-1", className)}
      data-slot="kbd-group"
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
