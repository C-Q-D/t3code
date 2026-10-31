/** Verifies permission selection and focus through the fork's standalone runtime control. */
import type { RuntimeMode } from "@t3tools/contracts";
import { type ReactNode, useState } from "react";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { t } from "../../i18n";
import { ComposerHandleContext, type ComposerHandleRef } from "../../composerHandleContext";
import { ComposerFooterModeControls } from "./ComposerFooterControls";
import { runtimeModeConfig, runtimeModeOptions } from "./runtimeModeConfig";

const options = runtimeModeOptions.map((mode) => ({ mode, ...runtimeModeConfig[mode] }));

/** Keeps selection controlled while optionally removing the full-access trigger after a pick. */
function Permissions({ hideDefault = false }: { hideDefault?: boolean }) {
  const [mode, setMode] = useState<RuntimeMode>("approval-required");
  return (
    <>
      {hideDefault && mode === "full-access" ? null : (
        <ComposerFooterModeControls
          showInteractionModeToggle={false}
          interactionMode="default"
          runtimeMode={mode}
          runtimeModeOptions={options}
          onToggleInteractionMode={() => {}}
          onRuntimeModeChange={setMode}
        />
      )}
      <output aria-label="permission">{mode}</output>
    </>
  );
}

function withComposer(children: ReactNode) {
  const handle = { focusAtEnd: vi.fn() };
  const ref = { current: handle } as unknown as ComposerHandleRef;
  return { handle, ui: <ComposerHandleContext value={ref}>{children}</ComposerHandleContext> };
}

it("selects a permission with arrow keys and Enter", async () => {
  // The standalone control has no route dependencies.
  await using screen = await render(<Permissions />, { router: false });
  const trigger = screen.getByRole("combobox", { name: t.composer.mode.runtimeAriaLabel });
  await userEvent.tab();
  await expect.element(trigger).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}");
  await expect
    .element(
      page.getByRole("option", { name: new RegExp(runtimeModeConfig["approval-required"].label) }),
    )
    .toHaveAttribute("aria-selected", "true");
  await userEvent.keyboard("{ArrowDown}{Enter}");
  await expect.element(screen.getByLabelText("permission")).toHaveTextContent("auto-accept-edits");
  await expect.element(trigger).toHaveFocus();
});

it("marks the current permission as selected and closes on Escape", async () => {
  // The standalone control has no route dependencies.
  await using screen = await render(<Permissions />, { router: false });
  const trigger = screen.getByRole("combobox", { name: t.composer.mode.runtimeAriaLabel });
  await userEvent.click(trigger);
  const selected = page.getByRole("option", {
    name: new RegExp(runtimeModeConfig["approval-required"].label),
  });
  await expect.element(selected).toHaveAttribute("aria-selected", "true");
  await userEvent.keyboard("{Escape}");
  await expect.element(selected).not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();
});

it.each([false, true])(
  "returns focus to the editor after a pick (hidden=%s)",
  async (hideDefault) => {
    const { handle, ui } = withComposer(<Permissions hideDefault={hideDefault} />);
    // The standalone control has no route dependencies.
    await using screen = await render(ui, { router: false });
    await userEvent.click(screen.getByRole("combobox", { name: t.composer.mode.runtimeAriaLabel }));
    await userEvent.click(
      page.getByRole("option", { name: new RegExp(runtimeModeConfig["full-access"].label) }),
    );
    await expect.element(screen.getByLabelText("permission")).toHaveTextContent("full-access");
    await vi.waitFor(() => expect(handle.focusAtEnd).toHaveBeenCalled());
  },
);
