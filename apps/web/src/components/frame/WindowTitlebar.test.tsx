/**
 * Exercises measured discussion-header budgets and release through real route portals.
 * @vitest-environment jsdom
 */
import { act, Profiler } from "react";
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
      // CSS now owns continuous widths; no measured pixel track is committed through React.
      expect(header.style.gridTemplateColumns).toBe("");
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

it("does not commit on same-region resize notifications and switches once at the threshold", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const committed = vi.fn();
  try {
    await act(() =>
      root.render(
        <Profiler id="header" onRender={committed}>
          <TitlebarSlotProvider>
            <WindowTitlebar
              sidebarControl={<button>sidebar</button>}
              onLeadingWidthChange={() => {}}
            />
            <TitlebarSlotOutlet name="panel" />
            <Route paused={false} panel />
          </TitlebarSlotProvider>
        </Profiler>,
      ),
    );
    await act(() => measurements.deliver!(437));
    committed.mockClear();
    for (const width of [440, 500, 600, 715]) await act(() => measurements.deliver!(width));
    expect(committed).not.toHaveBeenCalled();
    await act(() => measurements.deliver!(716));
    expect(container.querySelector("header")!.dataset.discussionLayout).toBe("full");
    expect(committed).toHaveBeenCalledTimes(1);
    committed.mockClear();
    for (const width of [720, 900, 1000]) await act(() => measurements.deliver!(width));
    expect(committed).not.toHaveBeenCalled();
  } finally {
    await act(() => root.unmount());
    container.remove();
    measurements.deliver = undefined;
    vi.unstubAllGlobals();
  }
});
