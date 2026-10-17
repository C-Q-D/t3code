/**
 * Exercises real menu selection and request cancellation without mocking Base UI.
 * @vitest-environment jsdom
 */
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useTerminalContextMenu, type TerminalContextMenuAction } from "./TerminalContextMenu";

/** A terminal right-click boundary with no available chat target. */
function TerminalMenuFixture({
  onResult,
}: {
  onResult: (action: TerminalContextMenuAction | null) => void;
}) {
  const input = useRef<HTMLButtonElement>(null);
  const { present, menu } = useTerminalContextMenu(() => input.current);
  return (
    <>
      <button
        ref={input}
        type="button"
        onContextMenu={(event) => {
          event.preventDefault();
          void present(
            [
              { id: "add-to-chat", label: "Add to chat", disabled: true },
              { id: "copy", label: "Copy" },
            ],
            { x: event.clientX, y: event.clientY },
          ).then(onResult);
        }}
      >
        Terminal input
      </button>
      {menu}
    </>
  );
}

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

/** Dispatch the same pointer gesture consumed by the terminal viewport. */
async function rightClick() {
  await act(async () => {
    container
      .querySelector("button")!
      .dispatchEvent(new MouseEvent("contextmenu", { clientX: 120, clientY: 80, bubbles: true }));
  });
}

it("keeps unavailable actions inert and resolves the clicked operation", async () => {
  const onResult = vi.fn();
  await act(async () => root.render(<TerminalMenuFixture onResult={onResult} />));
  await rightClick();
  const items = document.querySelectorAll<HTMLElement>('[role="menuitem"]');
  expect(Array.from(items, (item) => item.textContent)).toEqual(["Add to chat", "Copy"]);
  await act(async () => items[0]!.click());
  expect(onResult).not.toHaveBeenCalled();
  await act(async () => items[1]!.click());
  expect(onResult).toHaveBeenCalledExactlyOnceWith("copy");
  expect(document.querySelector('[role="menu"]')).toBeNull();
});

it("cancels a superseded request and dismisses its replacement with Escape", async () => {
  const onResult = vi.fn();
  await act(async () => root.render(<TerminalMenuFixture onResult={onResult} />));
  await rightClick();
  await rightClick();
  expect(onResult).toHaveBeenCalledExactlyOnceWith(null);
  await act(async () => {
    document
      .querySelector('[role="menu"]')!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(onResult.mock.calls).toEqual([[null], [null]]);
  expect(document.querySelector('[role="menu"]')).toBeNull();
});

it("settles a pending request when the terminal unmounts", async () => {
  const onResult = vi.fn();
  await act(async () => root.render(<TerminalMenuFixture onResult={onResult} />));
  await rightClick();
  await act(async () => root.render(null));
  expect(onResult).toHaveBeenCalledExactlyOnceWith(null);
  expect(document.querySelector('[role="menu"]')).toBeNull();
});
