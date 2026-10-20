/**
 * Exercises draft titlebar anchoring with the real details card, visibility store and Base UI positioning.
 * @vitest-environment jsdom
 */
import { act, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { TitlebarSlotOutlet, TitlebarSlotProvider } from "../frame/titlebarSlot";
import { PopoverCreateHandle } from "../ui/popover";
import { ThreadDetailsCard } from "./ThreadDetailsCard";
import { useRightPanelStore } from "../../rightPanelStore";

// Isolate server-backed commands; the header, slot ownership and details rendering stay real.
vi.mock("../../state/use-orchestration-command", () => ({
  useOrchestrationCommand: () => vi.fn(),
}));
vi.mock("../../state/session", () => ({
  useEnvironmentScope: () => true,
  readEnvironmentScope: () => true,
}));
vi.mock("../../hooks/useSettings", () => ({ useClientSettings: () => "Arial" }));
vi.mock("../ProjectFavicon", () => ({ ProjectFavicon: () => null }));
vi.mock("~/hooks/useThreadActionMenu", () => ({
  useThreadActionMenu: () => ({ openMenu: () => {}, closeMenu: () => {} }),
}));
import { ChatHeader } from "./ChatHeader";

/** A draft has no details trigger; its keyboard action uses the same store toggle as ChatView. */
function DraftDetailsFixture() {
  const anchor = useRef<HTMLElement>(null);
  const [handle] = useState(PopoverCreateHandle);
  const [threadRef] = useState(() => ({
    environmentId: EnvironmentId.make("local"),
    threadId: ThreadId.make("draft-1"),
  }));
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key === "B") {
        event.preventDefault();
        useRightPanelStore.getState().toggleThreadPanel(threadRef, "popover");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [threadRef]);
  return (
    <TitlebarSlotProvider>
      <header data-window-titlebar="">
        <TitlebarSlotOutlet name="breadcrumb" />
        <TitlebarSlotOutlet name="actions" />
      </header>
      <ChatHeader
        activeThreadEnvironmentId={threadRef.environmentId}
        activeThreadId={threadRef.threadId}
        activeThreadTitle="New thread"
        isServerThread={false}
        activeProject={null}
        parentThreadLink={null}
        onOpenThread={() => {}}
        onNewThreadInProject={() => {}}
        popoverAnchorRef={anchor}
        actions={<button type="button">Draft panel controls</button>}
      />
      <ThreadDetailsCard
        anchor={anchor}
        handle={handle}
        threadRef={threadRef}
        onPresentationChange={() => {}}
      >
        {() => "Draft details content"}
      </ThreadDetailsCard>
    </TitlebarSlotProvider>
  );
}

let container: HTMLDivElement;
let root: Root;

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
  useRightPanelStore.setState({ threadPanelVisibilityByThreadKey: {} });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("positions visible draft details on the titlebar when opened by keyboard", async () => {
  await act(async () => root.render(<DraftDetailsFixture />));
  // jsdom has no layout engine; only supply the header geometry,
  // leaving reference selection and floating positioning unmocked.
  const header = container.querySelector("header")!;
  vi.spyOn(header, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 48));
  // Drafts publish the panel well too; the keyboard path still anchors to the full titlebar.
  expect(container.querySelector('[data-titlebar-slot="actions"] button')?.textContent).toBe(
    "Draft panel controls",
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "B", ctrlKey: true, shiftKey: true, bubbles: true }),
    ),
  );
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog?.textContent).toBe("Draft details content");
  const positioner = dialog.closest<HTMLElement>('[data-slot="popover-positioner"]')!;
  expect(getComputedStyle(positioner).opacity).not.toBe("0");
  expect(positioner.style.getPropertyValue("--anchor-width")).toBe("800px");
  expect(getComputedStyle(dialog).visibility).toBe("visible");
  await act(async () =>
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
