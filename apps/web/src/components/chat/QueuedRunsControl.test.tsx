/**
 * Verifies queued-message display and editing through the composer's form boundary.
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  projection: null as unknown,
  workflow: null as unknown,
}));

vi.mock("@t3tools/client-runtime/environment", () => ({
  scopeThreadRef: () => ({}) as never,
}));

vi.mock("@t3tools/client-runtime/state/thread-workflows", () => ({
  deriveThreadQueueWorkflowState: () => state.workflow,
}));

vi.mock("../../state/entities", () => ({
  useThreadProjection: () => state.projection,
  useQuietThreadShell: () => undefined,
}));

vi.mock("../../state/threads", () => ({
  threadEnvironment: {
    cancelQueuedRun: Symbol("cancelQueuedRun"),
    promoteQueuedRun: Symbol("promoteQueuedRun"),
    reorderQueuedRun: Symbol("reorderQueuedRun"),
  },
}));

vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: () => async () => undefined,
}));

vi.mock("../../assets/assetUrls", () => ({
  useAssetUrls: (_environmentId: never, resources: ReadonlyArray<{ attachmentId: string }>) =>
    resources.map((resource) => `https://assets.test/${resource.attachmentId}`),
}));

import { setPhysicsEnabled } from "../../lib/motion/preference";
import { installTestRaf } from "../../lib/motion/testRaf";
import { QueuedRunsControl } from "./QueuedRunsControl";
import { ComposerPrimaryActions } from "./ComposerPrimaryActions";
import { ComposerSubmissionStateContext } from "./composerSubmissionState";
import {
  getComposerSubmissionState,
  type ComposerSubmissionInput,
} from "./composerSubmissionState.logic";

vi.mock("~/hooks/useSettings", () => ({
  useEnvironmentIdentificationMode: () => "none",
}));

vi.mock("../SidebarStageBackdrop", () => ({
  StageBackdropButtonArt: () => null,
  useSidebarStageBackdropVariant: () => null,
}));

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  setPhysicsEnabled(false);
  vi.unstubAllGlobals();
});

describe("QueuedRunsControl automatic completion delivery", () => {
  it("does not render a queue control when only hidden delivery remains", () => {
    state.projection = {
      projection: {
        messages: [
          {
            delegatedCompletion: {
              parentRunId: "run:parent",
              generation: 1,
              taskIds: ["task:child"],
            },
            id: "message:completion",
          },
        ],
      },
    };
    state.workflow = {
      activeRun: { id: "run:active" },
      canPromoteToSteer: true,
      canReorder: true,
      queuedRuns: [],
    };

    const html = renderToStaticMarkup(
      <QueuedRunsControl
        environmentId={"environment:test" as never}
        optimisticMessages={[]}
        threadId={"thread:test" as never}
        editingRunId={null}
        onEditQueuedRun={() => undefined}
        onCancelEdit={() => undefined}
      />,
    );

    expect(html).toBe("");
  });
});

describe("QueuedRunsControl attachments and edit mode", () => {
  const workflowWithAttachment = () => ({
    activeRun: { id: "run:active" },
    canPromoteToSteer: true,
    canReorder: true,
    queuedRuns: [
      {
        run: { id: "run:queued", userMessageId: "message:queued" },
        text: "Queued with a screenshot",
        attachments: [
          {
            type: "image",
            id: "attachment-1",
            name: "screenshot.png",
            mimeType: "image/png",
            sizeBytes: 128,
          },
        ],
      },
    ],
  });

  it("pops only the visible collapsed count when a second message arrives", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const clock = installTestRaf();
    setPhysicsEnabled(true);
    state.projection = { projection: { messages: [] } };
    state.workflow = workflowWithAttachment();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const renderQueue = () =>
      root?.render(
        <QueuedRunsControl
          environmentId={"environment:test" as never}
          threadId={"thread:test" as never}
          optimisticMessages={[]}
          editingRunId={null}
          onEditQueuedRun={() => undefined}
          onCancelEdit={() => undefined}
        />,
      );
    await act(async () => renderQueue());
    await act(async () =>
      container!
        .querySelector<HTMLButtonElement>('button[aria-label="Collapse queued messages"]')!
        .click(),
    );
    state.projection = { projection: { messages: [] } };
    const workflow = workflowWithAttachment();
    state.workflow = {
      ...workflow,
      queuedRuns: [
        ...workflow.queuedRuns,
        {
          run: { id: "run:second", userMessageId: "message:second" },
          text: "Second message",
          attachments: [],
        },
      ],
    };
    await act(async () => renderQueue());
    clock.advance(0);
    const visible = container.querySelector<HTMLSpanElement>(
      'li:not(.hidden) button[aria-label="Expand queued messages"] > span',
    )!;
    const hidden = container.querySelector<HTMLSpanElement>(
      'li.hidden button[aria-label="Expand queued messages"] > span',
    )!;
    expect(visible).not.toBeNull();
    expect(hidden).not.toBeNull();
    expect(visible.style.transform).toMatch(/^scale\(1\.\d+\)$/);
    expect(hidden.style.transform).toBe("");
  });

  it("expands the queue when edit is chosen from the collapsed row", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.projection = { projection: { messages: [] } };
    state.workflow = workflowWithAttachment();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <QueuedRunsControl
          environmentId={"environment:test" as never}
          optimisticMessages={[]}
          threadId={"thread:test" as never}
          editingRunId={null}
          onEditQueuedRun={() => undefined}
          onCancelEdit={() => undefined}
        />,
      );
    });
    const collapse = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Collapse queued messages"]',
    );
    expect(collapse).not.toBeNull();
    await act(async () => collapse?.click());
    expect(container.querySelector('button[aria-label="Expand queued messages"]')).not.toBeNull();
    const edit = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit queued message"]',
    );
    expect(edit).not.toBeNull();
    await act(async () => edit?.click());
    expect(container.querySelector('button[aria-label="Collapse queued messages"]')).not.toBeNull();
  });

  it("saves an edited row through the composer form without submitting on cancel", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.projection = { projection: { messages: [] } };
    state.workflow = workflowWithAttachment();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const onSubmit = vi.fn();
    await act(async () => {
      root?.render(
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <ComposerSubmissionStateContext value={{ disabled: false, busy: false }}>
            <QueuedRunsControl
              environmentId={"environment:test" as never}
              optimisticMessages={[]}
              threadId={"thread:test" as never}
              editingRunId={"run:queued" as never}
              onEditQueuedRun={() => undefined}
              onCancelEdit={() => undefined}
            />
          </ComposerSubmissionStateContext>
        </form>,
      );
    });
    const cancel = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Cancel editing queued message"]',
    );
    const save = container.querySelector<HTMLButtonElement>('button[aria-label="Save"]');
    expect(cancel).not.toBeNull();
    expect(save).not.toBeNull();
    await act(async () => cancel?.click());
    expect(onSubmit).not.toHaveBeenCalled();
    await act(async () => save?.click());
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it.each<{
    scenario: string;
    overrides: Partial<ComposerSubmissionInput>;
    busy: boolean;
  }>([
    {
      scenario: "the draft has no text or attachments",
      overrides: { hasSendableContent: false },
      busy: false,
    },
    { scenario: "an edit is being saved", overrides: { isSendBusy: true }, busy: true },
    {
      scenario: "the connection is being established",
      overrides: { isConnecting: true },
      busy: true,
    },
    {
      scenario: "operate permission has been revoked",
      overrides: { canOperateThread: false },
      busy: false,
    },
    {
      scenario: "another send restriction applies",
      overrides: { sendDisabledReason: "Uploads pending" },
      busy: false,
    },
    {
      scenario: "the environment is unavailable",
      overrides: { isEnvironmentUnavailable: true },
      busy: false,
    },
  ])(
    "blocks both save entries when $scenario, then enables them on recovery",
    async ({ overrides, busy }) => {
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      state.projection = { projection: { messages: [] } };
      state.workflow = workflowWithAttachment();
      container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
      const onSubmit = vi.fn();
      const ready: ComposerSubmissionInput = {
        canOperateThread: true,
        isSendBusy: false,
        sendDisabledReason: null,
        isConnecting: false,
        isEnvironmentUnavailable: false,
        hasSendableContent: true,
      };
      const render = async (input: ComposerSubmissionInput) => {
        await act(async () => {
          root?.render(
            <ComposerSubmissionStateContext value={getComposerSubmissionState(input)}>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  onSubmit();
                }}
              >
                <QueuedRunsControl
                  environmentId={"environment:test" as never}
                  optimisticMessages={[]}
                  threadId={"thread:test" as never}
                  editingRunId={"run:queued" as never}
                  onEditQueuedRun={() => undefined}
                  onCancelEdit={() => undefined}
                />
                <ComposerPrimaryActions
                  {...input}
                  compact={false}
                  pendingAction={null}
                  isRunning
                  canInterrupt
                  showPlanFollowUpPrompt={false}
                  promptHasText={input.hasSendableContent}
                  isPreparingWorktree={false}
                  isEditingQueuedMessage
                  onPreviousPendingQuestion={() => undefined}
                  onInterrupt={() => undefined}
                  onImplementPlanInNewThread={() => undefined}
                />
              </form>
            </ComposerSubmissionStateContext>,
          );
        });
      };
      await render({ ...ready, ...overrides });
      const saves = container.querySelectorAll<HTMLButtonElement>('button[type="submit"]');
      expect(saves).toHaveLength(2);
      // Check the footer first: the regression is the inline save remaining actionable.
      expect(saves[1]?.disabled).toBe(true);
      expect(saves[0]?.disabled).toBe(true);
      for (const save of saves) {
        expect(save.getAttribute("aria-busy")).toBe(String(busy));
        await act(async () => save.click());
      }
      expect(onSubmit).not.toHaveBeenCalled();
      await render(ready);
      for (const save of saves) {
        expect(save.disabled).toBe(false);
        expect(save.getAttribute("aria-busy")).toBe("false");
        await act(async () => save.click());
      }
      expect(onSubmit).toHaveBeenCalledTimes(2);
    },
  );

  it("renders an attachment thumbnail on the queued row", () => {
    state.projection = { projection: { messages: [] } };
    state.workflow = workflowWithAttachment();

    const html = renderToStaticMarkup(
      <QueuedRunsControl
        environmentId={"environment:test" as never}
        optimisticMessages={[]}
        threadId={"thread:test" as never}
        editingRunId={null}
        onEditQueuedRun={() => undefined}
        onCancelEdit={() => undefined}
      />,
    );

    expect(html).toContain("https://assets.test/attachment-1");
    expect(html).toContain("Queued with a screenshot");
    expect(html).toContain("Edit queued message");
    expect(html).toContain("Reorder queued message");
    expect(html).not.toContain("Move queued message up");
  });

  it("drops the optimistic pending row once the projection holds its message", () => {
    state.projection = {
      projection: { messages: [{ id: "message:acknowledged", text: "hello" }] },
    };
    state.workflow = {
      activeRun: { id: "run:active" },
      canPromoteToSteer: true,
      canReorder: true,
      queuedRuns: [],
    };

    const html = renderToStaticMarkup(
      <QueuedRunsControl
        environmentId={"environment:test" as never}
        optimisticMessages={[
          {
            id: "message:acknowledged" as never,
            inputIntent: "queued_turn",
            text: "hello",
            attachments: [],
          },
        ]}
        threadId={"thread:test" as never}
        editingRunId={null}
        onEditQueuedRun={() => undefined}
        onCancelEdit={() => undefined}
      />,
    );

    expect(html).toBe("");
  });

  it("keeps the original queued message visible while editing", () => {
    state.projection = { projection: { messages: [] } };
    state.workflow = workflowWithAttachment();

    const html = renderToStaticMarkup(
      <QueuedRunsControl
        environmentId={"environment:test" as never}
        optimisticMessages={[]}
        threadId={"thread:test" as never}
        editingRunId={"run:queued" as never}
        onEditQueuedRun={() => undefined}
        onCancelEdit={() => undefined}
      />,
    );

    expect(html).toContain("Queued with a screenshot");
  });
});
