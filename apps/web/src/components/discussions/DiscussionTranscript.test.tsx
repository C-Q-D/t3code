// @vitest-environment jsdom
/** Measures real transcript row memoization; transport and Markdown parsing are isolated at their boundaries. */
import { Discussion, DiscussionEntry, EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { act, type ComponentProps, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { ClockIcon, PauseIcon } from "lucide-react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type ChatMarkdown from "../ChatMarkdown";
import { DiscussionTranscript } from "./DiscussionTranscript";
import { DiscussionFiles } from "./DiscussionFiles";
import { PixelSeat } from "./PixelSeat";

const stream = vi.hoisted(() => ({
  entries: [] as readonly DiscussionEntry[],
  markdownRenders: vi.fn<(props: ComponentProps<typeof ChatMarkdown>) => void>(),
}));

vi.mock("~/state/query", () => ({
  useEnvironmentQuery: () => ({ data: { entries: stream.entries } }),
}));
vi.mock("~/state/server", () => ({
  EMPTY_SERVER_PROVIDERS: [],
  serverEnvironment: { discussionLive: () => null, providersValueAtom: () => null },
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => null }));
vi.mock("~/hooks/useSettings", async () => {
  const { DEFAULT_SERVER_SETTINGS } = await import("@t3tools/contracts");
  const { DEFAULT_CLIENT_SETTINGS } = await import("@t3tools/contracts/settings");
  const settings = { ...DEFAULT_SERVER_SETTINGS, ...DEFAULT_CLIENT_SETTINGS };
  return { useEnvironmentSettings: () => settings };
});
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("./DiscussionLiveRow", () => ({ MemoizedDiscussionLiveRow: () => null }));
vi.mock("../ChatMarkdown", async () => {
  const { memo } = await import("react");
  return {
    // Match ChatMarkdown's default shallow memo, observing render work rather than JSX props.
    default: memo(function MarkdownProbe(props: ComponentProps<typeof ChatMarkdown>) {
      stream.markdownRenders(props);
      return <span>{props.text}</span>;
    }),
  };
});
vi.mock("./DiscussionFiles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./DiscussionFiles")>();
  return { ...actual, DiscussionFiles: vi.fn(actual.DiscussionFiles) };
});
vi.mock("./PixelSeat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./PixelSeat")>();
  return { ...actual, PixelSeat: vi.fn(actual.PixelSeat) };
});

const decodeDiscussion = Schema.decodeSync(Discussion);
const decodeEntry = Schema.decodeSync(DiscussionEntry);
const discussion = decodeDiscussion({
  id: "discussion",
  projectId: "project",
  title: "讨论",
  topic: "议题",
  seats: [
    {
      id: "a",
      personaName: "架构师",
      personaPrompt: "结构",
      avatar: "architect",
      modelSelection: { instanceId: "claude", model: "opus" },
      threadId: "thread-a",
    },
    {
      id: "b",
      personaName: "反方",
      personaPrompt: "异议",
      avatar: "opponent",
      modelSelection: { instanceId: "codex", model: "gpt" },
      threadId: "thread-b",
    },
    {
      id: "c",
      personaName: "实现者",
      personaPrompt: "落地",
      avatar: "implementer",
      modelSelection: { instanceId: "codex", model: "gpt" },
      threadId: "thread-c",
    },
  ],
  status: "speaking",
  cursor: {
    phase: "regular",
    seatIndex: 0,
    round: 3,
    dispatchNo: 0,
    runId: null,
    dispatchedEntrySeq: 0,
    briefChars: 0,
    briefSentAsFile: false,
  },
  pause: null,
  closing: null,
  createdBy: "user",
  creationSource: "web",
  createdAt: "2026-10-13T00:00:00.000Z",
  updatedAt: "2026-10-13T00:00:00.000Z",
  endedAt: null,
});
const first = decodeEntry({
  id: "first",
  discussionId: "discussion",
  seq: 1,
  kind: "statement",
  seatId: "a",
  threadId: "thread-a",
  round: 1,
  text: "历史 AI 记录 A",
  files: [{ path: "src/a.ts", additions: 1, deletions: 0 }],
  status: "completed",
  checkpointRef: null,
  createdAt: discussion.createdAt,
});
const second = decodeEntry({
  ...first,
  id: "second",
  seq: 2,
  seatId: "b",
  threadId: "thread-b",
  text: "历史 AI 记录 B",
  files: [],
});
const userEntry = {
  discussionId: "discussion",
  kind: "user" as const,
  files: null,
  status: "completed" as const,
  checkpointRef: null,
  createdAt: discussion.createdAt,
};
const read = decodeEntry({ ...userEntry, id: "read", seq: 3, text: "已读插话", readBySeatId: "c" });
const unread = decodeEntry({ ...userEntry, id: "unread", seq: 4, text: "未读插话" });
const environmentId = EnvironmentId.make("environment");
const onOpenDiff = vi.fn();
let renderer: ReactTestRenderer | undefined;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  stream.entries = [first, second, read, unread];
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

/**
 * Counts execution of real row children; their distinct files/receipt identity identifies each historical row.
 * @returns Render counts for the two historical AI rows and the already-read interjection, respectively.
 */
function historicalRowRenders() {
  return [
    vi.mocked(DiscussionFiles).mock.calls.filter(([props]) => props.files === first.files).length,
    vi.mocked(DiscussionFiles).mock.calls.filter(([props]) => props.files === second.files).length,
    vi
      .mocked(PixelSeat)
      .mock.calls.filter(([props]) => props.size === 18 && props.role === "implementer").length,
  ];
}

/**
 * Builds the production transcript with stable non-lifecycle inputs.
 * @param snapshot Lifecycle snapshot to render; persisted entries stay in the stream fixture.
 * @param selectedDiff Real file selection, null when the diff panel is closed.
 * @param destination Environment identity used to verify Markdown context invalidation.
 * @returns The unchanged production entry point, without exposing private row components.
 */
function transcript(
  snapshot = discussion,
  selectedDiff: ComponentProps<typeof DiscussionTranscript>["selectedDiff"] = null,
  destination = environmentId,
) {
  return (
    <DiscussionTranscript
      discussion={snapshot}
      environmentId={destination}
      cwd="/project"
      selectedDiff={selectedDiff}
      onOpenDiff={onOpenDiff}
    />
  );
}

it("isolates historical AI and read interjections through stop, continue and failure while unread receipts update", async () => {
  await act(() => {
    renderer = create(transcript());
  });
  expect(historicalRowRenders()).toEqual([1, 1, 1]);
  expect(renderer!.root.findAllByType(ClockIcon)).toHaveLength(1);

  await act(() => {
    renderer!.update(transcript({ ...discussion, status: "paused", pause: { reason: "stopped" } }));
  });
  expect(historicalRowRenders(), "stopping must only update the unread receipt").toEqual([1, 1, 1]);
  expect(renderer!.root.findAllByType(PauseIcon)).toHaveLength(1);

  await act(() => {
    renderer!.update(transcript());
  });
  expect(historicalRowRenders(), "continuing must preserve historical row renders").toEqual([
    1, 1, 1,
  ]);
  expect(renderer!.root.findAllByType(ClockIcon)).toHaveLength(1);

  await act(() => {
    renderer!.update(
      transcript({ ...discussion, status: "paused", pause: { reason: "seat_failed" } }),
    );
  });
  expect(historicalRowRenders(), "failure pauses must preserve historical row renders").toEqual([
    1, 1, 1,
  ]);
  expect(renderer!.root.findAllByType(PauseIcon)).toHaveLength(1);

  await act(() => {
    renderer!.update(transcript());
  });
  expect(historicalRowRenders()).toEqual([1, 1, 1]);
  expect(renderer!.root.findAllByType(ClockIcon)).toHaveLength(1);
  expect(stream.markdownRenders).toHaveBeenCalledTimes(2);
});

it("keeps Markdown memoized when a file selection rerenders its AI row, but refreshes changed thread and environment context", async () => {
  await act(() => {
    renderer = create(transcript());
  });
  expect(stream.markdownRenders).toHaveBeenCalledTimes(2);

  const selection = { entryId: first.id, filePath: "src/a.ts" };
  await act(() => {
    renderer!.update(transcript(discussion, selection));
  });
  expect(historicalRowRenders()).toEqual([2, 1, 1]);
  expect(renderer!.root.findByType("button").props["aria-pressed"]).toBe(true);
  expect(
    stream.markdownRenders,
    "file selection must not rerender unchanged Markdown",
  ).toHaveBeenCalledTimes(2);

  stream.entries = [
    { ...first, threadId: ThreadId.make("replacement-thread") },
    second,
    read,
    unread,
  ];
  await act(() => {
    renderer!.update(transcript(discussion, selection));
  });
  expect(stream.markdownRenders).toHaveBeenCalledTimes(3);
  expect(stream.markdownRenders.mock.calls.at(-1)![0].threadRef).toEqual({
    environmentId: "environment",
    threadId: "replacement-thread",
  });

  await act(() => {
    renderer!.update(transcript(discussion, selection, EnvironmentId.make("other-environment")));
  });
  expect(stream.markdownRenders).toHaveBeenCalledTimes(5);
  expect(stream.markdownRenders.mock.calls.slice(-2).map(([props]) => props.threadRef)).toEqual([
    { environmentId: "other-environment", threadId: "replacement-thread" },
    { environmentId: "other-environment", threadId: "thread-b" },
  ]);
});
