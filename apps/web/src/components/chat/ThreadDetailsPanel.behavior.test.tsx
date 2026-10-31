/**
 * Exercises detail-panel branch selection and change navigation through the real child controls.
 * @vitest-environment jsdom
 */
import { EnvironmentId, ProjectId, ThreadId, type VcsRef } from "@t3tools/contracts";
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { ThreadDetailsPanel, type ThreadDetailsPanelProps } from "./ThreadDetailsPanel";
import { BranchPicker } from "../BranchPicker";

const state = vi.hoisted(() => ({
  density: "full" as "full" | "compact" | "essential",
  switchRef: vi.fn(),
  updateMetadata: vi.fn(),
}));
vi.mock("./ThreadDetailsCard", () => ({
  ThreadDetailsCard: ({ children }: { children: (density: typeof state.density) => ReactNode }) =>
    children(state.density),
}));
vi.mock("../BranchToolbar", () => ({ BranchToolbar: () => null }));
vi.mock("../ProjectScriptsControl", () => ({ default: () => null }));
vi.mock("./ThreadServersPanel", () => ({ ThreadServersPanel: () => null }));
vi.mock("./ThreadAutomationsPanel", () => ({ ThreadAutomationsPanel: () => null }));
vi.mock("./ThreadRelationshipsControl", () => ({ ThreadRelationshipsPanel: () => null }));
vi.mock("../../hooks/useT3ProjectFileScripts", () => ({ useT3ProjectFileScripts: () => [] }));
vi.mock("~/hooks/useSupportsMultiplePullRequests", () => ({
  useSupportsMultiplePullRequests: () => false,
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@effect/atom-react", () => ({
  useAtomMount: () => {},
  useAtomValue: (atom: unknown) => (atom === "vcs-state" ? { isRunning: false } : null),
}));
vi.mock("~/state/entities", () => ({
  useQuietThreadShell: () => ({
    id: "thread",
    environmentId: "environment",
    projectId: "project",
    branch: "main",
    worktreePath: null,
    runtime: null,
  }),
  useThreadProjection: () => null,
  useQuietThreadProjection: () => null,
  useProject: () => ({ id: "project", workspaceRoot: "/project" }),
}));
vi.mock("~/state/session", () => ({
  environmentSession: { preparedConnectionValueAtom: () => null },
  useEnvironmentScope: () => true,
  readEnvironmentScope: () => true,
}));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: (command: unknown) => command }));
vi.mock("~/state/threads", () => ({ threadEnvironment: { updateMetadata: state.updateMetadata } }));
vi.mock("~/state/server", () => ({ serverEnvironment: { configValueAtom: () => null } }));
vi.mock("~/state/sourceControl", () => ({
  sourceControlEnvironment: { discovery: () => "discovery" },
}));
vi.mock("~/state/vcs", () => ({
  vcsStatusRevalidation: () => null,
  vcsEnvironment: { status: () => "status", listRefs: () => "refs", switchRef: state.switchRef },
  vcsActionManager: { stateAtom: () => "vcs-state", runStackedAction: () => vi.fn() },
}));
vi.mock("~/state/query", () => ({
  useEnvironmentQuery: (atom: unknown) => ({
    data:
      atom === "discovery"
        ? { sourceControlProviders: [] }
        : atom === "refs"
          ? { refs: [] }
          : {
              isRepo: true,
              refName: "main",
              isDefaultRef: false,
              hasPrimaryRemote: true,
              hasWorkingTreeChanges: false,
              aheadCount: 0,
              behindCount: 0,
              workingTree: { files: [], insertions: 3, deletions: 1 },
            },
    error: null,
    refresh: vi.fn(),
  }),
}));
vi.mock("~/state/queries", () => ({
  usePaginatedBranches: () => ({
    refs: [
      { name: "feature", current: false, isDefault: false, isRemote: false, worktreePath: null },
    ] satisfies Partial<VcsRef>[],
    data: { nextCursor: null },
    isPending: false,
    isFetchingNextPage: false,
    refresh: vi.fn(),
  }),
}));
vi.mock("~/composerDraftStore", () => ({
  useComposerDraftStore: (select: (store: unknown) => unknown) =>
    select({
      getDraftThreadByRef: () => null,
      setDraftThreadContext: vi.fn(),
    }),
}));
vi.mock("~/lib/openPullRequestLink", () => ({ useOpenPrLink: () => vi.fn() }));
vi.mock("~/editorPreferences", () => ({ useOpenInPreferredEditor: () => vi.fn() }));
vi.mock("~/browser/useOpenLink", () => ({ useOpenLink: () => vi.fn() }));
vi.mock("~/lib/sourceControlActions", () => ({
  useSourceControlActionRunning: () => false,
  useVcsInitAction: () => ({}),
  useVcsPullAction: () => ({}),
  useSourceControlPublishRepositoryAction: () => ({}),
  useGitStackedAction: () => ({}),
}));
vi.mock("../ThreadStatusIndicators", () => ({
  useLinkedThreadPullRequest: () => null,
  prStatusIndicator: () => null,
}));
vi.mock("../ui/combobox", () => ({
  ComboboxTrigger: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("../BranchPicker", () => ({
  BranchPicker: ({ onSelectItem, children }: ComponentProps<typeof BranchPicker>) => (
    <>
      <button onClick={() => onSelectItem("feature")}>Choose feature branch</button>
      {children}
    </>
  ),
}));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.density = "full";
  state.switchRef.mockReset().mockResolvedValue({ _tag: "Success", value: { refName: "feature" } });
  state.updateMetadata.mockReset().mockResolvedValue({ _tag: "Success" });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

/** Mounts the real detail panel with a repo and idle thread; overrides select the scenario. */
async function render(overrides: Partial<ThreadDetailsPanelProps> = {}) {
  await act(async () =>
    root.render(
      <ThreadDetailsPanel
        usage={{ providerInstanceId: null, providers: [], sources: [], contextWindow: null }}
        anchor={{ current: null }}
        handle={{} as ThreadDetailsPanelProps["handle"]}
        environmentId={EnvironmentId.make("environment")}
        threadId={ThreadId.make("thread")}
        projectId={ProjectId.make("project")}
        worktreePath={null}
        isServerThread
        openInShortcutEnabled={false}
        activeProjectName="project"
        activeProjectScripts={undefined}
        preferredScriptId={null}
        keybindings={[]}
        availableEditors={[]}
        showOpenInPicker={false}
        gitCwd="/project"
        isGitRepo
        envLocked={false}
        availableEnvironments={[]}
        onEnvironmentChange={vi.fn()}
        onEnvModeChange={vi.fn()}
        envMode="local"
        startFromOrigin={false}
        onStartFromOriginChange={vi.fn()}
        onComposerFocusRequest={vi.fn()}
        onRunProjectScript={vi.fn()}
        onAddProjectScript={vi.fn()}
        onUpdateProjectScript={vi.fn()}
        onDeleteProjectScript={vi.fn()}
        {...overrides}
      />,
    ),
  );
}

it("selects a base branch without checking out when multiple-model sending forces a new worktree", async () => {
  await render({ forceNewWorktree: true, envMode: "local" });
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Choose feature branch")!
      .click(),
  );
  expect(state.switchRef).not.toHaveBeenCalled();
  expect(state.updateMetadata).toHaveBeenCalledWith({
    environmentId: "environment",
    input: { threadId: "thread", branch: "feature", worktreePath: null },
  });
});

it.each(["compact", "essential"] as const)(
  "keeps change navigation available at %s density",
  async (density) => {
    state.density = density;
    const onOpenChanges = vi.fn();
    await render({ onOpenChanges });
    const changes = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.startsWith("Changes"),
    );
    expect(changes).toBeDefined();
    await act(async () => changes!.click());
    expect(onOpenChanges).toHaveBeenCalledOnce();
  },
);
