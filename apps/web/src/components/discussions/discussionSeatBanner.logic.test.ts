/** Protects permanent seat-thread attribution and independently specified localized copy. */
import { DiscussionListItem } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, it, expect } from "vite-plus/test";
import { discussions as zh } from "~/i18n/locales/zh-CN/discussions";
import { discussions as en } from "~/i18n/locales/en/discussions";
import {
  discussionSeatBannerMetadata,
  discussionSeatBannerView,
} from "./discussionSeatBanner.logic";

const item = Schema.decodeSync(DiscussionListItem)({
  id: "discussion-a",
  projectId: "project",
  title: "缓存策略",
  status: "paused",
  seats: [
    {
      id: "seat-a",
      personaName: "架构师",
      avatar: "architect",
      modelSelection: { instanceId: "claude", model: "opus" },
    },
  ],
  cursor: { seatIndex: 0, round: 1 },
  pause: { reason: "stopped" },
  createdAt: "2026-10-14T00:00:00.000Z",
  updatedAt: "2026-10-14T00:00:00.000Z",
  endedAt: null,
});
const association = { discussionId: "discussion-a", seatId: "seat-a" };
const description = "发言由讨论驱动，在这里发的消息不会进入讨论记录。";

describe("seat thread banner", () => {
  it("names both the discussion and matching seat", () =>
    expect(
      discussionSeatBannerView(association, discussionSeatBannerMetadata(association, [item]), zh),
    ).toEqual({
      id: "discussion-seat-thread",
      variant: "info",
      priority: "notice",
      title: "这是讨论「缓存策略」中架构师的座位线程",
      description,
      openDiscussionId: "discussion-a",
    }));
  it("keeps the discussion link when the seat is absent", () => {
    const ref = { ...association, seatId: "missing" };
    expect(discussionSeatBannerView(ref, discussionSeatBannerMetadata(ref, [item]), zh)).toEqual({
      id: "discussion-seat-thread",
      variant: "info",
      priority: "notice",
      title: "这是讨论「缓存策略」的座位线程",
      description,
      openDiscussionId: "discussion-a",
    });
  });
  it.each([
    { reason: "loading", list: null },
    { reason: "failure", list: null },
    { reason: "discussion missing", list: [] },
  ])("shows an unlinked fallback for $reason", ({ list }) =>
    expect(
      discussionSeatBannerView(association, discussionSeatBannerMetadata(association, list), zh),
    ).toEqual({
      id: "discussion-seat-thread",
      variant: "info",
      priority: "notice",
      title: "这是一场讨论的座位线程",
      description,
      openDiscussionId: null,
    }),
  );
  it.each([
    {
      metadata: { title: "Caching strategy", personaName: "Architect" },
      title: "This is Architect’s seat thread in the discussion “Caching strategy”",
      target: "discussion-a",
    },
    {
      metadata: { title: "Caching strategy", personaName: null },
      title: "This is a seat thread in the discussion “Caching strategy”",
      target: "discussion-a",
    },
    { metadata: null, title: "This is a discussion seat thread", target: null },
  ])("English: $title", ({ metadata, title, target }) =>
    expect(discussionSeatBannerView(association, metadata, en)).toEqual({
      id: "discussion-seat-thread",
      variant: "info",
      priority: "notice",
      title,
      description:
        "Speaking turns are driven by the discussion. Messages sent here will not be added to the discussion record.",
      openDiscussionId: target,
    }),
  );
  it("does not produce a banner for a thread without an association", () =>
    expect(
      discussionSeatBannerView(null, { title: "缓存策略", personaName: "架构师" }, zh),
    ).toBeNull());
  it("cannot be dismissed and stays below activity/urgent notices", () => {
    const banner = discussionSeatBannerView(
      association,
      { title: "缓存策略", personaName: "架构师" },
      zh,
    );
    expect(banner).toMatchObject({
      variant: "info",
      priority: "notice",
      openDiscussionId: "discussion-a",
    });
    expect(banner).not.toHaveProperty("onDismiss");
  });
});
