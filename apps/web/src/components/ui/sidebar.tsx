/** Provides responsive sidebar layout, collapse state, and pointer resizing controls. */
import { t } from "~/i18n";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeft, PanelLeftClose } from "lucide";
import * as React from "react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Input, type InputProps } from "~/components/ui/input";
import { MorphIcon } from "~/components/MorphIcon";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Slab } from "~/components/ui/slab";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPopup,
  SheetPortal,
  SheetTitle,
} from "~/components/ui/sheet";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { isPhysicsEnabled } from "~/lib/motion/preference";
import { createResizePhysics, useResizeDrag } from "~/hooks/useResizeDrag";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import { FRAME_NARROW_MEDIA_QUERY } from "~/frameBreakpoints";
import { FRAME_SIDEBAR_DRAWER_GEOMETRY } from "~/components/frame/sidebarDrawerGeometry";
import { getLocalStorageItem, setLocalStorageItem } from "~/hooks/useLocalStorage";
import { resolveSidebarState, type ResponsiveSidebarState } from "./sidebarState";
import * as Schema from "effect/Schema";
import { announceSidebarVisibility } from "~/lib/accessibilityAnnouncements";
import { useStableCallback } from "~/hooks/useStableCallback";

const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "calc(100vw - var(--spacing(3)))";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_RESIZE_DEFAULT_MIN_WIDTH = 16 * 16;
const SIDEBAR_TITLEBAR_CONTROL_SIZE = "max-sm:[--workspace-titlebar-control-size:--spacing(8)]";

type SidebarContextProps = {
  state: ResponsiveSidebarState;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Updates desktop visibility for temporary layouts without changing the saved preference. */
  setOpenTemporarily: (open: boolean) => void;
  openMobile: boolean;
  mobileSheetMounted: boolean;
  setMobileSheetElement: (element: HTMLDivElement | null) => void;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
  /** Runs before desktop collapse so active drags can release ownership. */
  onCollapse: (listener: () => void) => () => void;
  /** Captures visibility in memory once, until restore consumes the snapshot. */
  saveSidebarState: () => void;
  /** Restores both visibility modes; does nothing without a saved snapshot. */
  restoreSidebarState: () => void;
};

type SidebarResizableOptions = {
  maxWidth?: number;
  minWidth?: number;
  onResize?: (width: number) => void;
  shouldAcceptWidth?: (context: {
    currentWidth: number;
    nextWidth: number;
    rail: HTMLButtonElement;
    side: "left" | "right";
    sidebarRoot: HTMLElement;
    wrapper: HTMLElement;
  }) => boolean;
  storageKey?: string;
};

type SidebarResolvedResizableOptions = {
  maxWidth: number;
  minWidth: number;
  onResize?: (width: number) => void;
  shouldAcceptWidth?: (context: {
    currentWidth: number;
    nextWidth: number;
    rail: HTMLButtonElement;
    side: "left" | "right";
    sidebarRoot: HTMLElement;
    wrapper: HTMLElement;
  }) => boolean;
  storageKey: string | null;
};

type SidebarInstanceContextProps = {
  resizable: SidebarResolvedResizableOptions | null;
  side: "left" | "right";
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);
const SidebarInstanceContext = React.createContext<SidebarInstanceContextProps | null>(null);

function useSidebar() {
  const context = React.use(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}

function useSidebarVisibility() {
  const { isMobile, open, openMobile } = useSidebar();
  return isMobile ? openMobile : open;
}

/** Moves focus to the outside trigger before a collapsing offcanvas sidebar becomes inert. */
function moveFocusOutOfCollapsingSidebar() {
  const sidebar = document.activeElement?.closest<HTMLElement>(
    '[data-slot="sidebar"][data-collapsible-mode="offcanvas"]',
  );
  const wrapper = sidebar?.closest<HTMLElement>('[data-slot="sidebar-wrapper"]');
  if (!sidebar || !wrapper) return;
  const trigger = Array.from(
    wrapper.querySelectorAll<HTMLElement>('[data-sidebar="trigger"]'),
  ).find((element) => !sidebar.contains(element));
  trigger?.focus({ preventScroll: true });
}

/** Keeps shortcut reads current between React commits; each provider owns its own visibility. */
function createSidebarOpenStore(defaultOpen: boolean) {
  let state = { open: defaultOpen, openMobile: false };
  const listeners = new Set<() => void>();
  const publish = (next: typeof state) => {
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setOpen: (open: boolean) => {
      if (open !== state.open) publish({ ...state, open });
    },
    setOpenMobile: (value: boolean | ((open: boolean) => boolean)) => {
      const openMobile = typeof value === "function" ? value(state.openMobile) : value;
      if (openMobile !== state.openMobile) publish({ ...state, openMobile });
    },
  };
}

/**
 * Owns desktop and drawer visibility, toggle actions, and an in-memory panel snapshot.
 * defaultOpen seeds uncontrolled desktop visibility; open/onOpenChange allow control.
 * Manual desktop changes retain cookie persistence; temporary layouts and snapshot restores do not.
 * Native div props, children, and CSS geometry pass through to the shared wrapper.
 */
function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isMobile = useMediaQuery(FRAME_NARROW_MEDIA_QUERY);
  const [store] = React.useState(() => createSidebarOpenStore(defaultOpen));
  const visibility = React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const { openMobile } = visibility;
  const setOpenMobile = store.setOpenMobile;
  const [mobileSheetMounted, setMobileSheetMounted] = React.useState(false);
  const setMobileSheetElement = (element: HTMLDivElement | null) => {
    setMobileSheetMounted(element !== null);
  };

  const open = openProp ?? visibility.open;
  const [collapseListeners] = React.useState(() => new Set<() => void>());
  const onCollapse = useStableCallback((listener: () => void) => {
    collapseListeners.add(listener);
    return () => {
      collapseListeners.delete(listener);
    };
  });
  const setOpenTemporarily = useStableCallback((value: boolean | ((value: boolean) => boolean)) => {
    const currentOpen = openProp ?? store.getSnapshot().open;
    const openState = typeof value === "function" ? value(currentOpen) : value;
    if (!openState && currentOpen) {
      for (const listener of collapseListeners) listener();
      moveFocusOutOfCollapsingSidebar();
    }
    if (openState !== currentOpen && !isMobile) announceSidebarVisibility(openState);
    if (setOpenProp) {
      setOpenProp(openState);
    } else {
      store.setOpen(openState);
    }
  });
  const setOpen = useStableCallback(async (value: boolean | ((value: boolean) => boolean)) => {
    const currentOpen = openProp ?? store.getSnapshot().open;
    const openState = typeof value === "function" ? value(currentOpen) : value;
    setOpenTemporarily(openState);

    // This sets the cookie to keep the sidebar state.
    await cookieStore.set({
      expires: Date.now() + SIDEBAR_COOKIE_MAX_AGE * 1000,
      name: SIDEBAR_COOKIE_NAME,
      path: "/",
      value: String(openState),
    });
  });

  const toggleSidebar = useStableCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open);
  });

  const state = resolveSidebarState({ isMobile, open, openMobile });
  const savedVisibility = React.useRef<{ open: boolean; openMobile: boolean } | null>(null);

  const contextValue: SidebarContextProps = (() => ({
    isMobile,
    open,
    openMobile,
    mobileSheetMounted,
    setMobileSheetElement,
    setOpen,
    setOpenTemporarily,
    setOpenMobile,
    state,
    toggleSidebar,
    onCollapse,
    saveSidebarState() {
      // Preserve the first snapshot if a panel changes tabs while the sidebar is hidden.
      if (savedVisibility.current === null) savedVisibility.current = { open, openMobile };
    },
    restoreSidebarState() {
      const saved = savedVisibility.current;
      if (!saved) return;
      savedVisibility.current = null;
      if (saved.open !== open) setOpenTemporarily(saved.open);
      setOpenMobile(saved.openMobile);
    },
  }))();

  return (
    <SidebarContext value={contextValue}>
      <div
        className={cn(
          "group/sidebar-wrapper flex min-h-svh w-full",
          SIDEBAR_TITLEBAR_CONTROL_SIZE,
          className,
        )}
        data-sidebar-state={state}
        data-slot="sidebar-wrapper"
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            "--workspace-titlebar-content-left":
              "calc(var(--workspace-controls-left) + var(--workspace-titlebar-control-size) + var(--workspace-titlebar-control-gap))",
            ...style,
          } as React.CSSProperties
        }
        {...props}
      >
        {children}
      </div>
    </SidebarContext>
  );
}

/** Disables resizing for mobile sheets and non-collapsible layouts; absent bounds preserve the default minimum and an unbounded maximum. */
function resolveSidebarResizable({
  collapsible,
  isMobile,
  resizable,
}: {
  collapsible: "offcanvas" | "icon" | "none";
  isMobile: boolean;
  resizable: boolean | SidebarResizableOptions;
}): SidebarResolvedResizableOptions | null {
  if (isMobile || collapsible === "none" || !resizable) {
    return null;
  }

  const options = typeof resizable === "boolean" ? {} : resizable;
  return {
    maxWidth: options.maxWidth ?? Number.POSITIVE_INFINITY,
    minWidth: options.minWidth ?? SIDEBAR_RESIZE_DEFAULT_MIN_WIDTH,
    storageKey: options.storageKey ?? null,
    ...(options.onResize ? { onResize: options.onResize } : {}),
    ...(options.shouldAcceptWidth ? { shouldAcceptWidth: options.shouldAcceptWidth } : {}),
  };
}

/** Renders sidebar children with the requested side, variant, collapse behavior, and resizing support; mobile layouts use a sheet. */
function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  resizable = false,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset" | "frame";
  collapsible?: "offcanvas" | "icon" | "none";
  resizable?: boolean | SidebarResizableOptions;
}) {
  const { isMobile, state, openMobile, setOpenMobile, setMobileSheetElement } = useSidebar();
  const desktopSidebarRef = React.useRef<HTMLDivElement>(null);
  const offcanvasCollapsed = !isMobile && collapsible === "offcanvas" && state === "collapsed";

  React.useLayoutEffect(() => {
    const sidebar = desktopSidebarRef.current;
    if (!sidebar) return;

    // Transfer focus before inert causes the browser to clear the focused descendant.
    if (offcanvasCollapsed && sidebar.contains(document.activeElement)) {
      const wrapper = sidebar.closest('[data-slot="sidebar-wrapper"]');
      const trigger = Array.from(
        wrapper?.querySelectorAll<HTMLElement>('[data-sidebar="trigger"]') ?? [],
      ).find((element) => !sidebar.contains(element));
      trigger?.focus({ preventScroll: true });
    }
    sidebar.toggleAttribute("inert", offcanvasCollapsed);
  }, [offcanvasCollapsed]);

  const resolvedResizable = resolveSidebarResizable({ collapsible, isMobile, resizable });
  const instanceContextValue: SidebarInstanceContextProps = { side, resizable: resolvedResizable };

  if (collapsible === "none") {
    return (
      <SidebarInstanceContext value={instanceContextValue}>
        <div
          className={cn(
            "flex h-full w-(--sidebar-width) flex-col bg-sidebar surface-grain text-sidebar-foreground",
            className,
          )}
          data-slot="sidebar"
          {...props}
        >
          {children}
        </div>
      </SidebarInstanceContext>
    );
  }

  if (isMobile) {
    if (variant === "frame") {
      return (
        <SidebarInstanceContext value={instanceContextValue}>
          <Sheet onOpenChange={setOpenMobile} open={openMobile}>
            {/* Sidebar children own global navigation shortcuts. Keep their listeners
                alive while closed, but exclude the retained subtree from input and AT. */}
            <SheetPortal keepMounted inert={!openMobile} aria-hidden={!openMobile || undefined}>
              <SheetPrimitive.Backdrop
                className="frame-sidebar-drawer-backdrop bg-stone-scrim"
                style={FRAME_SIDEBAR_DRAWER_GEOMETRY.backdrop}
              />
              {/* Keep dismissal and focus ownership in the same primitive as SheetPopup.
                  The viewport excludes the project rail and titlebar, like the scrim. */}
              <SheetPrimitive.Viewport
                className="frame-sidebar-drawer-viewport"
                style={FRAME_SIDEBAR_DRAWER_GEOMETRY.backdrop}
              >
                <SheetPrimitive.Popup
                  ref={setMobileSheetElement}
                  render={
                    <Slab tone="sidebar" radius="slab" elevation="slab-frame" render={<aside />} />
                  }
                  className={cn(
                    "frame-sidebar-drawer stone-sidebar text-sidebar-foreground",
                    className,
                  )}
                  style={FRAME_SIDEBAR_DRAWER_GEOMETRY.drawer}
                  data-mobile="true"
                  data-sidebar="sidebar"
                  data-slot="sidebar"
                >
                  <SheetHeader className="sr-only">
                    <SheetTitle>{props["aria-label"] ?? t.app.sidebar.title}</SheetTitle>
                    <SheetDescription>{t.app.sidebar.description}</SheetDescription>
                  </SheetHeader>
                  <div className="flex h-full min-h-0 w-full flex-col" {...props}>
                    {children}
                  </div>
                </SheetPrimitive.Popup>
              </SheetPrimitive.Viewport>
            </SheetPortal>
          </Sheet>
        </SidebarInstanceContext>
      );
    }
    return (
      <SidebarInstanceContext value={instanceContextValue}>
        <Sheet onOpenChange={setOpenMobile} open={openMobile}>
          <SheetPopup
            ref={setMobileSheetElement}
            className={cn(
              "w-(--sidebar-width) max-w-none bg-sidebar surface-grain p-0 text-sidebar-foreground",
              className,
            )}
            data-mobile="true"
            data-sidebar="sidebar"
            data-slot="sidebar"
            showCloseButton={false}
            side={side}
            style={
              {
                "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
              } as React.CSSProperties
            }
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{props["aria-label"] ?? t.app.sidebar.title}</SheetTitle>
              <SheetDescription>{t.app.sidebar.description}</SheetDescription>
            </SheetHeader>
            <div
              className={cn(
                "flex h-full w-full flex-col pb-safe pt-safe",
                SIDEBAR_TITLEBAR_CONTROL_SIZE,
                side === "left" ? "pl-safe" : "pr-safe",
              )}
              {...props}
            >
              {children}
            </div>
          </SheetPopup>
        </Sheet>
      </SidebarInstanceContext>
    );
  }

  return (
    <SidebarInstanceContext value={instanceContextValue}>
      <div
        ref={desktopSidebarRef}
        className="group peer hidden text-sidebar-foreground md:block"
        data-collapsible={state === "collapsed" ? collapsible : ""}
        data-collapsible-mode={collapsible}
        data-side={side}
        data-slot="sidebar"
        data-state={state}
        data-variant={variant}
      >
        <div
          className={cn(
            "relative w-(--sidebar-width) bg-transparent",
            "[[data-panel-animations=true]_&]:transition-[width] [[data-panel-animations=true]_&]:[transition-duration:var(--panel-animation-duration)] [[data-panel-animations=true]_&]:ease-(--panel-animation-easing)",
            "group-data-[collapsible=offcanvas]:w-0",
            "group-data-[side=right]:rotate-180",
            variant === "floating" || variant === "inset"
              ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
              : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
          )}
          data-slot="sidebar-gap"
        />
        <div
          className={cn(
            "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) md:flex",
            "[[data-panel-animations=true]_&]:transition-[left,right,width] [[data-panel-animations=true]_&]:[transition-duration:var(--panel-animation-duration)] [[data-panel-animations=true]_&]:ease-(--panel-animation-easing)",
            side === "left"
              ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
              : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
            variant === "floating" || variant === "inset"
              ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
              : variant === "frame"
                ? "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
                : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
            className,
          )}
          data-slot="sidebar-container"
          {...props}
        >
          {variant === "frame" ? (
            <Slab
              tone="sidebar"
              radius="slab"
              elevation="slab-frame"
              glow
              className="stone-sidebar flex h-full min-h-0 w-full flex-col overflow-hidden"
              data-sidebar="sidebar"
              data-slot="sidebar-inner"
            >
              {children}
            </Slab>
          ) : (
            <div
              className="flex h-full w-full flex-col bg-sidebar surface-grain group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow-sm/5"
              data-sidebar="sidebar"
              data-slot="sidebar-inner"
            >
              {children}
            </div>
          )}
        </div>
      </div>
    </SidebarInstanceContext>
  );
}

/** Renders the sidebar toggle; calls the supplied onClick before changing sidebar state and forwards remaining button props. */
function SidebarTrigger({ className, onClick, ...props }: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar();
  const isOpen = useSidebarVisibility();

  return (
    <Button
      className={cn(
        "size-[var(--workspace-titlebar-control-size)]! [-webkit-app-region:no-drag]",
        className,
      )}
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      aria-pressed={isOpen}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      size="icon"
      variant="ghost"
      {...props}
    >
      <MorphIcon className="size-4" icon={isOpen ? PanelLeftClose : PanelLeft} />
      <span className="sr-only">{t.app.sidebar.toggle}</span>
    </Button>
  );
}

function clampSidebarWidth(width: number, options: SidebarResolvedResizableOptions): number {
  return Math.max(options.minWidth, Math.min(width, options.maxWidth));
}

/** Renders the sidebar edge control and drag-only pixel readout, forwarding supplied pointer handlers and click action; enables resizing only when the sidebar context allows it. */
function SidebarRail({
  className,
  onClick,
  onPointerCancel,
  onLostPointerCapture,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  ...props
}: React.ComponentProps<"button">) {
  const { open, setOpen, toggleSidebar, onCollapse } = useSidebar();
  const sidebarInstance = React.use(SidebarInstanceContext);
  const railRef = React.useRef<HTMLButtonElement | null>(null);
  const widthReadoutRef = React.useRef<HTMLSpanElement | null>(null);
  const [isResizing, setIsResizing] = React.useState(false);
  const suppressClickRef = React.useRef(false);
  const resolvedResizable = sidebarInstance?.resizable ?? null;
  const latestResizable = React.useRef(resolvedResizable);
  const canResize = resolvedResizable !== null && open;
  const railLabel = canResize ? t.app.sidebar.resize : t.app.sidebar.toggle;
  const railTitle = canResize ? t.app.sidebar.dragResize : t.app.sidebar.toggle;
  const resize = useResizeDrag<HTMLButtonElement>((event) => {
    if (!resolvedResizable) return null;
    suppressClickRef.current = false;
    const side = sidebarInstance?.side ?? "left";
    if (!open) {
      if (
        !isPhysicsEnabled() ||
        event.currentTarget.closest("[data-slot='sidebar']")?.getAttribute("data-collapsible") !==
          "icon"
      )
        return null;
      // Only visible icon rails probe outward travel; offcanvas rails leave native scrollbars unobstructed.
      return {
        width: 0,
        bounds: { min: 0, max: Number.POSITIVE_INFINITY },
        physicalInteraction: true,
        edge: side === "left" ? "right" : "left",
        resize: (distance) => distance,
        finish(distance) {
          if (distance > 24) {
            suppressClickRef.current = true;
            setOpen(true);
          }
        },
      };
    }
    const rail = event.currentTarget;
    const wrapper = rail.closest<HTMLElement>("[data-slot='sidebar-wrapper']");
    const sidebarRoot = rail.closest<HTMLElement>("[data-slot='sidebar']");
    const sidebarContainer = sidebarRoot?.querySelector<HTMLElement>(
      "[data-slot='sidebar-container']",
    );
    if (!wrapper || !sidebarRoot || !sidebarContainer) return null;

    let width = clampSidebarWidth(
      sidebarContainer.getBoundingClientRect().width,
      resolvedResizable,
    );
    // Drag frames write width to the gap and container only. Changing the
    // inherited --sidebar-width on the wrapper restyles the whole app, so it is
    // written once when the drag commits.
    const widthTargets = [
      sidebarRoot.querySelector<HTMLElement>("[data-slot='sidebar-gap']"),
      sidebarContainer,
    ].filter((element): element is HTMLElement => element !== null);
    const setTargetWidth = (value: number) => {
      widthTargets.forEach((element) => {
        element.style.setProperty("width", `${value}px`);
      });
      // Keep pointer-frame feedback local to the rail, without rendering the list.
      if (widthReadoutRef.current) widthReadoutRef.current.textContent = `${Math.round(value)} px`;
    };
    widthTargets.forEach((element) => {
      element.style.setProperty("transition-duration", "0ms");
    });
    setTargetWidth(width);
    rail.setAttribute("data-resizing", "true");
    setIsResizing(true);

    let acceptedFrame = true;
    const physics = createResizePhysics(
      () => latestResizable.current?.minWidth ?? resolvedResizable.minWidth,
      () => latestResizable.current?.maxWidth ?? resolvedResizable.maxWidth,
      () => {
        if (!acceptedFrame) return;
        suppressClickRef.current = true;
        setOpen(false);
      },
    );
    return {
      width,
      bounds: physics,
      physics,
      paint(value) {
        if (acceptedFrame) setTargetWidth(value);
      },
      edge: side === "left" ? "right" : "left",
      resize(value) {
        const options = latestResizable.current;
        if (!options) return width;
        const nextWidth = clampSidebarWidth(value, options);
        const accepted =
          options.shouldAcceptWidth?.({
            currentWidth: width,
            nextWidth,
            rail,
            side,
            sidebarRoot,
            wrapper,
          }) ?? true;
        acceptedFrame = accepted;
        if (accepted) {
          setTargetWidth(nextWidth);
          width = nextWidth;
        }
        return width;
      },
      finish(finalWidth, moved) {
        wrapper.style.setProperty("--sidebar-width", `${finalWidth}px`);
        suppressClickRef.current = moved;
        const options = latestResizable.current;
        if (options?.storageKey) {
          try {
            setLocalStorageItem(options.storageKey, finalWidth, Schema.Finite);
          } catch (error) {
            console.error("Could not persist sidebar width.", error);
          }
        }
        options?.onResize?.(finalWidth);
      },
      cleanup() {
        rail.removeAttribute("data-resizing");
        setIsResizing(false);
        widthTargets.forEach((element) => {
          element.style.removeProperty("width");
          element.style.removeProperty("transition-duration");
        });
      },
    };
  }, String(open));
  const attachRail = useStableCallback((node: HTMLButtonElement | null) => {
    railRef.current = node;
    const releaseDrag = resize.ref(node);
    if (!releaseDrag) return undefined;
    const unsubscribe = onCollapse(resize.cancel);
    return () => {
      unsubscribe();
      releaseDrag();
      railRef.current = null;
    };
  });
  const refreshResize = React.useEffectEvent(() => resize.refresh());
  React.useLayoutEffect(() => {
    latestResizable.current = resolvedResizable;
    refreshResize();
  }, [resolvedResizable]);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      return;
    }
    if (resolvedResizable && open) {
      event.preventDefault();
      return;
    }
    toggleSidebar();
  };

  React.useLayoutEffect(() => {
    if (!resolvedResizable?.storageKey || typeof window === "undefined") return;
    const rail = railRef.current;
    if (!rail) return;
    const wrapper = rail.closest<HTMLElement>("[data-slot='sidebar-wrapper']");
    if (!wrapper) return;

    let storedWidth: number | null;
    try {
      storedWidth = getLocalStorageItem(resolvedResizable.storageKey, Schema.Finite);
    } catch (error) {
      console.error("Could not restore persisted sidebar width.", error);
      return;
    }
    if (storedWidth === null) return;
    const clampedWidth = clampSidebarWidth(storedWidth, resolvedResizable);
    wrapper.style.setProperty("--sidebar-width", `${clampedWidth}px`);
    resolvedResizable.onResize?.(clampedWidth);
  }, [resolvedResizable]);

  return (
    <Tooltip disabled={isResizing}>
      <TooltipTrigger
        render={
          <button
            aria-label={railLabel}
            className={cn(
              /* A collapsed offcanvas rail overlaps the adjacent native scrollbar on Windows/Linux.
                 Keep it non-interactive in both motion modes; the visible icon rail retains click and drag. */
              "-translate-x-1/2 group-data-[side=left]:-right-4 absolute inset-y-0 z-20 hidden w-4 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-sidebar-border group-data-[side=right]:left-0 sm:flex [[data-collapsible=offcanvas][data-state=collapsed]_&]:pointer-events-none",
              "[[data-panel-animations=true]_&]:transition-all [[data-panel-animations=true]_&]:[transition-duration:var(--panel-animation-duration)] [[data-panel-animations=true]_&]:ease-(--panel-animation-easing)",
              "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
              "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
              "group-data-[collapsible=offcanvas]:translate-x-0 hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:after:left-full",
              "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
              "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
              className,
            )}
            data-sidebar="rail"
            data-slot="sidebar-rail"
            data-resizable={canResize || undefined}
            onClick={handleClick}
            onLostPointerCapture={(event) => {
              onLostPointerCapture?.(event);
              if (!event.defaultPrevented) resize.onLostPointerCapture(event);
            }}
            onPointerCancel={(event) => {
              onPointerCancel?.(event);
              if (!event.defaultPrevented) resize.onPointerCancel(event);
            }}
            onPointerDown={(event) => {
              onPointerDown?.(event);
              if (!event.defaultPrevented) resize.onPointerDown(event);
            }}
            onPointerMove={(event) => {
              onPointerMove?.(event);
              if (!event.defaultPrevented) resize.onPointerMove(event);
            }}
            onPointerUp={(event) => {
              onPointerUp?.(event);
              if (!event.defaultPrevented) resize.onPointerUp(event);
            }}
            ref={attachRail}
            tabIndex={-1}
            type="button"
            {...props}
          >
            {canResize ? (
              <>
                <span aria-hidden="true" className="sidebar-resize-grip" />
                <span aria-hidden="true" className="sidebar-resize-readout" ref={widthReadoutRef} />
              </>
            ) : null}
          </button>
        }
      />
      <TooltipPopup side="right">{railTitle}</TooltipPopup>
    </Tooltip>
  );
}

function SidebarInput({ className, ...props }: Omit<InputProps, "unstyled" | "variant">) {
  return (
    <Input
      className={cn(
        "[&_[data-slot=input]]:h-auto [&_[data-slot=input]]:p-0 [&_[data-slot=input]]:font-medium [&_[data-slot=input]]:text-sidebar-foreground [&_[data-slot=input]]:text-sm [&_[data-slot=input]]:leading-normal [&_[data-slot=input]]:placeholder:text-sidebar-muted-foreground",
        className,
      )}
      unstyled
      {...props}
    />
  );
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "relative flex min-w-0 w-full flex-1 flex-col bg-background surface-grain",
        "md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ms-2 md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ms-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm/5",
        className,
      )}
      data-slot="sidebar-inset"
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-2 p-2", className)}
      data-sidebar="header"
      data-slot="sidebar-header"
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 px-[var(--sidebar-content-inset)] pt-1 pb-[var(--sidebar-content-inset)]",
        className,
      )}
      data-sidebar="footer"
      data-slot="sidebar-footer"
      {...props}
    />
  );
}

function SidebarContent({
  className,
  fixedHeader,
  ...props
}: React.ComponentProps<"div"> & {
  fixedHeader?: React.ReactNode;
}) {
  return (
    <>
      {fixedHeader ? <div className="w-full shrink-0">{fixedHeader}</div> : null}
      <ScrollArea
        hideScrollbars
        scrollFade
        scrollFadePadding={false}
        // Thread rows provide keyboard access to this scroll region. Keeping
        // Base UI's viewport out of the tab order lets its presentational role
        // flatten in WebKit instead of becoming a VoiceOver interaction group.
        viewportTabIndex={-1}
        className="h-auto min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]]:[--fade-size:0.75rem]"
      >
        <div
          className={cn(
            "flex w-full min-w-0 flex-col [overflow-anchor:none] group-data-[collapsible=icon]:overflow-hidden [&>[data-sidebar=group]+[data-sidebar=group]]:pt-0",
            fixedHeader && "[&>[data-sidebar=group]:first-child]:pt-0",
            className,
          )}
          data-sidebar="content"
          data-slot="sidebar-content"
          {...props}
        />
      </ScrollArea>
    </>
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative flex w-full min-w-0 flex-col p-[var(--sidebar-content-inset)]",
        className,
      )}
      data-sidebar="group"
      data-slot="sidebar-group"
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      data-sidebar="menu"
      data-slot="sidebar-menu"
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      className={cn("group/menu-item relative", className)}
      data-sidebar="menu-item"
      data-slot="sidebar-menu-item"
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full cursor-pointer items-center gap-[var(--sidebar-control-gap)] overflow-hidden text-left outline-hidden ring-ring transition-[width,height,padding] hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset active:bg-sidebar-row-active active:text-sidebar-foreground disabled:pointer-events-none disabled:opacity-64 aria-disabled:pointer-events-none aria-disabled:opacity-64 data-[active=true]:bg-sidebar-row-selected data-[active=true]:font-medium data-[active=true]:text-sidebar-foreground data-[state=open]:hover:bg-sidebar-row-hover data-[state=open]:hover:text-sidebar-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-[var(--sidebar-content-inset)]! [&>span:last-child]:truncate [&>svg:not([class*='size-'])]:size-4 [&>svg]:shrink-0 [&>svg]:text-[var(--sidebar-icon-color)] hover:[&>svg]:text-sidebar-foreground active:[&>svg]:text-sidebar-foreground data-[active=true]:[&>svg]:text-sidebar-foreground",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default:
          "h-8 rounded-[var(--control-radius)] px-[var(--sidebar-row-content-inset)] py-1.5 text-sm",
        icon: "size-8 justify-center rounded-[var(--control-radius)] p-0",
        lg: "h-12 rounded-[var(--control-radius)] px-[var(--sidebar-row-content-inset)] py-2 text-sm group-data-[collapsible=icon]:p-0!",
        sm: "h-7 rounded-[var(--control-radius)] px-[var(--sidebar-row-content-inset)] py-2 text-xs",
      },
      variant: {
        default: "font-medium text-sidebar-muted-foreground/80",
        outline: "bg-sidebar-control-surface ring-1 ring-sidebar-border",
      },
    },
  },
);

function SidebarMenuButton({
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  render,
  ...props
}: useRender.ComponentProps<"button"> & {
  isActive?: boolean;
  tooltip?: string | React.ComponentProps<typeof TooltipPopup>;
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const { isMobile, state } = useSidebar();

  const defaultProps = {
    className: cn(sidebarMenuButtonVariants({ size, variant }), className),
    "data-active": isActive,
    "data-sidebar": "menu-button",
    "data-size": size,
    "data-slot": "sidebar-menu-button",
  };

  const buttonProps = mergeProps<"button">(defaultProps, props);

  const buttonElement = useRender({
    defaultTagName: "button",
    props: buttonProps,
    render,
  });

  if (!tooltip) {
    return buttonElement;
  }

  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip,
    };
  }

  return (
    <Tooltip>
      <TooltipTrigger render={buttonElement as React.ReactElement<Record<string, unknown>>} />
      <TooltipPopup
        align="center"
        hidden={state !== "collapsed" || isMobile}
        side="right"
        {...tooltip}
      />
    </Tooltip>
  );
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-sidebar-border border-l px-2.5 py-0.5",
        "group-data-[collapsible=icon]:hidden",
        className,
      )}
      data-sidebar="menu-sub"
      data-slot="sidebar-menu-sub"
      {...props}
    />
  );
}

function SidebarMenuSubItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      className={cn("group/menu-sub-item relative", className)}
      data-sidebar="menu-sub-item"
      data-slot="sidebar-menu-sub-item"
      {...props}
    />
  );
}

function SidebarMenuSubButton({
  size = "md",
  isActive = false,
  className,
  render,
  ...props
}: useRender.ComponentProps<"a"> & {
  size?: "sm" | "md";
  isActive?: boolean;
}) {
  const defaultProps = {
    className: cn(
      "-translate-x-px flex h-7 min-w-0 cursor-pointer items-center gap-2 overflow-hidden rounded-lg px-2 text-sidebar-foreground outline-hidden ring-ring hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset active:bg-sidebar-row-active active:text-sidebar-foreground disabled:pointer-events-none disabled:opacity-64 aria-disabled:pointer-events-none aria-disabled:opacity-64 [&>span:last-child]:truncate [&>svg:not([class*='size-'])]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-muted-foreground",
      "data-[active=true]:bg-sidebar-row-selected data-[active=true]:text-sidebar-foreground",
      size === "sm" && "text-xs",
      size === "md" && "text-sm",
      "group-data-[collapsible=icon]:hidden",
      className,
    ),
    "data-active": isActive,
    "data-sidebar": "menu-sub-button",
    "data-size": size,
    "data-slot": "sidebar-menu-sub-button",
  };

  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(defaultProps, props),
    render,
  });
}

export {
  SidebarInput,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
  useSidebarVisibility,
};
