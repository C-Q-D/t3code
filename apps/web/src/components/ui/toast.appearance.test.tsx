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
