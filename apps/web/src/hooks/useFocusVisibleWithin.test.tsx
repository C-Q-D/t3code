/**
 * Verifies focus transitions at the hook's DOM container boundary.
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { useFocusVisibleWithin } from "./useFocusVisibleWithin";

let container: HTMLDivElement;
let root: Root;
let focusVisible: boolean;
let portalContainer: HTMLDivElement;

/** Renders two descendants and an outside control to exercise the container boundary. */
function Probe() {
  const { active, handlers } = useFocusVisibleWithin();
  return (
    <>
      <button id="outside">outside</button>
      <div data-active={String(active)} {...handlers}>
        <button id="first">first</button>
        <button id="second">second</button>
        {createPortal(<button id="portal">portal</button>, portalContainer)}
      </div>
    </>
  );
}

/** Dispatches one focus phase so assertions can catch an intermediate false state. */
function focusEvent(id: string, type: "focusin" | "focusout", relatedId: string) {
  const target = container.querySelector(`#${id}`)!;
  const relatedTarget = container.querySelector(`#${relatedId}`)!;
  act(() => target.dispatchEvent(new FocusEvent(type, { bubbles: true, relatedTarget })));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  focusVisible = true;
  const matches = Element.prototype.matches;
  // jsdom does not model keyboard/pointer modality; Electron separately verifies this browser input.
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector) {
    return selector === ":focus-visible" ? focusVisible : matches.call(this, selector);
  });
  container = document.createElement("div");
  portalContainer = document.createElement("div");
  document.body.append(container, portalContainer);
  root = createRoot(container);
  act(() => root.render(<Probe />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  portalContainer.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("activates when keyboard focus enters from outside", () => {
  focusEvent("first", "focusin", "outside");
  expect(container.querySelector("[data-active]")?.getAttribute("data-active")).toBe("true");
});

it("does not clear between blur and focus while moving between descendants", () => {
  focusEvent("first", "focusin", "outside");
  focusEvent("first", "focusout", "second");
  expect(container.querySelector("[data-active]")?.getAttribute("data-active")).toBe("true");
  focusEvent("second", "focusin", "first");
  expect(container.querySelector("[data-active]")?.getAttribute("data-active")).toBe("true");
});

it("clears when focus leaves the container", () => {
  focusEvent("first", "focusin", "outside");
  focusEvent("first", "focusout", "outside");
  expect(container.querySelector("[data-active]")?.getAttribute("data-active")).toBe("false");
});

it("clears keyboard highlighting when a descendant receives mouse focus", () => {
  focusEvent("first", "focusin", "outside");
  focusEvent("first", "focusout", "second");
  focusVisible = false;
  focusEvent("second", "focusin", "first");
  expect(container.querySelector("[data-active]")?.getAttribute("data-active")).toBe("false");
});

it("stays inactive in an external child portal and reactivates on DOM reentry", () => {
  const first = container.querySelector<HTMLButtonElement>("#first")!;
  const portalButton = portalContainer.querySelector<HTMLButtonElement>("#portal")!;
  const wrapper = container.querySelector("[data-active]")!;

  act(() => first.focus());
  expect(wrapper.getAttribute("data-active")).toBe("true");
  act(() => portalButton.focus());
  expect(document.activeElement).toBe(portalButton);
  expect(wrapper.contains(document.activeElement)).toBe(false);
  expect(wrapper.getAttribute("data-active")).toBe("false");
  act(() => first.focus());
  expect(document.activeElement).toBe(first);
  expect(wrapper.getAttribute("data-active")).toBe("true");
});
