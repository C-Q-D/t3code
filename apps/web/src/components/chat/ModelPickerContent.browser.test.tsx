/** Exercises shared highlight geometry against real virtualized model rows and desktop CSS. */
import { RegistryProvider } from "@effect/atom-react";
import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { captureAnimations } from "../../test/captureAnimations";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import { applyThemePalette } from "../../themePalette";
import { isPhysicsEnabled, setPhysicsEnabled } from "~/lib/motion/preference";
import { ModelPickerContent } from "./ModelPickerContent";
import "../../index.css";

/** Provides enough real options to force recycling without a server or favorite writes. */
function Harness() {
  const instanceId = ProviderInstanceId.make("codex");
  const models = Array.from({ length: 80 }, (_, index) => ({
    slug: `model-${String(index).padStart(2, "0")}`,
    name: `Model ${String(index).padStart(2, "0")}`,
    isCustom: false,
    capabilities: {},
  }));
  const providers = deriveProviderInstanceEntries([
    {
      instanceId,
      driver: ProviderDriverKind.make("codex"),
      enabled: true,
      installed: true,
      version: null,
      status: "ready",
      auth: { status: "authenticated" },
      checkedAt: "2026-01-01T00:00:00.000Z",
      models,
      slashCommands: [],
      skills: [],
    },
  ]);
  return (
    <RegistryProvider>
      <ModelPickerContent
        environmentId={null}
        activeInstanceId={instanceId}
        model="model-00"
        lockedProvider={ProviderDriverKind.make("codex")}
        instanceEntries={providers}
        modelOptionsByInstance={new Map([[instanceId, models]])}
        terminalOpen={false}
        onInstanceModelChange={() => {}}
      />
    </RegistryProvider>
  );
}

/** Restores theme variables and motion permission after each browser case. */
function setup(dark: boolean, physics: boolean) {
  const root = document.documentElement;
  const oldStyle = root.getAttribute("style");
  const oldTheme = root.getAttribute("data-theme-id");
  const oldDark = root.classList.contains("dark");
  const oldPhysics = isPhysicsEnabled();
  applyThemePalette("graphite", dark ? "dark" : "light");
  root.classList.toggle("dark", dark);
  setPhysicsEnabled(physics);
  return {
    [Symbol.dispose]() {
      if (oldStyle === null) root.removeAttribute("style");
      else root.setAttribute("style", oldStyle);
      if (oldTheme === null) root.removeAttribute("data-theme-id");
      else root.setAttribute("data-theme-id", oldTheme);
      root.classList.toggle("dark", oldDark);
      setPhysicsEnabled(oldPhysics);
    },
  };
}

/** Reads the one visible layer and checks its edges against the actual highlighted option. */
function expectAligned(container: HTMLElement) {
  const layers = container.querySelectorAll<HTMLElement>("[data-model-picker-highlight]");
  expect(layers).toHaveLength(1);
  const layer = layers[0]!;
  expect(layer.hidden).toBe(false);
  const row = container.querySelector<HTMLElement>('[role="option"][data-highlighted]')!;
  expect(row).not.toBeNull();
  const target = row.getBoundingClientRect();
  const actual = layer.getBoundingClientRect();
  expect(target.height).toBeGreaterThan(0);
  expect(Math.abs(actual.top - target.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.bottom - target.bottom)).toBeLessThanOrEqual(1);
  return layer;
}

it.each([false, true])(
  "keeps keyboard and hovered selected rows transparent with physics off, dark=%s",
  async (dark) => {
    using _settings = setup(dark, false);
    await using screen = await render(<Harness />);
    using captured = captureAnimations();
    const input = screen.getByRole("combobox");
    await input.click();
    await userEvent.keyboard("{ArrowDown}");
    await expect
      .element(screen.getByRole("option", { name: /Model 00/ }))
      .toHaveAttribute("data-highlighted");
    await userEvent.keyboard("{ArrowDown}");
    await vi.waitFor(() => {
      const layer = expectAligned(screen.container);
      expect(getComputedStyle(layer).backgroundImage).toContain("linear-gradient");
      expect(layer.getAnimations()).toHaveLength(0);
      const row = screen.container.querySelector<HTMLElement>('[role="option"][data-highlighted]')!;
      expect(row.textContent).toContain("Model 01");
      expect(getComputedStyle(row).backgroundColor).toBe("rgba(0, 0, 0, 0)");
      expect(getComputedStyle(layer).boxShadow === "none").toBe(!dark);
    });
    const selected = screen.getByRole("option", { name: /Model 00/ });
    await selected.hover();
    await vi.waitFor(() => {
      expectAligned(screen.container);
      expect(selected.element().hasAttribute("data-selected")).toBe(true);
      expect(selected.element().hasAttribute("data-highlighted")).toBe(true);
      expect(getComputedStyle(selected.element()).backgroundColor).toBe("rgba(0, 0, 0, 0)");
      expect(captured.animations).toHaveLength(0);
    });
  },
);

/** Waits for delivery of a real DOM notification before checking that it preserved or canceled motion. */
async function notifyLayout(row: HTMLElement, change: () => void) {
  await new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      observer.disconnect();
      resolve();
    });
    observer.observe(row, { attributes: true, childList: true });
    change();
  });
}

it("preserves in-flight springs for unchanged or subpixel layout but snaps real moves and scrolling", async () => {
  using _settings = setup(true, true);
  await using screen = await render(<Harness />);
  using captured = captureAnimations();
  await screen.getByRole("combobox").click();
  await userEvent.keyboard("{ArrowDown}");
  await vi.waitFor(() => expectAligned(screen.container));
  await userEvent.keyboard("{ArrowDown}");
  await vi.waitFor(() => expect(captured.animations).toHaveLength(2));
  const row = screen.getByRole("option", { name: /Model 01/ }).element() as HTMLElement;
  const layer = screen.container.querySelector<HTMLElement>("[data-model-picker-highlight]")!;
  const animations = [...captured.animations];
  const bounds = row.getBoundingClientRect();
  await notifyLayout(row, () => {
    const decoration = document.createElement("span");
    decoration.hidden = true;
    row.append(decoration);
  });
  await vi.waitFor(() => {
    expect(row.getBoundingClientRect().top).toBe(bounds.top);
    expect(row.getBoundingClientRect().bottom).toBe(bounds.bottom);
    expect(animations.map((animation) => animation.playState)).toEqual(["paused", "paused"]);
    expect(layer.getAnimations()).toEqual(animations);
  });
  await notifyLayout(row, () => {
    row.style.transform = "translateY(0.5px)";
  });
  await vi.waitFor(() => {
    expect(row.getBoundingClientRect().top - bounds.top).toBe(0.5);
    expect(animations.map((animation) => animation.playState)).toEqual(["paused", "paused"]);
    expect(captured.animations).toHaveLength(2);
  });
  await notifyLayout(row, () => {
    row.style.transform = "translateY(0.75px)";
  });
  await vi.waitFor(() => {
    expectAligned(screen.container);
    expect(animations.map((animation) => animation.playState)).toEqual(["idle", "idle"]);
    expect(captured.animations).toHaveLength(2);
  });
  await userEvent.keyboard("{ArrowDown}");
  await vi.waitFor(() => expect(captured.animations).toHaveLength(4));
  const scroller = Array.from(
    screen.getByRole("listbox").element().querySelectorAll<HTMLElement>("div"),
  ).find(
    (element) =>
      element.scrollHeight > element.clientHeight && getComputedStyle(element).overflowY === "auto",
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

it("springs between keys but snaps scrolling, recycled rows and search changes", async () => {
  using _settings = setup(true, true);
  await using screen = await render(<Harness />);
  using captured = captureAnimations();
  const input = screen.getByRole("combobox");
  await input.click();
  await userEvent.keyboard("{ArrowDown}");
  await expect
    .element(screen.getByRole("option", { name: /Model 00/ }))
    .toHaveAttribute("data-highlighted");
  await vi.waitFor(() => expectAligned(screen.container));
  expect(captured.animations).toHaveLength(0);
  await userEvent.keyboard("{ArrowDown}");
  await vi.waitFor(() => expect(captured.animations).toHaveLength(2));
  const layer = screen.container.querySelector<HTMLElement>("[data-model-picker-highlight]")!;
  for (const animation of captured.animations) {
    expect((animation.effect as KeyframeEffect).target).toBe(layer);
    expect(animation.playState).toBe("paused");
    expect(animation.effect!.getTiming().iterations).toBe(1);
    expect(Number(animation.effect!.getTiming().duration)).toBeGreaterThan(0);
    expect(Number.isFinite(Number(animation.effect!.getTiming().duration))).toBe(true);
    animation.finish();
  }
  await Promise.all(captured.animations.map((animation) => animation.finished));
  await vi.waitFor(() => expectAligned(screen.container));
  const row = screen.container.querySelector<HTMLElement>('[role="option"][data-highlighted]')!;
  const list = screen.getByRole("listbox").element();
  const scroller = Array.from(list.querySelectorAll<HTMLElement>("div")).find(
    (element) =>
      element.scrollHeight > element.clientHeight && getComputedStyle(element).overflowY === "auto",
  )!;
  expect(scroller).toBeDefined();
  scroller.scrollTop = 20;
  await vi.waitFor(() => {
    expect(scroller.scrollTop).toBe(20);
    expectAligned(screen.container);
    expect(captured.animations).toHaveLength(2);
  });
  scroller.scrollTop = 2200;
  await vi.waitFor(() => {
    expect(
      Array.from(list.querySelectorAll<HTMLElement>("[data-model-picker-key]")).some(
        (element) => element.dataset.modelPickerKey === row.dataset.modelPickerKey,
      ),
    ).toBe(false);
    expect(layer.hidden).toBe(true);
    expect(captured.animations).toHaveLength(2);
  });
  scroller.scrollTop = 0;
  await vi.waitFor(() => {
    expectAligned(screen.container);
    expect(captured.animations).toHaveLength(2);
  });
  await screen.getByRole("option", { name: /Model 03/ }).hover();
  await vi.waitFor(() => expect(captured.animations).toHaveLength(4));
  const pointerAnimations = captured.animations.slice(2);
  for (const animation of pointerAnimations) {
    expect((animation.effect as KeyframeEffect).target).toBe(layer);
    expect(animation.playState).toBe("paused");
    expect(animation.effect!.getTiming().iterations).toBe(1);
    expect(Number(animation.effect!.getTiming().duration)).toBeGreaterThan(0);
    expect(Number.isFinite(Number(animation.effect!.getTiming().duration))).toBe(true);
    animation.finish();
  }
  await Promise.all(pointerAnimations.map((animation) => animation.finished));
  await vi.waitFor(() => expectAligned(screen.container));
  await input.fill("Model 07");
  await vi.waitFor(() => {
    expectAligned(screen.container);
    expect(
      screen.container.querySelector('[role="option"][data-highlighted]')!.textContent,
    ).toContain("Model 07");
    expect(captured.animations).toHaveLength(4);
  });
});
