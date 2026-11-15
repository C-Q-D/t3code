/** @vitest-environment jsdom */
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { ComposerAssistPopover } from "./ComposerAssistPopover";
import type { useComposerPromptOptimizer } from "./useComposerPromptOptimizer";
import { t } from "~/i18n";

async function setup() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const optimize = vi.fn(async () => {});
  const changed = vi.fn();
  let disabledReason: string | null = null;
  let inFlight = false;
  let optimizerEnabled = true;
  let optimizerDisabledReason: string | null = null;
  const optimizer = (): ReturnType<typeof useComposerPromptOptimizer> => ({
    trigger: optimize,
    undo: () => {},
    label: "",
    done: false,
    inFlight,
    visible: optimizerEnabled,
    disabledReason: optimizerDisabledReason,
    cacheMaybeExpired: false,
    availability: { getSnapshot: () => true, subscribe: () => () => {}, update: () => {} },
  });
  function Harness({
    currentOptimizer,
    reason,
  }: {
    currentOptimizer: ReturnType<typeof optimizer>;
    reason: string | null;
  }) {
    const [checked, setChecked] = useState(false);
    return (
      <ComposerAssistPopover
        optimizer={currentOptimizer}
        rewrite={{
          checked,
          disabledReason: reason,
          onCheckedChange: (value) => {
            changed(value);
            setChecked(value);
          },
        }}
      />
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(<Harness currentOptimizer={optimizer()} reason={disabledReason} />),
  );
  const trigger = () => {
    const node = host.querySelector("button");
    if (!node) throw new Error("Writing tools trigger missing");
    return node;
  };
  const action = () => {
    const node = [...document.querySelectorAll("button")].find(
      (button) => button.getAttribute("aria-label") === t.composer.assist.tools.optimizeNow,
    );
    if (!node) throw new Error("Improve action missing");
    return node;
  };
  const toggle = () => {
    const node = document.querySelector<HTMLButtonElement>('[role="switch"]');
    if (!node) throw new Error("Rewrite switch missing");
    return node;
  };
  const click = async (node: HTMLElement) => {
    await act(async () => node.click());
  };
  return {
    optimize,
    changed,
    trigger,
    action,
    toggle,
    click,
    rerender: async (changes: {
      disabled?: string;
      inFlight?: boolean;
      enabled?: boolean;
      optimizerDisabledReason?: string;
    }) => {
      disabledReason = changes.disabled ?? null;
      inFlight = changes.inFlight ?? false;
      optimizerEnabled = changes.enabled ?? true;
      optimizerDisabledReason = changes.optimizerDisabledReason ?? null;
      await act(async () =>
        root.render(<Harness currentOptimizer={optimizer()} reason={disabledReason} />),
      );
    },
    [Symbol.asyncDispose]: async () => {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    },
  };
}

it("opens and changes the local rewrite choice without calling a model, then keeps it visible when closed", async () => {
  await using h = await setup();
  await h.click(h.trigger());
  expect(h.trigger().getAttribute("aria-expanded")).toBe("true");
  expect(h.optimize).not.toHaveBeenCalled();
  await h.click(h.toggle());
  expect(h.changed.mock.calls).toEqual([[true]]);
  expect(h.optimize).not.toHaveBeenCalled();
  await h.click(h.trigger());
  expect(h.trigger().getAttribute("aria-expanded")).toBe("false");
  expect(h.trigger().getAttribute("aria-label")).toContain(t.composer.assist.tools.rewriteOn);
});

it("only invokes the existing optimizer on its explicit action and keeps disabled reasons available", async () => {
  await using h = await setup();
  await h.click(h.trigger());
  await h.click(h.action());
  expect(h.optimize).toHaveBeenCalledTimes(1);
  await h.rerender({ inFlight: true });
  expect(h.action().disabled).toBe(true);
  await h.click(h.action());
  expect(h.optimize).toHaveBeenCalledTimes(1);
  await h.rerender({ enabled: false });
  expect(h.action().disabled).toBe(true);
  expect(document.body.textContent).toContain(t.composer.assist.tools.optimizeUnavailable);
  await h.rerender({ optimizerDisabledReason: t.composer.assist.optimize.disabledEmpty });
  expect(h.action().disabled).toBe(true);
  expect(document.body.textContent).toContain(t.composer.assist.optimize.disabledEmpty);
});

it("keeps an inherited run setting locked and explains how additional instructions work", async () => {
  await using h = await setup();
  await h.rerender({ disabled: t.composer.assist.tools.inherited });
  await h.click(h.trigger());
  await h.click(h.toggle());
  expect(h.changed).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain(t.composer.assist.tools.inherited);
});
