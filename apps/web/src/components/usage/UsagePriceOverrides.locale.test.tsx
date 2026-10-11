/** Verifies that localized mixed and unavailable cells retain intentional clearing edits. */
import { EnvironmentId } from "@t3tools/contracts";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { installMessages } from "~/i18n";
import { en } from "~/i18n/locales/en";
import { messages } from "~/i18n/locales/zh-CN";
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

import { UsagePriceOverrides } from "./UsagePriceOverrides";

let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  state.write.mockClear();
  installMessages("en", en);
  vi.unstubAllGlobals();
});

it.each([
  { name: "mixed", aliases: { example: "first-model" } },
  { name: "unavailable", aliases: null },
])("saves an explicitly cleared $name mapping after switching to Chinese", async ({ aliases }) => {
  installMessages("zh-CN", messages);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.targets = [
    {
      environmentId: EnvironmentId.make("first"),
      label: "First",
      prices: { example: { inputCostPerMillionTokens: 2, outputCostPerMillionTokens: 8 } },
      aliases,
      unavailable: null,
    },
    {
      environmentId: EnvironmentId.make("second"),
      label: "Second",
      prices: {},
      aliases: { example: "second-model" },
      unavailable: null,
    },
  ];
  await act(async () => {
    renderer = create(
      <UsagePriceOverrides
        usage={[]}
        initialSelectedEnvironmentIds={null}
        onOpenChange={() => {}}
      />,
    );
  });
  const mapping = () => renderer!.root.findByProps({ "aria-label": "将example映射到模型" });
  await act(async () => mapping().props.onChange({ target: { value: "temporary-model" } }));
  await act(async () => mapping().props.onChange({ target: { value: "" } }));
  const save = renderer!.root
    .findAllByType("button")
    .find((button) => button.children.join("") === "保存更改")!;
  expect(save.props.disabled).toBe(false);
  await act(async () => save.props.onClick());
  expect(state.write).toHaveBeenCalledWith({
    environmentId: "second",
    input: { patch: { usageModelAliases: { example: null } } },
  });
});
