/** @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  type ReplyRewriteSettings as Settings,
} from "@t3tools/contracts";
import { t } from "~/i18n";
import { ReplyRewriteSettings } from "./ReplyRewriteSettings";

const dependencies = vi.hoisted(() => ({
  scope: vi.fn(),
  settings: vi.fn(),
  allowed: vi.fn(),
  update: vi.fn(),
  grants: vi.fn(),
  subscribe: vi.fn(),
}));
vi.mock("./SettingsScopeContext", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useSettingsScope: () => useSyncExternalStore(dependencies.subscribe, dependencies.scope),
  };
});
vi.mock("./useScopedSettings", () => ({
  useScopedSettings: dependencies.settings,
  useScopedSettingsWriteAllowed: dependencies.allowed,
  useUpdateScopedSettings: () => dependencies.update,
}));
vi.mock("~/state/session", () => ({ useEnvironmentsWithScope: dependencies.grants }));
vi.mock("./settingsLayout", () => ({
  SettingsSection: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  SettingsRow: ({ children, control }: { children?: ReactNode; control?: ReactNode }) => (
    <div>
      {control}
      {children}
    </div>
  ),
}));

function setup() {
  for (const mock of Object.values(dependencies)) mock.mockReset();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let selected = "A";
  let settings = DEFAULT_SERVER_SETTINGS.replyRewrite;
  let online = true;
  const listeners = new Set<() => void>();
  dependencies.subscribe.mockImplementation((listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  });
  const writes: { environmentId: string; patch: unknown }[] = [];
  const render = async (
    changes: { selected?: string; settings?: Settings; online?: boolean } = {},
  ) => {
    selected = changes.selected ?? selected;
    settings = changes.settings ?? settings;
    online = changes.online ?? online;
    const environmentId = EnvironmentId.make(selected);
    dependencies.scope.mockReturnValue({
      search: { machine: selected },
      scope: { kind: "environment", environmentId, environmentIds: [environmentId] },
      targets: online
        ? [{ environmentId, settings: { ...DEFAULT_SERVER_SETTINGS, replyRewrite: settings } }]
        : [],
      connectedEnvironments: online ? [{ environmentId }] : [],
    });
    dependencies.settings.mockImplementation(
      (select: (settings: typeof DEFAULT_SERVER_SETTINGS) => unknown) =>
        select({ ...DEFAULT_SERVER_SETTINGS, replyRewrite: settings }),
    );
    dependencies.allowed.mockReturnValue(online);
    dependencies.grants.mockReturnValue(new Set(online ? [environmentId] : []));
    dependencies.update.mockImplementation(async (patch: unknown) => {
      writes.push({ environmentId: selected, patch });
    });
    await act(async () => {
      for (const listener of listeners) listener();
      root.render(<ReplyRewriteSettings />);
    });
  };
  const input = (label: string) => {
    const node = [
      ...host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input,textarea"),
    ].find((element) => element.getAttribute("aria-label") === label);
    if (!node) throw new Error(`Missing input ${label}`);
    return node;
  };
  const edit = async (label: string, value: string) => {
    const node = input(label);
    await act(async () => {
      node.focus();
      const prototype =
        node instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(node, value);
      node.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return node;
  };
  const click = async (text: string) => {
    const button = [...host.querySelectorAll("button")].find((node) => node.textContent === text);
    if (!button) throw new Error(`Missing button ${text}`);
    await act(async () => button.click());
  };
  return {
    host,
    render,
    input,
    edit,
    click,
    writes,
    async [Symbol.asyncDispose]() {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    },
  };
}

it("keeps a prompt draft through disconnect and reconnect", async () => {
  await using h = setup();
  await h.render();
  await h.edit(t.settings.replyRewrite.prompt, "  Local draft\nsecond line  ");
  await h.render({ online: false });
  expect(h.input(t.settings.replyRewrite.prompt).value).toBe("  Local draft\nsecond line  ");
  await h.render({ online: true });
  expect(h.input(t.settings.replyRewrite.prompt).value).toBe("  Local draft\nsecond line  ");
  await h.click(t.settings.replyRewrite.save);
  expect(h.writes).toEqual([
    {
      environmentId: "A",
      patch: { replyRewrite: { customPrompt: "  Local draft\nsecond line  " } },
    },
  ]);
});

it.each(["modelId", "provider", "binaryPath"] as const)(
  "preserves a focused %s draft when the saved value changes",
  async (field) => {
    await using h = setup();
    await h.render();
    const node = await h.edit(t.settings.replyRewrite.fields[field], "local-value");
    await h.render({
      settings: { ...DEFAULT_SERVER_SETTINGS.replyRewrite, [field]: "external-value" },
    });
    expect(h.input(t.settings.replyRewrite.fields[field])).toBe(node);
    expect(node.value).toBe("local-value");
    expect(document.activeElement).toBe(node);
    expect(h.host.textContent).toContain(t.settings.replyRewrite.conflict);
    await act(async () => node.blur());
    expect(h.writes).toEqual([]);
  },
);

it("does not carry an environment's draft into another destination", async () => {
  await using h = setup();
  await h.render();
  await h.edit(t.settings.replyRewrite.prompt, "A draft");
  await h.render({ selected: "B" });
  expect(h.input(t.settings.replyRewrite.prompt).value).toBe("");
  await h.edit(t.settings.replyRewrite.prompt, "B draft");
  await h.click(t.settings.replyRewrite.save);
  expect(h.writes).toEqual([
    { environmentId: "B", patch: { replyRewrite: { customPrompt: "B draft" } } },
  ]);
});
