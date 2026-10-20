/** Owns the composer shell geometry; attached controls retain their own surfaces. */
import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";

/** Centers the input at E1's 760px width and exposes context-strip state to descendants. */
function Shell({
  contextStrip = false,
  className,
  ...props
}: ComponentProps<"div"> & { contextStrip?: boolean }) {
  return (
    <div
      data-slot="composer-shell"
      data-with-context={contextStrip || undefined}
      className={cn(
        "composer-shell @container/composer-surface group/composer-surface relative isolate mx-auto w-full max-w-composer",
        className,
      )}
      {...props}
    />
  );
}

/** Hosts banners and the input without painting an extra shell over either surface. */
function Host({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="composer-host"
      className={cn("relative z-10 w-full rounded-composer", className)}
      {...props}
    />
  );
}

/** Paints the raised E1 input; surface-glass keeps the existing opacity preference. */
function Main({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-chat-composer-main-surface="true"
      className={cn(
        "surface-glass group relative z-10 rounded-composer shadow-raise-detail edge-glow",
        className,
      )}
      {...props}
    />
  );
}

function ContextStrip({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="composer-context-strip"
      className={cn(
        "group/composer-context relative isolate mx-auto -mt-4 flex w-[calc(100%-2*var(--chat-composer-drawer-inset))] items-center gap-2 overflow-x-clip overflow-y-visible px-2 pt-5 pb-1",
        "before:absolute before:inset-0 before:-z-1 before:rounded-b-2xl before:border before:border-(--chat-composer-outline) before:mask-b-from-transparent before:mask-b-from-4 before:mask-b-to-black before:mask-b-to-4 before:shadow-composer",
        "dark:before:border-white/7 dark:before:bg-composer-seam-below dark:before:shadow-composer-dark",
        "group-has-data-[composer-banner-surface=attached]/composer-surface:before:bg-(--chat-composer-glass-surface)/(--glass-opacity) group-has-data-[composer-banner-surface=attached]/composer-surface:before:backdrop-blur-(--glass-blur) group-has-data-[composer-banner-surface=attached]/composer-surface:before:backdrop-saturate-(--glass-saturation)",
        "not-supports-[clip-path:shape(from_0_0,line_to_1px_1px)]:before:bg-(--chat-composer-glass-surface)/(--glass-opacity) not-supports-[clip-path:shape(from_0_0,line_to_1px_1px)]:before:backdrop-blur-(--glass-blur) not-supports-[clip-path:shape(from_0_0,line_to_1px_1px)]:before:backdrop-saturate-(--glass-saturation)",
        className,
      )}
      {...props}
    />
  );
}

export const ComposerSurface = { Shell, Host, Main, ContextStrip };
