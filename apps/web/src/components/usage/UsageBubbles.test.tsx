/** Interaction regressions exercise the real bubble view and page Escape navigation together. */
// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ModelTotals } from "@t3tools/shared/usageMerge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useEscapeToGoBack } from "../../hooks/useNavigateBack";
import { installTestRaf } from "../../lib/motion/testRaf";
import { UsageBubbles } from "./UsageBubbles";

vi.mock("@tanstack/react-router", () => ({
  useCanGoBack: () => true,
  useNavigate: () => vi.fn(),
}));
const motion = vi.hoisted(() => ({ enabled: false }));
vi.mock("../../hooks/usePhysicsMotion", () => ({
  usePhysicsMotion: () => motion,
}));

/** Build priced models with explicit shares, independent of the bubble grouping implementation. */
function model(name: string, share: number): ModelTotals {
  return {
    model: name,
    provider: "codex",
    costUsd: share,
    totalTokens: 1000 * share,
    tokens: {
      uncachedInputTokens: 1000 * share,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
    },
    records: 1,
    unpricedRecords: 0,
    unpricedTokens: 0,
    costShare: share,
    tokenShare: share,
  };
}

/** Keep the production page navigation listener mounted around the real graph. */
function Page({ models }: { models: ModelTotals[] }) {
  useEscapeToGoBack();
  return <UsageBubbles models={models} metric="cost" onSelectModel={() => {}} />;
}

describe("bubble hints", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    motion.enabled = false;
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("closes a focused hint on first Escape and navigates back only on the second", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    act(() => root.render(<Page models={[model("main", 1)]} />));
    const bubble = container.querySelector<SVGGElement>('[role="button"]')!;
    act(() => bubble.focus());
    expect(container.querySelector('[role="tooltip"]')?.textContent).toContain("main");
    act(() =>
      bubble.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      ),
    );
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
    expect(back).not.toHaveBeenCalled();
    act(() =>
      bubble.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      ),
    );
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("keeps a long member hint reachable across the gap and closes after leaving it", () => {
    const models = [
      model("main", 0.975),
      ...Array.from({ length: 25 }, (_, index) => model(`small-${index}`, 0.001)),
    ];
    act(() => root.render(<Page models={models} />));
    const bubble = container.querySelector<SVGGElement>('[data-bubble="other"]')!;
    act(() => bubble.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })));
    expect(container.querySelector('[role="tooltip"]')?.textContent).toContain("small-24");
    act(() => {
      bubble.dispatchEvent(
        new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body }),
      );
      vi.advanceTimersByTime(100);
    });
    const hint = container.querySelector<HTMLElement>('[role="tooltip"]');
    expect(hint).not.toBeNull();
    act(() =>
      hint!.dispatchEvent(
        new MouseEvent("pointerover", { bubbles: true, relatedTarget: document.body }),
      ),
    );
    act(() => vi.advanceTimersByTime(1000));
    expect(container.querySelector('[role="tooltip"]')?.textContent).toContain("small-24");
    act(() => {
      hint!.dispatchEvent(
        new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body }),
      );
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
  });

  it("keeps a captured drag through focus hints and parent renders, then releases it", () => {
    motion.enabled = true;
    installTestRaf();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);
    const models = [model("main", 1)];
    const onSelectModel = vi.fn();
    act(() =>
      root.render(<UsageBubbles models={models} metric="cost" onSelectModel={onSelectModel} />),
    );
    const svg = container.querySelector("svg")!;
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 600, 300));
    const bubble = container.querySelector<SVGGElement>('[data-bubble="codex:main"]')!;
    let captured: number | null = null;
    const releaseCapture = vi.fn((pointerId: number) => {
      if (captured === pointerId) captured = null;
    });
    Object.assign(bubble, {
      setPointerCapture: (pointerId: number) => {
        captured = pointerId;
      },
      hasPointerCapture: (pointerId: number) => captured === pointerId,
      releasePointerCapture: releaseCapture,
    });
    /** jsdom supplies mouse coordinates; add the stable pointer identity used by capture. */
    const pointer = (type: string, x: number, y: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
        clientY: y,
      });
      Object.defineProperty(event, "pointerId", { value: 7 });
      return event;
    };
    act(() => bubble.dispatchEvent(pointer("pointerdown", 300, 150)));
    expect(captured).toBe(7);
    expect(container.querySelector('[role="tooltip"]')?.textContent).toContain("main");
    act(() =>
      root.render(<UsageBubbles models={models} metric="cost" onSelectModel={onSelectModel} />),
    );
    act(() => bubble.dispatchEvent(pointer("pointermove", 360, 180)));
    expect(bubble.getAttribute("transform")).toBe("translate(360 180)");
    act(() => bubble.dispatchEvent(pointer("pointerup", 360, 180)));
    expect(releaseCapture).toHaveBeenCalledExactlyOnceWith(7);
    expect(captured).toBeNull();
    expect(onSelectModel).not.toHaveBeenCalled();
    act(() => bubble.dispatchEvent(pointer("pointermove", 420, 210)));
    expect(bubble.getAttribute("transform")).toBe("translate(360 180)");
  });
});
