/** Checks caption top-layer ownership through MCP entry, exit and removal.
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { WindowsWindowControls } from "./WindowsWindowControls";

it("uses the top layer only while an MCP app is fullscreen, including removal", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const stack: HTMLElement[] = [];
  const originalMatches = HTMLElement.prototype.matches;
  const matches = vi.spyOn(HTMLElement.prototype, "matches").mockImplementation(function (
    this: HTMLElement,
    selector: string,
  ) {
    return selector === ":popover-open"
      ? stack.includes(this)
      : originalMatches.call(this, selector);
  });
  // jsdom has no top layer. This boundary models native stacking, not caption policy.
  const show = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "showPopover");
  const hide = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "hidePopover");
  Object.defineProperty(HTMLElement.prototype, "showPopover", {
    configurable: true,
    value(this: HTMLElement) {
      if (!this.hasAttribute("popover")) throw new Error("Missing popover attribute");
      if (!stack.includes(this)) stack.push(this);
      this.dispatchEvent(new Event("toggle"));
    },
  });
  Object.defineProperty(HTMLElement.prototype, "hidePopover", {
    configurable: true,
    value(this: HTMLElement) {
      const index = stack.indexOf(this);
      if (index !== -1) stack.splice(index, 1);
      this.dispatchEvent(new Event("toggle"));
    },
  });
  const container = document.createElement("div");
  const app = document.createElement("div");
  app.setAttribute("popover", "manual");
  document.body.append(container, app);
  const root = createRoot(container);
  try {
    await act(() => root.render(<WindowsWindowControls maximized={false} />));
    expect(stack).toEqual([]);
    const controls = document.querySelector<HTMLElement>(".windows-window-controls")!;

    await act(() => {
      app.setAttribute("data-mcp-app-fullscreen", "");
      app.showPopover();
    });
    expect(stack).toEqual([app, controls]);

    // React removes the fullscreen marker before its effect hides the popover.
    await act(() => {
      app.removeAttribute("data-mcp-app-fullscreen");
      app.hidePopover();
    });
    expect(stack).toEqual([]);

    await act(() => {
      app.setAttribute("data-mcp-app-fullscreen", "");
      app.showPopover();
    });
    expect(stack).toEqual([app, controls]);
    await act(() => app.remove());
    expect(stack).not.toContain(controls);
    await act(() => root.unmount());
    await act(() => {
      document.body.append(app);
      app.showPopover();
    });
    expect(stack).not.toContain(controls);
  } finally {
    await act(() => root.unmount());
    container.remove();
    app.remove();
    matches.mockRestore();
    if (show) Object.defineProperty(HTMLElement.prototype, "showPopover", show);
    else Reflect.deleteProperty(HTMLElement.prototype, "showPopover");
    if (hide) Object.defineProperty(HTMLElement.prototype, "hidePopover", hide);
    else Reflect.deleteProperty(HTMLElement.prototype, "hidePopover");
    vi.unstubAllGlobals();
  }
});
