/**
 * @vitest-environment jsdom
 * Protects instance selection from model-area hit targets without coupling independent controls.
 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { t } from "~/i18n";
import { ProviderModelsSection } from "./ProviderModelsSection";
import { ProviderInstanceCard } from "./ProviderInstanceCard";

let container: HTMLDivElement;
let root: Root;

/** Models the parent editor selection while retaining the real card and switch event paths. */
function InstanceSelection({ empty }: { empty: boolean }) {
  const [selected, setSelected] = useState("previous-instance");
  const [enabled, setEnabled] = useState(true);
  const driver = ProviderDriverKind.make("codex");
  const instanceId = ProviderInstanceId.make("codex");
  const liveProvider: ServerProvider = {
    instanceId,
    driver,
    enabled,
    installed: true,
    version: "1.0.0",
    status: "ready",
    auth: { status: "authenticated", email: "developer@example.com" },
    checkedAt: "2026-08-27T12:00:00.000Z",
    models: empty
      ? []
      : [{ slug: "test-model", name: "Test model", isCustom: false, capabilities: null }],
    slashCommands: [],
    skills: [],
  };
  return (
    <>
      <ProviderInstanceCard
        instanceId={instanceId}
        instance={{ driver, enabled }}
        driverOption={undefined}
        liveProvider={liveProvider}
        mode="list"
        selected={selected === instanceId}
        onSelect={() => setSelected(instanceId)}
        onUpdate={(next) => setEnabled(next.enabled ?? true)}
        hiddenModels={[]}
        favoriteModels={[]}
        modelOrder={[]}
        onHiddenModelsChange={() => undefined}
        onFavoriteModelsChange={() => undefined}
        onToggleFavorite={() => undefined}
        onModelOrderChange={() => undefined}
      />
      <output>{selected}</output>
    </>
  );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("provider card selection", () => {
  it("keeps the Reasoning label for models with an effort control", async () => {
    await act(() =>
      root.render(
        <ProviderModelsSection
          instanceId={ProviderInstanceId.make("cursor")}
          driverKind={ProviderDriverKind.make("cursor")}
          models={[
            {
              slug: "test-model",
              name: "Test model",
              isCustom: false,
              capabilities: {
                optionDescriptors: [
                  {
                    id: "effort",
                    label: "Effort",
                    type: "select",
                    options: [{ id: "high", label: "High" }],
                  },
                ],
              },
            },
          ]}
          customModels={[]}
          canManageCustomModels={false}
          hiddenModels={[]}
          favoriteModels={[]}
          modelOrder={[]}
          onChange={() => undefined}
          onHiddenModelsChange={() => undefined}
          onFavoriteModelsChange={() => undefined}
          onToggleFavorite={() => undefined}
          onModelOrderChange={() => undefined}
        />,
      ),
    );
    expect(container.textContent).toContain(t.settings.providerModels.reasoning);
    expect(container.textContent).not.toContain("No reasoning");
  });
  it.each(["model", "empty", "space"] as const)(
    "selects through the %s area but keeps the enable switch independent",
    async (target) => {
      await act(() => root.render(<InstanceSelection empty={target === "empty"} />));
      const toggle = container.querySelector<HTMLElement>('[role="switch"]');
      if (!toggle) throw new Error("Missing provider switch");
      await act(() => toggle.click());
      expect(toggle.getAttribute("aria-checked")).toBe("false");
      expect(container.querySelector("output")?.textContent).toBe("previous-instance");

      const label =
        target === "empty" ? t.settings.providerModels.modelsReportedProviderYetHint : "Test model";
      const text = [...container.querySelectorAll<HTMLElement>("span, p")].find(
        (node) => node.textContent === label && node.children.length === 0,
      );
      if (!text) throw new Error("Missing model content");
      const hitTarget = target === "space" ? text.parentElement?.parentElement : text;
      if (!hitTarget) throw new Error("Missing model area");
      await act(() => hitTarget.click());
      expect(container.querySelector("output")?.textContent).toBe("codex");
    },
  );
});
