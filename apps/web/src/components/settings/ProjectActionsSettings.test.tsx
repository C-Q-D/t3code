/**
 * @vitest-environment jsdom
 * Exercises inline deletion through the real persistence hook and native DOM focus.
 * Environment reads and command transport use an in-memory store; unrelated editor and layout
 * children are omitted while buttons, tooltips and the deletion persistence hook stay real.
 */
import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  ProjectId,
  type ProjectScript,
  type ResolvedKeybindingsConfig,
  type ServerSettings,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const commands = vi.hoisted(() => ({
  updateSettings: vi.fn(),
  upsertKeybinding: vi.fn(),
  removeKeybinding: vi.fn(),
}));

vi.mock("../../env", () => ({ isElectron: false }));
vi.mock("../../state/session", () => ({ readEnvironmentScope: () => true }));
vi.mock("../../state/entities", () => ({ useProjects: () => [project] }));
vi.mock("../../state/server", () => ({
  serverEnvironment: {
    updateSettings: "updateSettings",
    upsertKeybinding: "upsertKeybinding",
    removeKeybinding: "removeKeybinding",
  },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: keyof typeof commands) => commands[command],
}));
vi.mock("../../state/environments", () => ({
  useEnvironments: () => ({
    environments: [
      {
        environmentId,
        serverConfig: {
          settings: savedSettings,
          keybindings: savedKeybindings,
          environment: { capabilities: { projectSettingsOverrides: true } },
        },
      },
    ],
  }),
}));
vi.mock("./SettingsScopeContext", () => ({
  useSettingsScope: () => {
    const target = {
      environmentId,
      projectId: project.id,
      settings: {
        ...savedSettings,
        defaultProjectScripts:
          savedSettings.projectSettingsOverrides[project.id]!.defaultProjectScripts,
      },
    };
    return { scope: { kind: "project", members: [project] }, targets: [target], target };
  },
}));
vi.mock("./useScopedSettings", () => ({ useScopedSettingsWriteAllowed: () => true }));
vi.mock("../../hooks/useT3ProjectFileScripts", () => ({
  useT3ProjectFileState: () => ({ status: "valid", scripts: [] }),
}));
vi.mock("./settingsLayout", () => ({
  SettingsSection: "section",
  SettingsRow: () => null,
}));
vi.mock("../projectScriptEditor", () => ({
  EMPTY_PROJECT_SCRIPT_INPUT: {},
  ProjectScriptEditorDialog: () => null,
  ScriptIcon: () => null,
}));
vi.mock("../ui/toast", () => ({ toastManager: { add: vi.fn() } }));

import { ProjectActionsSettings } from "./ProjectActionsSettings";

const environmentId = EnvironmentId.make("test-environment");
const otherProjectId = ProjectId.make("other");
const project = {
  id: ProjectId.make("selected"),
  environmentId,
  workspaceRoot: "/test/project",
  scripts: [],
};
const lint: ProjectScript = {
  id: "lint",
  name: "Lint",
  command: "vp lint",
  icon: "lint",
  runOnWorktreeCreate: false,
};
const testScript: ProjectScript = {
  id: "test",
  name: "Test",
  command: "vp test",
  icon: "test",
  runOnWorktreeCreate: false,
};
let savedSettings: ServerSettings;
let savedKeybindings: ResolvedKeybindingsConfig;
let releaseWrite: () => void;
let writeGate: Promise<void>;
let container: HTMLDivElement;
let root: Root;

/** Requires an actual rendered control so a missing or renamed entry fails before interacting. */
function button(label: string): HTMLButtonElement {
  const element = Array.from(container.querySelectorAll("button")).find(
    (candidate) =>
      (candidate.getAttribute("aria-label") ?? candidate.textContent?.trim()) === label,
  );
  if (!element) throw new Error(`Missing action control: ${label}`);
  return element;
}

/** Clicks deletion, commits its disabled saving state, then releases the command transport. */
async function deleteLint() {
  await act(() => {
    const remove = button("Delete Lint");
    remove.focus();
    remove.click();
  });
  expect(button("Add action").disabled).toBe(true);
  await act(async () => {
    releaseWrite();
    await writeGate;
  });
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  savedSettings = {
    ...DEFAULT_SERVER_SETTINGS,
    defaultProjectScripts: [],
    projectSettingsOverrides: {
      [project.id]: { defaultProjectScripts: [lint, testScript] },
    },
  };
  savedKeybindings = [
    {
      command: "script.lint.run",
      shortcut: {
        key: "k",
        metaKey: false,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
        modKey: true,
      },
    },
  ];
  writeGate = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  commands.updateSettings.mockImplementation(
    async ({ input }: { input: { patch: Partial<ServerSettings> } }) => {
      await writeGate;
      savedSettings = {
        ...savedSettings,
        ...input.patch,
        projectSettingsOverrides: {
          ...savedSettings.projectSettingsOverrides,
          ...input.patch.projectSettingsOverrides,
        },
      };
      return AsyncResult.success(undefined);
    },
  );
  commands.removeKeybinding.mockImplementation(
    async ({ input }: { input: { command: string } }) => {
      savedKeybindings = savedKeybindings.filter((binding) => binding.command !== input.command);
      return AsyncResult.success(undefined);
    },
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("inline project action deletion", () => {
  it("removes only the selected script from persisted settings", async () => {
    await act(() => root.render(<ProjectActionsSettings />));
    await deleteLint();
    expect(
      savedSettings.projectSettingsOverrides[project.id]?.defaultProjectScripts?.map(
        (script) => script.id,
      ),
    ).toEqual(["test"]);
    expect(container.querySelector('[aria-label="Delete Lint"]')).toBeNull();
    expect(button("Delete Test")).toBeDefined();
  });

  it("clears the shortcut when no project still references the deleted script", async () => {
    await act(() => root.render(<ProjectActionsSettings />));
    await deleteLint();
    expect(savedKeybindings).toEqual([]);
  });

  it("retains a shortcut still referenced by another project", async () => {
    savedSettings = {
      ...savedSettings,
      projectSettingsOverrides: {
        ...savedSettings.projectSettingsOverrides,
        [otherProjectId]: { defaultProjectScripts: [lint] },
      },
    };
    await act(() => root.render(<ProjectActionsSettings />));
    await deleteLint();
    expect(
      savedSettings.projectSettingsOverrides[project.id]?.defaultProjectScripts?.map(
        (script) => script.id,
      ),
    ).toEqual(["test"]);
    expect(
      savedSettings.projectSettingsOverrides[otherProjectId]?.defaultProjectScripts?.map(
        (script) => script.id,
      ),
    ).toEqual(["lint"]);
    expect(savedKeybindings).toEqual([
      {
        command: "script.lint.run",
        shortcut: {
          key: "k",
          metaKey: false,
          ctrlKey: false,
          shiftKey: true,
          altKey: false,
          modKey: true,
        },
      },
    ]);
  });

  it("returns focus to Add action after the successful deletion is rendered", async () => {
    await act(() => root.render(<ProjectActionsSettings />));
    await deleteLint();
    const add = button("Add action");
    expect(add.disabled).toBe(false);
    expect(document.activeElement).toBe(add);
  });
});
