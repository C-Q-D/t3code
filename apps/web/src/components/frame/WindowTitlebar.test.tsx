/**
 * Exercises measured discussion-header budgets and release through real route portals.
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { WindowTitlebar } from "./WindowTitlebar";
import { TitlebarSlotOutlet, TitlebarSlotProvider, useTitlebarSlot } from "./titlebarSlot";

const measurements = vi.hoisted(() => ({
  deliver: undefined as ((width: number) => void) | undefined,
}));
vi.mock("~/lib/observeResize", () => ({
  /** Supply a real ResizeObserver boundary's content width without pretending jsdom lays out text. */
  observeResize: (element: HTMLElement, callback: (entries: unknown[]) => void) => {
    if (element.tagName === "HEADER") {
      measurements.deliver = (width) => callback([{ contentRect: { width } }]);
    }
    return () => {};
  },
}));
vi.mock("~/hooks/useSettings", () => ({ useEnvironmentIdentificationMode: () => "none" }));
vi.mock("../SidebarStageBackdrop", () => ({
  useEnvironmentStageLabel: () => null,
  resolveSidebarStageBackdropVariant: () => null,
}));
vi.mock("@tanstack/react-router", () => ({
  /** Navigation is outside the geometry contract; preserve the brand's rendered children. */
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));

/** Supplies long live route content; closing the panel must restore the original frame layout. */
function Route({ paused, panel }: { paused: boolean; panel: boolean }) {
  return useTitlebarSlot({
    breadcrumb: <h1>{"长讨论标题 Long discussion title ".repeat(30)}</h1>,
    actions: (
      <div>
        <button>{paused ? "继续" : "停止"}</button>
        <button>结束讨论</button>
      </div>
    ),
    panel: panel ? <aside>diff</aside> : null,
  });
}

it.each([false, true])(
  "bounds a long title and actions at 1025px (paused=%s), then restores chrome",
  async (paused) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    /** Keeps the measured frame mounted while the route releases its panel ownership. */
    const render = (panel: boolean) => (
      <TitlebarSlotProvider>
        <WindowTitlebar sidebarControl={<button>sidebar</button>} onLeadingWidthChange={() => {}} />
        <TitlebarSlotOutlet name="panel" />
        <Route paused={paused} panel={panel} />
      </TitlebarSlotProvider>
    );
    try {
      await act(() => root.render(render(true)));
      expect(measurements.deliver).toBeDefined();
      await act(() => measurements.deliver!(437));
      const header = container.querySelector("header")!;
      expect(header.dataset.discussionLayout).toBe("compact");
      // These are the grid tracks delivered to layout, not measurements fabricated by jsdom.
      // The intrinsic width of the long h1 cannot enlarge the bounded 307px title track.
      expect(header.style.gridTemplateColumns).toBe("70px 8px minmax(0, 307px) 8px 44px");
      const fixedTracks = [...header.style.gridTemplateColumns.matchAll(/(\d+)px/g)].reduce(
        (total, match) => total + Number(match[1]),
        0,
      );
      expect(fixedTracks + 16).toBeLessThanOrEqual(453);
      expect(header.querySelector("h1")!.textContent!.length).toBeGreaterThan(500);
      expect(header.querySelector('[data-titlebar-slot="actions"]')!.textContent).toBe(
        paused ? "继续结束讨论" : "停止结束讨论",
      );
      await act(() => root.render(render(false)));
      expect(header.dataset.discussionLayout).toBeUndefined();
      expect(header.style.gridTemplateColumns).toBe("");
    } finally {
      await act(() => root.unmount());
      container.remove();
      measurements.deliver = undefined;
      vi.unstubAllGlobals();
    }
  },
);
