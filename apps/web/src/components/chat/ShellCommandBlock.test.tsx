/**
 * Verifies that the compact command exposes its complete text through real tooltip interaction.
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { ShellCommandBlock } from "./ShellCommandBlock";

vi.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
  useRenderedAppearance: () => "dark",
}));

it("reveals the full multiline command on keyboard focus without altering the command text", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const command = "pwsh -NoProfile -Command \"Write-Output 'a  b'\"\nWrite-Output done";
  try {
    await act(async () =>
      root.render(<ShellCommandBlock command={command} presentation="timeline" />),
    );
    const trigger = host.querySelector<HTMLElement>('[tabindex="0"]');
    expect(
      trigger,
      "the command must be reachable by keyboard to reveal its full text",
    ).not.toBeNull();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
      trigger!.focus();
    });
    expect(document.querySelector('[data-slot="tooltip-popup"][data-open]')?.textContent).toBe(
      command,
    );
    expect(host.textContent).toContain("a  b");
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
