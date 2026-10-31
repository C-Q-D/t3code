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
import { t } from "~/i18n";

const settings = vi.hoisted(() => ({
  wordWrap: false,
  update: vi.fn<(patch: { wordWrap: boolean }) => void>(),
}));
const fileState = vi.hoisted(() => ({
  data: { contents: "# Document\n\nPreview contents", truncated: false } as {
    contents: string;
    truncated: boolean;
  } | null,
  error: null as string | null,
  isPending: false,
  isNotFile: false,
}));
const clipboard = vi.hoisted(() => ({
  writeText: vi.fn<(text: string) => Promise<void>>(),
  toast: vi.fn(),
}));

vi.mock("~/components/ui/toast", () => ({
  toastManager: { add: clipboard.toast },
  stackedThreadToast: (value: unknown) => value,
}));
vi.mock("~/hooks/useSettings", () => ({
  useClientSettings: (select: (value: { wordWrap: boolean }) => unknown) => select(settings),
  updateClientSettings: (patch: { wordWrap: boolean }) => settings.update(patch),
}));
vi.mock("~/hooks/useTheme", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
  useRenderedAppearance: () => "dark",
}));
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
vi.mock("~/state/server", async () => {
  const { Atom } = await import("effect/reactivity");
  const config = Atom.make(null);
  return {
    primaryServerKeybindingsAtom: {},
    serverEnvironment: { configValueAtom: () => config },
  };
});
vi.mock("~/state/assets", () => ({ assetEnvironment: { createUrl: {} } }));
vi.mock("~/state/preview", () => ({ previewEnvironment: { open: {} } }));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("~/state/use-atom-query-runner", () => ({ useAtomQueryRunner: () => vi.fn() }));
vi.mock("~/assets/assetUrls", () => ({
  useAssetUrlState: () => ({ _tag: "Success", url: "https://environment.test/document" }),
}));
vi.mock("./projectFilesQueryState", async () => {
  const { Atom } = await import("effect/reactivity");
  const query = Atom.make(null);
  return {
    useProjectFileQuery: () => fileState,
    getProjectFileContents: () => fileState.data?.contents,
    getProjectFileQueryAtom: () => query,
  };
});
vi.mock("./fileSaveSessions", () => ({
  useFileSaveSession: () => {},
  changeFileSaveSession: vi.fn(),
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

describe("workspace preview toolbar", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    localStorage.clear();
    localStorage.setItem("t3code.renderMarkdown", "true");
    settings.wordWrap = false;
    fileState.data = { contents: "# Document\n\nPreview contents", truncated: false };
    fileState.error = null;
    fileState.isPending = false;
    clipboard.writeText.mockReset().mockResolvedValue(undefined);
    clipboard.toast.mockReset();
    vi.stubGlobal(
      "navigator",
      Object.create(navigator, { clipboard: { value: { writeText: clipboard.writeText } } }),
    );
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
          openInShortcutEnabled={false}
          folderTrail={undefined}
          onNavigateFolder={() => {}}
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
    const button = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${t.tools.files.wordWrap}"]`,
    );
    if (!button) throw new Error("Word wrap action was not rendered");
    return button;
  }

  /** Finds a live command by its accessible name; clicking exercises its real disabled behavior. */
  function copyButton(): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${t.tools.files.copyContents}"]`,
    );
    if (!button) throw new Error("Copy action was not rendered");
    return button;
  }

  it("toggles the explorer from the header and restores its saved state after reopening", async () => {
    await openFile("README.md");
    const hide = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${t.tools.files.hideExplorer}"]`,
    );
    expect(hide).not.toBeNull();
    expect(host.querySelector("aside")).not.toBeNull();
    expect(hide!.getAttribute("aria-pressed")).toBe("true");
    await act(() => hide!.click());
    expect(host.querySelector("aside")).toBeNull();
    expect(localStorage.getItem("t3code.fileExplorerOpen")).toBe("false");
    await act(() => root.unmount());
    root = createRoot(host);
    await openFile("README.md");
    expect(host.querySelector("aside")).toBeNull();
    const show = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${t.tools.files.showExplorer}"]`,
    );
    expect(show).not.toBeNull();
    expect(show!.getAttribute("aria-pressed")).toBe("false");
    await act(() => show!.click());
    expect(host.querySelector("aside")).not.toBeNull();
    expect(localStorage.getItem("t3code.fileExplorerOpen")).toBe("true");
  });

  it("copies the current text after an update and reports success", async () => {
    await openFile("README.md");
    fileState.data = { contents: "Updated text\nwith a second line", truncated: false };
    await openFile("README.md");
    await act(() => copyButton().click());
    expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith("Updated text\nwith a second line");
    expect(clipboard.toast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", title: t.tools.files.copied }),
    );
    expect(host.querySelector('button[aria-label="Save file"]')).toBeNull();
  });

  it("reports a clipboard failure without a success toast", async () => {
    clipboard.writeText.mockRejectedValue(new Error("Clipboard denied"));
    await openFile("README.md");
    await act(() => copyButton().click());
    expect(clipboard.toast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "error" }),
    );
  });

  it.each([
    { name: "loading", path: "README.md", contents: "Stale contents", pending: true, error: null },
    {
      name: "failed read",
      path: "README.md",
      contents: "Stale contents",
      pending: false,
      error: "Read failed",
    },
    { name: "binary", path: "data.bin", contents: null, pending: false, error: "Binary file" },
    { name: "image", path: "image.png", contents: "Not text", pending: false, error: null },
    { name: "empty text", path: "empty.txt", contents: "", pending: false, error: null },
  ])(
    "does not copy when $name has no available text",
    async ({ path, contents, pending, error }) => {
      await openFile("README.md");
      expect(copyButton().disabled).toBe(false);
      fileState.data = contents === null ? null : { contents, truncated: false };
      fileState.isPending = pending;
      fileState.error = error;
      await openFile(path);
      expect(copyButton().disabled).toBe(true);
      await act(() => copyButton().click());
      expect(clipboard.writeText).not.toHaveBeenCalled();
      expect(clipboard.toast).not.toHaveBeenCalled();
    },
  );

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

  it("toggles only this preview after switching from rendered Markdown to source", async () => {
    await openFile("README.md");
    const source = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === t.tools.files.sourceTab,
    );
    if (!source) throw new Error("Source mode action was not rendered");
    await act(() => source.click());
    const button = wrapButton();
    expect(button.disabled).toBe(false);
    await act(() => button.click());
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(settings.wordWrap).toBe(false);
    expect(settings.update).not.toHaveBeenCalled();
  });
});
