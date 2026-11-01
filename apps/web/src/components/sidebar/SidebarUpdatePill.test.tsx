/**
 * Verifies release-note access and live update status transitions without an animation latch.
 * @vitest-environment jsdom
 */
import type { DesktopUpdateState } from "@t3tools/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vite-plus/test";
import { TooltipProvider } from "../ui/tooltip";

type EnvironmentModule = typeof import("../../env");
const updateInput = vi.hoisted(() => ({ state: null as DesktopUpdateState | null }));
// Only replace service inputs; the update control and its Base UI wrappers stay real.
vi.mock("../../state/desktopUpdate", () => ({ useDesktopUpdateState: () => updateInput.state }));
vi.mock("../../env", async (importOriginal) => ({
  ...(await importOriginal<EnvironmentModule>()),
  isElectron: true,
}));
vi.mock("./useUpdateEverything", () => ({
  useUpdateEverything: () => ({
    hasUpdates: false,
    summary: "",
    lines: [],
    restarts: [],
    skipped: [],
    run: async () => {},
  }),
}));
vi.mock("./updateEverythingRun", () => ({ useUpdateEverythingRun: () => null }));

import {
  handleSidebarUpdateReleaseNotesPopoverOpenChange,
  openSidebarUpdateReleaseNotesPopoverOnForwardTab,
  shouldUseSidebarUpdateReleaseNotesPopover,
  SidebarUpdatePill,
} from "./SidebarUpdatePill";

const nightlyState: DesktopUpdateState = {
  enabled: true,
  status: "available",
  channel: "nightly",
  currentVersion: "0.0.35",
  hostArch: "arm64",
  appArch: "arm64",
  runningUnderArm64Translation: false,
  availableVersion: "0.0.36-nightly.3",
  downloadedVersion: null,
  releaseNotes: [{ version: "0.0.36-nightly.3", items: ["Newest change"], totalItems: 1 }],
  omittedReleaseCount: 0,
  downloadPercent: null,
  checkedAt: null,
  message: null,
  errorContext: null,
  canRetry: false,
};

describe("sidebar update release notes popover", () => {
  it("uses the popover for visible release notes on either channel", () => {
    expect(shouldUseSidebarUpdateReleaseNotesPopover(true, nightlyState)).toBe(true);
    expect(shouldUseSidebarUpdateReleaseNotesPopover(false, nightlyState)).toBe(false);
    expect(
      shouldUseSidebarUpdateReleaseNotesPopover(true, {
        ...nightlyState,
        channel: "latest",
      }),
    ).toBe(true);
    expect(
      shouldUseSidebarUpdateReleaseNotesPopover(true, {
        ...nightlyState,
        releaseNotes: [],
      }),
    ).toBe(false);
  });

  it("cancels trigger presses without canceling other open reasons", () => {
    const cancelTriggerPress = vi.fn();
    const cancelHover = vi.fn();

    handleSidebarUpdateReleaseNotesPopoverOpenChange(true, {
      reason: "trigger-press",
      cancel: cancelTriggerPress,
    });
    handleSidebarUpdateReleaseNotesPopoverOpenChange(true, {
      reason: "trigger-hover",
      cancel: cancelHover,
    });

    expect(cancelTriggerPress).toHaveBeenCalledOnce();
    expect(cancelHover).not.toHaveBeenCalled();
  });

  it("promotes forward Tab without preventing native navigation", () => {
    const open = vi.fn();
    const preventDefault = vi.fn();
    const event = { key: "Tab", shiftKey: false, preventDefault };

    openSidebarUpdateReleaseNotesPopoverOnForwardTab(event, { open }, "nightly-release-notes");

    expect(open).toHaveBeenCalledWith("nightly-release-notes");
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("does not promote backward Tab", () => {
    const open = vi.fn();

    openSidebarUpdateReleaseNotesPopoverOnForwardTab(
      { key: "Tab", shiftKey: true },
      { open },
      "nightly-release-notes",
    );

    expect(open).not.toHaveBeenCalled();
  });
});

it("hides disabled builds and restores available updates when the state changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    updateInput.state = { ...nightlyState, enabled: false, status: "disabled" };
    await act(() =>
      root.render(
        <TooltipProvider>
          <SidebarUpdatePill />
        </TooltipProvider>,
      ),
    );
    expect(container.textContent).toBe("");
    expect(container.querySelector("button")).toBeNull();

    updateInput.state = { ...nightlyState, channel: "latest", releaseNotes: [] };
    await act(() =>
      root.render(
        <TooltipProvider>
          <SidebarUpdatePill />
        </TooltipProvider>,
      ),
    );
    expect(container.querySelector("button")?.textContent).toBe("Update available");
  } finally {
    await act(() => root.unmount());
    container.remove();
    updateInput.state = null;
    vi.unstubAllGlobals();
  }
});

it.each([
  ["available", "Update available"],
  ["up-to-date", "Check for updates"],
  ["error", "Network unavailable"],
] as const)(
  "replaces checking immediately with %s and clears the previous state on recheck",
  async (status, label) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const renderStatus = async (nextStatus: DesktopUpdateState["status"]) => {
      updateInput.state = {
        ...nightlyState,
        channel: "latest",
        releaseNotes: [],
        status: nextStatus,
        availableVersion: nextStatus === "available" ? "0.0.36" : null,
        message: nextStatus === "error" ? "Network unavailable" : null,
        errorContext: nextStatus === "error" ? "check" : null,
        canRetry: true,
      };
      await act(() =>
        root.render(
          <TooltipProvider>
            <SidebarUpdatePill />
          </TooltipProvider>,
        ),
      );
      const button = container.querySelector("button");
      expect(button).not.toBeNull();
      return button!;
    };
    try {
      for (const nextStatus of ["checking", status, "checking", status] as const) {
        const button = await renderStatus(nextStatus);
        const checking = nextStatus === "checking";
        expect(button.textContent).toBe(checking ? "Checking for updates…" : label);
        expect(button.getAttribute("aria-disabled") === "true").toBe(checking);
        if (checking) expect(button.textContent).not.toContain(label);
        else expect(button.textContent).not.toContain("Checking for updates…");
      }
    } finally {
      await act(() => root.unmount());
      container.remove();
      updateInput.state = null;
      vi.unstubAllGlobals();
    }
  },
);
