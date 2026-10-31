/**
 * Draft ownership snapshots and C2's scratch entry use the real project picker and draft store.
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EnvironmentId, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { Project } from "../../types";
import { DraftId, useComposerDraftStore } from "../../composerDraftStore";

const effects = vi.hoisted(() => ({
  openDraft: vi.fn(),
  openScratch: vi.fn(),
  addProject: vi.fn(),
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => [] }));
vi.mock("~/state/entities", () => ({ useProjects: () => projects, useThreadShells: () => [] }));
vi.mock("~/state/environments", () => ({
  useEnvironments: () => ({ environments: [] }),
  usePrimaryEnvironmentId: () => environmentId,
  useEnvironmentProviders: () => new Map(),
}));
vi.mock("~/hooks/useSettings", () => ({
  useClientSettings: (select: (settings: typeof DEFAULT_CLIENT_SETTINGS) => unknown) =>
    select(DEFAULT_CLIENT_SETTINGS),
}));
vi.mock("~/hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => effects.openDraft }));
vi.mock("~/hooks/useScratchProject", () => ({
  useScratchProject: () => ({
    scratchEnvironmentId: () => environmentId,
    scratchWorkspaceRootFor: () => "F:/scratch",
    openScratchProject: effects.openScratch,
  }),
}));
// Project pinning is outside these picker tests; project selection and draft writes stay real.
vi.mock("~/hooks/useProjectGroupUpdate", () => ({
  useProjectPin: () => ({ canPinProjectGroup: () => false, toggleProjectGroupPin: vi.fn() }),
}));
vi.mock("~/commandPaletteBus", () => ({ openCommandPalette: effects.addProject }));
vi.mock("../ProjectFavicon", () => ({ ProjectFavicon: () => null }));
import { DraftHeroHeadline } from "./DraftHeroHeadline";

const environmentId = EnvironmentId.make("picker-environment");
const draftId = DraftId.make("picker-draft");
const projects: Project[] = [
  {
    id: ProjectId.make("atlas"),
    environmentId,
    title: "Atlas",
    workspaceRoot: "F:/atlas",
    repositoryIdentity: null,
    defaultModelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    scripts: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: ProjectId.make("boreal"),
    environmentId,
    title: "Boreal",
    workspaceRoot: "F:/boreal",
    repositoryIdentity: null,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

describe("draft project picker", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.clearAllMocks();
    localStorage.clear();
    useComposerDraftStore.setState({
      draftsByThreadKey: {},
      draftThreadsByThreadKey: {},
      logicalProjectDraftThreadKeyByLogicalProjectKey: {},
      stickyModelSelectionByProvider: {},
      stickyActiveProvider: null,
    });
    useComposerDraftStore
      .getState()
      .setProjectDraftThreadId(scopeProjectRef(environmentId, ProjectId.make("atlas")), draftId);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  /** Opens the real combobox, keeping selection, popup focus and draft mutations unmocked. */
  async function openPicker() {
    await act(async () =>
      root.render(
        <DraftHeroHeadline
          draftId={draftId}
          activeProjectRef={scopeProjectRef(environmentId, ProjectId.make("atlas"))}
          activeProjectTitle="Atlas"
        />,
      ),
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>("[data-draft-project-trigger]")!.click(),
    );
  }

  it("retargets a nonempty draft through the picker without losing its prompt", async () => {
    useComposerDraftStore.getState().setPrompt(draftId, "Keep this prompt");
    await openPicker();
    const option = Array.from(document.querySelectorAll<HTMLElement>("[role='option']")).find(
      (item) => item.textContent === "Boreal",
    )!;
    await act(async () => option.click());
    expect(useComposerDraftStore.getState().getDraftSession(draftId)).toMatchObject({
      environmentId: "picker-environment",
      projectId: "boreal",
    });
    expect(useComposerDraftStore.getState().getComposerDraft(draftId)?.prompt).toBe(
      "Keep this prompt",
    );
    expect(document.querySelector("[role='listbox']")).toBeNull();
    expect(effects.openDraft).not.toHaveBeenCalled();
  });

  it("opens the selected project's own draft when the current draft is empty", async () => {
    await openPicker();
    const option = Array.from(document.querySelectorAll<HTMLElement>("[role='option']")).find(
      (item) => item.textContent === "Boreal",
    )!;
    await act(async () => option.click());
    expect(effects.openDraft).toHaveBeenCalledExactlyOnceWith({
      environmentId: "picker-environment",
      projectId: "boreal",
    });
    expect(useComposerDraftStore.getState().getDraftSession(draftId)?.projectId).toBe("atlas");
  });

  it("offers no project in C2 and reuses the scratch action while preserving a typed prompt", async () => {
    effects.openScratch.mockResolvedValue({
      ...projects[0],
      id: ProjectId.make("scratch"),
      title: "Scratch",
      workspaceRoot: "F:/scratch",
    });
    useComposerDraftStore.getState().setPrompt(draftId, "Keep my no-project prompt");
    await openPicker();
    const option = Array.from(document.querySelectorAll<HTMLElement>("[role='option']")).find(
      (item) => item.textContent === "No project",
    );
    expect(option, "C2 must expose the existing no-project action").toBeDefined();
    await act(async () => option!.click());
    expect(useComposerDraftStore.getState().getDraftSession(draftId)).toMatchObject({
      environmentId: "picker-environment",
      projectId: "scratch",
    });
    expect(useComposerDraftStore.getState().getComposerDraft(draftId)?.prompt).toBe(
      "Keep my no-project prompt",
    );
  });
});
