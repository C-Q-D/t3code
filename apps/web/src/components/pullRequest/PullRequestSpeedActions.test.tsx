/**
 * Exercises pending reports through real speed-action buttons and the production action runner.
 * The command boundary is deferred; no network request or real pull request is changed.
 * @vitest-environment jsdom
 */
import { EnvironmentId, ProjectId, type PullRequestAction } from "@t3tools/contracts";
import { act } from "react";
import * as Cause from "effect/Cause";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const command = vi.hoisted(() => vi.fn());
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => command }));
vi.mock("~/state/pullRequests", async () => {
  const { Atom } = await import("effect/reactivity");
  const allowed = Atom.make(true);
  return { pullRequestEnvironment: { runAction: { permissionAtom: () => allowed } } };
});
vi.mock("./usePullRequestActions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./usePullRequestActions")>()),
  // Closing needs no merge preference; retain the real runner's success/error paths.
  usePullRequestDefaultMergeMethodResolver: () => () => undefined,
}));
vi.mock("../ui/toast", () => ({ toastManager: { add: vi.fn() } }));

import { TooltipProvider } from "../ui/tooltip";
import { toastManager } from "../ui/toast";
import { PullRequestSpeedActions, PullRequestSpeedModeContext } from "./PullRequestSpeedActions";

const entry = {
  environmentId: EnvironmentId.make("speed-actions-environment"),
  projectId: ProjectId.make("speed-actions-project"),
  host: "github.com",
  repository: "test/speed-actions",
  number: 42,
  state: "open",
  isDraft: false,
} as const;
const closeActions = new Set<PullRequestAction>(["close"]);
const noActions = new Set<PullRequestAction>();
let container: HTMLDivElement;
let root: Root | null;
let request: ReturnType<typeof deferredCommand>;
const reportPending = vi.fn<(pending: boolean) => void>();

/** Holds the command at its async boundary until a test supplies success or failure. */
function deferredCommand() {
  let resolve!: (result: AtomCommandResult<undefined, Error>) => void;
  const promise = new Promise<AtomCommandResult<undefined, Error>>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

/** Renders the real component with a fixed callback; capability changes preserve its hook state. */
async function renderActions(hostActions = closeActions) {
  await act(async () => {
    root!.render(
      <TooltipProvider>
        <PullRequestSpeedModeContext value={true}>
          <PullRequestSpeedActions
            entry={entry}
            hostActions={hostActions}
            onPendingChange={reportPending}
          />
        </PullRequestSpeedModeContext>
      </TooltipProvider>,
    );
  });
}

/** Starts a close through its DOM button and leaves the command unresolved. */
async function startClose() {
  const button = container.querySelector<HTMLButtonElement>("button");
  expect(button).not.toBeNull();
  await act(async () => button!.click());
  expect(command).toHaveBeenCalledOnce();
  expect(reportPending).toHaveBeenLastCalledWith(true);
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  command.mockReset();
  reportPending.mockClear();
  vi.mocked(toastManager.add).mockClear();
  request = deferredCommand();
  command.mockReturnValue(request.promise);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

it("reports pending on start and clears it after a successful command", async () => {
  await renderActions();
  expect(reportPending).toHaveBeenLastCalledWith(false);
  await startClose();

  await act(async () => request.resolve(AsyncResult.success(undefined)));

  expect(reportPending).toHaveBeenLastCalledWith(false);
  expect(container.querySelector<HTMLButtonElement>("button")?.disabled).toBe(false);
  expect(toastManager.add).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
});

it("clears pending and re-enables the action after a failed command", async () => {
  await renderActions();
  await startClose();

  await act(async () =>
    request.resolve(AsyncResult.failure(Cause.fail(new Error("Host rejected close")))),
  );

  expect(reportPending).toHaveBeenLastCalledWith(false);
  expect(container.querySelector<HTMLButtonElement>("button")?.disabled).toBe(false);
  expect(toastManager.add).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
});

it("renders nothing and clears the report when actions disappear during a pending command", async () => {
  await renderActions();
  await startClose();

  await renderActions(noActions);

  expect(container.childElementCount).toBe(0);
  expect(reportPending).toHaveBeenLastCalledWith(false);
  // Keep the request pending while capabilities return: the runner must still own the action.
  await renderActions();
  expect(reportPending).toHaveBeenLastCalledWith(true);
  await act(async () => request.resolve(AsyncResult.success(undefined)));
  expect(reportPending).toHaveBeenLastCalledWith(false);
});

it("reports no pending action when mounted without available actions", async () => {
  await renderActions(noActions);

  expect(container.childElementCount).toBe(0);
  expect(reportPending).toHaveBeenLastCalledWith(false);
  expect(command).not.toHaveBeenCalled();
});

it("clears pending on unmount and cannot report it again when the command completes", async () => {
  await renderActions();
  await startClose();

  await act(async () => root!.unmount());
  root = null;

  expect(reportPending).toHaveBeenLastCalledWith(false);
  reportPending.mockClear();
  await act(async () => request.resolve(AsyncResult.success(undefined)));
  expect(reportPending).not.toHaveBeenCalled();
});
