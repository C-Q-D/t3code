/**
 * Checks the slot-count contract through a wrapper's rendered attributes.
 * @vitest-environment jsdom
 */
import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { createPresenceRegistry } from "./presenceRegistry";

const registry = createPresenceRegistry<"header">();
let container: HTMLDivElement;
let root: Root;

/** Models a wrapper that uses counts to style its own DOM. */
function Wrapper({ children }: { children?: ReactNode }) {
  const { counts, onChange } = registry.usePresence();
  return (
    <registry.Provider onChange={onChange}>
      <div data-count={counts.header ?? 0}>{children}</div>
    </registry.Provider>
  );
}

/** Models a conditional slot without adding a test-only production interface. */
function Slot({ present = true }: { present?: boolean }) {
  registry.useRegister("header", present);
  return <span>slot</span>;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

it("publishes a mounted slot count synchronously after layout effects, including StrictMode replay", () => {
  act(() =>
    root.render(
      <StrictMode>
        <Wrapper>
          <Slot />
        </Wrapper>
      </StrictMode>,
    ),
  );
  expect(container.firstElementChild?.getAttribute("data-count")).toBe("1");
});

it("removes an unmounted slot from the wrapper count", () => {
  act(() =>
    root.render(
      <Wrapper>
        <Slot />
      </Wrapper>,
    ),
  );
  act(() => root.render(<Wrapper />));
  expect(container.firstElementChild?.getAttribute("data-count")).toBe("0");
});

it("removes a slot when present changes from true to false", () => {
  act(() =>
    root.render(
      <Wrapper>
        <Slot />
      </Wrapper>,
    ),
  );
  act(() =>
    root.render(
      <Wrapper>
        <Slot present={false} />
      </Wrapper>,
    ),
  );
  expect(container.firstElementChild?.getAttribute("data-count")).toBe("0");
});

it("counts two slots of the same kind independently", () => {
  act(() =>
    root.render(
      <Wrapper>
        <Slot />
        <Slot />
      </Wrapper>,
    ),
  );
  expect(container.firstElementChild?.getAttribute("data-count")).toBe("2");
});

it("leaves an unrelated provider unchanged when a slot has no provider", () => {
  act(() =>
    root.render(
      <>
        <Slot />
        <Wrapper />
      </>,
    ),
  );
  expect(container.querySelector("[data-count]")?.getAttribute("data-count")).toBe("0");
  expect(container.querySelector("span")?.textContent).toBe("slot");
  act(() => root.render(<Wrapper />));
  expect(container.firstElementChild?.getAttribute("data-count")).toBe("0");
});
