/** Owns window chrome geometry; routes supply content and Electron owns system buttons. */
import { TitlebarSlotOutlet } from "./titlebarSlot";

/** Renders the 48px first row; sidebar control and brand are reserved for FR1-bar.2. */
export function WindowTitlebar() {
  return (
    <header
      className="window-titlebar drag-region flex h-12 w-full shrink-0 items-center text-foreground text-shadow-stone"
      data-window-titlebar=""
    >
      <div className="size-8 shrink-0" data-titlebar-sidebar-control="" aria-hidden="true" />
      <div className="ml-2 w-40 shrink-0" data-titlebar-brand="" aria-hidden="true" />
      <div className="w-47.5 shrink-0 self-stretch" aria-hidden="true" />
      <TitlebarSlotOutlet name="breadcrumb" />
      <div className="min-w-10 flex-1 self-stretch" aria-hidden="true" />
      <TitlebarSlotOutlet name="actions" />
      <div className="window-titlebar-system-controls shrink-0 self-stretch" aria-hidden="true" />
    </header>
  );
}
