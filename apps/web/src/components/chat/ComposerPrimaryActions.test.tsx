/**
 * Verifies primary action visibility and dispatch at the composer's form boundary.
 * @vitest-environment jsdom
 */
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const stageArtworkState = vi.hoisted(() => ({
  mode: "none" as "artwork" | "none",
  variant: null as "nightly" | "dev" | null,
}));

vi.mock("~/hooks/useSettings", () => ({
  useEnvironmentIdentificationMode: () => stageArtworkState.mode,
}));
vi.mock("../SidebarStageBackdrop", () => ({
  StageBackdropButtonArt: ({ variant }: { variant: string }) => `stage-${variant}`,
  useSidebarStageBackdropVariant: (mode: "artwork" | "none") =>
    mode === "artwork" ? stageArtworkState.variant : null,
}));

import { ComposerPrimaryActions } from "./ComposerPrimaryActions";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

/** Mounts the real action inside a form; overrides describe the current conversation state. */
async function mountActions(
  overrides: Partial<ComponentProps<typeof ComposerPrimaryActions>> = {},
) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const onSubmit = vi.fn();
  const onResume = vi.fn();
  await act(async () => {
    root?.render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <ComposerPrimaryActions
          compact={false}
          canOperateThread
          pendingAction={null}
          isRunning={false}
          canInterrupt={false}
          showPlanFollowUpPrompt={false}
          promptHasText
          isSendBusy={false}
          sendDisabledReason={null}
          isConnecting={false}
          isEnvironmentUnavailable={false}
          isPreparingWorktree={false}
          hasSendableContent
          onResume={onResume}
          onPreviousPendingQuestion={() => {}}
          onInterrupt={() => {}}
          onImplementPlanInNewThread={() => {}}
          {...overrides}
        />
      </form>,
    );
  });
  const button = container.querySelector("button");
  if (!button) throw new Error("Primary action is missing");
  return { button, onSubmit, onResume };
}

function renderPendingActions(isRunning: boolean) {
  return renderToStaticMarkup(
    createElement(ComposerPrimaryActions, {
      compact: true,
      canOperateThread: true,
      pendingAction: {
        questionIndex: 0,
        isLastQuestion: true,
        canAdvance: true,
        isResponding: false,
        isComplete: true,
      },
      isRunning,
      canInterrupt: isRunning,
      showPlanFollowUpPrompt: false,
      promptHasText: false,
      isSendBusy: false,
      sendDisabledReason: null,
      isConnecting: false,
      isEnvironmentUnavailable: false,
      isPreparingWorktree: false,
      hasSendableContent: false,
      onPreviousPendingQuestion: () => {},
      onInterrupt: () => {},
      onImplementPlanInNewThread: () => {},
    }),
  );
}

function renderSendButton(sendDisabledReason: string | null = null) {
  return renderToStaticMarkup(
    createElement(ComposerPrimaryActions, {
      compact: true,
      canOperateThread: true,
      pendingAction: null,
      isRunning: false,
      canInterrupt: false,
      showPlanFollowUpPrompt: false,
      promptHasText: true,
      isSendBusy: false,
      sendDisabledReason,
      isConnecting: false,
      isEnvironmentUnavailable: false,
      isPreparingWorktree: false,
      hasSendableContent: true,
      onPreviousPendingQuestion: () => {},
      onInterrupt: () => {},
      onImplementPlanInNewThread: () => {},
    }),
  );
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  vi.unstubAllGlobals();
  stageArtworkState.mode = "none";
  stageArtworkState.variant = null;
});

describe("ComposerPrimaryActions", () => {
  it("opens the ready plan in a new thread without submitting the current form", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const onImplementPlanInNewThread = vi.fn();
    const { onSubmit } = await mountActions({
      showPlanFollowUpPrompt: true,
      promptHasText: false,
      onImplementPlanInNewThread,
    });
    const newThreadButton = Array.from(container!.querySelectorAll("button")).find(
      (button) => button.textContent === "Implement in a new thread",
    );
    expect(newThreadButton, "U1 exposes the existing new-thread action directly").toBeDefined();
    await act(async () => newThreadButton!.click());
    expect(onImplementPlanInNewThread).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("labels the queued edit check as Save and keeps the existing form submission", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const { button, onSubmit } = await mountActions({
      isRunning: true,
      isEditingQueuedMessage: true,
    });
    expect(button.getAttribute("aria-label")).toBe("Save");
    expect(button.textContent).toBe("");
    await act(async () => button.click());
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("keeps ordinary send icon-only and submits the form", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const { button, onSubmit } = await mountActions();

    expect(button.textContent).toBe("");
    expect(button.getAttribute("aria-label")).toBe("Send message");
    await act(async () => button.click());
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("shows steer and queue text as Control changes the running action", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const { button, onSubmit } = await mountActions({ isRunning: true, canInterrupt: true });

    expect(button.textContent).toBe("Steer message");
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", ctrlKey: true }));
    });
    expect(button.textContent).toBe("Queue message");
    await act(async () => button.click());
    expect(onSubmit).toHaveBeenCalledOnce();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Control" }));
    });
    expect(button.textContent).toBe("Steer message");
  });

  it("shows the configured queue default and the alternate steer label", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const { button } = await mountActions({ isRunning: true, followUpBehavior: "queue" });

    expect(button.textContent).toBe("Queue message");
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", ctrlKey: true }));
    });
    expect(button.textContent).toBe("Steer message");
  });

  it("shows continue text and resumes without submitting an empty form", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const { button, onResume, onSubmit } = await mountActions({
      canResume: true,
      hasSendableContent: false,
      promptHasText: false,
    });

    expect(button.textContent).toBe("Continue conversation");
    await act(async () => button.click());
    expect(onResume).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables and labels the send button while feedback is uploading", () => {
    const markup = renderSendButton("Sending feedback");

    expect(markup).toContain("disabled");
    expect(markup).toContain('aria-label="Sending feedback"');
  });

  it("offers Stop generation while a running turn is waiting for user input", () => {
    expect(renderPendingActions(true)).toContain('aria-label="Stop generation"');
  });

  it("does not offer Stop generation for a pending request without a running turn", () => {
    expect(renderPendingActions(false)).not.toContain('aria-label="Stop generation"');
  });

  it("renders stage artwork inside the send button when artwork identification is active", () => {
    stageArtworkState.mode = "artwork";
    stageArtworkState.variant = "nightly";

    const markup = renderSendButton();

    expect(markup).toContain("stage-nightly");
  });

  it("hides stage artwork when artwork identification is inactive", () => {
    stageArtworkState.variant = "nightly";

    const markup = renderSendButton();

    expect(markup).not.toContain("stage-nightly");
  });
});
