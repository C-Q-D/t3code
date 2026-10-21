/** @vitest-environment jsdom */
/** Exercises the live summary disclosure and an editor save using real price-table logic. */
import { EnvironmentId } from "@t3tools/contracts";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { installMessages } from "~/i18n";
import { en } from "~/i18n/locales/en";
import type { UsagePriceTarget } from "./usagePriceTargets";
const state = vi.hoisted(() => ({
  targets: [] as UsagePriceTarget[],
  write: vi.fn(async () => ({ _tag: "Success" as const })),
}));
// Supply environment snapshots at the atom boundary; price cells and patch planning remain real.
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => state.targets }));
vi.mock("../../state/presentation", () => ({ environmentPresentations: {} }));
vi.mock("../../state/server", () => ({ serverEnvironment: { updateSettings: null } }));
vi.mock("../../state/session", () => ({
  environmentSession: {},
  readEnvironmentScope: () => true,
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.write }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("../ui/label", () => ({ Label: "label" }));
vi.mock("../ui/dialog", () => ({
  Dialog: "div",
  DialogDescription: "p",
  DialogFooter: "footer",
  DialogHeader: "header",
  DialogPanel: "main",
  DialogPopup: "section",
  DialogTitle: "h1",
}));
vi.mock("../ui/menu", () => ({
  Menu: "div",
  MenuCheckboxItem: "div",
  MenuPopup: "div",
  MenuSeparator: "hr",
  MenuTrigger: "div",
}));
vi.mock("../ui/table", () => ({
  Table: "table",
  TableBody: "tbody",
  TableCell: "td",
  TableHead: "th",
  TableHeader: "thead",
  TableRow: "tr",
}));
vi.mock("../ui/tooltip", () => ({ Tooltip: "div", TooltipTrigger: "div", TooltipPopup: "div" }));

import { UsagePriceOverrides, UsagePriceSummary } from "./UsagePriceOverrides";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  installMessages("en", en);
  state.targets = [
    {
      environmentId: EnvironmentId.make("first"),
      label: "First",
      prices: { example: { inputCostPerMillionTokens: 2, outputCostPerMillionTokens: 8 } },
      aliases: {},
      unavailable: null,
    },
  ];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  state.write.mockClear();
  vi.unstubAllGlobals();
});

/** Uses the page's summary-to-editor state transition while leaving table and save logic real. */
function PriceSection() {
  const [editor, setEditor] = useState<{ model?: string } | null>(null);
  return (
    <>
      <UsagePriceSummary
        selectedEnvironmentIds={null}
        onEditModel={(model) => setEditor(model === undefined ? {} : { model })}
      />
      {editor && (
        <UsagePriceOverrides
          usage={[]}
          initialSelectedEnvironmentIds={null}
          initialModel={editor.model}
          onOpenChange={() => setEditor(null)}
        />
      )}
    </>
  );
}

it("starts collapsed, exposes prices and a working editor, then collapses again", async () => {
  act(() => root.render(<PriceSection />));
  const toggle = host.querySelector<HTMLButtonElement>(".usage-price-toggle")!;
  const body = document.getElementById(toggle.getAttribute("aria-controls")!)!;
  expect(getComputedStyle(body).display).toBe("none");
  expect(toggle.textContent).toContain("1 configured");
  act(() => toggle.click());
  expect(getComputedStyle(body).display).not.toBe("none");
  expect(body.querySelector("tbody")!.textContent).toContain("2.00");
  expect(body.querySelector("tbody")!.textContent).toContain("8.00");
  act(() => body.querySelector<HTMLButtonElement>("tbody button")!.click());
  const mapping = host.querySelector<HTMLInputElement>('input[aria-label="Map example to model"]')!;
  expect(mapping).not.toBeNull();
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      mapping,
      "mapped-model",
    );
    mapping.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const save = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Save changes",
  )!;
  expect(save.disabled).toBe(false);
  await act(async () => save.click());
  expect(state.write).toHaveBeenCalledWith({
    environmentId: "first",
    input: {
      patch: {
        usageModelAliases: { example: "mapped-model" },
        usagePriceOverrides: { example: null },
      },
    },
  });
  expect(host.textContent).toContain("Saved");
  act(() => toggle.click());
  expect(getComputedStyle(body).display).toBe("none");
  expect(toggle.textContent).toContain("Expand");
});
