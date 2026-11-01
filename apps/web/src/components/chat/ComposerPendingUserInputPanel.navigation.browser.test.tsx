import {
  EnvironmentId,
  NodeId,
  ProviderSessionId,
  RuntimeRequestId,
  ThreadId,
  TurnItemId,
  type OrchestrationV2ThreadProjection,
} from "@t3tools/contracts";
import { makeThreadRequestsResolvedAnnouncer } from "@t3tools/client-runtime/state/thread-requests";
import { useLayoutEffect, useRef, type ComponentProps } from "react";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { t } from "~/i18n";
import "~/index.css";

const approvalCommands = vi.hoisted(() => ({ respond: vi.fn() }));
vi.mock(import("../../state/use-orchestration-command"), async (original) => ({
  ...(await original()),
  useOrchestrationCommand: (() => approvalCommands.respond) as never,
}));
vi.mock(import("../../state/session"), async (original) => ({
  ...(await original()),
  readEnvironmentScope: () => true,
}));

vi.mock(import("../ChatMarkdown"), async (importOriginal) => ({
  ...(await importOriginal()),
  default: (({ text }: { text: string }) => <p>{text}</p>) as never,
}));

import { act, fakeTimers, render } from "../../../test/render";
import { makeThreadProjectionFixture } from "../../test-fixtures";
import { usePendingThreadRequests } from "./usePendingThreadRequests";
import { ComposerPendingApprovalActions } from "./ComposerPendingApprovalActions";
import { ComposerPendingApprovalPanel } from "./ComposerPendingApprovalPanel";
import type { PendingApproval } from "../../session-logic";

const threadRef = { environmentId: EnvironmentId.make("env"), threadId: ThreadId.make("thread") };

const prompt = {
  requestId: RuntimeRequestId.make("question-navigation"),
  createdAt: "2026-10-09T00:00:00.000Z",
  dismissible: false,
  responseCapability: "live" as const,
  questions: [0, 1, 2].map((index) => ({
    id: `question-${index}`,
    header: `Question ${index + 1}`,
    question: `Choose for question ${index + 1}`,
    options: [{ label: "Incremental", description: "One module at a time" }],
    multiSelect: false,
  })),
};

function questionProjection(threadId: ThreadId, requestIds = ["first", "second"]) {
  const projection = makeThreadProjectionFixture();
  return {
    ...projection,
    thread: { ...projection.thread, id: threadId },
    runtimeRequests: requestIds.map((id) => ({
      id: RuntimeRequestId.make(id),
      nodeId: NodeId.make(id),
      providerTurnId: null,
      nativeRequestRef: null,
      kind: "user_input" as const,
      status: "pending" as const,
      responseCapability: { type: "message" as const },
      createdAt: projection.updatedAt,
      resolvedAt: null,
    })),
    turnItems: requestIds.map((id, ordinal) => ({
      id: TurnItemId.make(id),
      threadId,
      runId: null,
      nodeId: NodeId.make(id),
      providerThreadId: null,
      providerTurnId: null,
      nativeItemRef: null,
      parentItemId: null,
      ordinal,
      status: "completed" as const,
      title: null,
      startedAt: projection.updatedAt,
      completedAt: projection.updatedAt,
      updatedAt: projection.updatedAt,
      type: "user_input_request" as const,
      requestId: RuntimeRequestId.make(id),
      questions: prompt.questions,
    })),
  } satisfies OrchestrationV2ThreadProjection;
}

interface ProbeProps {
  environmentId: EnvironmentId;
  projection: OrchestrationV2ThreadProjection;
  loading?: boolean;
}

function useProbeRequests({ environmentId, projection, loading = false }: ProbeProps) {
  const promptRef = useRef("");
  const composerRef = useRef(null);
  return usePendingThreadRequests({
    environmentId,
    activeThreadId: projection.thread.id,
    serverProjection: loading ? null : projection,
    supportsQuestionAttachments: false,
    composerDraftTarget: { environmentId, threadId: projection.thread.id },
    setComposerDraftPrompt: () => {},
    promptRef,
    composerRef,
    setThreadError: () => {},
  });
}

let requests: ReturnType<typeof usePendingThreadRequests>;

function PendingRequestsProbe(props: ProbeProps) {
  const state = useProbeRequests(props);
  useLayoutEffect(() => {
    requests = state;
  });
  return null;
}

it("retains answers, selections and question position after leaving chat, including while the projection reloads", async () => {
  using _timers = fakeTimers();
  const environmentId = EnvironmentId.make("remount-environment");
  const projection = questionProjection(threadRef.threadId);
  const probe = (loading = false) => (
    <PendingRequestsProbe environmentId={environmentId} projection={projection} loading={loading} />
  );
  await using screen = await render(probe());
  await act(() =>
    requests.onChangeActivePendingUserInputCustomAnswer("question-0", "Keep my text"),
  );
  await act(() => requests.onAdvanceActivePendingUserInput());
  await act(() => requests.onSelectActivePendingUserInputOption("question-1", "Incremental"));
  await act(() => requests.onAdvanceActivePendingUserInput());
  const expected = {
    activePendingQuestionIndex: 2,
    activePendingDraftAnswers: {
      "question-0": { customAnswer: "Keep my text" },
      "question-1": { selectedOptionValues: ["Incremental"] },
    },
  };
  expect(requests).toMatchObject(expected);

  // New thread and Settings both unmount the chat that owns this hook.
  await screen.rerender(null);
  await screen.rerender(probe());
  expect(requests).toMatchObject(expected);

  await screen.rerender(null);
  await screen.rerender(probe(true));
  expect(requests.activePendingUserInput).toBeNull();
  await screen.rerender(probe());
  expect(requests).toMatchObject(expected);
});

function QuestionPositionProbe(props: ProbeProps) {
  const state = useProbeRequests(props);
  return (
    <>
      <output>Question {state.activePendingQuestionIndex + 1}</output>
      <button
        type="button"
        onClick={() => state.onSelectActivePendingUserInputOption("question-0", "Incremental")}
      >
        Choose Incremental
      </button>
      <button type="button" onClick={() => state.onAdvanceActivePendingUserInput()}>
        Submit
      </button>
    </>
  );
}

it("stays on an unanswered question when the composer submits", async () => {
  await using screen = await render(
    <QuestionPositionProbe
      environmentId={EnvironmentId.make("unanswered-environment")}
      projection={questionProjection(threadRef.threadId)}
    />,
  );
  const submit = screen.getByRole("button", { name: "Submit" });
  await userEvent.click(submit);
  await expect.element(screen.getByRole("status")).toHaveTextContent("Question 1");

  await userEvent.click(screen.getByRole("button", { name: "Choose Incremental" }));
  await userEvent.click(submit);
  await expect.element(screen.getByRole("status")).toHaveTextContent("Question 2");
});

it("isolates drafts by environment, thread and request and discards only resolved requests", async () => {
  using _timers = fakeTimers();
  const environmentId = EnvironmentId.make("scope-environment");
  const projection = questionProjection(threadRef.threadId);
  const scopes = [
    { environmentId, projection },
    { environmentId: EnvironmentId.make("other-environment"), projection },
    { environmentId, projection: questionProjection(ThreadId.make("other-thread")) },
    { environmentId, projection: questionProjection(threadRef.threadId, ["second", "first"]) },
  ];
  await using screen = await render(null);
  const show = (scope: ComponentProps<typeof PendingRequestsProbe>) =>
    screen.rerender(<PendingRequestsProbe {...scope} />);
  for (const [index, scope] of scopes.entries()) {
    await show(scope);
    expect(requests.activePendingQuestionIndex).toBe(0);
    expect(requests.activePendingDraftAnswers["question-0"]?.customAnswer).toBeUndefined();
    await act(() =>
      requests.onChangeActivePendingUserInputCustomAnswer("question-0", `Answer ${index}`),
    );
    await act(() => requests.onAdvanceActivePendingUserInput());
  }

  // "first" was answered on another device.
  await show({
    environmentId,
    projection: {
      ...projection,
      runtimeRequests: projection.runtimeRequests.map((request) =>
        request.id === "first"
          ? { ...request, status: "resolved", resolvedAt: projection.updatedAt }
          : request,
      ),
    },
  });
  expect(requests.activePendingUserInput?.requestId).toBe("second");
  await act(() =>
    makeThreadRequestsResolvedAnnouncer(
      environmentId,
      threadRef.threadId,
    )([RuntimeRequestId.make("second")]),
  );
  for (const [index, scope] of scopes.entries()) {
    await show(scope);
    expect(requests.activePendingQuestionIndex).toBe(index === 0 ? 0 : 1);
    expect(requests.activePendingDraftAnswers["question-0"]?.customAnswer).toBe(
      index === 0 ? undefined : `Answer ${index}`,
    );
  }
});

/** Mounts the pending request hook with the same approval panel/actions used beside ChatComposer. */
function ComposerApprovalProbe(props: ProbeProps & { disabled?: boolean }) {
  const state = useProbeRequests(props);
  const approval = state.activePendingApproval;
  return approval ? (
    <>
      <ComposerPendingApprovalPanel
        approval={approval}
        pendingCount={state.pendingApprovals.length}
      />
      <ComposerPendingApprovalActions
        requestId={approval.requestId}
        disabled={props.disabled ?? false}
        isResponding={state.respondingRequestIds.includes(approval.requestId)}
        canRespond={approval.responseCapability === "live"}
        options={approval.options}
        onRespondToApproval={state.onRespondToApproval}
      />
    </>
  ) : (
    <p>Composer ready</p>
  );
}

it("keeps concurrent composer approvals actionable and restores the input after both settle", async () => {
  approvalCommands.respond.mockReset().mockResolvedValue({ _tag: "Success", value: {} });
  const commandRequest = RuntimeRequestId.make("command-approval");
  const appRequest = RuntimeRequestId.make("app-approval");
  const approvals: PendingApproval[] = [
    {
      requestId: commandRequest,
      requestKind: "command",
      createdAt: "2026-10-09T00:00:00.000Z",
      detail: "printf '" + "long-command ".repeat(80) + "'",
      reason: "Needs permission to run the command",
      fullAccessOverride: "ask_rule",
      responseCapability: "live",
    },
    {
      requestId: appRequest,
      requestKind: "permission",
      createdAt: "2026-10-09T00:00:00.000Z",
      detail: "Open the current tab",
      appName: "Safari",
      options: [
        { decision: "decline", label: "Deny" },
        { decision: "accept", label: "Allow once" },
        {
          decision: "acceptAlways",
          label: "Always allow Safari",
          warning: "Applies to future requests",
        },
      ],
      responseCapability: "live",
    },
  ];
  const base = questionProjection(threadRef.threadId, ["command-approval", "app-approval"]);
  const projection = {
    ...base,
    runtimeRequests: base.runtimeRequests.map((request, index) => ({
      ...request,
      kind: approvals[index]!.requestKind,
      responseCapability: {
        type: "live" as const,
        providerSessionId: ProviderSessionId.make("approvals"),
      },
    })),
    turnItems: base.turnItems.map(({ questions: _questions, ...item }, index) => ({
      ...item,
      type: "approval_request" as const,
      requestKind: approvals[index]!.requestKind,
      prompt: approvals[index]!.detail,
      reason: approvals[index]!.reason,
      fullAccessOverride: approvals[index]!.fullAccessOverride,
      appName: approvals[index]!.appName,
      options: approvals[index]!.options,
    })),
  } satisfies OrchestrationV2ThreadProjection;
  const ui = (current: OrchestrationV2ThreadProjection = projection, disabled = false) => (
    <ComposerApprovalProbe
      environmentId={threadRef.environmentId}
      projection={current}
      disabled={disabled}
    />
  );
  await using screen = await render(ui());
  await expect
    .element(screen.getByRole("group", { name: t.composer.approval.commandTitle }))
    .toBeVisible();
  await expect.element(screen.getByText("1/2", { exact: true })).toBeVisible();
  await expect.element(screen.getByText(approvals[0]!.detail!, { exact: false })).toBeVisible();
  await expect.element(screen.getByText("Needs permission to run the command")).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: t.composer.approval.fullAccessOverride.question }),
  );
  await expect
    .element(page.getByText(t.composer.approval.fullAccessOverride.askRule))
    .toBeVisible();
  await userEvent.keyboard("{Escape}");
  await userEvent.click(screen.getByRole("button", { name: t.composer.approval.moreOptions }));
  await userEvent.click(page.getByRole("menuitem", { name: t.composer.approval.allowSession }));
  expect(approvalCommands.respond).toHaveBeenLastCalledWith({
    environmentId: threadRef.environmentId,
    input: {
      threadId: threadRef.threadId,
      requestId: commandRequest,
      decision: "acceptForSession",
    },
  });
  await userEvent.click(
    screen.getByRole("button", { name: t.composer.approval.decline, exact: true }),
  );
  expect(approvalCommands.respond).toHaveBeenLastCalledWith({
    environmentId: threadRef.environmentId,
    input: { threadId: threadRef.threadId, requestId: commandRequest, decision: "decline" },
  });
  await screen.rerender(ui(projection, true));
  await expect
    .element(screen.getByRole("button", { name: t.composer.approval.approve, exact: true }))
    .toBeDisabled();
  await expect
    .element(screen.getByRole("button", { name: t.composer.approval.moreOptions }))
    .toBeDisabled();
  await screen.rerender(
    ui({
      ...projection,
      runtimeRequests: projection.runtimeRequests.map((request) => ({
        ...request,
        responseCapability: { type: "not_resumable", reason: "Provider exited" },
      })),
    }),
  );
  await expect.element(screen.getByText(t.composer.approval.processGoneHint)).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: t.composer.approval.approve, exact: true }))
    .toBeDisabled();
  await screen.rerender(ui());
  let finishResponse!: () => void;
  const pending = new Promise<{ _tag: "Success"; value: object }>((resolve) => {
    finishResponse = () => resolve({ _tag: "Success", value: {} });
  });
  approvalCommands.respond.mockReturnValueOnce(pending);
  await userEvent.click(
    screen.getByRole("button", { name: t.composer.approval.approve, exact: true }),
  );
  await expect
    .element(screen.getByRole("button", { name: t.composer.approval.approve, exact: true }))
    .toBeDisabled();
  expect(approvalCommands.respond).toHaveBeenLastCalledWith({
    environmentId: threadRef.environmentId,
    input: { threadId: threadRef.threadId, requestId: commandRequest, decision: "accept" },
  });
  await act(finishResponse);
  await expect
    .element(screen.getByRole("button", { name: t.composer.approval.approve, exact: true }))
    .toBeEnabled();
  const commandResolved = {
    ...projection,
    runtimeRequests: [
      {
        ...projection.runtimeRequests[0]!,
        status: "resolved" as const,
        resolvedAt: projection.updatedAt,
      },
      projection.runtimeRequests[1]!,
    ],
  };
  await screen.rerender(ui(commandResolved));
  await expect
    .element(screen.getByRole("group", { name: t.composer.approval.commandTitle }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByText("Safari", { exact: true })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: t.composer.approval.moreOptions }));
  await userEvent.click(page.getByRole("menuitem", { name: "Always allow Safari" }));
  expect(approvalCommands.respond).toHaveBeenLastCalledWith({
    environmentId: threadRef.environmentId,
    input: { threadId: threadRef.threadId, requestId: appRequest, decision: "acceptAlways" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Allow once", exact: true }));
  expect(approvalCommands.respond).toHaveBeenLastCalledWith({
    environmentId: threadRef.environmentId,
    input: { threadId: threadRef.threadId, requestId: appRequest, decision: "accept" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Deny", exact: true }));
  expect(approvalCommands.respond).toHaveBeenLastCalledWith({
    environmentId: threadRef.environmentId,
    input: { threadId: threadRef.threadId, requestId: appRequest, decision: "decline" },
  });
  await screen.rerender(
    ui({
      ...projection,
      runtimeRequests: projection.runtimeRequests.map((request) => ({
        ...request,
        status: "resolved",
        resolvedAt: projection.updatedAt,
      })),
    }),
  );
  await expect.element(screen.getByText("Composer ready")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Allow once", exact: true }))
    .not.toBeInTheDocument();
  await screen.rerender(ui());
  await expect
    .element(screen.getByRole("button", { name: t.composer.approval.approve, exact: true }))
    .toBeEnabled();
});
