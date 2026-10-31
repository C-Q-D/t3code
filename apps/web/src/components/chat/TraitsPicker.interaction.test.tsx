/**
 * Verifies provider values survive the U4 segmented/switch controls at the menu boundary.
 * @vitest-environment jsdom
 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";
import {
  ProviderDriverKind,
  type ProviderOptionSelection,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/menu";
import { CompactComposerControlsMenu } from "./CompactComposerControlsMenu";
import { markOpenToPermissions } from "./composerEventScope";
import { TraitsMenu as Menu } from "./TraitsMenu";
import { setPhysicsEnabled } from "~/lib/motion/preference";
import { MOTION_SNAP_DURATION_MS } from "~/lib/motion/springToLinear";
import { readPromptUltrathink, TraitsMenuContent } from "./TraitsPicker";

const MODELS: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "custom-model",
    name: "Custom",
    isCustom: false,
    capabilities: {
      optionDescriptors: [
        {
          id: "effort",
          label: "Provider effort",
          type: "select",
          currentValue: "balanced-provider-id",
          promptInjectedValues: ["ultrathink"],
          options: [
            { id: "balanced-provider-id", label: "Balanced", isDefault: true },
            {
              id: "research-provider-id",
              label: "Research",
              description: "Provider research mode",
            },
            { id: "ultrathink", label: "Ultrathink" },
          ],
        },
        { id: "thinking", label: "Provider thinking", type: "boolean", currentValue: false },
      ],
    },
  },
];

let root: Root | undefined;
let container: HTMLDivElement | undefined;

/** Keeps the real selection result visible after Base UI dismisses the portal. */
function ProviderTraitsHarness() {
  const [options, setOptions] = useState<ReadonlyArray<ProviderOptionSelection>>();
  const [prompt, setPrompt] = useState("Investigate");
  return (
    <>
      <output>{JSON.stringify(options ?? [])}</output>
      <output aria-label="Prompt">{prompt}</output>
      <Menu defaultOpen>
        <MenuTrigger>Traits</MenuTrigger>
        <MenuPopup>
          <TraitsMenuContent
            provider={ProviderDriverKind.make("codex")}
            models={MODELS}
            model="custom-model"
            promptUltrathink={readPromptUltrathink(prompt)}
            onPromptEdit={setPrompt}
            planModeEnabled
            modelOptions={options}
            onModelOptionsChange={setOptions}
          />
        </MenuPopup>
      </Menu>
    </>
  );
}

/** Mounts the real menu and provider descriptors without mocking selection or persistence callbacks. */
async function mountTraits() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<ProviderTraitsHarness />));
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setPhysicsEnabled(false);
});

it("focuses the checked permission after the compact menu opens from composer.mode", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <CompactComposerControlsMenu
        interactionMode="default"
        runtimeMode="full-access"
        runtimeModeOptions={[
          { mode: "approval-required", label: "Supervised" },
          { mode: "full-access", label: "Full access" },
        ]}
        showInteractionModeToggle
        traitsMenuContent={
          <MenuRadioGroup value="high">
            <MenuRadioItem value="high">High effort</MenuRadioItem>
          </MenuRadioGroup>
        }
        onToggleInteractionMode={() => {}}
        onRuntimeModeChange={() => {}}
      />,
    ),
  );
  const trigger = container.querySelector<HTMLButtonElement>(
    '[data-composer-shortcut~="composer.mode"]',
  )!;
  await act(async () => {
    trigger.focus();
    markOpenToPermissions(trigger);
    trigger.click();
  });
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  expect(document.activeElement?.textContent).toBe("Full access");
  expect(document.activeElement?.getAttribute("aria-checked")).toBe("true");
  expect(trigger.dataset.openToPermissions).toBeUndefined();
});

it.each(["Research", "Ultrathink", "Provider thinking"])(
  "waits for snap before closing after selecting %s",
  async (label) => {
    await mountTraits();
    vi.useFakeTimers();
    setPhysicsEnabled(true);
    const item = [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find((element) =>
      element.textContent?.includes(label),
    )!;
    await act(async () => item.click());
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(MOTION_SNAP_DURATION_MS - 1));
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(1));
    expect(document.querySelector('[role="menu"]')).toBeNull();
  },
);

it("writes the provider's arbitrary option ID and closes after choosing a segment", async () => {
  await mountTraits();
  const research = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
    (item) => item.textContent?.includes("Research"),
  );
  expect(research).toBeDefined();
  await act(async () => research?.click());
  expect(container?.querySelector("output")?.textContent).toBe(
    '[{"id":"effort","value":"research-provider-id"},{"id":"thinking","value":false}]',
  );
  expect(document.querySelector('[role="menu"]')).toBeNull();
});

it("toggles the provider boolean without replacing the selected effort", async () => {
  await mountTraits();
  const toggle = [...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')].find(
    (item) => item.textContent?.includes("Provider thinking"),
  );
  expect(toggle).toBeDefined();
  expect(toggle?.getAttribute("aria-checked")).toBe("false");
  await act(async () => toggle?.click());
  expect(container?.querySelector("output")?.textContent).toBe(
    '[{"id":"effort","value":"balanced-provider-id"},{"id":"thinking","value":true}]',
  );
});

it("toggles prompt-controlled effort without replacing the saved provider selection", async () => {
  await mountTraits();
  const ultrathink = [...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')].find(
    (item) => item.textContent?.includes("Ultrathink"),
  );
  expect(ultrathink).toBeDefined();
  await act(async () => ultrathink?.click());
  expect(container?.querySelector('[aria-label="Prompt"]')?.textContent).toBe(
    "Ultrathink:\nInvestigate",
  );
  expect(container?.querySelector("output")?.textContent).toBe("[]");
  await act(async () => container?.querySelector<HTMLButtonElement>("button")?.click());
  const enabled = [...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')].find(
    (item) => item.textContent?.includes("Ultrathink"),
  );
  expect(enabled?.getAttribute("aria-checked")).toBe("true");
  await act(async () => enabled?.click());
  expect(container?.querySelector('[aria-label="Prompt"]')?.textContent).toBe("Investigate");
  expect(container?.querySelector("output")?.textContent).toBe("[]");
});

it.each(["Enter", " "])("delays keyboard selection with %j just like a click", async (key) => {
  await mountTraits();
  vi.useFakeTimers();
  setPhysicsEnabled(true);
  const research = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
    (item) => item.textContent?.includes("Research"),
  )!;
  await act(async () => {
    research.focus();
    research.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    research.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
  });
  expect(container?.querySelector("output")?.textContent).toContain('"research-provider-id"');
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  await act(async () => vi.advanceTimersByTime(MOTION_SNAP_DURATION_MS));
  expect(document.querySelector('[role="menu"]')).toBeNull();
});

it("cancels an old close when Escape dismisses and the menu reopens", async () => {
  await mountTraits();
  vi.useFakeTimers();
  setPhysicsEnabled(true);
  const research = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
    (item) => item.textContent?.includes("Research"),
  )!;
  await act(async () => research.click());
  await act(async () => {
    research.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(document.querySelector('[role="menu"]')).toBeNull();
  await act(async () => container?.querySelector<HTMLButtonElement>("button")?.click());
  await act(async () => vi.advanceTimersByTime(MOTION_SNAP_DURATION_MS));
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
});

it("restarts the close delay after another selection", async () => {
  await mountTraits();
  vi.useFakeTimers();
  setPhysicsEnabled(true);
  const items = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
  await act(async () => items.find((item) => item.textContent?.includes("Research"))!.click());
  await act(async () => vi.advanceTimersByTime(MOTION_SNAP_DURATION_MS - 1));
  await act(async () => items.find((item) => item.textContent?.includes("Balanced"))!.click());
  await act(async () => vi.advanceTimersByTime(1));
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  await act(async () => vi.advanceTimersByTime(MOTION_SNAP_DURATION_MS - 1));
  expect(document.querySelector('[role="menu"]')).toBeNull();
});

it("clears pending selection dismissal on unmount", async () => {
  await mountTraits();
  vi.useFakeTimers();
  using schedule = vi.spyOn(globalThis, "setTimeout");
  using cancel = vi.spyOn(globalThis, "clearTimeout");
  setPhysicsEnabled(true);
  const research = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
    (item) => item.textContent?.includes("Research"),
  )!;
  await act(async () => research.click());
  const callIndex = schedule.mock.calls.findIndex(
    ([, duration]) => duration === MOTION_SNAP_DURATION_MS,
  );
  expect(callIndex).toBeGreaterThanOrEqual(0);
  const closeTimer = schedule.mock.results[callIndex]!.value;
  await act(async () => root?.unmount());
  root = undefined;
  expect(cancel).toHaveBeenCalledWith(closeTimer);
});
