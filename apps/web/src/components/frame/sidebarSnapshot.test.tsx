/**
 * Verifies panel snapshots against real sidebar state, without layout or class assertions.
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { SidebarProvider, useSidebar } from "../ui/sidebar";

let container: HTMLDivElement;
let root: Root;

/** Exposes visibility and the future panel actions through ordinary user events. */
function Controls() {
  const { open, openMobile, setOpen, setOpenMobile, saveSidebarState, restoreSidebarState } =
    useSidebar();
  return (
    <>
      <output>{`${open}/${openMobile}`}</output>
      <button onClick={saveSidebarState}>save</button>
      <button onClick={restoreSidebarState}>restore</button>
      <button onClick={() => void setOpen(!open)}>desktop</button>
      <button onClick={() => setOpenMobile(!openMobile)}>drawer</button>
    </>
  );
}

/** Dispatches a named control and waits for the resulting React state commit. */
async function click(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (element) => element.textContent === label,
  );
  if (!button) throw new Error(`Missing ${label} control`);
  await act(() => button.click());
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal("cookieStore", { set: vi.fn().mockResolvedValue(undefined) });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("sidebar visibility before a right panel opens", () => {
  it("restores the first snapshot of both modes and consumes it after restoring", async () => {
    await act(() =>
      root.render(
        <SidebarProvider>
          <Controls />
        </SidebarProvider>,
      ),
    );
    await click("drawer");
    await click("save");
    expect(cookieStore.set).not.toHaveBeenCalled();
    await click("desktop");
    await click("drawer");
    await click("save");
    expect(container.querySelector("output")?.textContent).toBe("false/false");
    await click("restore");
    expect(container.querySelector("output")?.textContent).toBe("true/true");
    await click("desktop");
    await click("restore");
    expect(container.querySelector("output")?.textContent).toBe("false/true");
  });

  it("keeps a previously closed sidebar closed and does nothing without a snapshot", async () => {
    await act(() =>
      root.render(
        <SidebarProvider defaultOpen={false}>
          <Controls />
        </SidebarProvider>,
      ),
    );
    await click("restore");
    expect(container.querySelector("output")?.textContent).toBe("false/false");
    expect(cookieStore.set).not.toHaveBeenCalled();
    await click("save");
    await click("desktop");
    await click("restore");
    expect(container.querySelector("output")?.textContent).toBe("false/false");
  });
});
