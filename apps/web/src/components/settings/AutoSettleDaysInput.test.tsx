/**
 * @vitest-environment jsdom
 * Exercises the real stepper's input, focus, and click behavior against stateful saved values.
 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { t } from "~/i18n";
import { AutoSettleDaysInput } from "./AutoSettleDaysInput";

let container: HTMLDivElement;
let root: Root;

/** Supplies saved settings and a visible write history so rejected edits cannot silently persist. */
function SavedDays({ initialValue }: { initialValue: number }) {
  const [days, setDays] = useState(initialValue);
  const [writes, setWrites] = useState<number[]>([]);
  return (
    <>
      <AutoSettleDaysInput
        value={days}
        onCommit={(next) => {
          setDays(next);
          setWrites((previous) => [...previous, next]);
        }}
      />
      <output aria-label="Saved values">{writes.join(",")}</output>
    </>
  );
}

/** Requires a real rendered input or button; a missing control fails at the queried boundary. */
function control<T extends HTMLInputElement | HTMLButtonElement>(selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Missing stepper control: ${selector}`);
  return element;
}

/** Dispatches a native edit without React's value tracker mistaking it for its own render. */
async function enterDraft(input: HTMLInputElement, value: string) {
  await act(() => {
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Native input value setter unavailable");
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
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

describe("inactivity day stepper", () => {
  it("saves each increment and decrement and displays the new saved value", async () => {
    await act(() => root.render(<SavedDays initialValue={7} />));
    const input = control<HTMLInputElement>("input");
    const increase = control<HTMLButtonElement>(
      `button[aria-label="${t.settings.rows.daysBeforeAutoSettle.increaseAriaLabel}"]`,
    );
    const decrease = control<HTMLButtonElement>(
      `button[aria-label="${t.settings.rows.daysBeforeAutoSettle.decreaseAriaLabel}"]`,
    );

    await act(() => increase.click());
    expect(input.value).toBe("8");
    await act(() => decrease.click());
    expect(input.value).toBe("7");
    expect(container.querySelector("output")?.textContent).toBe("8,7");
  });

  it.each([
    [2, "decreaseAriaLabel", "1"],
    [89, "increaseAriaLabel", "90"],
  ] as const)("stops at the boundary when stepping from %i", async (initial, label, expected) => {
    await act(() => root.render(<SavedDays initialValue={initial} />));
    const button = control<HTMLButtonElement>(
      `button[aria-label="${t.settings.rows.daysBeforeAutoSettle[label]}"]`,
    );
    expect(button.disabled).toBe(false);
    await act(() => button.click());
    expect(control<HTMLInputElement>("input").value).toBe(expected);
    expect(button.disabled).toBe(true);
    await act(() => button.click());
    expect(container.querySelector("output")?.textContent).toBe(expected);
    expect(control<HTMLInputElement>("input").value).toBe(expected);
  });

  it.each(["", "3.5", "0", "91"])(
    "reverts invalid draft %j on blur and steps from the saved value",
    async (draft) => {
      await act(() => root.render(<SavedDays initialValue={7} />));
      const input = control<HTMLInputElement>("input");
      await enterDraft(input, draft);
      expect(input.value).toBe(draft);
      expect(container.querySelector("output")?.textContent).toBe("");
      await act(() => input.blur());
      expect(input.value).toBe("7");
      const increase = control<HTMLButtonElement>(
        `button[aria-label="${t.settings.rows.daysBeforeAutoSettle.increaseAriaLabel}"]`,
      );
      await act(() => increase.click());
      expect(input.value).toBe("8");
      expect(container.querySelector("output")?.textContent).toBe("8");
    },
  );
});
