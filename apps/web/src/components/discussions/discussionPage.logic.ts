/** Derives route eligibility, header actions and physical table seats without starting subscriptions. */
import type { Discussion, DiscussionId, EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import type { discussions } from "~/i18n/locales/en/discussions";
import type { AppRouter } from "~/router";
import type { DiscussionSeatTag, DiscussionTableSeat } from "./discussionRoundTable.logic";

/**
 * Collapses turn occurrences into stable physical seats for both table shapes.
 * @param discussion Server snapshot; cursor and closing plan retain their existing strip semantics.
 * @param copy Localized seat annotations; identity names come from the snapshot.
 * @returns One seat per persisted identity, in physical order, with zero-based color indices.
 */
export function discussionTableSeats(
  discussion: Discussion,
  copy: typeof discussions.page,
): DiscussionTableSeat[] {
  const occurrences = discussionSeatStrip(discussion).filter((item) => item.kind === "seat");
  const tones = {
    speaking: "info",
    interrupted: "warning",
    failed: "error",
    next: "outline",
    summarizer: "neutral",
  } as const;
  return discussion.seats.map((seat, seatIndex) => {
    const turns = occurrences.filter((item) => item.index === seatIndex);
    // The final/summary strip can repeat an identity; the physical table cannot.
    const turn =
      turns.find((item) => item.state === "current") ??
      turns.find((item) => item.tags.includes("next")) ??
      turns[0];
    const summarizer = seat.id === discussion.closing?.summarizerSeatId;
    const tags: DiscussionSeatTag[] = (turn?.tags ?? [])
      .filter((tag) => tag !== "summarizer")
      .map((tag) => ({ label: copy[tag], tone: tones[tag] }));
    if (summarizer) tags.push({ label: copy.summarizer, tone: "neutral" });
    return {
      id: seat.id,
      seatIndex,
      role: seat.avatar,
      label: seat.personaName,
      // Completion colors an arc; only the ended summarizer receives a checkmark.
      state:
        discussion.status === "ended" && summarizer
          ? "done"
          : turn?.state === "current"
            ? discussion.status === "paused"
              ? "idle"
              : "speaking"
            : turn?.state === "next"
              ? "next"
              : "idle",
      completed: turns.some((item) => item.state === "done"),
      tags,
    };
  });
}

/**
 * Keeps a delayed deletion response from replacing a page the user has since opened.
 * @param router Router supplying its latest address and synchronous route matching, including unfinished navigation.
 * @param environmentId Environment containing the deleted discussion.
 * @param discussionId Discussion whose deletion was submitted.
 * @returns Whether the current route still belongs to that discussion, even after its projection disappears.
 */
export function discussionDeleteShouldNavigate(
  router: Pick<AppRouter, "latestLocation" | "matchRoutes">,
  environmentId: string,
  discussionId: string,
): boolean {
  // Committed matches can still describe the deleted discussion while another page loads.
  // The pathname/search overload preserves the registered route and parameter types.
  const currentDiscussion = router
    .matchRoutes(router.latestLocation.pathname, router.latestLocation.search)
    .find((match) => match.routeId === "/_chat/discussions/$environmentId/$discussionId")?.params;
  return (
    currentDiscussion?.environmentId === environmentId &&
    currentDiscussion.discussionId === discussionId
  );
}

/** A route can subscribe only after both IDs and the environment directory are valid. */
export type DiscussionRouteState =
  | { kind: "invalid" | "waiting" | "unknown-environment" }
  | { kind: "subscribe"; environmentId: EnvironmentId; discussionId: DiscussionId };
/** Ordered segments and seats; duplicated seats represent their separate final/summary turns. */
export type DiscussionStripItem =
  | { kind: "segment"; label: "round" | "final" | "summary"; round?: number }
  | {
      kind: "seat";
      index: number;
      state: "done" | "current" | "next";
      tags: ("speaking" | "interrupted" | "failed" | "next" | "summarizer")[];
    };
/** Header presentation and the action positions available in the current discussion state. */
export type DiscussionHeaderView = {
  label: string;
  variant: "info" | "warning" | "secondary";
  actions: ("stop" | "resume" | "end" | "more")[];
};

/**
 * Gates each header action using its destination permission and the shared submission lock.
 * @param action Action selected by the current header presentation.
 * @param pending Whether any header command is already submitted.
 * @param permitted Whether the destination grants this action's command.
 * @returns Whether this header button can execute now.
 */
export function discussionHeaderActionEnabled(
  action: DiscussionHeaderView["actions"][number],
  pending: boolean,
  permitted: boolean,
): boolean {
  void action;
  return !pending && permitted;
}

/**
 * Gates subscription creation in the route boundary.
 * @param environmentId Safely decoded environment ID.
 * @param discussionId Safely decoded discussion ID.
 * @param isReady Whether the environment directory has finished loading.
 * @param exists Whether the decoded environment is registered.
 * @returns The earliest blocking state, or the IDs allowed to subscribe.
 */
export function discussionRouteState(
  environmentId: Option.Option<EnvironmentId>,
  discussionId: Option.Option<DiscussionId>,
  isReady: boolean,
  exists: boolean,
): DiscussionRouteState {
  if (Option.isNone(environmentId) || Option.isNone(discussionId)) return { kind: "invalid" };
  if (!isReady) return { kind: "waiting" };
  if (!exists) return { kind: "unknown-environment" };
  return {
    kind: "subscribe",
    environmentId: environmentId.value,
    discussionId: discussionId.value,
  };
}

/**
 * Selects the status label and available action positions.
 * @param discussion Current server snapshot.
 * @param copy Localized discussion labels.
 * @param endedTime Day-aware formatted end time, empty when no timestamp exists.
 * @returns Badge presentation and ordered action names.
 */
export function discussionHeaderView(
  discussion: Discussion,
  copy: typeof discussions,
  endedTime: string,
): DiscussionHeaderView {
  switch (discussion.status) {
    case "speaking":
      return {
        label: copy.page.roundSpeaking(discussion.cursor.round),
        variant: "info",
        actions: ["stop", "end"],
      };
    case "paused":
      return {
        label: copy.paused,
        variant: "warning",
        actions: discussion.closing ? ["resume"] : ["resume", "end"],
      };
    case "closing":
      return {
        label:
          discussion.closing?.phase === "summarizing"
            ? copy.page.closingSummary
            : copy.page.closingFinal,
        variant: "info",
        actions: ["stop"],
      };
    case "ended":
      return {
        label: endedTime ? `${copy.ended} · ${endedTime}` : copy.ended,
        variant: "secondary",
        actions: ["more"],
      };
  }
}

/**
 * Projects the cursor and closing plan into the visible speaking sequence.
 * @param discussion Current snapshot; seat order and IDs come from the service.
 * @returns Ordered segment labels and seat states, including retry and summarizer tags.
 */
export function discussionSeatStrip(discussion: Discussion): DiscussionStripItem[] {
  const items: DiscussionStripItem[] = [];
  const paused = discussion.status === "paused";
  const ended = discussion.status === "ended";
  const currentIndex = discussion.cursor.seatIndex;
  const plan = discussion.closing;
  // A stopped seat retries itself; the cursor has not advanced to the following seat.
  const currentTags: Extract<DiscussionStripItem, { kind: "seat" }>["tags"] = paused
    ? [discussion.pause?.reason === "seat_failed" ? "failed" : "interrupted", "next"]
    : ["speaking"];
  if (!plan && !ended) {
    items.push({ kind: "segment", label: "round", round: discussion.cursor.round });
    discussion.seats.forEach((_, index) =>
      items.push({
        kind: "seat",
        index,
        state: index < currentIndex ? "done" : index === currentIndex ? "current" : "next",
        tags:
          index === currentIndex
            ? [...currentTags]
            : index === currentIndex + 1 && !paused
              ? ["next"]
              : [],
      }),
    );
    if (currentIndex === discussion.seats.length - 1) {
      items.push(
        { kind: "segment", label: "round", round: discussion.cursor.round + 1 },
        { kind: "seat", index: 0, state: "next", tags: paused ? [] : ["next"] },
      );
    }
    return items;
  }
  // End preserves the ordinary assignment, including its paused retry. Legacy snapshots lack
  // phase, so only their multi-seat order can distinguish that assignment from a final statement.
  const ordinaryInFlight =
    (discussion.status === "closing" || paused) &&
    plan?.phase === "final_round" &&
    (discussion.cursor.phase === undefined
      ? discussion.seats.length > 1 &&
        discussion.seats[currentIndex]?.id !== plan.remainingFinalSeatIds[0]
      : discussion.cursor.phase === "regular");
  if (ordinaryInFlight)
    items.push(
      { kind: "segment", label: "round", round: discussion.cursor.round },
      { kind: "seat", index: currentIndex, state: "current", tags: [...currentTags] },
    );
  items.push({ kind: "segment", label: "final" });
  discussion.seats.forEach((seat, index) => {
    const isCurrent =
      !ended &&
      !ordinaryInFlight &&
      plan?.phase === "final_round" &&
      index === currentIndex &&
      seat.id === plan.remainingFinalSeatIds[0];
    const state =
      ended || !plan || plan.phase === "summarizing"
        ? "done"
        : ordinaryInFlight
          ? "next"
          : isCurrent
            ? "current"
            : plan.remainingFinalSeatIds.includes(seat.id)
              ? "next"
              : "done";
    const tags = isCurrent ? [...currentTags] : [];
    if (
      !paused &&
      !ended &&
      plan?.phase === "final_round" &&
      seat.id === plan.remainingFinalSeatIds[ordinaryInFlight ? 0 : 1]
    )
      tags.push("next");
    if (!ended && seat.id === plan?.summarizerSeatId) tags.push("summarizer");
    items.push({ kind: "seat", index, state, tags });
  });
  if (plan) {
    const index = discussion.seats.findIndex((seat) => seat.id === plan.summarizerSeatId);
    if (index >= 0) {
      const state = ended ? "done" : plan.phase === "summarizing" ? "current" : "next";
      const tags = ended
        ? ["summarizer" as const]
        : state === "current"
          ? [...currentTags]
          : !paused && !ordinaryInFlight && plan.remainingFinalSeatIds.length === 1
            ? ["next" as const]
            : [];
      items.push({ kind: "segment", label: "summary" }, { kind: "seat", index, state, tags });
    }
  }
  return items;
}
