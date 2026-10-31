/** Proves favorite feedback comes from clicks, not prop updates or recycled virtual rows. */
import { useState } from "react";
import { LegendList } from "@legendapp/list/react";
import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
import { captureAnimations } from "../../test/captureAnimations";
import { applyThemePalette } from "../../themePalette";
import { isPhysicsEnabled, setPhysicsEnabled } from "~/lib/motion/preference";
import { Combobox, ComboboxListVirtualized } from "../ui/combobox";
import { ModelListRow } from "./ModelListRow";
import { t } from "~/i18n";

import "../../index.css";

/** Keeps favorite writes local while real LegendList recycling changes the rows' identities. */
function Harness({
  favorites,
  selected,
}: {
  favorites?: ReadonlySet<string>;
  selected?: ReadonlySet<string>;
}) {
  const [localFavorites, setLocalFavorites] = useState(new Set<string>());
  const current = favorites ?? localFavorites;
  const items = Array.from({ length: 80 }, (_, index) => `Model ${String(index).padStart(2, "0")}`);
  return (
    <div className="composer-model-picker" style={{ width: 500, height: 240 }}>
      <Combobox inline open virtualized items={items}>
        <ComboboxListVirtualized>
          <LegendList
            data={items}
            extraData={{ current, selected }}
            estimatedItemSize={54}
            recycleItems
            style={{ height: 220 }}
            keyExtractor={(item) => item}
            renderItem={({ item, index }) => (
              <ModelListRow
                index={index}
                slug={item}
                name={item}
                instanceId={ProviderInstanceId.make("codex")}
                driverKind={ProviderDriverKind.make("codex")}
                providerDisplayName="Codex"
                isFavorite={current.has(item)}
                isSelected={selected?.has(item) ?? false}
                showInstanceBadge={false}
                showProvider
                onToggleFavorite={(_instance, slug) =>
                  setLocalFavorites((previous) => {
                    const next = new Set(previous);
                    if (next.has(slug)) next.delete(slug);
                    else next.add(slug);
                    return next;
                  })
                }
              />
            )}
          />
        </ComboboxListVirtualized>
      </Combobox>
    </div>
  );
}

/** Restores theme and motion permission regardless of test outcome. */
function setup(dark: boolean, physics: boolean) {
  const root = document.documentElement;
  const style = root.getAttribute("style");
  const theme = root.getAttribute("data-theme-id");
  const wasDark = root.classList.contains("dark");
  const wasEnabled = isPhysicsEnabled();
  applyThemePalette("graphite", dark ? "dark" : "light");
  root.classList.toggle("dark", dark);
  setPhysicsEnabled(physics);
  return {
    [Symbol.dispose]() {
      if (style === null) root.removeAttribute("style");
      else root.setAttribute("style", style);
      if (theme === null) root.removeAttribute("data-theme-id");
      else root.setAttribute("data-theme-id", theme);
      root.classList.toggle("dark", wasDark);
      setPhysicsEnabled(wasEnabled);
    },
  };
}

/** Checks the rendered SVG paint server and exact approved theme colors, independent of CSS tokens. */
function expectFavorite(star: SVGSVGElement, dark: boolean) {
  const gradient = star.querySelector("linearGradient")!;
  expect(gradient).not.toBeNull();
  expect(getComputedStyle(star).fill).toContain(`#${gradient.id}`);
  expect(getComputedStyle(star).stroke).toContain(`#${gradient.id}`);
  expect(
    Array.from(gradient.querySelectorAll("stop"), (stop) => getComputedStyle(stop).stopColor),
  ).toEqual(
    dark
      ? ["rgb(138, 255, 207)", "rgb(124, 192, 255)", "rgb(195, 155, 255)", "rgb(255, 154, 214)"]
      : ["rgb(11, 127, 99)", "rgb(37, 99, 201)", "rgb(106, 63, 201)", "rgb(194, 58, 140)"],
  );
  expect(getComputedStyle(star).filter === "none").toBe(!dark);
}

it.each([false, true])("keeps favorite paint with physics off, dark=%s", async (dark) => {
  using _settings = setup(dark, false);
  await using screen = await render(<Harness />);
  using captured = captureAnimations();
  const row = screen.getByRole("option", { name: /Model 00/ });
  const button = row.getByRole("button", { name: t.composer.modelPicker.addFavorite });
  const star = button.element().querySelector<SVGSVGElement>("svg")!;
  expect(getComputedStyle(star).fill).toBe("none");
  expect(getComputedStyle(star).stroke).toBe("rgb(124, 135, 150)");
  await button.click();
  await vi.waitFor(() => expectFavorite(star, dark));
  expect(captured.animations).toHaveLength(0);
  expect(screen.container.querySelector(".composer-model-favorite-particles")).toBeNull();
});

it("bounces from 0.55 and emits six finite particles only on user activation", async () => {
  using _settings = setup(true, true);
  await using screen = await render(<Harness />);
  using captured = captureAnimations();
  const row = screen.getByRole("option", { name: /Model 00/ });
  await row.getByRole("button", { name: t.composer.modelPicker.addFavorite }).click();
  await vi.waitFor(() => expect(captured.animations).toHaveLength(7));
  const starAnimation = captured.animations[0]!;
  const starFrames = (starAnimation.effect as KeyframeEffect).getKeyframes();
  expect(starFrames[0]!.transform).toBe("scale(0.55)");
  expect(starFrames[1]!.transform).toBe("scale(1)");
  expect(starAnimation.effect!.getTiming().easing).toMatch(/^linear\(/);
  const particles = row
    .element()
    .querySelectorAll<HTMLElement>(".composer-model-favorite-particle");
  expect(particles).toHaveLength(6);
  expect(getComputedStyle(row.element()).overflow).toBe("visible");
  expect(getComputedStyle(particles[0]!.parentElement!).pointerEvents).toBe("none");
  expect(Array.from(particles, (particle) => getComputedStyle(particle).backgroundColor)).toEqual([
    "rgb(138, 255, 207)",
    "rgb(124, 192, 255)",
    "rgb(195, 155, 255)",
    "rgb(255, 154, 214)",
    "rgb(255, 224, 138)",
    "rgb(138, 255, 207)",
  ]);
  const endpoints = [
    [0, -14],
    [12.124, -7],
    [12.124, 7],
    [0, 14],
    [-12.124, 7],
    [-12.124, -7],
  ];
  for (const [index, animation] of captured.animations.entries()) {
    expect(animation.playState).toBe("paused");
    expect(animation.effect!.getTiming().iterations).toBe(1);
    expect(Number(animation.effect!.getTiming().duration)).toBeGreaterThan(0);
    expect(Number.isFinite(Number(animation.effect!.getTiming().duration))).toBe(true);
    if (index === 0) continue;
    expect(animation.effect!.getTiming().duration).toBe(520);
    const effect = animation.effect as KeyframeEffect;
    const end = effect.getKeyframes().at(-1)!;
    const matrix = new DOMMatrix(String(end.transform));
    expect(matrix.e).toBeCloseTo(endpoints[index - 1]![0]!, 2);
    expect(matrix.f).toBeCloseTo(endpoints[index - 1]![1]!, 2);
    expect(Number(end.opacity)).toBe(0);
    expect(getComputedStyle(particles[index - 1]!).width).toBe("4px");
  }
  const finished = Promise.all(captured.animations.map((animation) => animation.finished));
  captured.animations.forEach((animation) => animation.finish());
  await finished;
  await vi.waitFor(() =>
    expect(row.element().querySelector(".composer-model-favorite-particles")).toBeNull(),
  );
  await row.getByRole("button", { name: t.composer.modelPicker.removeFavorite }).click();
  expect(captured.animations).toHaveLength(7);
});

it("cancels feedback on rapid reversal, disabling physics and unmount", async () => {
  using _settings = setup(true, true);
  await using screen = await render(<Harness />);
  using captured = captureAnimations();
  const row = screen.getByRole("option", { name: /Model 00/ });
  await row.getByRole("button", { name: t.composer.modelPicker.addFavorite }).click();
  await vi.waitFor(() => expect(captured.animations).toHaveLength(7));
  await row.getByRole("button", { name: t.composer.modelPicker.removeFavorite }).click();
  expect(captured.animations).toHaveLength(7);
  expect(captured.animations.every((animation) => animation.playState === "idle")).toBe(true);
  expect(row.element().querySelector(".composer-model-favorite-particles")).toBeNull();
  await row.getByRole("button", { name: t.composer.modelPicker.addFavorite }).click();
  setPhysicsEnabled(false);
  expect(captured.animations).toHaveLength(14);
  expect(captured.animations.every((animation) => animation.playState === "idle")).toBe(true);
  expect(row.element().querySelector(".composer-model-favorite-particles")).toBeNull();
  await row.getByRole("button", { name: t.composer.modelPicker.removeFavorite }).click();
  setPhysicsEnabled(true);
  await row.getByRole("button", { name: t.composer.modelPicker.addFavorite }).click();
  await screen.unmount();
  expect(captured.animations).toHaveLength(21);
  expect(captured.animations.every((animation) => animation.playState === "idle")).toBe(true);
});

it("never replays saved, externally changed or recycled favorites", async () => {
  using _settings = setup(true, true);
  using captured = captureAnimations();
  await using screen = await render(<Harness favorites={new Set(["Model 00", "Model 50"])} />);
  const first = screen.getByRole("option", { name: /Model 00/ });
  await expect
    .element(first.getByRole("button", { name: t.composer.modelPicker.removeFavorite }))
    .toBeVisible();
  expect(captured.animations).toHaveLength(0);
  await screen.rerender(<Harness favorites={new Set(["Model 01", "Model 50"])} />);
  await expect
    .element(first.getByRole("button", { name: t.composer.modelPicker.addFavorite }))
    .toBeVisible();
  const next = screen.getByRole("option", { name: /Model 01/ });
  await expect
    .element(next.getByRole("button", { name: t.composer.modelPicker.removeFavorite }))
    .toBeVisible();
  expect(captured.animations).toHaveLength(0);
  const scroller = Array.from(
    screen.getByRole("listbox").element().querySelectorAll<HTMLElement>("div"),
  ).find(
    (element) =>
      element.scrollHeight > element.clientHeight && getComputedStyle(element).overflowY === "auto",
  )!;
  scroller.scrollTop = 2700;
  const distant = screen.getByRole("option", { name: /Model 50/ });
  await expect
    .element(distant.getByRole("button", { name: t.composer.modelPicker.removeFavorite }))
    .toBeInTheDocument();
  await vi.waitFor(() => expect(first.query()).toBeNull());
  expect(captured.animations).toHaveLength(0);
  scroller.scrollTop = 0;
  await expect
    .element(first.getByRole("button", { name: t.composer.modelPicker.addFavorite }))
    .toBeVisible();
  expect(captured.animations).toHaveLength(0);
  expect(screen.container.querySelector(".composer-model-favorite-particles")).toBeNull();
});

it("never animates initially selected, externally selected or recycled checks", async () => {
  using _settings = setup(true, true);
  using captured = captureAnimations();
  await using screen = await render(<Harness selected={new Set(["Model 00", "Model 50"])} />);
  const first = screen.getByRole("option", { name: /Model 00/ });
  expect(first.element().querySelector<HTMLElement>(".composer-model-check")!.dataset.checked).toBe(
    "true",
  );
  expect(captured.animations).toHaveLength(0);
  await screen.rerender(<Harness selected={new Set(["Model 01", "Model 50"])} />);
  expect(first.element().querySelector<HTMLElement>(".composer-model-check")!.dataset.checked).toBe(
    "false",
  );
  expect(
    screen
      .getByRole("option", { name: /Model 01/ })
      .element()
      .querySelector<HTMLElement>(".composer-model-check")!.dataset.checked,
  ).toBe("true");
  expect(captured.animations).toHaveLength(0);
  const rows = Array.from(screen.container.querySelectorAll('[role="option"]'));
  const scroller = Array.from(
    screen.getByRole("listbox").element().querySelectorAll<HTMLElement>("div"),
  ).find(
    (element) =>
      element.scrollHeight > element.clientHeight && getComputedStyle(element).overflowY === "auto",
  )!;
  scroller.scrollTop = 2700;
  const distant = screen.getByRole("option", { name: /Model 50/ });
  await expect.element(distant).toBeInTheDocument();
  await vi.waitFor(() => expect(first.query()).toBeNull());
  expect(rows).toContain(distant.element());
  expect(
    distant.element().querySelector<HTMLElement>(".composer-model-check")!.dataset.checked,
  ).toBe("true");
  expect(captured.animations).toHaveLength(0);
  scroller.scrollTop = 0;
  await expect.element(first).toBeVisible();
  expect(first.element().querySelector<HTMLElement>(".composer-model-check")!.dataset.checked).toBe(
    "false",
  );
  expect(captured.animations).toHaveLength(0);
});
