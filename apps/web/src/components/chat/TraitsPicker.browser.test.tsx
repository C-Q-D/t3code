/** Exercises real layout after selection; jsdom cannot prove pixel alignment. */
import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import {
  ProviderDriverKind,
  type ProviderOptionSelection,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { fakeTimers, render } from "../../../test/render";
import { captureAnimations } from "../../test/captureAnimations";
import { TraitsMenuContent } from "./TraitsPicker";
import { TraitsMenu } from "./TraitsMenu";
import { MenuTrigger, MenuPopup } from "../ui/menu";
import { isPhysicsEnabled, setPhysicsEnabled } from "~/lib/motion/preference";
import "../../index.css";
import { applyThemePalette } from "../../themePalette";

const models: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "custom-model",
    name: "Custom",
    isCustom: false,
    capabilities: {
      optionDescriptors: [
        {
          id: "effort",
          label: "Effort",
          type: "select",
          currentValue: "low",
          options: [
            { id: "low", label: "Low" },
            { id: "high", label: "High" },
          ],
        },
        { id: "fastMode", label: "Fast Mode", type: "boolean", currentValue: false },
      ],
    },
  },
];

/** Holds dismissal at the menu boundary so layout can be measured before unmount.
 * Immediate dismissal itself is covered by the interaction suite with the same content.
 */
function Harness({
  availableModels = models,
  initialPrompt = "",
}: {
  availableModels?: ReadonlyArray<ServerProviderModel>;
  initialPrompt?: string;
}) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [options, setOptions] = useState<ReadonlyArray<ProviderOptionSelection>>();
  return (
    <TraitsMenu
      onOpenChange={(_open, details) => {
        if (details.reason === "item-press") details.cancel();
      }}
    >
      <MenuTrigger>Traits</MenuTrigger>
      <MenuPopup data-composer-traits-popup="true">
        <TraitsMenuContent
          provider={ProviderDriverKind.make("claudeCode")}
          models={availableModels}
          model="custom-model"
          prompt={prompt}
          onPromptChange={setPrompt}
          planModeEnabled
          modelOptions={options}
          onModelOptionsChange={setOptions}
        />
      </MenuPopup>
    </TraitsMenu>
  );
}

it.each(["Effort", "Fast Mode"])(
  "aligns the single indicator after selecting in %s with physics disabled",
  async (label) => {
    const previousTheme = document.documentElement.getAttribute("data-theme-id");
    document.documentElement.setAttribute("data-theme-id", "graphite");
    using _theme = {
      [Symbol.dispose]() {
        if (previousTheme === null) document.documentElement.removeAttribute("data-theme-id");
        else document.documentElement.setAttribute("data-theme-id", previousTheme);
      },
    };
    expect(isPhysicsEnabled()).toBe(false);
    await using screen = await render(<Harness />);
    using _animations = captureAnimations();
    await screen.getByRole("button").click();
    const group = page.getByRole("group", { name: label, exact: true });
    const next = group
      .element()
      .querySelector<HTMLElement>("[role=menuitemradio]:not([data-checked])")!;
    const nextLabel = next.textContent!;
    await page.elementLocator(next).click();
    await expect.element(page.getByRole("menu")).toBeVisible();
    await vi.waitFor(() => {
      const element = group.element();
      const indicators = element.querySelectorAll(".composer-trait-indicator");
      expect(indicators).toHaveLength(1);
      const selected = element.querySelector<HTMLElement>("[data-checked]")!;
      expect(selected.textContent).toBe(nextLabel);
      const target = selected.getBoundingClientRect();
      const actual = indicators[0]!.getBoundingClientRect();
      expect(target.width).toBeGreaterThan(0);
      expect(Math.abs(actual.left - target.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(actual.right - target.right)).toBeLessThanOrEqual(1);
    });
  },
);

it("moves both edges with finite animations when physics is enabled", async () => {
  const previousTheme = document.documentElement.getAttribute("data-theme-id");
  document.documentElement.setAttribute("data-theme-id", "graphite");
  using _settings = {
    [Symbol.dispose]() {
      setPhysicsEnabled(false);
      if (previousTheme === null) document.documentElement.removeAttribute("data-theme-id");
      else document.documentElement.setAttribute("data-theme-id", previousTheme);
    },
  };
  await using screen = await render(<Harness />);
  using _animations = captureAnimations();
  await screen.getByRole("button").click();
  const group = page.getByRole("group", { name: "Effort", exact: true });
  await expect.element(group).toBeVisible();
  using _clock = fakeTimers();
  setPhysicsEnabled(true);
  const indicator = group.element().querySelector<HTMLElement>(".composer-trait-indicator")!;
  const from = indicator.getBoundingClientRect();
  await group.getByRole("menuitemradio", { name: "High" }).click();
  await vi.waitFor(() => {
    const animations = indicator
      .getAnimations()
      .filter(
        (animation) =>
          animation.effect instanceof KeyframeEffect &&
          animation.effect.getKeyframes().some((frame) => "left" in frame || "right" in frame),
      );
    expect(animations).toHaveLength(2);
    expect(animations[0]!.playState).toBe("paused");
    expect(animations[1]!.playState).toBe("paused");
    animations[0]!.currentTime = 80;
    animations[1]!.currentTime = 80;
    const moving = indicator.getBoundingClientRect();
    expect(moving.left).toBeGreaterThan(from.left);
    expect(moving.right - from.right).toBeGreaterThan(moving.left - from.left);
    expect(animations[0]!.effect!.getTiming().iterations).toBe(1);
    expect(animations[1]!.effect!.getTiming().iterations).toBe(1);
  });
});

it.each([false, true])(
  "changes only the primary reasoning border with physics off (dark=%s)",
  async (dark) => {
    const root = document.documentElement;
    const oldTheme = root.getAttribute("data-theme-id");
    const oldDark = root.classList.contains("dark");
    root.setAttribute("data-theme-id", "graphite");
    root.classList.toggle("dark", dark);
    using _theme = {
      [Symbol.dispose]() {
        root.classList.toggle("dark", oldDark);
        if (oldTheme === null) root.removeAttribute("data-theme-id");
        else root.setAttribute("data-theme-id", oldTheme);
      },
    };
    const availableModels: ReadonlyArray<ServerProviderModel> = [
      {
        ...models[0]!,
        capabilities: {
          optionDescriptors: [
            {
              id: "effort",
              label: "Effort",
              type: "select",
              currentValue: "low",
              promptInjectedValues: ["ultrathink"],
              options: [
                { id: "low", label: "Low" },
                { id: "high", label: "High" },
                { id: "ultrathink", label: "Ultrathink" },
              ],
            },
            {
              id: "context",
              label: "Context",
              type: "select",
              currentValue: "short",
              options: [
                { id: "short", label: "Short" },
                { id: "long", label: "Long" },
              ],
            },
            { id: "fastMode", label: "Fast Mode", type: "boolean", currentValue: false },
          ],
        },
      },
    ];
    expect(isPhysicsEnabled()).toBe(false);
    await using screen = await render(<Harness availableModels={availableModels} />);
    using _animations = captureAnimations();
    await screen.getByRole("button").click();
    const group = page.getByRole("group", { name: "Effort", exact: true });
    const indicator = group.element().querySelector<HTMLElement>(".composer-trait-indicator")!;
    const lowBorder = getComputedStyle(indicator)
      .backgroundImage.split(/,\s*(?=linear-gradient\()/)
      .at(-1);
    await group.getByRole("menuitemradio", { name: "High" }).click();
    await vi.waitFor(() => {
      expect(indicator.dataset.reasoningLevel).toBe("5");
      const style = getComputedStyle(indicator);
      const border = style.backgroundImage.split(/,\s*(?=linear-gradient\()/).at(-1);
      expect(border).toContain("linear-gradient");
      expect(border).not.toBe(lowBorder);
      expect(indicator.getAnimations()).toHaveLength(0);
    });
    const contextIndicator = page
      .getByRole("group", { name: "Context", exact: true })
      .element()
      .querySelector(".composer-trait-indicator")!;
    const fastIndicator = page
      .getByRole("group", { name: "Fast Mode", exact: true })
      .element()
      .querySelector(".composer-trait-indicator")!;
    expect(getComputedStyle(contextIndicator).backgroundImage).toBe("none");
    expect(getComputedStyle(fastIndicator).backgroundImage).toBe("none");
    expect(getComputedStyle(indicator).boxShadow === "none").toBe(!dark);
    expect(
      getComputedStyle(
        group.getByRole("menuitemradio", { name: "High" }).element().querySelector("span")!,
      ).textShadow === "none",
    ).toBe(!dark);
  },
);

/** Filters visual feedback from the independent edge animations without mocking WAAPI. */
function flashes(indicator: HTMLElement) {
  return indicator
    .getAnimations()
    .filter(
      (animation) =>
        animation.effect instanceof KeyframeEffect &&
        animation.effect.getKeyframes().some((frame) => "filter" in frame),
    );
}

it("flashes only on entering levels 4/5 and replaces or cancels the previous flash", async () => {
  setPhysicsEnabled(true);
  using _physics = {
    [Symbol.dispose]() {
      setPhysicsEnabled(false);
    },
  };
  const availableModels: ReadonlyArray<ServerProviderModel> = [
    {
      ...models[0]!,
      capabilities: {
        optionDescriptors: [
          {
            id: "effort",
            label: "Effort",
            type: "select",
            currentValue: "5",
            options: ["0", "1", "2", "3", "4", "5"].map((id) => ({ id, label: `Level ${id}` })),
          },
        ],
      },
    },
  ];
  await using screen = await render(<Harness availableModels={availableModels} />);
  using _animations = captureAnimations();
  await screen.getByRole("button").click();
  const group = page.getByRole("group", { name: "Effort", exact: true });
  const indicator = group.element().querySelector<HTMLElement>(".composer-trait-indicator")!;
  using _clock = fakeTimers();
  expect(flashes(indicator)).toHaveLength(0);
  await group.getByRole("menuitemradio", { name: "Level 4" }).click();
  await vi.waitFor(() => expect(flashes(indicator)).toHaveLength(1));
  const first = flashes(indicator)[0]!;
  expect(first.playState).toBe("paused");
  expect(first.effect!.getTiming()).toMatchObject({
    duration: 520,
    easing: "ease-out",
    iterations: 1,
  });
  await group.getByRole("menuitemradio", { name: "Level 5" }).click();
  await vi.waitFor(() => {
    expect(flashes(indicator)).toHaveLength(1);
    expect(flashes(indicator)[0]).not.toBe(first);
    expect(first.playState).toBe("idle");
  });
  await group.getByRole("menuitemradio", { name: "Level 3" }).click();
  await vi.waitFor(() => expect(flashes(indicator)).toHaveLength(0));
  setPhysicsEnabled(false);
  await group.getByRole("menuitemradio", { name: "Level 5" }).click();
  await vi.waitFor(() => {
    expect(indicator.dataset.reasoningLevel).toBe("5");
    expect(flashes(indicator)).toHaveLength(0);
  });
});

/** Both persistence paths must drive the same visual feedback. */
function switchModels(enabled = false): ReadonlyArray<ServerProviderModel> {
  return [
    {
      ...models[0]!,
      capabilities: {
        optionDescriptors: [
          {
            id: "effort",
            label: "Effort",
            type: "select",
            currentValue: "low",
            promptInjectedValues: ["ultrathink"],
            options: [
              { id: "low", label: "Low" },
              { id: "ultrathink", label: "Ultrathink" },
            ],
          },
          { id: "thinking", label: "Thinking", type: "boolean", currentValue: enabled },
        ],
      },
    },
  ];
}

/** Restore document-wide preferences even when an assertion fails. */
function switchSettings(dark: boolean, physics: boolean) {
  const root = document.documentElement;
  const theme = root.getAttribute("data-theme-id");
  const motion = root.getAttribute("data-physics");
  const wasDark = root.classList.contains("dark");
  const wasEnabled = isPhysicsEnabled();
  const oldStyle = root.getAttribute("style");
  applyThemePalette("graphite", dark ? "dark" : "light");
  root.setAttribute("data-theme-id", "graphite");
  root.setAttribute("data-physics", physics ? "on" : "off");
  root.classList.toggle("dark", dark);
  setPhysicsEnabled(physics);
  return {
    [Symbol.dispose]() {
      root.classList.toggle("dark", wasDark);
      if (theme === null) root.removeAttribute("data-theme-id");
      else root.setAttribute("data-theme-id", theme);
      if (motion === null) root.removeAttribute("data-physics");
      else root.setAttribute("data-physics", motion);
      if (oldStyle === null) root.removeAttribute("style");
      else root.setAttribute("style", oldStyle);
      setPhysicsEnabled(wasEnabled);
    },
  };
}

it.each([false, true])("keeps switch aurora colors without motion (dark=%s)", async (dark) => {
  using _settings = switchSettings(dark, false);
  await using screen = await render(<Harness availableModels={switchModels()} />);
  using _animations = captureAnimations();
  await screen.getByRole("button").click();
  for (const name of ["Ultrathink", "Thinking"]) {
    const row = page.getByRole("menuitemcheckbox", { name, exact: true });
    const track = row.element().querySelector<HTMLElement>(".composer-trait-switch")!;
    const off = getComputedStyle(track).backgroundImage;
    await row.click();
    await expect.element(row).toHaveAttribute("aria-checked", "true");
    await vi.waitFor(() => {
      const style = getComputedStyle(track);
      expect(style.backgroundImage).toContain("linear-gradient");
      expect(style.backgroundImage).not.toBe(off);
      expect(style.boxShadow === "none").toBe(!dark);
      const thumb = track.querySelector<HTMLElement>(".composer-trait-switch-thumb")!;
      expect(
        Math.abs(track.getBoundingClientRect().right - thumb.getBoundingClientRect().right - 2),
      ).toBeLessThanOrEqual(1);
      expect(track.getAnimations({ subtree: true })).toHaveLength(0);
    });
  }
});

it.each(["Ultrathink", "Thinking"])(
  "runs one finite halo only on user enabling %s",
  async (name) => {
    using _settings = switchSettings(true, true);
    await using screen = await render(
      <Harness availableModels={switchModels(true)} initialPrompt="Ultrathink: " />,
    );
    using _animations = captureAnimations();
    await screen.getByRole("button").click();
    using _clock = fakeTimers();
    const row = page.getByRole("menuitemcheckbox", { name, exact: true });
    await expect.element(row).toHaveAttribute("aria-checked", "true");
    const halo = row.element().querySelector<HTMLElement>(".composer-trait-switch-halo");
    expect(halo).not.toBeNull();
    expect(halo!.getAnimations()).toHaveLength(0);
    await row.click();
    await expect.element(row).toHaveAttribute("aria-checked", "false");
    expect(halo!.getAnimations()).toHaveLength(0);
    await row.click();
    await vi.waitFor(() => expect(halo!.getAnimations()).toHaveLength(1));
    const animation = halo!.getAnimations()[0]!;
    expect(animation.playState).toBe("paused");
    expect(animation.effect!.getTiming()).toMatchObject({ duration: 650, iterations: 1 });
    expect((animation.effect as KeyframeEffect).getKeyframes()[0]!.boxShadow).not.toBe(
      (animation.effect as KeyframeEffect).getKeyframes().at(-1)!.boxShadow,
    );
    await row.click();
    expect(animation.playState).toBe("idle");
    await row.click();
    const last = halo!.getAnimations()[0]!;
    expect(last.playState).toBe("paused");
    await screen.unmount();
    expect(last.playState).toBe("idle");
  },
);
it.each([false, true])("colors only Fast Mode on without physics (dark=%s)", async (dark) => {
  using _settings = switchSettings(dark, false);
  await using screen = await render(<Harness />);
  using _animations = captureAnimations();
  await screen.getByRole("button").click();
  const group = page.getByRole("group", { name: "Fast Mode", exact: true });
  const items = group.getByRole("menuitemradio");
  const on = items.nth(0);
  const off = items.nth(1);
  const indicator = group.element().querySelector<HTMLElement>(".composer-trait-indicator")!;
  expect(getComputedStyle(indicator).backgroundImage).toBe("none");
  await on.click();
  await vi.waitFor(() => {
    expect(getComputedStyle(indicator).backgroundImage).toContain("linear-gradient");
    expect(getComputedStyle(indicator).boxShadow === "none").toBe(!dark);
    expect(getComputedStyle(on.element().querySelector("span")!).backgroundImage).toContain(
      "linear-gradient",
    );
    expect(indicator.getAnimations({ subtree: true })).toHaveLength(0);
  });
  await off.click();
  await vi.waitFor(() => expect(getComputedStyle(indicator).backgroundImage).toBe("none"));
});

it("sweeps once only when entering Fast Mode and cancels on leaving or unmount", async () => {
  using _settings = switchSettings(true, true);
  const availableModels: ReadonlyArray<ServerProviderModel> = [
    {
      ...models[0]!,
      capabilities: {
        optionDescriptors: [
          { id: "fastMode", label: "Fast Mode", type: "boolean", currentValue: true },
        ],
      },
    },
  ];
  await using screen = await render(<Harness availableModels={availableModels} />);
  using _animations = captureAnimations();
  await screen.getByRole("button").click();
  using _clock = fakeTimers();
  const group = page.getByRole("group", { name: "Fast Mode", exact: true });
  const on = group.getByRole("menuitemradio").nth(0);
  const off = group.getByRole("menuitemradio").nth(1);
  const indicator = group.element().querySelector<HTMLElement>(".composer-trait-indicator")!;
  const highlight = indicator.querySelector<HTMLElement>(".composer-trait-fast-highlight");
  expect(highlight).not.toBeNull();
  expect(highlight!.getAnimations()).toHaveLength(0);
  expect(getComputedStyle(indicator).overflowX).toBe("hidden");
  await off.click();
  await on.click();
  await vi.waitFor(() => expect(highlight!.getAnimations()).toHaveLength(1));
  const animation = highlight!.getAnimations()[0]!;
  expect(animation.playState).toBe("paused");
  expect(animation.effect!.getTiming()).toMatchObject({ duration: 650, delay: 80, iterations: 1 });
  expect((animation.effect as KeyframeEffect).getKeyframes()[0]!.transform).not.toBe(
    (animation.effect as KeyframeEffect).getKeyframes().at(-1)!.transform,
  );
  await off.click();
  await vi.waitFor(() => expect(animation.playState).toBe("idle"));
  await on.click();
  await vi.waitFor(() => expect(highlight!.getAnimations()).toHaveLength(1));
  const last = highlight!.getAnimations()[0]!;
  expect(last.playState).toBe("paused");
  await screen.unmount();
  expect(last.playState).toBe("idle");
});
it.each(["Effort", "Fast Mode"])(
  "keeps the selected surface visible while highlighted in %s",
  async (name) => {
    using _settings = switchSettings(false, false);
    await using screen = await render(<Harness />);
    using _animations = captureAnimations();
    await screen.getByRole("button").click();
    const group = page.getByRole("group", { name, exact: true });
    const selected = group.getByRole("menuitemradio").nth(name === "Effort" ? 1 : 0);
    await selected.click();
    await selected.hover();
    await expect.element(selected).toHaveAttribute("data-highlighted");
    await expect.element(selected).toHaveAttribute("data-checked");
    expect(getComputedStyle(selected.element()).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    const other = group.getByRole("menuitemradio").nth(name === "Effort" ? 0 : 1);
    await other.hover();
    await expect.element(other).toHaveAttribute("data-highlighted");
    expect(getComputedStyle(other.element()).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  },
);
