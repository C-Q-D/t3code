/**
 * Verifies Dock presence follows rendered notices and badges across updates and boundaries.
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { ComposerBanner } from "./ComposerBanner";
import { ComposerBannerStack } from "./ComposerBannerStack";
import { ComposerTasksBadge, ComposerTasksDrawer } from "./ComposerTasksBadge";

/** Uses the actual inline badge, including its zero-task early return. */
function badge(totalSteps: number) {
  return (
    <ComposerTasksBadge
      expanded={false}
      onToggle={() => {}}
      placement="inline"
      progress={{ step: "Task", completedSteps: 0, totalSteps }}
      steps={[]}
    />
  );
}

it.each(["standard", "custom"] as const)(
  "tracks %s notices and untyped inline badges through removal and Dock isolation",
  async (kind) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const notice =
      kind === "standard"
        ? { id: "notice", variant: "info" as const, icon: null, title: "Notice" }
        : { id: "notice", variant: "info" as const, content: "Notice" };
    const content = (showNotice: boolean, total: number, outside = false) => (
      <>
        <ComposerBanner.Dock>
          <ComposerBannerStack items={showNotice ? [notice] : []} />
          <ComposerBanner.Attachment>{badge(total)}</ComposerBanner.Attachment>
        </ComposerBanner.Dock>
        <ComposerBanner.Dock />
        {outside ? badge(1) : null}
      </>
    );
    const states = () =>
      [...container.querySelectorAll("[data-empty]")].map((dock) => [
        dock.getAttribute("data-has-notice"),
        dock.getAttribute("data-has-tasks"),
      ]);
    try {
      await act(async () => root.render(content(false, 0)));
      expect(states()).toEqual([
        ["false", "false"],
        ["false", "false"],
      ]);
      await act(async () => root.render(content(false, 1)));
      expect(container.querySelectorAll(".composer-tasks-badge")).toHaveLength(1);
      expect(states()).toEqual([
        ["false", "true"],
        ["false", "false"],
      ]);
      await act(async () => root.render(content(true, 1)));
      expect(states()).toEqual([
        ["true", "true"],
        ["false", "false"],
      ]);
      await act(async () => root.render(content(false, 1)));
      expect(states()).toEqual([
        ["false", "true"],
        ["false", "false"],
      ]);
      await act(async () => root.render(content(true, 0)));
      expect(container.querySelector(".composer-tasks-badge")).toBeNull();
      expect(states()).toEqual([
        ["true", "false"],
        ["false", "false"],
      ]);
      await act(async () => root.render(content(false, 0, true)));
      expect(container.querySelectorAll(".composer-tasks-badge")).toHaveLength(1);
      expect(states()).toEqual([
        ["false", "false"],
        ["false", "false"],
      ]);
      await act(async () => root.render(content(false, 0)));
      expect(states()).toEqual([
        ["false", "false"],
        ["false", "false"],
      ]);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  },
);

it("does not register a zero-task drawer and clears presence when its badge becomes empty", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const content = (totalSteps: number): ReactNode => (
    <ComposerBanner.Dock>
      <ComposerTasksDrawer
        onCollapse={() => {}}
        progress={{ step: "Task", completedSteps: 0, totalSteps }}
        steps={[]}
      />
    </ComposerBanner.Dock>
  );
  try {
    for (const total of [0, 1, 0]) {
      await act(async () => root.render(content(total)));
      expect(container.querySelectorAll(".composer-tasks-badge")).toHaveLength(total);
      expect(container.querySelector("[data-empty]")?.getAttribute("data-has-tasks")).toBe(
        total === 1 ? "true" : "false",
      );
    }
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
