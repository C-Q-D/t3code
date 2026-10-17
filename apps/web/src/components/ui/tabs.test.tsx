/**
 * Protect the stateful className contract through real Base UI rendering and tab activation.
 * @vitest-environment jsdom
 */
import type { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

let root: Root;
let container: HTMLDivElement;

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

/** Fail explicitly when a public slot is missing, rather than hiding a missing render behind ?. */
function getSlot(slot: string) {
  const element = container.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
  if (!element) throw new Error(`Missing tab slot: ${slot}`);
  return element;
}

describe("Tabs className callbacks", () => {
  it("passes Base UI state to each caller and applies updated results after activation", async () => {
    const rootClassName = vi.fn(
      (state: TabsPrimitive.Root.State) => `caller-root-${state.orientation}`,
    );
    const listClassName = vi.fn(
      (state: TabsPrimitive.List.State) => `caller-list-${state.orientation}`,
    );
    const triggerClassName = vi.fn((state: TabsPrimitive.Tab.State) =>
      state.active ? "caller-trigger-active" : "caller-trigger-inactive",
    );
    const contentClassName = vi.fn((state: TabsPrimitive.Panel.State) =>
      state.hidden ? "caller-content-hidden" : "caller-content-visible",
    );

    await act(async () => {
      root.render(
        <Tabs defaultValue="diff" orientation="vertical" className={rootClassName}>
          <TabsList aria-label="Panel" className={listClassName}>
            <TabsTrigger value="diff" className={triggerClassName}>
              Diff
            </TabsTrigger>
            <TabsTrigger value="terminal">Terminal</TabsTrigger>
          </TabsList>
          <TabsContent value="diff" keepMounted className={contentClassName}>
            Changes
          </TabsContent>
          <TabsContent value="terminal">Shell</TabsContent>
        </Tabs>,
      );
    });

    expect(rootClassName).toHaveBeenCalledWith(
      expect.objectContaining({ orientation: "vertical" }),
    );
    expect(listClassName).toHaveBeenCalledWith(
      expect.objectContaining({ orientation: "vertical" }),
    );
    expect(triggerClassName).toHaveBeenCalledWith(
      expect.objectContaining({ active: true, disabled: false, orientation: "vertical" }),
    );
    expect(contentClassName).toHaveBeenCalledWith(
      expect.objectContaining({ hidden: false, orientation: "vertical" }),
    );
    expect(getSlot("tabs").classList.contains("caller-root-vertical")).toBe(true);
    expect(getSlot("tabs-list").classList.contains("caller-list-vertical")).toBe(true);
    expect(getSlot("tabs-trigger").classList.contains("caller-trigger-active")).toBe(true);
    expect(getSlot("tabs-content").classList.contains("caller-content-visible")).toBe(true);

    const terminalTab = container.querySelector<HTMLButtonElement>('[role="tab"]:last-child');
    if (!terminalTab) throw new Error("Missing Terminal tab");
    await act(async () => terminalTab.click());

    expect(triggerClassName).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
    expect(contentClassName).toHaveBeenCalledWith(expect.objectContaining({ hidden: true }));
    expect(getSlot("tabs-trigger").classList.contains("caller-trigger-inactive")).toBe(true);
    expect(getSlot("tabs-content").classList.contains("caller-content-hidden")).toBe(true);
  });
});
