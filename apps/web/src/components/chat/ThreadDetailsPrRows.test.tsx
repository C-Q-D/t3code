/** Verifies PR disclosure and thread lifecycle/permission guards for starting and stopping watches. */
import { EnvironmentId, ThreadId, type ThreadPullRequestLink } from "@t3tools/contracts";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";

const watchCommand = vi.hoisted(() => vi.fn());
const watchState = vi.hoisted(() => ({
  supported: true,
  permitted: true,
  thread: {
    settledOverride: null as "settled" | "active" | null,
    settledAt: null as string | null,
    archivedAt: null as string | null,
    lineage: { relationshipToParent: null as "subagent" | null },
    source: {
      creationSource: "user" as "user" | "provider" | "mcp",
      lineage: { relationshipToParent: null as "subagent" | null },
    },
  },
}));
vi.mock("~/state/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/state/session")>()),
  useEnvironmentScope: () => watchState.permitted,
  readEnvironmentScope: () => watchState.permitted,
}));

vi.mock("./ThreadDetailsPrRow", () => ({
  ThreadDetailsPrRow: ({
    number,
    onStopWatching,
    onStartWatching,
  }: {
    number: number;
    onStopWatching?: () => void;
    onStartWatching?: () => void;
  }) => (
    <span
      data-row={String(number)}
      data-watched={onStopWatching ? "" : undefined}
      onClick={onStopWatching}
      onDoubleClick={onStartWatching}
    />
  ),
}));
vi.mock("~/state/entities", () => ({
  useProjects: () => [],
  useThreadShell: () => watchState.thread,
  useServerConfigs: () =>
    new Map([
      [
        "environment",
        { environment: { capabilities: { threadPullRequestWatch: watchState.supported } } },
      ],
    ]),
}));
vi.mock("~/state/threads", () => ({
  threadEnvironment: {},
}));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => watchCommand }));
vi.mock("~/lib/openPullRequestLink", () => ({
  parseChangeRequestUrl: () => null,
  findProjectOnChangeRequestHost: () => undefined,
}));

import { ThreadDetailsPrRows } from "./ThreadDetailsPrRows";

function link(
  number: number,
  headBranch: string,
  baseBranch: string,
  updatedAt: string,
): ThreadPullRequestLink {
  return {
    host: "github.com",
    repository: "pingdotgg/t3code",
    number,
    url: `https://github.com/pingdotgg/t3code/pull/${number}`,
    source: "manual",
    linkedAt: updatedAt,
    snapshot: {
      state: "open",
      title: `Change ${number}`,
      headBranch,
      baseBranch,
      isDraft: false,
      updatedAt,
      syncedAt: updatedAt,
    },
    stack: null,
  };
}

const bottom = link(1, "layer-one", "main", "2026-01-01T00:00:10.000Z");
const top = link(2, "layer-two", "layer-one", "2026-01-01T00:00:20.000Z");
const other = link(3, "unrelated", "main", "2026-01-01T00:00:05.000Z");

let renderer: ReactTestRenderer;
afterEach(() => {
  act(() => renderer?.unmount());
  vi.unstubAllGlobals();
  watchState.supported = true;
  watchState.permitted = true;
  watchState.thread.settledOverride = null;
  watchState.thread.settledAt = null;
  watchState.thread.archivedAt = null;
  watchState.thread.lineage.relationshipToParent = null;
  watchState.thread.source.lineage.relationshipToParent = null;
  watchState.thread.source.creationSource = "user";
  watchCommand.mockClear();
});

function render(links: ReadonlyArray<ThreadPullRequestLink>, current: ThreadPullRequestLink) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  act(() => {
    renderer = create(
      <ThreadDetailsPrRows
        threadRef={{
          environmentId: EnvironmentId.make("environment"),
          threadId: ThreadId.make("thread"),
        }}
        links={links}
        currentLink={current}
        onOpenLink={vi.fn()}
        environmentId={EnvironmentId.make("environment")}
        pr={null}
        number={current.number}
        reference={current}
        status={null}
        project={null}
        label={`#${current.number}`}
        openAriaLabel="Open pull request"
        onOpen={vi.fn()}
      />,
    );
  });
}

const rows = () => renderer.root.findAllByType("span").map((node) => node.props["data-row"]);
const toggleLabel = () =>
  renderer.root
    .findAllByType("button")
    .at(-1)
    ?.children.filter((child) => typeof child === "string")
    .join("");

function toggle() {
  act(() => {
    (renderer.root.findAllByType("button").at(-1)!.props as { onClick: () => void }).onClick();
  });
}

it("shows only the current pull request until the rest are asked for", () => {
  render([other, bottom, top], top);
  expect(rows()).toEqual(["2"]);
  expect(toggleLabel()).toBe("Show 2 more");

  toggle();
  expect(rows()).toEqual(["2", "1", "3"]);
  expect(toggleLabel()).toBe("Show less");

  toggle();
  expect(rows()).toEqual(["2"]);
  expect(toggleLabel()).toBe("Show 2 more");
});

it("keeps the single row untouched when the thread links one pull request", () => {
  render([bottom], bottom);
  expect(rows()).toEqual(["1"]);
  expect(toggleLabel()).toBeUndefined();
});

it("lets only watched pull requests stop their watch", () => {
  const watched: ThreadPullRequestLink = {
    ...bottom,
    watch: {
      startedAt: "2026-01-01T00:00:30.000Z",
      headSha: null,
      failedChecks: [],
      passed: false,
      passedChecks: [],
      remarksThrough: "2026-01-01T00:00:30.000Z",
      remarkIds: [],
      conflicting: false,
      wakes: 0,
    },
  };
  render([other, watched, top], top);
  toggle();
  const spans = renderer.root.findAllByType("span");
  expect(
    spans
      .filter((node) => node.props["data-watched"] !== undefined)
      .map((node) => node.props["data-row"]),
  ).toEqual(["1"]);

  act(() => spans.find((node) => node.props["data-row"] === "1")!.props.onClick());
  expect(watchCommand).toHaveBeenCalledWith({
    environmentId: EnvironmentId.make("environment"),
    input: {
      threadId: ThreadId.make("thread"),
      host: "github.com",
      repository: "pingdotgg/t3code",
      number: 1,
      watching: false,
    },
  });
});

it("starts an unwatched PR through the existing command in the thread's environment", () => {
  render([bottom], bottom);
  const row = renderer.root.findByProps({ "data-row": "1" });
  expect(row.props.onDoubleClick).toBeTypeOf("function");
  act(() => row.props.onDoubleClick());
  expect(watchCommand).toHaveBeenCalledWith({
    environmentId: "environment",
    input: {
      threadId: "thread",
      host: "github.com",
      repository: "pingdotgg/t3code",
      number: 1,
      watching: true,
    },
  });
});

it.each([
  [false, true],
  [true, false],
])("offers no watch mutation when support=%s and permission=%s", (supported, permitted) => {
  watchState.supported = supported;
  watchState.permitted = permitted;
  render([bottom], bottom);
  const row = renderer.root.findByProps({ "data-row": "1" });
  expect(row.props.onDoubleClick).toBeUndefined();
  expect(row.props.onClick).toBeUndefined();
});

it.each([
  "settled override",
  "settled timestamp",
  "archived",
  "native subagent",
  "delegated subagent",
] as const)("prevents starting a watch for a %s thread but preserves stopping", (scenario) => {
  if (scenario === "settled override") watchState.thread.settledOverride = "settled";
  if (scenario === "settled timestamp") watchState.thread.settledAt = "2026-01-01T00:00:00Z";
  if (scenario === "archived") watchState.thread.archivedAt = "2026-01-01T00:00:00Z";
  if (scenario === "native subagent" || scenario === "delegated subagent") {
    watchState.thread.lineage.relationshipToParent = "subagent";
    watchState.thread.source.lineage.relationshipToParent = "subagent";
    watchState.thread.source.creationSource = scenario === "native subagent" ? "provider" : "mcp";
  }
  render([bottom], bottom);
  const start = renderer.root.findByProps({ "data-row": "1" });
  expect(start.props.onDoubleClick).toBeUndefined();
  act(() => renderer.unmount());
  const watched: ThreadPullRequestLink = {
    ...bottom,
    watch: {
      startedAt: "2026-01-01T00:00:30.000Z",
      headSha: null,
      failedChecks: [],
      passed: false,
      passedChecks: [],
      remarksThrough: "2026-01-01T00:00:30.000Z",
      remarkIds: [],
      conflicting: false,
      wakes: 0,
    },
  };
  render([watched], watched);
  act(() => renderer.root.findByProps({ "data-row": "1" }).props.onClick());
  expect(watchCommand).toHaveBeenCalledWith(
    expect.objectContaining({ input: expect.objectContaining({ watching: false }) }),
  );
});
