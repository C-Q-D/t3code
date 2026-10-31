/**
 * Verifies visible exit results and the default inspector's existing zero-exit behavior.
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  EnvironmentId,
  OrchestrationV2ProjectedTurnItem,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import { V2ItemInspector } from "./V2ItemInspector";

vi.mock("../../state/queries", () => ({
  useTurnItemDetail: () => ({ isPending: false, error: null }),
}));
vi.mock("../../state/v2ItemSupport", () => ({ useV2ItemSupport: () => ({}) }));
vi.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
  useRenderedAppearance: () => "dark",
}));

let host: HTMLDivElement;
let root: Root;
const decodeProjectedItem = Schema.decodeSync(OrchestrationV2ProjectedTurnItem);

/** Build a retained command result; absent exit code represents an unknown result, never success. */
function commandItem(exitCode: number | undefined) {
  const id = TurnItemId.make("command-1");
  const threadId = ThreadId.make("thread-1");
  return decodeProjectedItem({
    position: 0,
    visibility: "local",
    sourceThreadId: threadId,
    sourceItemId: id,
    item: {
      id,
      threadId,
      runId: null,
      nodeId: null,
      providerThreadId: null,
      providerTurnId: null,
      nativeItemRef: null,
      parentItemId: null,
      ordinal: 0,
      status: "completed",
      title: null,
      startedAt: null,
      completedAt: null,
      updatedAt: DateTime.makeUnsafe("2026-01-01T00:00:00Z"),
      type: "command_execution",
      input: "vp test run",
      output: "Retained command output",
      ...(exitCode === undefined ? {} : { exitCode }),
    },
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("timeline command results", () => {
  it.each([0, 7])("shows exit code %s beside the retained command output", async (exitCode) => {
    await act(async () =>
      root.render(
        <V2ItemInspector
          projectedItem={commandItem(exitCode)}
          environmentId={EnvironmentId.make("local")}
          presentation="timeline"
        />,
      ),
    );
    expect(host.textContent).toContain(`Exit code ${exitCode}`);
    expect(host.textContent).toContain("Retained command output");
  });

  it("keeps an unknown exit code absent", async () => {
    await act(async () =>
      root.render(
        <V2ItemInspector
          projectedItem={commandItem(undefined)}
          environmentId={EnvironmentId.make("local")}
          presentation="timeline"
        />,
      ),
    );
    expect(host.textContent).toContain("Retained command output");
    expect(host.textContent).not.toContain("Exit code");
  });

  it("preserves hidden zero exits for callers that do not select timeline presentation", async () => {
    await act(async () =>
      root.render(
        <V2ItemInspector
          projectedItem={commandItem(0)}
          environmentId={EnvironmentId.make("local")}
        />,
      ),
    );
    expect(host.textContent).toContain("Retained command output");
    expect(host.textContent).not.toContain("Exit code");
    expect(host.textContent).not.toContain("exit 0");
  });
});
