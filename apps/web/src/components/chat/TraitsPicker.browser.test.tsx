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
function Harness() {
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
          models={models}
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
    const animations = indicator.getAnimations();
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
