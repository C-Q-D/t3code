/** Shared, noninteractive shortcut keycaps and key sequences; labels come from callers. */
import type * as React from "react";

import { cn } from "~/lib/utils";

/** Renders shortcut keycaps; size selects the default H5, settings control, or compact page-header density. Native kbd props pass through. */
function Kbd({
  className,
  size,
  ...props
}: React.ComponentProps<"kbd"> & { size?: "settings" | "compact" }) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-5.5 min-w-5 select-none items-center justify-center gap-1 rounded-keycap bg-secondary px-2 font-mono text-meta font-normal text-code-foreground shadow-keycap [&_svg:not([class*='size-'])]:size-3",
        // SettingsPage8a N2 uses the same keycap language at 24px for settings controls.
        size === "settings" &&
          "h-6 min-w-6 px-1.75 text-meta-large text-foreground shadow-keybindings-keycap",
        // SettingsPage8a M2–P4: page-header shortcut hints use the shared keycap at 20px.
        size === "compact" && "h-5",
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
