/** Protects composer rendering from unrelated thread activity at the atom subscription boundary. */
import { RegistryContext } from "@effect/atom-react";
import { Atom, AtomRegistry } from "effect/reactivity";
import {
  EnvironmentId,
  MessageId,
  RunId,
  TurnItemId,
  type OrchestrationV2Run,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { act, render } from "../../../test/render";
import {
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationV2ThreadShell,
  type OrchestrationV2ThreadProjection,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { useComposerSuggestionMetadata } from "./useComposerSuggestion";

const v2Now = DateTime.makeUnsafe("2026-06-20T00:00:00.000Z");
const v2ProjectId = ProjectId.make("project-v2");
const v2ThreadId = ThreadId.make("thread-v2");
const v2ProviderInstanceId = ProviderInstanceId.make("codex");

const v2ThreadShell: OrchestrationV2ThreadShell = {
  id: v2ThreadId,
  projectId: v2ProjectId,
  title: "Thread",
  providerInstanceId: v2ProviderInstanceId,
  modelSelection: { instanceId: v2ProviderInstanceId, model: "gpt-5.4" },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  activeProviderThreadId: null,
  lineage: { rootThreadId: v2ThreadId, parentThreadId: null, relationshipToParent: null },
  forkedFrom: null,
  createdBy: "user",
  creationSource: "web",
  latestRunId: null,
  activeRunId: null,
  status: "idle",
  pendingRuntimeRequest: null,
  latestVisibleMessage: null,
  latestUserMessageAt: null,
  hasActionableProposedPlan: false,
  itemCount: 0,
  visibleItemCount: 0,
  createdAt: v2Now,
  updatedAt: v2Now,
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  lastVisitedAt: null,
  deletedAt: null,
};

const v2Projection: OrchestrationV2ThreadProjection = {
  thread: {
    id: v2ThreadShell.id,
    projectId: v2ThreadShell.projectId,
    title: v2ThreadShell.title,
    providerInstanceId: v2ThreadShell.providerInstanceId,
    modelSelection: v2ThreadShell.modelSelection,
    runtimeMode: v2ThreadShell.runtimeMode,
    interactionMode: v2ThreadShell.interactionMode,
    branch: v2ThreadShell.branch,
    worktreePath: v2ThreadShell.worktreePath,
    activeProviderThreadId: v2ThreadShell.activeProviderThreadId,
    lineage: v2ThreadShell.lineage,
    forkedFrom: v2ThreadShell.forkedFrom,
    createdBy: v2ThreadShell.createdBy,
    creationSource: v2ThreadShell.creationSource,
    createdAt: v2Now,
    updatedAt: v2Now,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    lastVisitedAt: null,
    deletedAt: null,
  },
  runs: [],
  attempts: [],
  nodes: [],
  subagents: [],
  providerSessions: [],
  providerThreads: [],
  providerTurns: [],
  runtimeRequests: [],
  messages: [],
  plans: [],
  turnItems: [],
  checkpointScopes: [],
  checkpoints: [],
  contextHandoffs: [],
  contextTransfers: [],
  visibleTurnItems: [],
  updatedAt: v2Now,
};

const source = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock(import("../../state/threads"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    environmentThreadDetails: {
      ...actual.environmentThreadDetails,
      threadAtom: source.read,
      quietThreadAtom: source.read,
    },
  };
});

/** Records render commits while displaying the actual selected value. */
function Probe({
  enabled = true,
  driver = "codex",
  rendered,
}: {
  enabled?: boolean;
  driver?: string;
  rendered: () => void;
}) {
  const data = useComposerSuggestionMetadata(
    { environmentId: EnvironmentId.make("test"), threadId: v2ThreadShell.id },
    enabled,
    driver,
  );
  rendered();
  return <output>{data.completedRuns}</output>;
}

it("ignores tool output and new tool entries but renders a completed run", async () => {
  using stack = new DisposableStack();
  const registry = stack.adopt(AtomRegistry.make(), (registry) => registry.dispose());
  const tool: OrchestrationV2TurnItem = {
    id: TurnItemId.make("tool-1"),
    threadId: v2ThreadShell.id,
    runId: RunId.make("run-1"),
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: 1,
    status: "running",
    title: null,
    startedAt: v2Now,
    completedAt: null,
    updatedAt: v2Now,
    type: "command_execution",
    input: "test",
    output: "first line",
  };
  const projection = { ...v2Projection, turnItems: [tool] };
  const atom = Atom.make({ environmentId: EnvironmentId.make("test"), projection });
  source.read.mockReset().mockReturnValue(atom);
  const rendered = vi.fn();
  await using screen = await render(
    <RegistryContext.Provider value={registry}>
      <Probe rendered={rendered} />
    </RegistryContext.Provider>,
  );
  await expect.element(screen.getByRole("status")).toHaveTextContent("0");
  const initial = rendered.mock.calls.length;
  await act(() =>
    registry.set(atom, {
      environmentId: EnvironmentId.make("test"),
      projection: { ...projection, turnItems: [{ ...tool, output: "second line" }] },
    }),
  );
  expect(rendered).toHaveBeenCalledTimes(initial);
  await act(() =>
    registry.set(atom, {
      environmentId: EnvironmentId.make("test"),
      projection: { ...projection, turnItems: [tool, { ...tool, id: TurnItemId.make("tool-2") }] },
    }),
  );
  expect(rendered).toHaveBeenCalledTimes(initial);
  const run: OrchestrationV2Run = {
    id: RunId.make("run-1"),
    threadId: v2ThreadShell.id,
    ordinal: 1,
    providerInstanceId: v2ThreadShell.providerInstanceId,
    modelSelection: v2ThreadShell.modelSelection!,
    providerThreadId: null,
    userMessageId: MessageId.make("user-1"),
    rootNodeId: null,
    activeAttemptId: null,
    status: "completed",
    requestedAt: v2Now,
    startedAt: v2Now,
    completedAt: v2Now,
    checkpointId: null,
    contextHandoffId: null,
  };
  await act(() =>
    registry.set(atom, {
      environmentId: EnvironmentId.make("test"),
      projection: { ...projection, runs: [run] },
    }),
  );
  await expect.element(screen.getByRole("status")).toHaveTextContent("1");
  expect(rendered).toHaveBeenCalledTimes(initial + 1);
});

it.each([
  { enabled: false, driver: "codex" },
  { enabled: true, driver: "cursor" },
])("does not subscribe when enabled=$enabled and driver=$driver", async (props) => {
  source.read.mockReset().mockReturnValue(Atom.make(null));
  await using screen = await render(<Probe {...props} rendered={() => {}} />);
  await expect.element(screen.getByRole("status")).toHaveTextContent("0");
  expect(source.read).not.toHaveBeenCalled();
});
