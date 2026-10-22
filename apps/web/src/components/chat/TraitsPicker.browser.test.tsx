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
import { TraitsMenuContent } from "./TraitsPicker";
import { TraitsMenu } from "./TraitsMenu";
import { MenuTrigger, MenuPopup } from "../ui/menu";
import { isPhysicsEnabled, setPhysicsEnabled } from "~/lib/motion/preference";
import "../../index.css";

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
}: {
  availableModels?: ReadonlyArray<ServerProviderModel>;
}) {
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
          prompt=""
          onPromptChange={() => {}}
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
    animations[0]!.pause();
    animations[1]!.pause();
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
  await screen.getByRole("button").click();
  const group = page.getByRole("group", { name: "Effort", exact: true });
  const indicator = group.element().querySelector<HTMLElement>(".composer-trait-indicator")!;
  using _clock = fakeTimers();
  expect(flashes(indicator)).toHaveLength(0);
  await group.getByRole("menuitemradio", { name: "Level 4" }).click();
  await vi.waitFor(() => expect(flashes(indicator)).toHaveLength(1));
  const first = flashes(indicator)[0]!;
  first.pause();
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
