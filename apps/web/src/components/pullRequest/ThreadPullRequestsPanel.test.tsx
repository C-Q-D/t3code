/** @vitest-environment jsdom */
/** Existing-behavior snapshot for watch gates and host updates; L2 adds visible sources and direct watch actions. */
import { EnvironmentId, ProjectId, ThreadId, type ThreadPullRequestLink } from "@t3tools/contracts";
import { act, type ReactElement, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

// The renderer has no layout; mount each virtual row to exercise its real actions.
vi.mock("@legendapp/list/react", () => ({
  LegendList: ({
    data,
    renderItem,
  }: {
    data: unknown[];
    renderItem: (info: { item: unknown; index: number }) => ReactNode;
  }) => data.map((item, index) => renderItem({ item, index })),
}));

const { watch, unlink, Wrapper, Trigger } = vi.hoisted(() => ({
  watch: vi.fn(),
  unlink: vi.fn(),
  Wrapper: ({ children }: { children?: ReactNode }) => children,
  Trigger: ({ children, render }: { children?: ReactNode; render?: ReactElement }) =>
    render ?? children,
}));

const threadRef = {
  environmentId: EnvironmentId.make("linked-environment"),
  threadId: ThreadId.make("linked-thread"),
};
const projectId = ProjectId.make("linked-project");
let supportsWatch = true;
let links: ReadonlyArray<ThreadPullRequestLink> = [];

vi.mock("~/state/entities", () => ({
  useProjects: () => [],
  useThreadShell: () => ({ projectId, pullRequests: links }),
  useServerConfigs: () =>
    new Map([
      [
        threadRef.environmentId,
        {
          environment: {
            capabilities: { threadPullRequests: true, threadPullRequestWatch: supportsWatch },
          },
        },
      ],
    ]),
}));
vi.mock("~/state/threads", () => ({
  threadEnvironment: { watchPullRequest: "watch", unlinkPullRequest: "unlink" },
}));
vi.mock("~/state/use-atom-command", () => ({
  useAtomCommand: (command: string) => (command === "watch" ? watch : unlink),
}));
vi.mock("~/shortcutModifierState", () => ({ useShortcutModifierState: () => ({}) }));
vi.mock("~/lib/openPullRequestLink", () => ({
  useOpenPrLink: () => vi.fn(),
  findProjectForChangeRequest: () => null,
}));
vi.mock("./LinkPullRequestDialog", () => ({ openLinkPullRequestDialog: vi.fn() }));
vi.mock("./PullRequestSpeedActions", async () => {
  const { createContext } = await import("react");
  return { PullRequestSpeedActions: () => null, PullRequestSpeedModeContext: createContext(false) };
});
vi.mock("../ui/scroll-area", () => ({ ScrollArea: Wrapper }));
vi.mock("../ui/tooltip", () => ({
  Tooltip: Wrapper,
  TooltipTrigger: Trigger,
  TooltipPopup: () => null,
}));
vi.mock("../ui/menu", () => ({
  Menu: Wrapper,
  MenuTrigger: Trigger,
  MenuPopup: Wrapper,
  MenuItem: ({ children, ...props }: { children?: ReactNode }) => (
    <button role="menuitem" {...props}>
      {children}
    </button>
  ),
}));

import { ThreadPullRequestsPanel } from "./ThreadPullRequestsPanel";

const link: ThreadPullRequestLink = {
  host: "github.com",
  repository: "acme/workbench",
  number: 42,
  url: "https://github.com/acme/workbench/pull/42",
  source: "manual",
  linkedAt: "2026-10-01T10:00:00Z",
  snapshot: {
    state: "open",
    title: "Keep linked review context",
    headBranch: "review-layout",
    baseBranch: "main",
    isDraft: false,
    updatedAt: "2026-10-01T10:00:00Z",
    syncedAt: "2026-10-01T10:00:00Z",
  },
  stack: null,
};
const watching: NonNullable<ThreadPullRequestLink["watch"]> = {
  startedAt: "2026-10-01T10:00:00Z",
  headSha: null,
  failedChecks: [],
  passed: false,
  passedChecks: [],
  remarksThrough: "2026-10-01T10:00:00Z",
  remarkIds: [],
  conflicting: false,
  wakes: 0,
};
let renderer: ReactTestRenderer;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  supportsWatch = true;
  links = [link];
});
afterEach(() => {
  act(() => renderer?.unmount());
  vi.unstubAllGlobals();
});

/** Render the public panel with state-query and command boundaries isolated from the server. */
function renderPanel() {
  act(() => {
    renderer = create(<ThreadPullRequestsPanel threadRef={threadRef} />);
  });
}

/**
 * Find an action by its product label rather than a styling or private component detail.
 * @param label Product action text.
 * @param direct Whether to require the row's button instead of the equivalent menu item.
 * @returns The native button, or undefined when the current state does not offer the action.
 */
function action(label: string, direct = false) {
  return renderer.root
    .findAllByType("button")
    .find(
      (button) => button.children.includes(label) && (!direct || button.props.role !== "menuitem"),
    );
}

it.each([false, true])(
  "keeps watch state until the host updates it (watching=%s)",
  (initiallyWatching) => {
    links = [{ ...link, ...(initiallyWatching ? { watch: watching } : {}) }];
    renderPanel();
    const label = initiallyWatching ? "Stop watching" : "Watch for changes";
    expect(action(label, true)).toBeDefined();
    act(() => action(label, true)!.props.onClick());
    expect(watch).toHaveBeenCalledExactlyOnceWith({
      environmentId: "linked-environment",
      input: {
        threadId: "linked-thread",
        host: "github.com",
        repository: "acme/workbench",
        number: 42,
        watching: !initiallyWatching,
      },
    });
    expect(action(label)).toBeDefined();
    links = [{ ...link, ...(initiallyWatching ? {} : { watch: watching }) }];
    act(() => renderer.update(<ThreadPullRequestsPanel threadRef={{ ...threadRef }} />));
    expect(action(initiallyWatching ? "Watch for changes" : "Stop watching")).toBeDefined();
    expect(action(label)).toBeUndefined();
  },
);

it.each([
  [false, "open"],
  [true, "closed"],
  [true, "merged"],
] as const)("hides watch actions when unsupported or finished (%s, %s)", (supported, state) => {
  supportsWatch = supported;
  links = [{ ...link, snapshot: { ...link.snapshot!, state }, watch: watching }];
  renderPanel();
  expect(action("Watch for changes") === undefined).toBe(true);
  expect(action("Stop watching") === undefined).toBe(true);
});

it.each([
  ["manual", "Unlink from thread"],
  ["stack", "Dismiss from thread"],
] as const)(
  "keeps %s removal available and waits for the host to remove the row",
  (source, label) => {
    links = [{ ...link, source }];
    renderPanel();
    expect(action(label)).toBeDefined();
    act(() => action(label)!.props.onClick());
    expect(unlink).toHaveBeenCalledExactlyOnceWith({
      environmentId: "linked-environment",
      input: {
        threadId: "linked-thread",
        host: "github.com",
        repository: "acme/workbench",
        number: 42,
      },
    });
    expect(renderer.root.findAllByType("a").some((anchor) => anchor.props.href === link.url)).toBe(
      true,
    );
    links = [];
    act(() => renderer.update(<ThreadPullRequestsPanel threadRef={{ ...threadRef }} />));
    expect(renderer.root.findAllByType("a").some((anchor) => anchor.props.href === link.url)).toBe(
      false,
    );
    expect(
      renderer.root
        .findAllByType("p")
        .some((paragraph) => paragraph.children.includes("No linked pull requests")),
    ).toBe(true);
  },
);

it("shows the link source in the row without opening a tooltip", () => {
  renderPanel();
  expect(
    renderer.root.findAllByType("span").some((span) => span.children.includes("Linked by you")),
  ).toBe(true);
});
