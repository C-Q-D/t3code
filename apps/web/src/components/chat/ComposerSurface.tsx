/** Owns the composer shell geometry; attached controls retain their own surfaces. */
import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";
import { createPresenceRegistry } from "~/lib/presenceRegistry";
import { PhysicalComposer } from "./physicalComposer/PhysicalComposer";
import "./physicalComposer/physicalComposer.css";

/** Shares attached banner presence between the shell and its descendant surfaces. */
export const ComposerShellRegistry = createPresenceRegistry<"attached">();

/** Centers the input at E1's 760px width and exposes context-strip state to descendants. */
function Shell({
  contextStrip = false,
  className,
  ...props
}: ComponentProps<"div"> & { contextStrip?: boolean }) {
  const { counts, onChange } = ComposerShellRegistry.usePresence();
  return (
    <ComposerShellRegistry.Provider onChange={onChange}>
      <div
        data-slot="composer-shell"
        data-attached-banner={(counts.attached ?? 0) > 0 ? "true" : "false"}
        data-with-context={contextStrip || undefined}
        className={cn(
          "composer-shell @container/composer-surface group/composer-surface relative isolate mx-auto w-full max-w-composer",
          className,
        )}
        {...props}
      />
    </ComposerShellRegistry.Provider>
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

/** Hosts the physical input surface while keeping editor, toolbar and throw-feedback geometry intact. */
function Main({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-chat-composer-main-surface="true"
      data-physical-composer-surface=""
      className={cn("group relative z-10 rounded-composer", className)}
      {...props}
    >
      <PhysicalComposer>{children}</PhysicalComposer>
    </div>
  );
}

/** Extends the composer seam below its content, using Shell's attached-banner state for glass. */
function ContextStrip({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="composer-context-strip"
      className={cn(
        "group/composer-context relative isolate mx-auto -mt-4 flex w-[calc(100%-2*var(--chat-composer-drawer-inset))] items-center gap-2 overflow-x-clip overflow-y-visible px-2 pt-5 pb-1",
        "before:absolute before:inset-0 before:-z-1 before:rounded-b-2xl before:border before:border-(--chat-composer-outline) before:mask-b-from-transparent before:mask-b-from-(position:--spacing-composer-seam) before:mask-b-to-black before:mask-b-to-(position:--spacing-composer-seam) before:shadow-composer",
        "dark:before:border-white/7 dark:before:bg-composer-seam-below dark:before:shadow-composer-dark",
        "group-data-[attached-banner=true]/composer-surface:before:bg-(--chat-composer-glass-surface)/(--glass-opacity) group-data-[attached-banner=true]/composer-surface:before:backdrop-blur-(--glass-blur) group-data-[attached-banner=true]/composer-surface:before:backdrop-saturate-(--glass-saturation)",
        "not-supports-[clip-path:shape(from_0_0,line_to_1px_1px)]:before:bg-(--chat-composer-glass-surface)/(--glass-opacity) not-supports-[clip-path:shape(from_0_0,line_to_1px_1px)]:before:backdrop-blur-(--glass-blur) not-supports-[clip-path:shape(from_0_0,line_to_1px_1px)]:before:backdrop-saturate-(--glass-saturation)",
        className,
      )}
      {...props}
    />
  );
}

export const ComposerSurface = { Shell, Host, Main, ContextStrip };
