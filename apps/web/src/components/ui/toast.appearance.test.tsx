/**
 * Exercises managed notifications through their public provider and manager, including raw error text.
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { t } from "~/i18n";
import { ToastProvider, toastManager } from "./toast";

vi.mock("@tanstack/react-router", () => ({ useParams: () => null }));

/** Both stack modes must let Base UI choose the single announcement path before and after viewport focus. */
it.each([undefined, "stone"] as const)(
  "preserves high-priority announcement ownership with stack=%s",
  async (stack) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<ToastProvider timeout={0} stack={stack} />));
      await act(async () => {
        toastManager.add({
          title: "Save failed",
          type: "error",
          priority: "high",
          data: { appearance: "error-stripe" },
        });
      });
      const viewport = document.querySelector<HTMLElement>('[data-slot="toast-viewport"]')!;
      const card = viewport.querySelector<HTMLElement>('[role="alertdialog"]')!;
      expect(card.getAttribute("aria-hidden")).toBe("true");
      expect(card.hasAttribute("inert")).toBe(false);
      expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);

      await act(async () => viewport.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
      expect(card.getAttribute("aria-hidden")).toBe("true");
      await act(async () => viewport.focus());
      expect(document.activeElement).toBe(viewport);
      expect(card.hasAttribute("aria-hidden")).toBe(false);
      expect(card.hasAttribute("inert")).toBe(false);
      expect(document.querySelectorAll('[role="alert"]')).toHaveLength(0);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  },
);

/** Exercises real Base UI expansion; inert is the native focus/accessibility boundary, which jsdom does not itself enforce. */
it("restores the fourth and fifth stone notifications on expansion with limit=5", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<ToastProvider timeout={0} stack="stone" position="bottom-right" limit={5} />),
    );
    await act(async () => {
      toastManager.add({ title: "First", actionProps: { children: "Open first" } });
      toastManager.add({ title: "Second", actionProps: { children: "Open second" } });
      toastManager.add({ title: "Third" });
      toastManager.add({ title: "Fourth" });
      toastManager.add({ title: "Fifth" });
    });
    const viewport = document.querySelector<HTMLElement>('[data-slot="toast-viewport"]')!;
    const fourth = viewport.querySelector<HTMLElement>('[data-stack-layer="3"]')!;
    const fifth = viewport.querySelector<HTMLElement>('[data-stack-layer="4"]')!;
    expect(fourth.hasAttribute("data-stack-hidden")).toBe(true);
    expect(fifth.hasAttribute("data-stack-hidden")).toBe(true);
    expect(fourth.hasAttribute("inert")).toBe(true);
    expect(fifth.hasAttribute("inert")).toBe(true);
    expect(fourth.getAttribute("aria-hidden")).toBe("true");
    expect(fifth.getAttribute("aria-hidden")).toBe("true");
    expect(viewport.querySelector(".ov2-toast-count")?.textContent).toBe("+4");

    await act(async () => viewport.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(fourth.hasAttribute("data-expanded")).toBe(true);
    expect(fourth.hasAttribute("data-stack-hidden")).toBe(false);
    expect(fifth.hasAttribute("data-stack-hidden")).toBe(false);
    expect(fourth.hasAttribute("inert")).toBe(false);
    expect(fifth.hasAttribute("inert")).toBe(false);
    expect(fourth.hasAttribute("aria-hidden")).toBe(false);
    expect(fifth.hasAttribute("aria-hidden")).toBe(false);
    expect(viewport.querySelector(".ov2-toast-count")).toBeNull();
    await act(async () =>
      viewport.dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }),
      ),
    );
    expect(fourth.hasAttribute("data-stack-hidden")).toBe(true);
    expect(fifth.hasAttribute("inert")).toBe(true);
    expect(viewport.querySelector(".ov2-toast-count")?.textContent).toBe("+4");
    await act(async () => viewport.focus());
    expect(fourth.hasAttribute("data-stack-hidden")).toBe(false);
    expect(fifth.hasAttribute("inert")).toBe(false);
    const action = fifth.querySelector<HTMLButtonElement>('[data-slot="toast-action"]')!;
    await act(async () => action.focus());
    expect(document.activeElement).toBe(action);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

/** Provider-limited cards must stay inaccessible even when the stone stack is expanded by keyboard focus. */
it("retains the default provider limit when the stone viewport receives focus", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<ToastProvider timeout={0} stack="stone" position="bottom-right" />),
    );
    await act(async () => {
      toastManager.add({ title: "First" });
      toastManager.add({ title: "Second" });
      toastManager.add({ title: "Third" });
      toastManager.add({ title: "Fourth" });
      toastManager.add({ title: "Fifth" });
    });
    const viewport = document.querySelector<HTMLElement>('[data-slot="toast-viewport"]')!;
    expect(viewport.querySelector(".ov2-toast-count")?.textContent).toBe("+4");
    await act(async () => viewport.focus());
    const fourth = viewport.querySelector<HTMLElement>('[data-stack-layer="3"]')!;
    const fifth = viewport.querySelector<HTMLElement>('[data-stack-layer="4"]')!;
    expect(fourth.hasAttribute("data-expanded")).toBe(true);
    expect(fourth.hasAttribute("data-limited")).toBe(true);
    expect(fifth.hasAttribute("data-limited")).toBe(true);
    expect(fourth.hasAttribute("inert")).toBe(true);
    expect(fifth.hasAttribute("inert")).toBe(true);
    expect(fourth.hasAttribute("data-stack-hidden")).toBe(true);
    expect(fifth.hasAttribute("data-stack-hidden")).toBe(true);
    expect(viewport.querySelector(".ov2-toast-count")).toBeNull();
    expect(
      viewport.querySelector('[data-stack-layer="2"]')?.hasAttribute("data-stack-hidden"),
    ).toBe(false);
    expect(viewport.querySelector('[data-stack-layer="2"]')?.hasAttribute("inert")).toBe(false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it.each([
  { data: {}, copyAvailable: true },
  { data: { appearance: "error-stripe" as const }, copyAvailable: false },
])(
  "keeps raw errors readable and dismissal available with data=$data",
  async ({ data, copyAvailable }) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<ToastProvider timeout={0} />);
      });
      await act(async () => {
        toastManager.add({
          type: "error",
          title: "Could not save template",
          description: "EACCES: <template> & permission denied",
          data,
        });
      });
      const title = document.querySelector('[data-slot="toast-title"]');
      const description = document.querySelector('[data-slot="toast-description"]');
      expect(title?.textContent).toBe("Could not save template");
      expect(description?.textContent).toBe("EACCES: <template> & permission denied");
      expect(description?.querySelector("template")).toBeNull();
      const buttons = Array.from(document.querySelectorAll("button"));
      expect(
        buttons.some((button) => button.getAttribute("aria-label") === t.app.clipboard.copyError),
      ).toBe(copyAvailable);
      const dismiss = buttons.find(
        (button) => button.getAttribute("aria-label") === t.app.notifications.dismiss,
      );
      expect(dismiss).toBeDefined();
      await act(async () => dismiss?.focus());
      expect(document.activeElement).toBe(dismiss);
      await act(async () => dismiss?.click());
      expect(document.querySelector('[data-slot="toast-title"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  },
);

/** Mixed appearances must share one interaction and announcement region. */
it.each([undefined, "stone"] as const)(
  "keeps mixed notifications in one viewport with stack=%s",
  async (stack) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<ToastProvider timeout={0} stack={stack} />);
      });
      await act(async () => {
        toastManager.add({ type: "error", title: "Default failure", priority: "high" });
        toastManager.add({
          type: "error",
          title: "Striped failure",
          description: "Original failure",
          data: { appearance: "error-stripe" },
        });
      });
      const viewports = document.querySelectorAll('[data-slot="toast-viewport"]');
      expect(viewports).toHaveLength(1);
      expect(
        Array.from(
          viewports[0]!.querySelectorAll('[data-slot="toast-title"]'),
          (node) => node.textContent,
        ),
      ).toEqual(expect.arrayContaining(["Default failure", "Striped failure"]));
      expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  },
);

/** The S1 badge reports real pending cards and follows dismissals without adding another live region. */
it("updates the S1 remaining count as notifications close", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<ToastProvider timeout={0} stack="stone" position="bottom-right" />),
    );
    let firstId = "";
    let secondId = "";
    await act(async () => {
      firstId = toastManager.add({ title: "First" });
      secondId = toastManager.add({ title: "Second" });
      toastManager.add({ title: "Third" });
    });
    expect(document.querySelector(".ov2-toast-count")?.textContent).toBe("+2");
    await act(async () => toastManager.close(firstId));
    expect(document.querySelector(".ov2-toast-count")?.textContent).toBe("+1");
    await act(async () => toastManager.close(secondId));
    expect(document.querySelector(".ov2-toast-count")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
