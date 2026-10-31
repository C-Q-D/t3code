/** Exercises shared highlight geometry against real virtualized model rows and desktop CSS. */
import { RegistryProvider } from "@effect/atom-react";
import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { useRef, useState } from "react";
import { t } from "~/i18n";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { render } from "../../../test/render";
import { captureAnimations } from "../../test/captureAnimations";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import { applyThemePalette } from "../../themePalette";
import { isPhysicsEnabled, setPhysicsEnabled } from "~/lib/motion/preference";
import { ModelPickerContent } from "./ModelPickerContent";
import "../../index.css";

/** Provides enough real options to force recycling without a server or favorite writes. */
function Harness({
  legacy = false,
  selectable = false,
  popup = false,
}: {
  legacy?: boolean;
  selectable?: boolean;
  popup?: boolean;
}) {
  const instanceId = ProviderInstanceId.make("codex");
  const [selected, setSelected] = useState(["model-00"]);
  const models = Array.from({ length: legacy ? 4 : 80 }, (_, index) => ({
    slug: `model-${String(index).padStart(2, "0")}`,
    name: `Model ${String(index).padStart(2, "0")}`,
    isCustom: false,
    capabilities: {},
    isLegacy: legacy && index >= 2,
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const Picker = popup ? ProviderModelPicker : ModelPickerContent;
  return (
    <RegistryProvider>
      <Picker
        searchInputRef={searchInputRef}
        environmentId={null}
        activeInstanceId={instanceId}
        model="model-00"
        lockedProvider={ProviderDriverKind.make("codex")}
        instanceEntries={providers}
        modelOptionsByInstance={new Map([[instanceId, models]])}
        terminalOpen={false}
        {...(selectable
          ? {
              selectedModels: selected.map((model) => ({ instanceId, model })),
              onToggleModel: (_instance: ProviderInstanceId, model: string) =>
                setSelected((previous) =>
                  previous.includes(model)
                    ? previous.filter((value) => value !== model)
                    : [...previous, model],
                ),
            }
          : {})}
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

/** Selects through the real keyboard path that keeps the multi-model picker open. */
async function shiftSelectSecond(screen: Awaited<ReturnType<typeof render>>) {
  await screen.getByRole("combobox").click();
  await userEvent.keyboard("{ArrowDown}{ArrowDown}{Shift>}{Enter}{/Shift}");
}

/** Isolates checkbox feedback from the independent shared highlight animations. */
function checkAnimations(animations: Animation[]) {
  return animations.filter((animation) =>
    (animation.effect as KeyframeEffect).target?.matches(
      ".lucide-check, .composer-model-check-halo",
    ),
  );
}

it.each([false, true])("keeps selected check paint with motion off, dark=%s", async (dark) => {
  using _settings = setup(dark, false);
  await using screen = await render(<Harness selectable />);
  using captured = captureAnimations();
  await shiftSelectSecond(screen);
  await vi.waitFor(() => {
    const check = screen
      .getByRole("option", { name: /Model 01/ })
      .element()
      .querySelector<HTMLElement>(".composer-model-check")!;
    expect(check.dataset.checked).toBe("true");
    const style = getComputedStyle(check);
    expect(style.backgroundImage).toContain("linear-gradient(90deg");
    expect(style.backgroundImage).toContain(dark ? "rgb(138, 255, 207)" : "rgb(11, 127, 99)");
    expect(style.backgroundImage).toContain(dark ? "rgb(124, 192, 255)" : "rgb(37, 99, 201)");
    expect(style.backgroundImage).toContain(dark ? "rgb(195, 155, 255)" : "rgb(106, 63, 201)");
    expect(style.backgroundImage).toContain(dark ? "rgb(255, 154, 214)" : "rgb(194, 58, 140)");
    expect(getComputedStyle(check.querySelector("svg")!).color).toBe("rgb(24, 24, 27)");
    expect(style.filter === "none").toBe(!dark);
    expect(captured.animations).toHaveLength(0);
  });
});

it("animates the check from 0.4 and a finite halo only for Shift selection", async () => {
  using _settings = setup(true, true);
  using captured = captureAnimations();
  await using screen = await render(<Harness selectable />);
  expect(checkAnimations(captured.animations)).toHaveLength(0);
  await shiftSelectSecond(screen);
  await vi.waitFor(() => expect(checkAnimations(captured.animations)).toHaveLength(2));
  const animations = checkAnimations(captured.animations);
  expect((animations[0]!.effect as KeyframeEffect).getKeyframes()[0]!.transform).toBe("scale(0.4)");
  expect(animations[0]!.effect!.getTiming().easing).toMatch(/^linear\(/);
  const halo = (animations[1]!.effect as KeyframeEffect).getKeyframes();
  expect(halo[0]!.boxShadow).toContain("0.65");
  expect(halo[1]!.boxShadow).toContain("7px");
  expect(halo[1]!.boxShadow).toContain("11px");
  for (const animation of animations) {
    expect(animation.playState).toBe("paused");
    expect(animation.effect!.getTiming().iterations).toBe(1);
    expect(Number.isFinite(Number(animation.effect!.getTiming().duration))).toBe(true);
    expect(Number(animation.effect!.getTiming().duration)).toBeGreaterThan(0);
  }
  await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
  await vi.waitFor(() => {
    expect(
      screen
        .getByRole("option", { name: /Model 01/ })
        .element()
        .querySelector<HTMLElement>(".composer-model-check")!.dataset.checked,
    ).toBe("false");
    expect(checkAnimations(captured.animations)).toHaveLength(2);
    expect(animations.map((animation) => animation.playState)).toEqual(["idle", "idle"]);
  });
  await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
  await vi.waitFor(() => expect(checkAnimations(captured.animations)).toHaveLength(4));
  const latest = checkAnimations(captured.animations).slice(2);
  latest.forEach((animation) => animation.finish());
  await Promise.all(latest.map((animation) => animation.finished));
  await vi.waitFor(() =>
    expect(screen.container.querySelector(".composer-model-check-halo")).toBeNull(),
  );
});

it("closes ordinary selection without leaving checkbox animations", async () => {
  using _settings = setup(true, true);
  await using screen = await render(<Harness popup />);
  using captured = captureAnimations();
  await screen.getByRole("button", { name: /Model 00/ }).click();
  await screen.getByRole("option", { name: /Model 01/ }).click();
  await expect.element(screen.getByRole("combobox")).not.toBeInTheDocument();
  expect(
    checkAnimations(captured.animations).filter((animation) => animation.playState !== "idle"),
  ).toHaveLength(0);
});

it.each([false, true])(
  "expands and collapses legacy geometry with aligned highlight, physics=%s",
  async (physics) => {
    using _settings = setup(true, physics);
    await using screen = await render(<Harness legacy />);
    using captured = captureAnimations();
    const legacy = screen.getByRole("option", { name: new RegExp(t.composer.modelPicker.legacy) });
    const list = screen.getByRole("listbox").element().parentElement!;
    const collapsed = list.getBoundingClientRect().height;
    await legacy.click();
    await expect.element(legacy).toHaveAttribute("aria-expanded", "true");
    const arrow = legacy.element().querySelector("svg")!;
    await vi.waitFor(() => {
      expect(
        captured.animations.filter(
          (animation) => (animation.effect as KeyframeEffect).target === list,
        ),
      ).toHaveLength(physics ? 1 : 0);
      expect(
        captured.animations.filter(
          (animation) => (animation.effect as KeyframeEffect).target === arrow,
        ),
      ).toHaveLength(physics ? 1 : 0);
    });
    const opening = captured.animations.filter((animation) =>
      [list as Element, arrow].includes((animation.effect as KeyframeEffect).target!),
    );
    for (const animation of opening) {
      expect(animation.effect!.getTiming().iterations).toBe(1);
      expect(Number.isFinite(Number(animation.effect!.getTiming().duration))).toBe(true);
      expect(animation.effect!.getTiming().easing).toMatch(/^linear\(/);
      animation.currentTime = Number(animation.effect!.getTiming().duration) / 3;
    }
    await vi.waitFor(() => expectAligned(screen.container));
    opening.forEach((animation) => animation.finish());
    await Promise.all(opening.map((animation) => animation.finished));
    await vi.waitFor(() => {
      expectAligned(screen.container);
      expect(getComputedStyle(arrow).rotate).toBe("90deg");
      expect(list.getBoundingClientRect().height).toBeGreaterThan(collapsed);
      expect(list.getAnimations()).toHaveLength(0);
    });
    const expanded = list.getBoundingClientRect().height;
    const count = captured.animations.length;
    await legacy.click();
    await expect.element(legacy).toHaveAttribute("aria-expanded", "false");
    await vi.waitFor(() =>
      expect(
        captured.animations
          .slice(count)
          .filter((animation) => (animation.effect as KeyframeEffect).target === list),
      ).toHaveLength(physics ? 1 : 0),
    );
    const closing = captured.animations
      .slice(count)
      .filter((animation) =>
        [list as Element, arrow].includes((animation.effect as KeyframeEffect).target!),
      );
    expect(closing).toHaveLength(physics ? 2 : 0);
    closing.forEach((animation) => {
      animation.currentTime = Number(animation.effect!.getTiming().duration) / 3;
    });
    await vi.waitFor(() => expectAligned(screen.container));
    closing.forEach((animation) => animation.finish());
    await Promise.all(closing.map((animation) => animation.finished));
    await vi.waitFor(() => {
      expectAligned(screen.container);
      expect(getComputedStyle(arrow).rotate).toBe("0deg");
      expect(Math.abs(list.getBoundingClientRect().height - collapsed)).toBeLessThanOrEqual(1);
      expect(list.getBoundingClientRect().height).toBeLessThan(expanded);
      expect(list.getAnimations()).toHaveLength(0);
    });
  },
);

it("reverses legacy springs from the painted geometry and inherited momentum", async () => {
  using _settings = setup(true, true);
  await using screen = await render(<Harness legacy />);
  using _captured = captureAnimations();
  const legacy = screen.getByRole("option", { name: new RegExp(t.composer.modelPicker.legacy) });
  const list = screen.getByRole("listbox").element().parentElement!;
  await legacy.click();
  const arrow = legacy.element().querySelector("svg")!;
  await vi.waitFor(() => expect(list.getAnimations()).toHaveLength(1));
  const height = list.getAnimations()[0]!;
  const rotation = arrow.getAnimations()[0]!;
  height.currentTime = 40;
  rotation.currentTime = 40;
  await vi.waitFor(() => expectAligned(screen.container));
  const beforeHeight = list.getBoundingClientRect().height;
  const beforeAngle = parseFloat(getComputedStyle(arrow).rotate);
  expect(beforeAngle).toBeGreaterThan(0);
  expect(beforeAngle).toBeLessThan(90);
  await legacy.click();
  await expect.element(legacy).toHaveAttribute("aria-expanded", "false");
  await vi.waitFor(() => {
    expect(Math.abs(list.getBoundingClientRect().height - beforeHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(parseFloat(getComputedStyle(arrow).rotate) - beforeAngle)).toBeLessThanOrEqual(
      1,
    );
  });
  const reverseHeight = list.getAnimations()[0]!;
  const reverseRotation = arrow.getAnimations()[0]!;
  reverseHeight.currentTime = 5;
  reverseRotation.currentTime = 5;
  await vi.waitFor(() => {
    // Still moving outward immediately after reversal proves inherited velocity, not a fresh rest spring.
    expect(list.getBoundingClientRect().height).toBeGreaterThan(beforeHeight);
    expect(parseFloat(getComputedStyle(arrow).rotate)).toBeGreaterThan(beforeAngle);
    expectAligned(screen.container);
  });
  setPhysicsEnabled(false);
  await vi.waitFor(() => {
    expect(list.getAnimations()).toHaveLength(0);
    expect(arrow.getAnimations()).toHaveLength(0);
    expect(getComputedStyle(arrow).rotate).toBe("0deg");
    expectAligned(screen.container);
  });
});
