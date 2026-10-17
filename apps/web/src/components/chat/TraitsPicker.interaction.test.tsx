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
import { Menu, MenuPopup, MenuTrigger } from "../ui/menu";
import { TraitsMenuContent } from "./TraitsPicker";

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
            prompt={prompt}
            onPromptChange={setPrompt}
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
});

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
