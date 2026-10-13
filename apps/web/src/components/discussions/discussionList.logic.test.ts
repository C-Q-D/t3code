/** Guards the delegated list grouping and status presentation requirements without rendering UI markup. */
import {
  DiscussionId,
  DiscussionSeatId,
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  type DiscussionListItem,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { discussions as copy } from "~/i18n/locales/zh-CN/discussions";
import {
  discussionListRow,
  groupDiscussions,
  type ScopedDiscussionListItem,
} from "./discussionList.logic";

const base: ScopedDiscussionListItem = {
  environmentId: EnvironmentId.make("environment-a"),
  id: DiscussionId.make("discussion-a"),
  projectId: ProjectId.make("project-a"),
  title: "讨论标题",
  status: "speaking",
  seats: [
    {
      id: DiscussionSeatId.make("seat-a"),
      personaName: "架构师",
      avatar: "architect",
      modelSelection: { instanceId: ProviderInstanceId.make("claude"), model: "opus" },
    },
    {
      id: DiscussionSeatId.make("seat-b"),
      personaName: "实现者",
      avatar: "implementer",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt" },
    },
  ],
  cursor: { seatIndex: 1, round: 3 },
  pause: null,
  createdAt: "2026-10-12T00:00:00.000Z",
  updatedAt: "2026-10-13T01:00:00.000Z",
  endedAt: null,
};

describe("discussion list presentation", () => {
  it.each([
    {
      status: "speaking",
      pause: null,
      expected: { roundLabel: "第 3 轮", statusLabel: "发言中 · 实现者", badgeVariant: "info" },
    },
    {
      status: "closing",
      pause: null,
      expected: { roundLabel: "第 3 轮", statusLabel: "收尾中", badgeVariant: "info" },
    },
    {
      status: "paused",
      pause: { reason: "seat_failed" },
      expected: {
        roundLabel: "第 3 轮",
        statusLabel: "已停下 · 发言失败",
        badgeVariant: "warning",
      },
    },
    {
      status: "paused",
      pause: { reason: "server_restarted" },
      expected: { roundLabel: "第 3 轮", statusLabel: "已停下", badgeVariant: "warning" },
    },
    {
      status: "ended",
      pause: null,
      expected: { roundLabel: "共 3 轮", statusLabel: "已结束", badgeVariant: "secondary" },
    },
  ] satisfies ReadonlyArray<{
    status: DiscussionListItem["status"];
    pause: DiscussionListItem["pause"];
    expected: { roundLabel: string; statusLabel: string; badgeVariant: string };
  }>)(
    "maps $status with $pause to the required round, status and Badge variant",
    ({ status, pause, expected }) => {
      expect(discussionListRow({ ...base, status, pause }, copy)).toEqual(expected);
    },
  );

  it("groups every active state across environments and projects, counts and sorts each group without changing input", () => {
    const speaking = {
      ...base,
      id: DiscussionId.make("speaking"),
      updatedAt: "2026-10-13T01:00:00.000Z",
    };
    const closing = {
      ...base,
      id: DiscussionId.make("closing"),
      status: "closing" as const,
      updatedAt: "2026-10-13T03:00:00.000Z",
    };
    const paused = {
      ...base,
      id: DiscussionId.make("paused"),
      environmentId: EnvironmentId.make("environment-b"),
      projectId: ProjectId.make("project-b"),
      status: "paused" as const,
      pause: { reason: "stopped" as const },
      updatedAt: "2026-10-13T02:00:00.000Z",
    };
    const endedOlder = {
      ...base,
      id: DiscussionId.make("ended-older"),
      status: "ended" as const,
      updatedAt: "2026-10-12T08:00:00.000Z",
    };
    const endedNewer = {
      ...endedOlder,
      id: DiscussionId.make("ended-newer"),
      updatedAt: "2026-10-13T04:00:00.000Z",
    };
    const input = Object.freeze([speaking, endedOlder, paused, endedNewer, closing]);

    expect(groupDiscussions(input, copy)).toEqual([
      { kind: "ongoing", label: "进行中 · 3", count: 3, items: [closing, paused, speaking] },
      { kind: "ended", label: "已结束 · 2", count: 2, items: [endedNewer, endedOlder] },
    ]);
    expect(input.map((item) => item.id)).toEqual([
      "speaking",
      "ended-older",
      "paused",
      "ended-newer",
      "closing",
    ]);
  });

  it.each([
    { statuses: [] as DiscussionListItem["status"][], expected: [] },
    {
      statuses: ["paused"] as DiscussionListItem["status"][],
      expected: [{ kind: "ongoing", label: "进行中 · 1", count: 1 }],
    },
    {
      statuses: ["ended"] as DiscussionListItem["status"][],
      expected: [{ kind: "ended", label: "已结束 · 1", count: 1 }],
    },
  ])("omits empty groups for $statuses", ({ statuses, expected }) => {
    const items = statuses.map((status) => ({ ...base, status }));
    expect(
      groupDiscussions(items, copy).map(({ kind, label, count }) => ({ kind, label, count })),
    ).toEqual(expected);
  });
});
