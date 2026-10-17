// @vitest-environment jsdom
/** Exercises real route portals and ownership transitions, without styling assertions. */
import { act, createContext, StrictMode, useContext, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { TitlebarSlotOutlet, TitlebarSlotProvider, useTitlebarSlot } from "./titlebarSlot";

let container: HTMLDivElement;
let root: Root;
const RouteTitle = createContext("Outside route");

/** Reads the route context inside the portal, rather than capturing it before portaling. */
function BreadcrumbTitle() {
  return useContext(RouteTitle);
}

/** Supplies live route state so a portal that only copies the initial content fails. */
function Route({ title, actions }: { title: string; actions?: ReactNode }) {
  const [count, setCount] = useState(0);
  const titlebar = useTitlebarSlot({
    breadcrumb: (
      <button onClick={() => setCount(count + 1)}>
        <BreadcrumbTitle />: {count}
      </button>
    ),
    actions,
  });
  return <RouteTitle value={title}>{titlebar}</RouteTitle>;
}

/** Mounts both owners in one commit to exercise the documented effect-order tie break. */
function NestedRoutes() {
  const titlebar = useTitlebarSlot({ breadcrumb: "Parent title" });
  return (
    <>
      {titlebar}
      <Route title="Child" />
    </>
  );
}

/** Keeps destinations mounted while route providers change. */
function Shell({ children }: { children?: ReactNode }) {
  return (
    <StrictMode>
      <TitlebarSlotProvider>
        <TitlebarSlotOutlet name="breadcrumb" />
        <TitlebarSlotOutlet name="actions" />
        <main>{children}</main>
      </TitlebarSlotProvider>
    </StrictMode>
  );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("titlebar route slots", () => {
  it("renders live route content into both destinations", async () => {
    await act(() =>
      root.render(
        <Shell>
          <Route title="Thread" actions="Open terminal" />
        </Shell>,
      ),
    );
    expect(container.querySelector('[data-titlebar-slot="breadcrumb"]')?.textContent).toBe(
      "Thread: 0",
    );
    expect(container.querySelector('[data-titlebar-slot="actions"]')?.textContent).toBe(
      "Open terminal",
    );
    expect(container.querySelector("main")?.textContent).toBe("");

    await act(() => container.querySelector("button")?.click());
    expect(container.querySelector('[data-titlebar-slot="breadcrumb"]')?.textContent).toBe(
      "Thread: 1",
    );
  });

  it("clears both destinations when their route unmounts", async () => {
    await act(() =>
      root.render(
        <Shell>
          <Route title="Thread" actions="Actions" />
        </Shell>,
      ),
    );
    expect(container.querySelector('[data-titlebar-slot="breadcrumb"]')?.textContent).toBe(
      "Thread: 0",
    );

    await act(() => root.render(<Shell />));
    expect(container.querySelector('[data-titlebar-slot="breadcrumb"]')?.textContent).toBe("");
    expect(container.querySelector('[data-titlebar-slot="actions"]')?.textContent).toBe("");
  });

  it("replaces a route without letting its cleanup clear the next route", async () => {
    await act(() =>
      root.render(
        <Shell>
          <Route key="thread" title="Thread" actions="Terminal" />
        </Shell>,
      ),
    );
    await act(() =>
      root.render(
        <Shell>
          <Route key="settings" title="Settings" />
        </Shell>,
      ),
    );
    expect(container.querySelector('[data-titlebar-slot="breadcrumb"]')?.textContent).toBe(
      "Settings: 0",
    );
    expect(container.querySelector('[data-titlebar-slot="actions"]')?.textContent).toBe("");
  });

  it("lets the last mounted owner win per slot and restores the previous owner", async () => {
    await act(() =>
      root.render(
        <Shell>
          <Route key="parent" title="Parent" actions="Parent action" />
        </Shell>,
      ),
    );
    await act(() =>
      root.render(
        <Shell>
          <Route key="parent" title="Parent" actions="Parent action" />
          <Route key="child" title="Child" />
        </Shell>,
      ),
    );
    expect(container.querySelector('[data-titlebar-slot="breadcrumb"]')?.textContent).toBe(
      "Child: 0",
    );
    expect(container.querySelector('[data-titlebar-slot="actions"]')?.textContent).toBe(
      "Parent action",
    );

    await act(() =>
      root.render(
        <Shell>
          <Route key="parent" title="Updated parent" actions="Parent action" />
          <Route key="child" title="Child" />
        </Shell>,
      ),
    );
    expect(container.querySelector('[data-titlebar-slot="breadcrumb"]')?.textContent).toBe(
      "Child: 0",
    );

    await act(() =>
      root.render(
        <Shell>
          <Route key="parent" title="Updated parent" actions="Parent action" />
        </Shell>,
      ),
    );
    expect(container.querySelector('[data-titlebar-slot="breadcrumb"]')?.textContent).toBe(
      "Updated parent: 0",
    );
  });

  it("resolves simultaneous nested owners in layout-effect registration order", async () => {
    await act(() =>
      root.render(
        <Shell>
          <NestedRoutes />
        </Shell>,
      ),
    );
    expect(container.querySelector('[data-titlebar-slot="breadcrumb"]')?.textContent).toBe(
      "Parent title",
    );
  });
});
