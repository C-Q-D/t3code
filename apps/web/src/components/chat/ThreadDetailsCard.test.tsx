/**
 * Verifies scoped card visibility, overlapping collapse ownership, and overlay dismissal.
 * @vitest-environment jsdom
 */

import { EnvironmentId, ThreadId, type ScopedThreadRef } from "@t3tools/contracts";
import { act, useState } from "react";
import { ThreadDetailsSection } from "./ThreadDetailsSection";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useRightPanelStore, selectThreadPanelVisibility } from "../../rightPanelStore";
import { PopoverCreateHandle } from "../ui/popover";
import { ChatCanvasContext } from "./ChatCanvasContext";
import { ThreadDetailsCard, collapseThreadDetailsCard } from "./ThreadDetailsCard";

vi.mock("../ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => children,
}));

const threadRef = {
  environmentId: EnvironmentId.make("details-test"),
  threadId: ThreadId.make("thread"),
} satisfies ScopedThreadRef;
const otherThreadRef = { ...threadRef, threadId: ThreadId.make("other") };
/** Reads the effective visibility for a scoped test thread, including store defaults. */
const visibility = (ref = threadRef) =>
  selectThreadPanelVisibility(useRightPanelStore.getState().threadPanelVisibilityByThreadKey, ref);
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useRightPanelStore.setState({ threadPanelVisibilityByThreadKey: {} });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it.each([true, false])(
  "collapses both presentations and restores their previous visibility (%s)",
  async (popoverOpen) => {
    useRightPanelStore.getState().setThreadPanelOpen(threadRef, "popover", popoverOpen);
    const before = visibility();
    const otherBefore = visibility(otherThreadRef);
    const restore = collapseThreadDetailsCard(threadRef);
    expect(visibility()).toEqual({ inlineOpen: false, popoverOpen: false });
    expect(visibility(otherThreadRef)).toEqual(otherBefore);
    restore();
    expect(visibility()).toEqual(before);
    useRightPanelStore.getState().setThreadPanelOpen(threadRef, "inline", false);
    restore();
    expect(visibility().inlineOpen).toBe(false);
  },
);

it("removes the visible card while collapsed and renders it again on restore", async () => {
  await act(async () => {
    root.render(
      <ChatCanvasContext
        value={{
          container: { width: 1600, height: 900 },
          lane: { padding: 48, minChatWidth: 640 },
          layout: { frame: null, overlapsDetailsCard: false } as NonNullable<
            React.ContextType<typeof ChatCanvasContext>
          >["layout"],
          previewKey: null,
          resolvePreviewFrame: () => null,
          reportPreview: vi.fn(),
          clearPreview: vi.fn(),
          registerTimeline: vi.fn(),
          reportDetailsCard: vi.fn(),
          detailsCardTopInset: 0,
        }}
      >
        <ThreadDetailsCard
          threadRef={threadRef}
          anchor={{ current: null }}
          handle={PopoverCreateHandle()}
          onPresentationChange={vi.fn()}
        >
          {() => <p>Workspace controls</p>}
        </ThreadDetailsCard>
      </ChatCanvasContext>,
    );
  });
  expect(container.textContent).toContain("Workspace controls");
  let restore!: () => void;
  await act(async () => {
    restore = collapseThreadDetailsCard(threadRef);
  });
  expect(container.textContent).not.toContain("Workspace controls");
  await act(async () => restore());
  expect(container.textContent).toContain("Workspace controls");
});

it.each(["Escape", "outside press"])(
  "opens a full-content overlay on demand and dismisses it with %s",
  async (dismissal) => {
    const anchor = document.createElement("header");
    document.body.append(anchor);
    try {
      await act(async () => {
        root.render(
          <ChatCanvasContext
            value={{
              container: { width: 924, height: 700 },
              lane: { padding: 48, minChatWidth: 640 },
              layout: { frame: null, overlapsDetailsCard: false } as NonNullable<
                React.ContextType<typeof ChatCanvasContext>
              >["layout"],
              previewKey: null,
              resolvePreviewFrame: () => null,
              reportPreview: vi.fn(),
              clearPreview: vi.fn(),
              registerTimeline: vi.fn(),
              reportDetailsCard: vi.fn(),
              detailsCardTopInset: 0,
            }}
          >
            <ThreadDetailsCard
              threadRef={threadRef}
              anchor={{ current: anchor }}
              handle={PopoverCreateHandle()}
              onPresentationChange={vi.fn()}
            >
              {(density) => <p>Workspace controls: {density}</p>}
            </ThreadDetailsCard>
          </ChatCanvasContext>,
        );
      });
      expect(document.body.textContent).not.toContain("Workspace controls");
      expect(container.querySelector("[data-thread-details-scrim]")).toBeNull();
      await act(async () =>
        useRightPanelStore.getState().setThreadPanelOpen(threadRef, "popover", true),
      );
      expect(document.body.textContent).toContain("Workspace controls: full");
      expect(container.querySelector("[data-thread-details-scrim]")).not.toBeNull();
      await act(async () => {
        if (dismissal === "Escape") {
          document
            .querySelector<HTMLElement>('[data-slot="popover-popup"]')!
            .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        } else {
          const scrim = container.querySelector<HTMLElement>("[data-thread-details-scrim]")!;
          scrim.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          scrim.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
          scrim.click();
        }
      });
      expect(visibility().popoverOpen).toBe(false);
      expect(container.querySelector("[data-thread-details-scrim]")).toBeNull();
    } finally {
      anchor.remove();
    }
  },
);

it.each([false, true])(
  "restores the original state only after both collapse owners release (reverse=%s)",
  (reverse) => {
    useRightPanelStore.getState().setThreadPanelOpen(threadRef, "popover", true);
    const original = visibility();
    const releases = [
      collapseThreadDetailsCard(threadRef),
      collapseThreadDetailsCard({ ...threadRef }),
    ];
    if (reverse) releases.reverse();
    const [first, last] = releases;
    try {
      first!();
      expect(visibility()).toEqual({ inlineOpen: false, popoverOpen: false });
      first!();
      expect(visibility()).toEqual({ inlineOpen: false, popoverOpen: false });
      last!();
      expect(visibility()).toEqual(original);
    } finally {
      releases.forEach((release) => release());
    }
  },
);

it("marks a section empty when nested content returns null and restores it when content appears", async () => {
  /** Keeps the section mounted while an optional child changes its rendered content. */
  function OptionalSection() {
    const [visible, setVisible] = useState(false);
    return (
      <>
        <button data-toggle onClick={() => setVisible(!visible)}>
          Toggle content
        </button>
        <ThreadDetailsSection headingId="optional-git" title="Git">
          <div className="flex flex-col gap-3">{visible ? <button>Git action</button> : null}</div>
        </ThreadDetailsSection>
      </>
    );
  }
  await act(async () => root.render(<OptionalSection />));
  const toggle = container.querySelector<HTMLButtonElement>("[data-toggle]")!;
  const section = container.querySelector("section")!;
  expect.soft(section.dataset.empty).toBe("true");
  await act(async () => toggle.click());
  expect(section.dataset.empty).toBe("false");
  expect(section.querySelector("button")?.textContent).toBe("Git action");
  await act(async () => toggle.click());
  expect(section.dataset.empty).toBe("true");
});
