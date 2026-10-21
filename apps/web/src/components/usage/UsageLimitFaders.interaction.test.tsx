/**
 * Mounts real quota cards and overlays; only settings, session/data sources and the redemption command are substituted.
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";

const state = vi.hoisted(() => ({
  presentations: new Map(),
  allowed: true,
  consume: vi.fn(),
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => state.presentations }));
vi.mock("../../state/presentation", () => ({
  environmentPresentations: { presentationsAtom: null },
}));
vi.mock("../../state/server", () => ({ serverEnvironment: { consumeResetCredit: "consume" } }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.consume }));
vi.mock("../../state/session", () => ({
  useEnvironmentScope: () => state.allowed,
  readEnvironmentScope: () => state.allowed,
}));
vi.mock("../../hooks/useSettings", () => ({
  usePrimarySettings: (select: (settings: { timestampFormat: string }) => unknown) =>
    select({ timestampFormat: "24h" }),
  useClientSettings: (select: (settings: { physicsMotion: "off" }) => unknown) =>
    select({ physicsMotion: "off" }),
  useClientSettingsHydrated: () => true,
}));

import { UsageLimitFaders } from "./UsageLimitFaders";

let root: Root;
let container: HTMLDivElement;

/** Build distinct native accounts with one real quota window and known credit balances. */
function provider(name: string, credits: number): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(name),
    driver: ProviderDriverKind.make("codex"),
    displayName: name,
    enabled: true,
    installed: true,
    status: "ready",
    version: null,
    auth: { status: "authenticated", email: `${name}@example.com`, label: `${name} plan` },
    checkedAt: "2026-10-20T10:00:00Z",
    models: [],
    slashCommands: [],
    skills: [],
    usageLimits: {
      checkedAt: "2026-10-20T10:00:00Z",
      resetCredits: { availableCount: credits },
      windows: [
        {
          id: "session",
          kind: "session",
          label: "Session",
          usedPercent: 40,
          resetsAt: "2026-10-20T14:00:00Z",
        },
      ],
    },
  };
}

/** Supply environment data and rerender without replacing card-local state. */
async function mount(providers: readonly ServerProvider[]) {
  state.presentations = new Map([
    [
      EnvironmentId.make("test"),
      {
        entry: { target: { label: "Desktop" } },
        serverConfig: { providers },
      },
    ],
  ]);
  await act(() =>
    root.render(
      <UsageLimitFaders
        selectedEnvironmentIds={null}
        hiddenProviders={new Set()}
        now={Date.parse("2026-10-20T10:00:00Z")}
      />,
    ),
  );
}

/** Locate a visible action by its complete text, failing if ambiguous or absent. */
function button(text: string, scope: ParentNode = document.body) {
  const matches = [...scope.querySelectorAll<HTMLButtonElement>("button")].filter(
    (element) =>
      element.textContent?.trim() === text && !element.closest("[hidden], [aria-hidden=true]"),
  );
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

/** Dispatch a native click so real React and Base UI event handling runs. */
async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  state.allowed = true;
  state.consume.mockReset();
  state.consume.mockResolvedValue({
    _tag: "Success",
    value: { outcome: "applied", warning: "Reset completed for this account" },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("opens the single-account confirmation before redeeming and keeps its outcome in the provider card", async () => {
  await mount([provider("Alpha", 2)]);
  await click(button("Reset ×2"));
  const dialog = document.querySelector('[role="alertdialog"]');
  expect(dialog?.textContent).toContain("Use a reset credit?");
  expect(state.consume).not.toHaveBeenCalled();
  await click(button("Use credit", dialog!));
  expect(state.consume).toHaveBeenCalledTimes(1);
  expect(state.consume).toHaveBeenCalledWith({
    environmentId: "test",
    input: { instanceId: "Alpha" },
  });
  const card = container.querySelector("section.usage-fader-card")!;
  expect(card.querySelector('[role="status"]')?.textContent).toContain(
    "Reset completed for this account",
  );
});

it("opens the first credited account, switches details, and retains the selected account outcome after closing the popover", async () => {
  await mount([provider("Alpha", 0), provider("Beta", 2), provider("Gamma", 3)]);
  await click(button("Reset ×5"));
  let popup = document.querySelector('[data-slot="popover-popup"]');
  expect(popup).not.toBeNull();
  expect(popup?.querySelector("button[aria-pressed=true]")?.textContent).toBe("Beta");
  expect(popup?.textContent).toContain("Beta plan");
  expect(popup?.textContent).not.toContain("Gamma plan");
  expect(state.consume).not.toHaveBeenCalled();
  await click(button("Gamma", popup!));
  popup = document.querySelector('[data-slot="popover-popup"]');
  expect(popup?.querySelector("button[aria-pressed=true]")?.textContent).toBe("Gamma");
  expect(popup?.textContent).toContain("Gamma plan");
  expect(popup?.textContent).not.toContain("Beta plan");
  await click(button("Use reset", popup!));
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
    "Use a reset credit?",
  );
  expect(state.consume).not.toHaveBeenCalled();
  await click(button("Use credit", document.querySelector('[role="alertdialog"]')!));
  expect(state.consume).toHaveBeenCalledTimes(1);
  expect(state.consume).toHaveBeenCalledWith({
    environmentId: "test",
    input: { instanceId: "Gamma" },
  });
  const card = container.querySelector("section.usage-fader-card")!;
  expect(card.textContent).toContain("Gamma Reset completed for this account");
  await click(button("Reset ×5"));
  await act(() =>
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
  );
  expect(document.querySelector('[data-slot="popover-popup"]')).toBeNull();
  expect(card.textContent).toContain("Gamma Reset completed for this account");
});

it("disables confirmation when permission is revoked after opening it", async () => {
  const accounts = [provider("Alpha", 1)];
  await mount(accounts);
  await click(button("Reset ×1"));
  expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  state.allowed = false;
  await mount(accounts);
  const confirm = button("Use credit", document.querySelector('[role="alertdialog"]')!);
  expect(confirm.disabled).toBe(true);
  await click(confirm);
  expect(state.consume).not.toHaveBeenCalled();
});
