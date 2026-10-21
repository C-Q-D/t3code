/**
 * @vitest-environment jsdom
 * Guards read-only source-control displays with real DOM controls; environment I/O is isolated.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as Option from "effect/Option";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("./useScopedSettings", () => ({
  useScopedSettings: () => DEFAULT_UNIFIED_SETTINGS,
  useScopedSettingsMixed: () => false,
  useUpdateScopedSettings: () => vi.fn(),
}));
vi.mock("./SettingsScopeContext", () => ({
  useSettingsScope: () => ({
    scope: { kind: "all", environmentIds: ["test-environment"] },
    environment: {
      environmentId: "test-environment",
      connection: { phase: "connected" },
      serverConfig: { providers: [] },
    },
    connectedEnvironments: [{ environmentId: "test-environment" }],
    targets: [],
  }),
}));
vi.mock("./useScopedModelAvailability", () => ({
  useScopedModelDisabledReason: () => () => null,
}));
vi.mock(import("../../state/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  EMPTY_SERVER_PROVIDERS: [],
}));
vi.mock("../../state/sourceControl", () => ({
  sourceControlEnvironment: { discovery: () => null },
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: () => ({
    data: {
      versionControlSystems: [
        {
          kind: "git",
          label: "Git",
          status: "available",
          implemented: true,
          version: Option.none(),
          detail: Option.none(),
          installHint: "",
          executable: "git",
        },
      ],
      sourceControlProviders: [],
    },
    isPending: false,
    error: null,
    refresh: vi.fn(),
  }),
}));
// The shell is outside this regression. It passes through real row content and controls.
vi.mock("./settingsLayout", () => ({
  SettingsPageContainer: ({ children }: { children: ReactNode }) => children,
  SettingsSection: ({ children }: { children: ReactNode }) => children,
  SettingsRow: ({
    id,
    children,
    control,
  }: {
    id?: string;
    children?: ReactNode;
    control?: ReactNode;
  }) => (
    <div id={id}>
      {control}
      {children}
    </div>
  ),
  SettingResetButton: () => null,
  useSettingsSearchTargetId: () => null,
}));
vi.mock("./settingsSearch", () => ({
  searchableSetting: (id: string) => ({ id, title: id }),
  sourceControlHostSettingsSearchId: (kind: string) => `source-control-host-${kind}`,
}));
vi.mock("./ProjectDefaultsSettings", () => ({
  ProjectDefaultsSettings: ({ sourceControlRows }: { sourceControlRows: ReactNode }) =>
    sourceControlRows,
}));
vi.mock("./BranchNamingSettings", () => ({ BranchNamingSettings: () => null }));
vi.mock("./SourceControlHostSettings", () => ({ SourceControlHostSettings: () => null }));
vi.mock("./GitHubAccountSettings", () => ({ GitHubAccountSettings: () => null }));
vi.mock("./GitHubTokenSettings", () => ({ GitHubTokenSettings: () => null }));
vi.mock("../chat/ProviderModelPicker", () => ({ ProviderModelPicker: () => null }));
vi.mock("../chat/TraitsPicker", () => ({ TraitsPicker: () => null }));

import { SourceControlSettingsPanel } from "./SourceControlSettings";

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() => root.render(<SourceControlSettingsPanel />));
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("read-only source-control displays", () => {
  it.each([
    ["source-control", "Only detected tools are shown. Switching is not supported yet."],
    [
      "source-control-writer-model",
      "Follows the text generation model for the current settings scope.",
    ],
  ])("disables %s and explains its source in visible row text", async (id, explanation) => {
    const row = container.querySelector<HTMLElement>(`#${id}`);
    const button = row?.querySelector<HTMLButtonElement>('button[data-slot="select-trigger"]');
    expect(button).toBeInstanceOf(HTMLButtonElement);
    if (!button || !row) throw new Error(`Missing read-only control: ${id}`);

    expect.soft(button.disabled).toBe(true);
    await act(() => button.focus());
    expect.soft(document.activeElement).not.toBe(button);

    const reason = Array.from(row.querySelectorAll("p")).find(
      (node) => node.textContent === explanation,
    );
    expect(reason, "The reason must be rendered text, not only an ARIA attribute").toBeDefined();
    if (!reason) throw new Error(`Missing visible reason: ${id}`);
    expect(reason.closest('[hidden], [aria-hidden="true"]')).toBeNull();
    expect(getComputedStyle(reason).display).not.toBe("none");
    expect(getComputedStyle(reason).visibility).not.toBe("hidden");
  });
});
