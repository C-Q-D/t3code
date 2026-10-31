/**
 * Protects dialog slots, confirmation focus, description layout, and embedded Field control states.
 * @vitest-environment jsdom
 */
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { Field } from "@base-ui/react/field";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogPopup,
} from "./alert-dialog";
import { Dialog, DialogFooter, DialogHeader, DialogPopup, DialogTitle } from "./dialog";
import { Input } from "./input";
import { Textarea } from "./textarea";

it.each([
  { Control: Input, slot: "input-control", present: null, disabledOverride: "true" },
  { Control: Textarea, slot: "textarea-control", present: "true", disabledOverride: "false" },
])(
  "applies explicit ARIA overrides and Base UI 1.9 disabled validation for $slot",
  async ({ Control, slot, present, disabledOverride }) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    /** Exercise real Field validation and native overrides through the shared dialog controls. */
    async function renderField(
      fieldProps: ComponentProps<typeof Field.Root>,
      controlProps: Pick<ComponentProps<typeof Input>, "disabled" | "aria-invalid">,
    ) {
      await act(async () =>
        root.render(
          <Dialog>
            <Field.Root {...fieldProps}>
              <Control aria-label="Value" {...controlProps} />
            </Field.Root>
          </Dialog>,
        ),
      );
      const wrapper = container.querySelector(`[data-slot="${slot}"]`);
      if (!wrapper) throw new Error(`Missing ${slot}`);
      return wrapper;
    }
    try {
      let wrapper = await renderField({ invalid: true }, {});
      expect(wrapper.getAttribute("data-invalid")).toBe("true");
      expect(wrapper.getAttribute("data-invalid-present")).toBe(present);
      expect(wrapper.getAttribute("data-disabled")).toBe("false");
      expect(wrapper.querySelector("input, textarea")?.getAttribute("aria-invalid")).toBe("true");

      wrapper = await renderField({ invalid: true }, { "aria-invalid": false });
      expect
        .soft(wrapper.querySelector("input, textarea")?.getAttribute("aria-invalid"))
        .toBe("false");
      expect(wrapper.getAttribute("data-invalid")).toBe("false");
      expect(wrapper.getAttribute("data-invalid-present")).toBe(present);

      // JavaScript callers can explicitly remove an ARIA attribute with null.
      wrapper = await renderField({ invalid: true }, {
        "aria-invalid": null,
      } as unknown as ComponentProps<typeof Input>);
      expect(wrapper.getAttribute("data-invalid")).toBe("false");
      expect(wrapper.getAttribute("data-invalid-present")).toBe(present === null ? null : "false");
      expect
        .soft(wrapper.querySelector("input, textarea")?.getAttribute("aria-invalid"))
        .toBeNull();

      wrapper = await renderField({ invalid: false }, {});
      expect(wrapper.getAttribute("data-invalid")).toBe("false");

      wrapper = await renderField({ invalid: true, disabled: true }, {});
      expect(wrapper.getAttribute("data-disabled")).toBe("true");
      expect(wrapper.getAttribute("data-invalid")).toBe("false");
      expect(wrapper.getAttribute("data-invalid-present")).toBe(present === null ? null : "false");
      wrapper = await renderField({ disabled: true }, { disabled: false });
      expect(wrapper.getAttribute("data-disabled")).toBe(disabledOverride);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  },
);

describe("dialog slot presence", () => {
  it("updates header and footer attributes independently through removal and remount", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const popupRef = createRef<HTMLDivElement>();
    /** Renders real slots inside the open popup without replacing registration or Base UI. */
    async function renderSlots(header: boolean, footer: boolean) {
      await act(async () => {
        root.render(
          <Dialog open>
            <DialogPopup ref={popupRef} initialFocus={false}>
              <DialogTitle>Slot presence</DialogTitle>
              {header && <DialogHeader>Header</DialogHeader>}
              {footer && <DialogFooter>Footer</DialogFooter>}
            </DialogPopup>
          </Dialog>,
        );
      });
    }
    try {
      await renderSlots(true, false);
      expect(popupRef.current?.getAttribute("data-has-header")).toBe("true");
      expect(popupRef.current?.getAttribute("data-has-footer")).toBe("false");

      await renderSlots(false, true);
      expect(popupRef.current?.getAttribute("data-has-header")).toBe("false");
      expect(popupRef.current?.getAttribute("data-has-footer")).toBe("true");

      await renderSlots(true, false);
      expect(popupRef.current?.getAttribute("data-has-header")).toBe("true");
      expect(popupRef.current?.getAttribute("data-has-footer")).toBe("false");

      await renderSlots(true, true);
      expect(popupRef.current?.getAttribute("data-has-header")).toBe("true");
      expect(popupRef.current?.getAttribute("data-has-footer")).toBe("true");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});

describe.each([
  { name: "dialog", Root: Dialog, Title: DialogTitle },
  { name: "alert dialog", Root: AlertDialog, Title: AlertDialogTitle },
])("$name title hover", ({ Root, Title }) => {
  it.each([
    { name: "full rich text", title: undefined, expected: "Archive important conversation?" },
    { name: "explicit hint", title: "Custom hint", expected: "Custom hint" },
    { name: "caller handler", title: undefined, expected: "Archive important conversation?" },
  ])("preserves $name", async ({ title, expected, name }) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onMouseEnter = vi.fn();
    try {
      await act(async () => {
        root.render(
          <Root>
            <Title title={title} onMouseEnter={onMouseEnter}>
              Archive <strong>important</strong> conversation?
            </Title>
          </Root>,
        );
      });
      const heading = container.querySelector("h2");
      expect(heading).not.toBeNull();
      await act(async () => {
        heading?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      });
      if (name === "caller handler") expect(onMouseEnter).toHaveBeenCalledTimes(1);
      else expect(heading?.title).toBe(expected);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});

describe("alert dialog initial focus", () => {
  it.each([
    {
      scenario: "primary action and callback ref",
      disabled: false,
      explicit: false,
      callbackRef: true,
      expected: "Confirm",
    },
    { scenario: "disabled action", disabled: true, explicit: false, expected: "Cancel" },
    { scenario: "explicit ref", disabled: false, explicit: true, expected: "Details" },
    { scenario: "hidden action", hidden: true, expected: "Cancel" },
    { scenario: "missing footer", footer: false, expected: "Details" },
    { scenario: "inert ancestor", inert: true, expected: "Cancel" },
    { scenario: "aria-disabled action", ariaDisabled: true, expected: "Cancel" },
    { scenario: "nested alertdialog", nestedRole: "alertdialog", expected: "Confirm" },
    { scenario: "nested dialog", nestedRole: "dialog", expected: "Confirm" },
    { scenario: "explicit false", preventFocus: true, expected: "Outside" },
    { scenario: "display none ancestor", displayNone: true, expected: "Cancel" },
    { scenario: "visibility hidden ancestor", visibilityHidden: true, expected: "Cancel" },
    { scenario: "negative tab index", tabIndex: -1, expected: "Cancel" },
    { scenario: "function initial focus", functionFocus: true, expected: "Details" },
    {
      scenario: "callback ref without cleanup",
      callbackRef: true,
      noCleanup: true,
      expected: "Confirm",
    },
  ])(
    "$scenario focuses $expected",
    async ({
      disabled,
      explicit,
      callbackRef,
      hidden,
      footer,
      inert,
      ariaDisabled,
      nestedRole,
      preventFocus,
      displayNone,
      visibilityHidden,
      tabIndex,
      functionFocus,
      noCleanup,
      expected,
    }) => {
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
      const container = document.createElement("div");
      const outside = document.createElement("button");
      outside.textContent = "Outside";
      document.body.append(outside);
      outside.focus();
      document.body.append(container);
      const root = createRoot(container);
      const detailsRef = createRef<HTMLButtonElement>();
      const popupRef = createRef<HTMLDivElement>();
      const onPopupRef = vi.fn((element: HTMLDivElement | null) => {
        popupRef.current = element;
        if (!noCleanup)
          return () => {
            popupRef.current = null;
          };
      });
      try {
        await act(async () => {
          root.render(
            <AlertDialog open>
              <AlertDialogPopup
                ref={callbackRef ? onPopupRef : popupRef}
                initialFocus={
                  preventFocus
                    ? false
                    : functionFocus
                      ? () => detailsRef.current
                      : explicit
                        ? detailsRef
                        : undefined
                }
              >
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive conversation?</AlertDialogTitle>
                </AlertDialogHeader>
                <button ref={detailsRef}>Details</button>
                {footer !== false && (
                  <AlertDialogFooter>
                    <button>Cancel</button>
                    <div
                      inert={inert}
                      style={{
                        display: displayNone ? "none" : undefined,
                        visibility: visibilityHidden ? "hidden" : undefined,
                      }}
                    >
                      <button
                        disabled={disabled}
                        hidden={hidden}
                        aria-disabled={ariaDisabled}
                        tabIndex={tabIndex}
                      >
                        Confirm
                      </button>
                    </div>
                    {nestedRole && (
                      <div
                        role={nestedRole}
                        data-slot={nestedRole === "dialog" ? "dialog-popup" : "alert-dialog-popup"}
                      >
                        <AlertDialogFooter>
                          <button>Nested</button>
                        </AlertDialogFooter>
                      </div>
                    )}
                  </AlertDialogFooter>
                )}
              </AlertDialogPopup>
            </AlertDialog>,
          );
        });
        // Base UI schedules the initial focus on the next animation frame.
        await act(async () => vi.advanceTimersToNextFrame());
        expect(document.activeElement?.textContent).toBe(expected);
        expect(popupRef.current?.contains(document.activeElement)).toBe(!preventFocus);
      } finally {
        await act(async () => root.unmount());
        container.remove();
        outside.remove();
        vi.useRealTimers();
        vi.unstubAllGlobals();
      }
      if (noCleanup) expect(onPopupRef).toHaveBeenLastCalledWith(null);
      expect(popupRef.current).toBeNull();
    },
  );
});

describe("alert dialog description", () => {
  it("keeps a long payload in a bounded scroll region so the actions stay put", () => {
    const payload = `{elements:[${"x".repeat(4_000)}]}`;
    const markup = renderToStaticMarkup(
      <AlertDialog>
        <AlertDialogHeader>
          <AlertDialogTitle>Allow excalidraw to run export_to_excalidraw?</AlertDialogTitle>
          <AlertDialogDescription>{payload}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>Cancel</AlertDialogFooter>
      </AlertDialog>,
    );
    const header = /<div[^>]*data-slot="alert-dialog-header"[^>]*>/.exec(markup)?.[0] ?? "";
    const description = /<p[^>]*data-slot="alert-dialog-description"[^>]*>/.exec(markup)?.[0] ?? "";

    // The whole payload stays available to inspect, untruncated…
    expect(markup).toContain(payload);
    // …but bounded: the header may shrink inside the height-capped popup and
    // the description scrolls instead of pushing the footer off screen.
    expect(header).toContain("min-h-0");
    expect(description).toContain("max-h-[min(24rem,60dvh)]");
    expect(description).toContain("overflow-y-auto");
    expect(description).toContain("overscroll-contain");
    expect(description).toContain("wrap-anywhere");
    expect(markup.indexOf("</p>")).toBeLessThan(markup.indexOf("Cancel"));
  });
});
