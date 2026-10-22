/** Verifies provider selection geometry and finite motion in the desktop composer's real CSS. */
import { useState } from "react";
import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { fakeTimers, render } from "../../../test/render";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import { isPhysicsEnabled, setPhysicsEnabled } from "~/lib/motion/preference";
import { ModelPickerSidebar } from "./ModelPickerSidebar";
import { t } from "~/i18n";
import { applyThemePalette } from "../../themePalette";
import { captureAnimations } from "../../test/captureAnimations";
import "../../index.css";

/** Uses ready local providers so navigation exercises actual toolbar buttons without network data. */
function entries() {
  return deriveProviderInstanceEntries(
    ["codex", "claudeCode", "cursor", "grok"].map((name) => ({
      instanceId: ProviderInstanceId.make(name),
      driver: ProviderDriverKind.make(name),
      displayName: name,
      enabled: true,
      installed: true,
      version: null,
      status: "ready" as const,
      auth: { status: "authenticated" as const },
      checkedAt: "2026-01-01T00:00:00.000Z",
      models: [],
      slashCommands: [],
      skills: [],
    })),
  );
}

/** Keeps selection controlled while allowing layout changes without remounting the sidebar. */
function Harness({ providers = entries(), height = 240 }) {
  const [selected, setSelected] = useState<ProviderInstanceId | "favorites">(
    ProviderInstanceId.make("codex"),
  );
  return (
    <div className="composer-model-picker flex" style={{ height }}>
      <ModelPickerSidebar
        selectedInstanceId={selected}
        onSelectInstance={setSelected}
        onFocusSearch={() => {}}
        instanceEntries={providers}
      />
    </div>
  );
}

/** Restores root theme and motion permission even when an assertion fails. */
function setup(dark: boolean, physics = false) {
  const root = document.documentElement;
  const theme = root.getAttribute("data-theme-id");
  const wasDark = root.classList.contains("dark");
  const wasEnabled = isPhysicsEnabled();
  const style = root.getAttribute("style");
  applyThemePalette("graphite", dark ? "dark" : "light");
  root.setAttribute("data-theme-id", "graphite");
  root.classList.toggle("dark", dark);
  setPhysicsEnabled(physics);
  return {
    [Symbol.dispose]() {
      if (theme === null) root.removeAttribute("data-theme-id");
      else root.setAttribute("data-theme-id", theme);
      root.classList.toggle("dark", wasDark);
      if (style === null) root.removeAttribute("style");
      else root.setAttribute("style", style);
      setPhysicsEnabled(wasEnabled);
    },
  };
}

/** Compares rendered edges against the selected button, never against the motion implementation. */
function expectAligned(container: HTMLElement) {
  const layers = container.querySelectorAll<HTMLElement>("[data-model-picker-selection]");
  expect(layers).toHaveLength(1);
  const layer = layers[0]!;
  const button = container.querySelector<HTMLElement>('button[aria-pressed="true"]')!;
  const bar = container.querySelector<HTMLElement>("[data-model-picker-selected-indicator]")!;
  const target = button.getBoundingClientRect();
  const actual = layer.getBoundingClientRect();
  const indicator = bar.getBoundingClientRect();
  expect(target.height).toBeGreaterThan(0);
  expect(Math.abs(actual.top - target.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.bottom - target.bottom)).toBeLessThanOrEqual(1);
  expect(
    Math.abs((indicator.top + indicator.bottom - target.top - target.bottom) / 2),
  ).toBeLessThanOrEqual(1);
  expect(indicator.width).toBe(3);
  expect(indicator.height).toBe(20);
  return layer;
}

it.each([false, true])(
  "aligns providers and favorites with persistent color, dark=%s",
  async (dark) => {
    using _settings = setup(dark);
    await using screen = await render(<Harness />);
    using _animations = captureAnimations();
    await screen.getByRole("button", { name: "claudeCode", exact: true }).click();
    await vi.waitFor(() => {
      const layer = expectAligned(screen.container);
      expect(layer.getAnimations()).toHaveLength(0);
      expect(getComputedStyle(layer).backgroundImage).toContain("linear-gradient");
      expect(getComputedStyle(layer).boxShadow === "none").toBe(!dark);
    });
    await screen
      .getByRole("button", { name: t.composer.modelPicker.favorites, exact: true })
      .click();
    await vi.waitFor(() => expectAligned(screen.container));
  },
);

it("animates selection once, then snaps layout changes and scrolling without replay", async () => {
  using _settings = setup(true, true);
  const providers = entries();
  await using screen = await render(<Harness providers={providers} />);
  const layer = expectAligned(screen.container);
  expect(layer.getAnimations()).toHaveLength(0);
  using _clock = fakeTimers();
  using _animations = captureAnimations();
  await screen.getByRole("button", { name: "claudeCode", exact: true }).click();
  await vi.waitFor(() => {
    const animations = layer.getAnimations();
    expect(animations).toHaveLength(2);
    for (const animation of animations) {
      expect(animation.playState).toBe("paused");
      const timing = animation.effect!.getTiming();
      expect(timing.iterations).toBe(1);
      expect(Number(timing.duration)).toBeGreaterThan(0);
      expect(Number.isFinite(Number(timing.duration))).toBe(true);
    }
  });
  const animations = layer.getAnimations();
  const finished = Promise.all(animations.map((animation) => animation.finished));
  animations.forEach((animation) => animation.finish());
  await finished;
  await vi.waitFor(() => expectAligned(screen.container));
  await screen.rerender(<Harness providers={providers.toReversed()} height={100} />);
  await vi.waitFor(() => {
    expect(expectAligned(screen.container)).toBe(layer);
    expect(layer.getAnimations()).toHaveLength(0);
  });
  const scroller = screen.container.querySelector<HTMLElement>(
    "[data-model-picker-sidebar] > div",
  )!;
  scroller.scrollTop = 50;
  await vi.waitFor(() => {
    expect(scroller.scrollTop).toBe(50);
    expectAligned(screen.container);
    expect(layer.getAnimations()).toHaveLength(0);
  });
});

it("preserves provider springs through icon DOM changes, including a selection batch", async () => {
  using _settings = setup(true, true);
  await using screen = await render(<Harness />);
  using captured = captureAnimations();
  const button = screen.getByRole("button", { name: "claudeCode", exact: true });
  await button.click();
  const layer = screen.container.querySelector<HTMLElement>("[data-model-picker-selection]")!;
  await vi.waitFor(() => expect(layer.getAnimations()).toHaveLength(2));
  const animations = [...captured.animations];
  const bounds = button.element().getBoundingClientRect();
  const decoration = document.createElement("span");
  decoration.hidden = true;
  await new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      observer.disconnect();
      resolve();
    });
    observer.observe(button.element(), { childList: true });
    button.element().append(decoration);
  });
  await vi.waitFor(() => {
    expect(button.element().getBoundingClientRect().top).toBe(bounds.top);
    expect(button.element().getBoundingClientRect().bottom).toBe(bounds.bottom);
    expect(animations.map((animation) => animation.playState)).toEqual(["paused", "paused"]);
    expect(layer.getAnimations()).toEqual(animations);
  });
  await new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      observer.disconnect();
      resolve();
    });
    observer.observe(button.element(), { childList: true });
    decoration.remove();
  });
  expect(animations.map((animation) => animation.playState)).toEqual(["paused", "paused"]);
  await new Promise<void>((resolve) => {
    const observer = new ResizeObserver(() => {
      observer.disconnect();
      resolve();
    });
    observer.observe(button.element());
    (button.element() as HTMLElement).style.height = `${bounds.height + 0.5}px`;
  });
  expect(button.element().getBoundingClientRect().height - bounds.height).toBe(0.5);
  expect(animations.map((animation) => animation.playState)).toEqual(["paused", "paused"]);
  await new Promise<void>((resolve) => {
    const observer = new ResizeObserver(() => {
      observer.disconnect();
      resolve();
    });
    observer.observe(button.element());
    (button.element() as HTMLElement).style.height = `${bounds.height + 0.75}px`;
  });
  await vi.waitFor(() => {
    expectAligned(screen.container);
    expect(animations.map((animation) => animation.playState)).toEqual(["idle", "idle"]);
    expect(captured.animations).toHaveLength(2);
  });
  const next = screen.getByRole("button", { name: "cursor", exact: true });
  next.element().addEventListener(
    "click",
    () => {
      next.element().append(decoration);
    },
    { once: true },
  );
  await next.click();
  await vi.waitFor(() => {
    expect(captured.animations).toHaveLength(4);
    expect(layer.getAnimations()).toEqual(captured.animations.slice(2));
    expect(captured.animations.slice(2).map((animation) => animation.playState)).toEqual([
      "paused",
      "paused",
    ]);
  });
  const scroller = screen.container.querySelector<HTMLElement>(
    "[data-model-picker-sidebar] > div",
  )!;
  scroller.scrollTop = 1;
  await vi.waitFor(() => {
    expect(scroller.scrollTop).toBe(1);
    expectAligned(screen.container);
    expect(captured.animations.slice(2).map((animation) => animation.playState)).toEqual([
      "idle",
      "idle",
    ]);
    expect(captured.animations).toHaveLength(4);
  });
});
