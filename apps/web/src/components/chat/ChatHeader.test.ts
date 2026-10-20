/**
 * Tests rename rules and observable titlebar interactions; ignores visual class implementation.
 * @vitest-environment jsdom
 */
import { act, createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, vi } from "vite-plus/test";
import type { useThreadActionMenu } from "~/hooks/useThreadActionMenu";
import { TitlebarSlotOutlet, TitlebarSlotProvider } from "../frame/titlebarSlot";
import { chat as englishChat } from "../../i18n/locales/en/chat";
import { chat as chineseChat } from "../../i18n/locales/zh-CN/chat";

const commands = vi.hoisted(() => ({
  update: vi.fn().mockResolvedValue({ _tag: "Success" }),
  toast: vi.fn(),
}));
vi.mock("../../state/use-orchestration-command", () => ({
  useOrchestrationCommand: () => commands.update,
}));
vi.mock("../../state/session", () => ({
  useEnvironmentScope: () => true,
  readEnvironmentScope: () => true,
}));
vi.mock("../../hooks/useSettings", () => ({ useClientSettings: () => "Arial" }));
vi.mock("../ProjectFavicon", () => ({ ProjectFavicon: () => null }));
vi.mock("../ui/toast", () => ({ toastManager: { add: commands.toast } }));
// Keep real menu rows and portals; isolate the server-backed action model and commands.
vi.mock("~/hooks/useThreadActionMenu", () => ({
  useThreadActionMenu: (input: Parameters<typeof useThreadActionMenu>[0]) => ({
    openMenu: (position: { x: number; y: number }) => {
      void input.menuPresenter
        .show([{ id: "rename", label: "Rename thread", icon: "pencil" }], position)
        .then((action) => {
          if (action === "rename") input.onStartRename();
        });
    },
    closeMenu: () => input.menuPresenter.close(),
  }),
}));
import { describe, expect, it } from "vite-plus/test";
import { ChatHeader, resolveRenameCommit } from "./ChatHeader";
import { buildTitlebarThreadMenuItems } from "./ChatHeader.logic";

describe("resolveRenameCommit", () => {
  it("commits a trimmed changed title", () => {
    expect(resolveRenameCommit({ title: "  New title ", originalTitle: "Old" })).toEqual({
      action: "commit",
      title: "New title",
    });
  });

  it("rejects empty and whitespace-only titles", () => {
    expect(resolveRenameCommit({ title: "   ", originalTitle: "Old" })).toEqual({
      action: "reject-empty",
    });
  });

  it("no-ops when the trimmed title is unchanged", () => {
    expect(resolveRenameCommit({ title: " Old ", originalTitle: "Old" })).toEqual({
      action: "noop",
    });
  });
});

describe("chat titlebar interactions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    commands.update.mockClear();
    commands.toast.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  /** Mounts the real slot provider and outlets so assertions exercise route-to-chrome ownership. */
  async function renderRoute(showChat = true, isServerThread = true) {
    await act(async () =>
      root.render(
        createElement(
          TitlebarSlotProvider,
          null,
          createElement(
            "header",
            { "data-window-titlebar": "" },
            createElement(TitlebarSlotOutlet, { name: "breadcrumb" }),
            createElement(TitlebarSlotOutlet, { name: "actions" }),
          ),
          createElement(
            "main",
            null,
            showChat
              ? createElement(ChatHeader, {
                  activeThreadEnvironmentId: EnvironmentId.make("local"),
                  activeThreadId: ThreadId.make("thread-1"),
                  activeThreadTitle: "Original title",
                  isServerThread,
                  activeProject: isServerThread
                    ? null
                    : {
                        id: ProjectId.make("project-1"),
                        environmentId: EnvironmentId.make("local"),
                        title: "Project",
                        workspaceRoot: "F:/project",
                        repositoryIdentity: null,
                        defaultModelSelection: null,
                        scripts: [],
                        createdAt: "2026-01-01T00:00:00Z",
                        updatedAt: "2026-01-01T00:00:00Z",
                      },
                  parentThreadLink: null,
                  onOpenThread: vi.fn(),
                  onNewThreadInProject: vi.fn(),
                  popoverAnchorRef: createRef<HTMLElement>(),
                  actions: createElement("button", null, "Existing panel control"),
                })
              : null,
          ),
        ),
      ),
    );
  }

  it("publishes both slots and releases them when the chat route leaves", async () => {
    await renderRoute();
    expect(container.querySelector('[data-titlebar-slot="breadcrumb"]')?.textContent).toBe(
      "Original title",
    );
    expect(container.querySelector('[data-titlebar-slot="actions"]')?.textContent).toBe(
      "Existing panel control",
    );
    expect(container.querySelector("main")?.textContent).toBe("");
    await renderRoute(false);
    expect(container.querySelector('[data-titlebar-slot="breadcrumb"]')?.textContent).toBe("");
    expect(container.querySelector('[data-titlebar-slot="actions"]')?.textContent).toBe("");
  });

  it("shows the project and panel actions on a draft route and restores thread chrome when opening a thread", async () => {
    await renderRoute(true, false);
    expect(container.querySelector('[data-titlebar-slot="breadcrumb"]')?.textContent).toBe(
      "Project",
    );
    expect(container.querySelector('[data-titlebar-slot="actions"]')?.textContent).toBe(
      "Existing panel control",
    );
    await renderRoute();
    expect(container.querySelector('[data-titlebar-slot="breadcrumb"]')?.textContent).toBe(
      "Original title",
    );
    expect(container.querySelector('[data-titlebar-slot="actions"]')?.textContent).toBe(
      "Existing panel control",
    );
  });

  it("opens a DOM menu on a single click and commits a trimmed rename on double click", async () => {
    await renderRoute();
    const title = container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
    await act(async () =>
      title.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })),
    );
    expect(document.querySelector('[role="menuitem"]')?.textContent).toBe("Rename thread");
    await act(async () => {
      title.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));
      title.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, detail: 2 }));
    });
    const input = container.querySelector(
      '[data-titlebar-slot="breadcrumb"] input',
    ) as HTMLInputElement;
    expect(input.value).toBe("Original title");
    input.value = "  Updated title  ";
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })),
    );
    expect(commands.update).toHaveBeenCalledExactlyOnceWith({
      environmentId: "local",
      input: { threadId: "thread-1", title: "Updated title" },
    });
    expect(container.querySelector("input")).toBeNull();
    expect(document.activeElement?.textContent).toBe("Original title");
  });

  it("opens from the no-drag title slot and starts rename from the menu; Escape discards it", async () => {
    await renderRoute();
    await act(async () =>
      container
        .querySelector('[data-titlebar-slot="breadcrumb"]')!
        .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
    );
    const rename = document.querySelector('[role="menuitem"]')!;
    expect(rename.textContent).toBe("Rename thread");
    await act(async () => rename.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const input = container.querySelector("input")!;
    input.value = "Discard this title";
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })),
    );
    expect(container.querySelector("input")).toBeNull();
    expect(commands.update).not.toHaveBeenCalled();
    expect(container.querySelector('[data-titlebar-slot="breadcrumb"]')?.textContent).toBe(
      "Original title",
    );
  });

  it("rejects a whitespace-only inline rename with a warning and no mutation", async () => {
    await renderRoute();
    await act(async () =>
      container
        .querySelector('button[aria-haspopup="menu"]')!
        .dispatchEvent(new MouseEvent("dblclick", { bubbles: true, detail: 2 })),
    );
    const input = container.querySelector("input")!;
    input.value = "   ";
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })),
    );
    expect(commands.update).not.toHaveBeenCalled();
    expect(commands.toast).toHaveBeenCalledExactlyOnceWith({
      type: "warning",
      title: "Thread title cannot be empty",
    });
  });
});

it.each([
  {
    locale: "en",
    messages: englishChat.header,
    expected: ["Copy path", "Copy branch", "Copy thread ID"],
  },
  {
    locale: "zh-CN",
    messages: chineseChat.header,
    expected: ["复制路径", "复制分支", "复制对话ID"],
  },
])(
  "uses standalone clipboard action labels in $locale without changing availability",
  ({ messages, expected }) => {
    const result = buildTitlebarThreadMenuItems(
      [
        {
          id: "copy",
          label: "Copy",
          children: [
            { id: "copy-path", label: "Path", icon: "folder" },
            { id: "copy-branch", label: "Branch", disabled: true, icon: "git-branch" },
            { id: "copy-thread-id", label: "Thread ID", icon: "hash" },
          ],
        },
      ],
      {
        "copy-path": messages.copyPath,
        "copy-branch": messages.copyBranch,
        "copy-thread-id": messages.copyThreadId,
      },
    );
    expect(result.map(({ label }) => label)).toEqual(expected);
    expect(result.map(({ id, disabled, icon }) => ({ id, disabled, icon }))).toEqual([
      { id: "copy-path", disabled: undefined, icon: "folder" },
      { id: "copy-branch", disabled: true, icon: "git-branch" },
      { id: "copy-thread-id", disabled: undefined, icon: "hash" },
    ]);
  },
);

it("groups existing commands like V2 while preserving disabled commands and checked submenus", () => {
  const choices = [{ id: "auto-settle:enabled" as const, label: "Enabled", checked: true }];
  const result = buildTitlebarThreadMenuItems(
    [
      { id: "new-thread-on-branch", label: "New on branch" },
      { id: "pin", label: "Pin", disabled: true },
      { id: "rename", label: "Rename", separatorBefore: true },
      { id: "auto-settle", label: "Auto settle", children: choices },
      {
        id: "copy",
        label: "Copy",
        children: [
          { id: "copy-path", label: "Path" },
          { id: "copy-thread-id", label: "ID" },
        ],
      },
      { id: "delete", label: "Delete", destructive: true },
    ],
    {
      "copy-path": englishChat.header.copyPath,
      "copy-branch": englishChat.header.copyBranch,
      "copy-thread-id": englishChat.header.copyThreadId,
    },
  );
  expect(result.map(({ id, separatorBefore }) => ({ id, separatorBefore }))).toEqual([
    { id: "rename", separatorBefore: false },
    { id: "pin", separatorBefore: true },
    { id: "copy-path", separatorBefore: true },
    { id: "copy-thread-id", separatorBefore: false },
    { id: "new-thread-on-branch", separatorBefore: true },
    { id: "auto-settle", separatorBefore: false },
    { id: "delete", separatorBefore: true },
  ]);
  expect(result[1]).toMatchObject({ label: "Pin", disabled: true });
  expect(result[5]?.children).toBe(choices);
  expect(result[6]).toMatchObject({ label: "Delete", destructive: true });
});
