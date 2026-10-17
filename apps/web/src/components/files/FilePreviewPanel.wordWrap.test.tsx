/**
 * Exercises the workspace preview's actual toolbar and DOM button against a settings boundary.
 * Renderers and environment I/O are isolated; mode selection and action disabling remain real.
 * @vitest-environment jsdom
 */
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import FilePreviewPanel from "./FilePreviewPanel";

const settings = vi.hoisted(() => ({
  wordWrap: false,
  update: vi.fn<(patch: { wordWrap: boolean }) => void>(),
}));

vi.mock("~/hooks/useSettings", () => ({
  useClientSettings: (select: (value: { wordWrap: boolean }) => unknown) => select(settings),
  useUpdateClientSettings: () => settings.update,
}));
vi.mock("~/hooks/useTheme", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));
vi.mock("~/hooks/useWorkspaceMutationRefresh", () => ({ useWorkspaceMutationRefresh: () => {} }));
vi.mock("~/state/filesystem", () => ({
  useFilesystemReadAccess: () => ({ canReadFiles: true, isPending: false }),
}));
vi.mock("~/state/session", () => ({ useEnvironmentScope: () => false }));
vi.mock("~/state/environments", () => ({
  usePrimaryEnvironmentId: () => "test-environment",
  useEnvironmentHttpBaseUrl: () => "https://environment.test",
}));
vi.mock("~/remoteOpen", () => ({ useRemoteOpenState: () => ({ mode: "local-exec" }) }));
vi.mock("~/browser/previewRuntime", () => ({ usePreviewAvailable: () => false }));
vi.mock("~/browser/useOpenLink", () => ({ useOpenLink: () => vi.fn() }));
vi.mock("~/lib/openPullRequestLink", () => ({ useOpenChangeRequestLink: () => vi.fn() }));
vi.mock("~/state/server", () => ({ primaryServerKeybindingsAtom: {}, serverEnvironment: {} }));
vi.mock("~/state/assets", () => ({ assetEnvironment: { createUrl: {} } }));
vi.mock("~/state/preview", () => ({ previewEnvironment: { open: {} } }));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("~/state/use-atom-query-runner", () => ({ useAtomQueryRunner: () => vi.fn() }));
vi.mock("~/assets/assetUrls", () => ({
  useAssetUrlState: () => ({ _tag: "Success", url: "https://environment.test/document" }),
}));
vi.mock("./projectFilesQueryState", () => ({
  useProjectFileQuery: () => ({
    data: { contents: "# Document\n\nPreview contents", truncated: false },
    error: null,
    isNotFile: false,
  }),
}));
vi.mock("./useFileSaveCoordinator", () => ({
  useFileSaveCoordinator: () => ({ change: vi.fn() }),
}));
vi.mock("~/components/DiffWorkerPoolProvider", () => ({
  DiffWorkerPoolProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("~/components/diffs/DiffCommentAnnotation", () => ({ DiffCommentAnnotation: () => null }));
vi.mock("~/components/chat/OpenInPicker", () => ({ OpenInPicker: () => null }));
vi.mock("~/components/media/MediaVideoPlayer", () => ({ MediaVideoPlayer: () => null }));
vi.mock("~/components/media/MediaActions", () => ({ MediaActions: () => null }));
vi.mock("./FileBrowserPanel", () => ({ default: () => null }));
vi.mock("./FileBreadcrumbs", () => ({ FileBreadcrumbs: () => null }));
vi.mock("./AttachmentFilePreview", () => ({ AttachmentFilePreview: () => null }));
vi.mock("./FileMarkdownPreview", () => ({
  FileMarkdownPreview: () => <article>Markdown</article>,
}));
vi.mock("./DelimitedTablePreview", () => ({ DelimitedTablePreview: () => <table /> }));
vi.mock("./ReadOnlySourcePreview", () => ({ default: () => <pre>Source</pre> }));
vi.mock(import("./BrowserDocumentFrame"), async (importOriginal) => ({
  ...(await importOriginal()),
  BrowserDocumentFrame: () => <iframe title="Document" sandbox="" />,
}));
vi.mock("~/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe("workspace preview word wrap", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    localStorage.clear();
    localStorage.setItem("t3code.renderMarkdown", "true");
    settings.wordWrap = false;
    settings.update.mockReset().mockImplementation((patch) => {
      settings.wordWrap = patch.wordWrap;
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(() => root.unmount());
    host.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  /** Mounts the production panel with a readable workspace and no editor/network side effects. */
  async function openFile(relativePath: string) {
    const environmentId = EnvironmentId.make("test-environment");
    const threadRef = { environmentId, threadId: ThreadId.make("test-thread") };
    await act(() => {
      root.render(
        <FilePreviewPanel
          environmentId={environmentId}
          cwd="/workspace"
          projectName="Workspace"
          relativePath={relativePath}
          threadRef={threadRef}
          composerDraftTarget={threadRef}
          keybindings={[]}
          availableEditors={[]}
          revealLine={null}
          revealRequestId={0}
          onOpenFile={() => {}}
          onPendingChange={() => {}}
          selectedFilePending={false}
          workspaceMutationId={null}
        />,
      );
    });
  }

  /** Finds the real toolbar button, failing explicitly if the expected action is absent. */
  function wrapButton(): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="Word wrap"]');
    if (!button) throw new Error("Word wrap action was not rendered");
    return button;
  }

  it.each(["README.md", "data.csv", "page.html", "document.pdf"])(
    "keeps word wrap disabled without writing settings in rendered %s",
    async (path) => {
      await openFile(path);
      const button = wrapButton();
      await act(() => button.click());
      expect.soft(button.disabled).toBe(true);
      expect.soft(settings.wordWrap).toBe(false);
      expect(settings.update).not.toHaveBeenCalled();
    },
  );

  it("still toggles the setting after switching from rendered Markdown to source", async () => {
    await openFile("README.md");
    const source = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Source",
    );
    if (!source) throw new Error("Source mode action was not rendered");
    await act(() => source.click());
    const button = wrapButton();
    expect(button.disabled).toBe(false);
    await act(() => button.click());
    expect(settings.wordWrap).toBe(true);
    expect(settings.update).toHaveBeenCalledExactlyOnceWith({ wordWrap: true });
  });
});
