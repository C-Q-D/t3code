/** Verifies project selection using real checkbox clicks and import requests.
 * @vitest-environment jsdom
 */
import { RegistryContext } from "@effect/atom-react";
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  EnvironmentId,
  ProjectId,
  type AgentSessionProjectCandidate,
  type AuthSessionState,
} from "@t3tools/contracts";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

type SessionResult = AsyncResult.AsyncResult<AuthSessionState, Error>;
type Project = { id: ProjectId; environmentId: EnvironmentId; workspaceRoot: string };
type CreateProjectInput = {
  environmentId: EnvironmentId;
  input: { projectId: ProjectId; workspaceRoot: string };
};
const state = vi.hoisted(() => ({
  selectedEnvironment: "primary",
  registry: null as AtomRegistry.AtomRegistry | null,
  sessions: new Map<EnvironmentId, Atom.Writable<SessionResult>>(),
  projects: null as Atom.Writable<ReadonlyArray<Project>> | null,
  providers: null as Atom.Atom<ReadonlyArray<never>> | null,
  config: null as Atom.Atom<null> | null,
  candidates: [] as AgentSessionProjectCandidate[],
  createProject: vi.fn(),
  importThreads: vi.fn(),
  refreshProviders: vi.fn(),
  connectPairing: vi.fn(),
  completeOnboarding: vi.fn(),
  onDone: vi.fn(),
  scan: vi.fn(),
  refreshScan: vi.fn(),
}));

vi.mock("../../connection/runtime", () => ({ connectionAtomRuntime: undefined }));
vi.mock("@t3tools/client-runtime/state/session", () => ({
  createEnvironmentSessionAtoms: () => ({
    sessionStateAtom: (id: EnvironmentId) => state.sessions.get(id)!,
  }),
}));
vi.mock("../../rpc/atomRegistry", () => ({
  get appAtomRegistry() {
    return state.registry;
  },
}));
vi.mock("@clerk/react", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: false }) }));
vi.mock("../../hooks/useTheme", () => ({ mountOnboardingTheme: () => () => {} }));
vi.mock("../../hooks/useLocalStorage", () => ({ useLocalStorage: () => [false, () => {}] }));
vi.mock("../../hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copyToClipboard: vi.fn(), copied: false }),
}));
vi.mock("../../cloud/publicConfig", () => ({ hasCloudPublicConfig: () => false }));
vi.mock("../clerk/useT3ConnectAuthPrompt", () => ({ useT3ConnectAuthPrompt: vi.fn() }));
vi.mock("../../hooks/useSettings", () => ({
  ensureClientSettingsHydrated: vi.fn(),
  persistClientSettingsUpdate: vi.fn(),
}));
vi.mock(import("../../onboarding/firstRun"), async (importOriginal) => ({
  ...(await importOriginal()),
  completeOnboarding: state.completeOnboarding,
}));
vi.mock("../../env", () => ({ isElectron: false }));
vi.mock("../../state/environments", () => {
  const environment = (environmentId: string) => ({
    environmentId,
    label: environmentId,
    connection: { phase: "connected" },
    entry: { enabled: true, target: { _tag: "DirectConnectionTarget" } },
  });
  const primary = environment("primary");
  return {
    usePrimaryEnvironment: () => primary,
    useEnvironments: () => ({ environments: [environment(state.selectedEnvironment)] }),
  };
});
vi.mock("../../state/server", () => ({
  serverEnvironment: {
    providersValueAtom: () => state.providers,
    configValueAtom: () => state.config,
    refreshProviders: "refreshProviders",
  },
}));
vi.mock("../../state/entities", async () => {
  const { useAtomValue } = await import("@effect/atom-react");
  return {
    useProjects: () => useAtomValue(state.projects!),
    readProjects: () => state.registry!.get(state.projects!),
  };
});
vi.mock("../../state/projects", () => ({ projectEnvironment: { create: "createProject" } }));
vi.mock("../../state/agentSessions", () => ({
  agentSessionScan: (query: { environmentId: EnvironmentId }) => query,
  agentSessionImport: "importThreads",
}));
vi.mock("../../onboarding/useProjectScans", () => ({
  useProjectScans: (ids: EnvironmentId[]) =>
    ids.map((environmentId) => {
      state.scan({ environmentId });
      return {
        environmentId,
        data: { candidates: state.candidates, truncated: false },
        isPending: false,
        error: null,
        refresh: state.refreshScan,
      };
    }),
}));
vi.mock("../ui/dialog", () => ({ Dialog: Content }));
vi.mock("./OnboardingSurface", () => ({
  OnboardingPanel: Content,
  OnboardingSteps: () => null,
  OnboardingPopup: Content,
  OnboardingHeader: Content,
}));
vi.mock("../ui/scroll-area", () => ({ ScrollArea: Content }));
vi.mock("../ui/tooltip", () => ({ Tooltip: "div", TooltipTrigger: "span", TooltipPopup: "span" }));
vi.mock("../../connection/onboarding", () => ({ connectPairing: "connectPairing" }));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (
    command: "createProject" | "importThreads" | "refreshProviders" | "connectPairing",
  ) => state[command],
}));
vi.mock("../../state/terminal", () => ({ terminalEnvironment: {} }));
vi.mock("../ThreadTerminalDrawer", () => ({ TerminalViewport: "div" }));
vi.mock("../cloud/CloudEnvironmentConnectList", () => ({ CloudEnvironmentConnectRows: "div" }));
vi.mock("../settings/ChatGptWelcomeCoordinator", () => ({ ChatGptWelcomeCoordinator: () => null }));
vi.mock("../settings/CodexSetupSection", () => ({
  CodexSetupSection: () => null,
  AddManagedCodexAccountDialog: () => null,
}));
vi.mock("../settings/providerDriverMeta", () => ({
  providerClients: { get: () => ({ label: "Agent" }) },
}));
vi.mock("../settings/providerStatus", () => ({
  getProviderSummary: () => ({ headline: "Checking", detail: null }),
}));
vi.mock("../ui/collapsible", () => ({
  Collapsible: Content,
  CollapsiblePanel: "div",
  CollapsibleTrigger: "button",
}));
vi.mock("../ui/toast", () => ({ toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() } }));

import { WelcomeWizard } from "./WelcomeWizard";

/** Keeps layout wrappers inert while preserving the real buttons, checkboxes and wizard state. */
function Content({ children }: { children?: ReactNode }) {
  return <div>{children}</div>;
}

let root: Root;
let container: HTMLDivElement;
const primaryId = EnvironmentId.make("primary");

/** Finds rendered actions by their user-visible label, never by a mocked step callback. */
function button(label: string) {
  const found = Array.from(container.querySelectorAll("button")).find(
    (node) => node.textContent === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

/** Selects the actual Base UI checkbox associated with a project or the select-all label. */
function checkbox(label: string) {
  const row = Array.from(container.querySelectorAll("label")).find((node) =>
    node.textContent?.includes(label),
  );
  const control = row?.querySelector<HTMLElement>('[role="checkbox"]');
  if (!control) throw new Error(`Missing checkbox: ${label}`);
  return control;
}

/** Drives DOM events so Base UI's mixed-state click behavior remains part of the test. */
async function click(element: HTMLElement) {
  await act(async () => element.click());
}

/** Enters the import step with two independently identifiable candidate paths. */
async function enterImport() {
  await act(async () =>
    root.render(
      <RegistryContext.Provider value={state.registry!}>
        <WelcomeWizard localAvailable onDone={state.onDone} />
      </RegistryContext.Provider>,
    ),
  );
  await click(button("Next"));
  await click(button("Next"));
  expect(checkbox("Select all").getAttribute("aria-checked")).toBe("false");
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.selectedEnvironment = "primary";
  state.registry = AtomRegistry.make();
  state.sessions.set(
    primaryId,
    Atom.make<SessionResult>(
      AsyncResult.success<AuthSessionState>({
        authenticated: true,
        scopes: [AuthOrchestrationReadScope, AuthOrchestrationOperateScope],
        auth: {
          policy: "remote-reachable",
          bootstrapMethods: ["one-time-token"],
          sessionMethods: ["bearer-access-token"],
          sessionCookieName: "t3_session",
        },
      }),
    ).pipe(Atom.keepAlive),
  );
  state.projects = Atom.make<ReadonlyArray<Project>>([]).pipe(Atom.keepAlive);
  state.providers = Atom.make<ReadonlyArray<never>>([]).pipe(Atom.keepAlive);
  state.config = Atom.make(null).pipe(Atom.keepAlive);
  state.candidates = ["/projects/first", "/projects/second"].map((path) => ({
    path,
    title: path,
    sources: ["codex"],
    threadCount: 1,
    lastActiveAt: null,
    alreadyImported: false,
  }));
  state.createProject
    .mockReset()
    .mockImplementation(async ({ environmentId, input }: CreateProjectInput) => {
      state.registry!.set(state.projects!, [
        ...state.registry!.get(state.projects!),
        { id: input.projectId, environmentId, workspaceRoot: input.workspaceRoot },
      ]);
      return AsyncResult.success(undefined);
    });
  state.importThreads
    .mockReset()
    .mockResolvedValue(AsyncResult.success({ importedCount: 1, skippedCount: 0 }));
  state.refreshProviders.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  state.completeOnboarding.mockReset().mockResolvedValue(undefined);
  state.onDone.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  state.registry?.dispose();
  state.sessions.clear();
  vi.unstubAllGlobals();
});

it("selects all from empty, removes one, then selects all from mixed before importing both paths", async () => {
  await enterImport();
  expect(checkbox("Select all").getAttribute("aria-checked")).toBe("false");
  expect(button("Import 0 projects").disabled).toBe(true);
  await click(checkbox("Select all"));
  expect(checkbox("Select all").getAttribute("aria-checked")).toBe("true");
  await click(checkbox("/projects/first"));
  expect(checkbox("Select all").getAttribute("aria-checked")).toBe("mixed");
  expect(button("Import 1 project").disabled).toBe(false);
  await click(checkbox("Select all"));
  expect(checkbox("Select all").getAttribute("aria-checked")).toBe("true");
  await click(button("Import 2 projects"));
  expect(state.createProject.mock.calls.map(([request]) => request.input.workspaceRoot)).toEqual([
    "/projects/first",
    "/projects/second",
  ]);
  expect(
    state.importThreads.mock.calls.map(([request]) => request.input.expectedWorkspaceRoot),
  ).toEqual(["/projects/first", "/projects/second"]);
});

it("imports only the remaining path after deselecting one project", async () => {
  await enterImport();
  await click(checkbox("Select all"));
  await click(checkbox("/projects/first"));
  expect(checkbox("Select all").getAttribute("aria-checked")).toBe("mixed");
  await click(button("Import 1 project"));
  expect(state.createProject.mock.calls.map(([request]) => request.input.workspaceRoot)).toEqual([
    "/projects/second",
  ]);
  expect(
    state.importThreads.mock.calls.map(([request]) => request.input.expectedWorkspaceRoot),
  ).toEqual(["/projects/second"]);
});

it("clears all projects and completes without any import", async () => {
  await enterImport();
  await click(checkbox("Select all"));
  expect(checkbox("Select all").getAttribute("aria-checked")).toBe("true");
  await click(checkbox("Select all"));
  expect(checkbox("Select all").getAttribute("aria-checked")).toBe("false");
  const importButton = button("Import 0 projects");
  expect(importButton.disabled).toBe(true);
  await click(importButton);
  await click(button("Do not import projects"));
  expect(state.createProject).not.toHaveBeenCalled();
  expect(state.importThreads).not.toHaveBeenCalled();
  expect(state.onDone).toHaveBeenCalledOnce();
});
