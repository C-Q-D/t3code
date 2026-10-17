/**
 * Checks menu portal removal and owned focus transfer in both titlebar layout directions.
 * @vitest-environment jsdom
 */
import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { t } from "~/i18n";
import {
  TitlebarSlotOutlet,
  TitlebarSlotProvider,
  useTitlebarPanelLayout,
  useTitlebarSlot,
} from "../frame/titlebarSlot";
import { DiscussionTitlebarActions } from "./DiscussionTitlebarActions";

it.each([false, true])(
  "removes the open compact menu and focuses a full button (paused=%s)",
  async (paused) => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const animations = Object.getOwnPropertyDescriptor(Element.prototype, "getAnimations");
    Object.defineProperty(Element.prototype, "getAnimations", {
      configurable: true,
      value: () => [],
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let setCompact: (value: boolean) => void = () => {
      throw new Error("Layout not mounted");
    };
    const execute = vi.fn();
    /** Uses the same layout provider as WindowTitlebar; only the width notification is controlled. */
    function Route() {
      const { setCompact: updateLayout } = useTitlebarPanelLayout();
      useLayoutEffect(() => {
        setCompact = updateLayout;
      }, [updateLayout]);
      return useTitlebarSlot({
        panel: <aside>diff</aside>,
        actions: (
          <DiscussionTitlebarActions
            actions={[paused ? "resume" : "stop", "end"]}
            enabled={() => true}
            onAction={execute}
          />
        ),
      });
    }
    try {
      await act(() =>
        root.render(
          <TitlebarSlotProvider>
            <TitlebarSlotOutlet name="actions" />
            <TitlebarSlotOutlet name="panel" />
            <Route />
          </TitlebarSlotProvider>,
        ),
      );
      const trigger = container.querySelector<HTMLButtonElement>("button")!;
      await act(() => {
        trigger.focus();
        trigger.click();
      });
      await act(() => vi.advanceTimersByTimeAsync(0));
      await act(() => vi.advanceTimersToNextFrame());
      const item = document.querySelector<HTMLElement>('[role="menuitem"]')!;
      expect(item).not.toBeNull();
      await act(() => item.focus());
      expect(document.activeElement).toBe(item);
      await act(() => setCompact(false));
      await act(() => vi.advanceTimersByTimeAsync(0));
      await act(() => vi.advanceTimersToNextFrame());
      expect(document.querySelector('[role="menu"]')).toBeNull();
      const fullButtons = container.querySelectorAll<HTMLButtonElement>("button");
      expect(fullButtons).toHaveLength(2);
      expect(fullButtons[0]!.textContent).toBe(
        paused ? t.discussions.page.resume : t.discussions.page.stop,
      );
      expect(document.activeElement).toBe(fullButtons[0]);
      await act(() => fullButtons[0]!.click());
      expect(execute).toHaveBeenCalledWith(paused ? "resume" : "stop");
    } finally {
      await act(() => root.unmount());
      container.remove();
      if (animations) Object.defineProperty(Element.prototype, "getAnimations", animations);
      else Reflect.deleteProperty(Element.prototype, "getAnimations");
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  },
);

it.each([
  { initialCompact: false, outside: false },
  { initialCompact: true, outside: false },
  { initialCompact: true, outside: true },
])(
  "preserves closed-menu focus ownership (compact=$initialCompact, outside=$outside)",
  async ({ initialCompact, outside }) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let setCompact: (value: boolean) => void = () => {
      throw new Error("Layout not mounted");
    };
    /** Supplies actual action portals while controlling only the measured layout result. */
    function Route() {
      const { setCompact: updateLayout } = useTitlebarPanelLayout();
      useLayoutEffect(() => {
        setCompact = updateLayout;
      }, [updateLayout]);
      return useTitlebarSlot({
        panel: <aside>diff</aside>,
        actions: (
          <DiscussionTitlebarActions
            actions={["stop", "end"]}
            enabled={() => true}
            onAction={() => {}}
          />
        ),
      });
    }
    try {
      await act(() =>
        root.render(
          <TitlebarSlotProvider>
            <input aria-label="outside" />
            <TitlebarSlotOutlet name="actions" />
            <TitlebarSlotOutlet name="panel" />
            <Route />
          </TitlebarSlotProvider>,
        ),
      );
      await act(() => setCompact(initialCompact));
      const previous = outside
        ? container.querySelector<HTMLInputElement>("input")!
        : container.querySelector<HTMLButtonElement>("button")!;
      await act(() => container.querySelector<HTMLButtonElement>("button")!.focus());
      await act(() => previous.focus());
      expect(document.activeElement).toBe(previous);
      expect(document.querySelector('[role="menu"]')).toBeNull();
      await act(() => setCompact(!initialCompact));
      expect(document.querySelector('[role="menu"]')).toBeNull();
      const next = container.querySelector<HTMLButtonElement>("button")!;
      expect(next.getAttribute("aria-label")).toBe(
        initialCompact ? t.discussions.page.stop : t.discussions.page.more,
      );
      expect(document.activeElement).toBe(outside ? previous : next);
    } finally {
      await act(() => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  },
);
