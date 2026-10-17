// @vitest-environment jsdom
/** Existing behavior snapshot, not a new requirement: details still opens through its popover handle. */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { Popover, PopoverCreateHandle, PopoverPopup } from "../ui/popover";
import { PanelLayoutControls } from "./PanelLayoutControls";

/** Uses the same external handle and controlled visibility as the chat's details popover. */
function DetailsPopoverFixture() {
  const [open, setOpen] = useState(false);
  const [handle] = useState(PopoverCreateHandle);
  return (
    <>
      <PanelLayoutControls
        terminalAvailable={false}
        terminalOpen={false}
        terminalShortcutLabel="Ctrl+J"
        threadPanelOpen={open}
        threadPanelPresentation="popover"
        threadPanelPopoverHandle={handle}
        threadPanelShortcutLabel="Ctrl+Shift+B"
        rightPanelAvailable={false}
        rightPanelOpen={false}
        rightPanelShortcutLabel="Ctrl+Alt+B"
        onToggleTerminal={() => {}}
        onToggleThreadPanel={() => setOpen((value) => !value)}
        onToggleRightPanel={() => {}}
      />
      <Popover handle={handle} open={open} onOpenChange={setOpen}>
        <PopoverPopup aria-label="Thread details">Thread details content</PopoverPopup>
      </Popover>
    </>
  );
}

describe("panel layout details popover", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("opens details from the well and closes it with Escape, restoring the toggle state", async () => {
    await act(async () => root.render(<DetailsPopoverFixture />));
    const details = container.querySelector<HTMLButtonElement>("button[aria-haspopup='dialog']")!;
    expect(details.getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector("[role='dialog']")).toBeNull();

    await act(async () => details.click());
    const dialog = document.querySelector<HTMLElement>("[role='dialog']")!;
    expect(dialog.textContent).toBe("Thread details content");
    expect(details.getAttribute("aria-pressed")).toBe("true");

    await act(async () =>
      dialog.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })),
    );
    expect(document.querySelector("[role='dialog']")).toBeNull();
    expect(details.getAttribute("aria-pressed")).toBe("false");
  });
});
