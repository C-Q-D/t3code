/** Renders opening-ordered discussion records and mounts one independently subscribed live seat. */
import { useAtomValue } from "@effect/atom-react";
import type {
  Discussion,
  DiscussionEntry,
  DiscussionPersonaAvatar,
  EnvironmentId,
} from "@t3tools/contracts";
import { shouldPreserveAssistantLineBreaks } from "@t3tools/shared/markdownPipeline";
import { discussionFilesCanOpen, type DiscussionDiffSelection } from "./discussionDiff.logic";
import { DiscussionFiles } from "./DiscussionFiles";
import { MemoizedDiscussionLiveRow } from "./DiscussionLiveRow";
import { orderDiscussionEntries } from "./discussionLive.logic";
import { discussionLiveWave } from "./discussionMotion.logic";
import { Link } from "@tanstack/react-router";
import { useState, useLayoutEffect, useRef, type CSSProperties } from "react";
import { CheckCheckIcon, ClockIcon, PauseIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { t } from "~/i18n";
import { observeResize } from "~/lib/observeResize";
import { useEnvironmentSettings } from "~/hooks/useSettings";
import { getCustomModelOptionsByInstance } from "~/modelSelection";
import { applyProviderInstanceSettings, deriveProviderInstanceEntries } from "~/providerInstances";
import { useEnvironmentQuery } from "~/state/query";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "~/state/server";
import ChatMarkdown from "../ChatMarkdown";
import { Badge } from "../ui/badge";
import { PixelSeat } from "./PixelSeat";
import { discussionModelLabel } from "./discussionModelLabel";
import { discussionSeatColor } from "./discussionSeatColors";
import {
  discussionUserView,
  discussionStatementHeading,
  discussionTranscriptItems,
  type DiscussionStatementHeading,
} from "./discussionTranscript.logic";

const EMPTY_ENTRIES: readonly DiscussionEntry[] = [];
const FOLLOW_BOTTOM_DISTANCE_PX = 8;

/** Stable entry reference and primitive presentation fields let memo skip unaffected Markdown rows. */
type DiscussionEntryRowProps = DiscussionStatementHeading & {
  entry: DiscussionEntry;
  environmentId: EnvironmentId;
  cwd: string | undefined;
  seatNumber: number;
  avatar: DiscussionPersonaAvatar;
  receiptLabel: string | null;
  receiptAvatar: DiscussionPersonaAvatar;
  receiptSeatNumber: number;
  receiptAvatarState: "idle" | "next";
  userRead: boolean;
  receiptPaused: boolean;
  selectedPath: string | undefined;
  onOpenDiff: (selection: DiscussionDiffSelection) => void;
};

/**
 * Renders a user bubble or a frozen AI statement without any discussion mutation.
 * @param props.entry Original reducer entry object; replacing it triggers this row's update.
 * @param props.environmentId Destination for process links and Markdown resource lookup.
 * @param props.cwd Discussion project directory, undefined for a missing project.
 * @param props.seatNumber One-based persona color index, zero when the seat is unavailable.
 * @param props.avatar Frozen persona sprite, ignored for a user entry.
 * @param props.personaName Resolved heading identity or the deleted-persona fallback.
 * @param props.modelLabel Shared instance/model label, with catalog fallbacks applied.
 * @param props.roundLabel Persisted entry round, null when not provided.
 * @param props.turnBadge Final-statement or summary tag, null for ordinary statements.
 * @param props.avatarState Done for summary entries, idle for persisted statements.
 * @param props.receiptLabel Interjection receipt text, null for the topic and AI entries.
 * @param props.receiptAvatar Frozen seat sprite shown with the receipt.
 * @param props.receiptSeatNumber One-based receipt color, zero when no avatar is available.
 * @param props.receiptAvatarState Idle when read, next when pending for a known seat.
 * @param props.userRead Whether the user bubble is raised; unread interjections use a dashed outline.
 * @param props.receiptPaused True only for an unread interjection with a known reader while paused.
 * @param props.threadId Entry-specific thread, seat fallback, or null when unavailable.
 * @param props.statusLabel Interrupted/failed text, null for completed entries.
 * @param props.badgeVariant Warning/error presentation, null for completed entries.
 * @param props.selectedPath Selected file within this entry, undefined when unselected.
 * @param props.onOpenDiff Opens a persisted statement patch at the activated file.
 * @returns A 32px avatar beside a chat bubble; AI is left-aligned and user material is right-aligned.
 */
function DiscussionEntryRow(props: DiscussionEntryRowProps) {
  const { entry, onOpenDiff } = props;
  // File selection can rerender this row without changing Markdown or its thread context.
  const threadRef = props.threadId
    ? { environmentId: props.environmentId, threadId: props.threadId }
    : undefined;
  if (entry.kind === "user")
    return (
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col items-end gap-1.25">
          <div
            className={cn(
              "max-w-4/5 rounded-discussion-user-bubble px-3.5 py-2.5 whitespace-pre-wrap break-words text-body",
              props.userRead
                ? "bg-discussion-user-bubble shadow-discussion-user-bubble"
                : "discussion-user-unread",
            )}
          >
            {entry.text}
          </div>
          {props.receiptLabel ? (
            <div className="flex max-w-full flex-wrap items-center justify-end gap-1.5 text-secondary-copy text-secondary-label">
              {props.receiptSeatNumber <= 0 ? null : props.userRead ? (
                <CheckCheckIcon className="size-3.25" />
              ) : props.receiptPaused ? (
                <PauseIcon className="size-3.25" />
              ) : (
                <ClockIcon className="size-3.25" />
              )}
              <span>{props.receiptLabel}</span>
              {props.receiptSeatNumber > 0 ? (
                <PixelSeat
                  role={props.receiptAvatar}
                  seatIndex={props.receiptSeatNumber - 1}
                  size={18}
                  state={props.receiptAvatarState}
                  label={props.receiptLabel}
                />
              ) : null}
            </div>
          ) : null}
        </div>
        <PixelSeat
          role="user"
          seatIndex={0}
          size={32}
          state="idle"
          label={t.discussions.page.you}
        />
      </div>
    );
  return (
    <div className="flex items-start gap-3">
      <PixelSeat
        role={props.avatar}
        seatIndex={props.seatNumber - 1}
        size={32}
        state={props.avatarState}
        label={props.personaName}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 items-center gap-2 text-secondary-copy text-secondary-label">
          <span
            className={cn(
              "max-w-32 shrink-0 truncate text-body font-bold",
              discussionSeatColor(props.seatNumber).textClassName,
            )}
          >
            {props.personaName}
          </span>
          <span className="min-w-0 truncate">{props.modelLabel}</span>
          {props.roundLabel ? (
            <span className="shrink-0 whitespace-nowrap">{props.roundLabel}</span>
          ) : null}
          {props.turnBadge ? <Badge variant="secondary">{props.turnBadge}</Badge> : null}
          {props.statusLabel && props.badgeVariant ? (
            <Badge variant={props.badgeVariant}>{props.statusLabel}</Badge>
          ) : null}
          {props.threadId ? (
            <Link
              to="/$environmentId/$threadId"
              params={{ environmentId: props.environmentId, threadId: props.threadId }}
              className="ml-auto shrink-0 rounded-sm underline underline-offset-3 outline-none hover:text-foreground focus-visible:inset-shadow-focus"
            >
              {t.discussions.page.viewProcess}
            </Link>
          ) : null}
        </div>
        <div
          className={cn(
            "flex min-w-0 flex-col gap-2 rounded-discussion-bubble",
            entry.kind === "summary"
              ? "discussion-record-summary bg-discussion-summary px-4.5 py-4 shadow-discussion-summary"
              : "bg-surface-raised px-3.5 py-3 shadow-raise-l",
          )}
        >
          {entry.text ? (
            <ChatMarkdown
              text={entry.text}
              className="text-body leading-discussion-record text-foreground"
              lineBreaks={shouldPreserveAssistantLineBreaks(entry.text)}
              cwd={props.cwd}
              environmentId={props.environmentId}
              threadRef={threadRef}
            />
          ) : null}
          <DiscussionFiles
            files={entry.files}
            hideEmpty={entry.kind === "summary"}
            selectedPath={props.selectedPath}
            onOpenFile={
              discussionFilesCanOpen(entry.id, entry.files)
                ? (filePath) => onOpenDiff({ entryId: entry.id, filePath })
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}

const MemoizedDiscussionEntryRow = DiscussionEntryRow;

/**
 * Shows the shared next assignment without rerendering when unrelated stream text grows.
 * @param props.avatar Frozen persona sprite.
 * @param props.seatNumber One-based seat color.
 * @param props.personaName Next speaker's frozen identity.
 * @param props.label Unread-interjection notice, null when none remain.
 * @returns A pending avatar, next badge and optional notice.
 */
function DiscussionNextRow(props: {
  avatar: DiscussionPersonaAvatar;
  seatNumber: number;
  personaName: string;
  label: string | null;
}) {
  return (
    <div
      className="flex items-center gap-3"
      style={
        { "--discussion-seat-color": discussionSeatColor(props.seatNumber).color } as CSSProperties
      }
    >
      <PixelSeat
        role={props.avatar}
        seatIndex={props.seatNumber - 1}
        size={32}
        state="next"
        label={props.personaName}
      />
      <div className="discussion-next-bubble flex min-w-0 flex-wrap items-center gap-2 rounded-discussion-bubble px-3.5 py-2 text-secondary-label">
        <span className="text-body font-bold">{props.personaName}</span>
        <span className="discussion-next-tag flex h-5 items-center rounded-discussion-table-outline px-1.75 text-secondary-copy font-semibold">
          {t.discussions.page.next}
        </span>
        {props.label ? <span className="text-secondary-copy">{props.label}</span> : null}
      </div>
    </div>
  );
}

const MemoizedDiscussionNextRow = DiscussionNextRow;

/**
 * Displays the discussion topic independently of subscription entries; receipts belong only to interjections.
 * @param props.text Persisted discussion.topic, rendered as plain text with original line breaks.
 * @returns User avatar and a solid right-aligned bubble; memoization depends only on the topic string.
 */
function DiscussionTopicRow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 justify-end">
        <div className="max-w-4/5 rounded-discussion-user-bubble bg-discussion-user-bubble px-3.5 py-2.5 whitespace-pre-wrap break-words text-body shadow-discussion-user-bubble">
          {text}
        </div>
      </div>
      <PixelSeat role="user" seatIndex={0} size={32} state="idle" label={t.discussions.page.you} />
    </div>
  );
}

const MemoizedDiscussionTopicRow = DiscussionTopicRow;

/**
 * Reads the route's shared subscription atom and follows growth only while the reader is near the bottom.
 * @param props.discussion Frozen seat attribution and subscription identity; cursor changes do not change row props.
 * @param props.environmentId Registered environment already validated by the route.
 * @param props.cwd Project directory used by Markdown links and media.
 * @param props.selectedDiff Open persisted entry/file selection, null when the panel is closed.
 * @param props.onOpenDiff Activates the statement diff independently of the thread process link.
 * @returns A centered 680px record column with 20px between items. Remount per discussion to reset initial-scroll ownership.
 */
export function DiscussionTranscript({
  discussion,
  environmentId,
  cwd,
  selectedDiff,
  onOpenDiff,
}: {
  discussion: Discussion;
  environmentId: EnvironmentId;
  cwd: string | undefined;
  selectedDiff: DiscussionDiffSelection | null;
  onOpenDiff: (selection: DiscussionDiffSelection) => void;
}) {
  // The family keys by environment and discussion ID, so this reads the route's existing stream.
  // Transport retries and release are owned by client-runtime, not by individual entry rows.
  const query = useEnvironmentQuery(
    serverEnvironment.discussionLive({ environmentId, input: { discussionId: discussion.id } }),
  );
  const entries = query.data?.entries ?? EMPTY_ENTRIES;
  // Preserve derived row inputs across stream-independent renders; the compiler does not cache this pipeline.
  const calculateOrderedEntries = () => orderDiscussionEntries(entries);
  const [orderedEntriesCache, setOrderedEntriesCache] = useState(() => ({
    inputs: [entries] as const,
    value: calculateOrderedEntries(),
  }));
  let orderedEntries = orderedEntriesCache.value;
  if (!Object.is(orderedEntriesCache.inputs[0], entries)) {
    orderedEntries = calculateOrderedEntries();
    setOrderedEntriesCache({ inputs: [entries] as const, value: orderedEntries });
  }
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(environmentId)) ?? EMPTY_SERVER_PROVIDERS;
  const settings = useEnvironmentSettings(environmentId);
  const calculateModelLabels = () => {
    const instances = applyProviderInstanceSettings(
      deriveProviderInstanceEntries(providers),
      settings,
      discussion.projectId,
    );
    return discussion.seats.map((seat) => {
      const instance = instances.find(
        (candidate) => candidate.instanceId === seat.modelSelection.instanceId,
      );
      const model = getCustomModelOptionsByInstance(
        settings,
        providers,
        seat.modelSelection.instanceId,
        seat.modelSelection.model,
      )
        .get(seat.modelSelection.instanceId)
        ?.find((option) => option.slug === seat.modelSelection.model);
      return discussionModelLabel(seat.modelSelection, instance, model);
    });
  };
  const [modelLabelsCache, setModelLabelsCache] = useState(() => ({
    inputs: [discussion.projectId, discussion.seats, providers, settings] as const,
    value: calculateModelLabels(),
  }));
  let modelLabels = modelLabelsCache.value;
  if (
    !Object.is(modelLabelsCache.inputs[0], discussion.projectId) ||
    !Object.is(modelLabelsCache.inputs[1], discussion.seats) ||
    !Object.is(modelLabelsCache.inputs[2], providers) ||
    !Object.is(modelLabelsCache.inputs[3], settings)
  ) {
    modelLabels = calculateModelLabels();
    setModelLabelsCache({
      inputs: [discussion.projectId, discussion.seats, providers, settings] as const,
      value: modelLabels,
    });
  }
  const calculateItems = () => discussionTranscriptItems(orderedEntries, discussion, t.discussions);
  const [itemsCache, setItemsCache] = useState(() => ({
    inputs: [orderedEntries, discussion] as const,
    value: calculateItems(),
  }));
  let items = itemsCache.value;
  if (
    !Object.is(itemsCache.inputs[0], orderedEntries) ||
    !Object.is(itemsCache.inputs[1], discussion)
  ) {
    items = calculateItems();
    setItemsCache({ inputs: [orderedEntries, discussion] as const, value: items });
  }
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const followsBottom = useRef(true);
  const initialized = useRef(false);
  const hasSnapshot = query.data !== null;
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !hasSnapshot) return;
    if (!initialized.current || followsBottom.current) viewport.scrollTop = viewport.scrollHeight;
    initialized.current = true;
  }, [hasSnapshot]);
  useLayoutEffect(() => {
    const content = contentRef.current;
    const viewport = viewportRef.current;
    if (!content || !viewport) return;
    // Content covers delayed Markdown layout; viewport covers the growing composer taking space.
    // Both preserve the reader's existing follow choice rather than forcing scrolled-away readers down.
    return observeResize([content, viewport], () => {
      const viewport = viewportRef.current;
      if (viewport && initialized.current && followsBottom.current)
        viewport.scrollTop = viewport.scrollHeight;
    });
  }, []);
  return (
    <div
      ref={viewportRef}
      role="region"
      aria-label={t.discussions.page.transcript}
      className="scrollbar-gutter-both min-h-0 flex-1 overflow-y-auto px-8 pb-6"
      onScroll={(event) => {
        const viewport = event.currentTarget;
        followsBottom.current =
          viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <=
          FOLLOW_BOTTOM_DISTANCE_PX;
      }}
    >
      <div
        ref={contentRef}
        className="mx-auto flex min-h-full w-full max-w-170 flex-col justify-end gap-5"
      >
        {items.map((item, position) => {
          if (item.kind === "round") {
            const following = items[position + 1];
            const boundaryId = following?.kind === "entry" ? following.entry.id : "initial";
            return (
              <div
                key={`round-${item.round}-${boundaryId}`}
                className="flex items-center gap-3 text-secondary-copy text-secondary-label"
              >
                <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-foreground/8" />
                <span className="flex h-5.5 shrink-0 items-center rounded-full bg-discussion-round px-3 shadow-discussion-inset">
                  {t.discussions.round(item.round)}
                </span>
                <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-foreground/8" />
              </div>
            );
          }
          if (item.kind === "topic")
            return (
              <article key="discussion-topic">
                <MemoizedDiscussionTopicRow text={item.text} />
              </article>
            );
          if (item.kind === "closing")
            return (
              <div
                key={`closing-${item.id}`}
                className="flex items-center gap-3 text-secondary-copy text-secondary-label"
              >
                <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-foreground/12" />
                <span>{item.label}</span>
                <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-foreground/12" />
              </div>
            );
          if (item.kind === "next") {
            const seat = discussion.seats[item.seatIndex]!;
            return (
              <MemoizedDiscussionNextRow
                key="next-speaker"
                avatar={seat.avatar}
                seatNumber={item.seatIndex + 1}
                personaName={seat.personaName}
                label={item.label}
              />
            );
          }
          if (item.kind === "live") {
            const seat = discussion.seats[item.seatIndex]!;
            return (
              <article key={item.runId}>
                <MemoizedDiscussionLiveRow
                  environmentId={environmentId}
                  threadId={seat.threadId}
                  runId={item.runId}
                  cwd={cwd}
                  seatNumber={item.seatIndex + 1}
                  avatar={seat.avatar}
                  personaName={seat.personaName}
                  modelLabel={modelLabels[item.seatIndex] ?? ""}
                  round={item.round}
                  phase={item.phase}
                  showWave={discussionLiveWave(item)}
                />
              </article>
            );
          }
          const entry = item.entry;
          const seatIndex = discussion.seats.findIndex((seat) => seat.id === entry.seatId);
          const seat = discussion.seats[seatIndex];
          const userView =
            entry.kind === "user" ? discussionUserView(entry, discussion, t.discussions) : null;
          const receiptSeat =
            userView?.seatIndex == null ? undefined : discussion.seats[userView.seatIndex];
          const heading = discussionStatementHeading(
            entry,
            seat,
            modelLabels[seatIndex] ?? "",
            t.discussions,
            t.settings.discussions.deletedPersona,
          );
          return (
            <article key={entry.runId ?? entry.id}>
              <MemoizedDiscussionEntryRow
                entry={entry}
                environmentId={environmentId}
                cwd={cwd}
                seatNumber={seatIndex + 1}
                avatar={seat?.avatar ?? "architect"}
                receiptLabel={userView?.label ?? null}
                receiptAvatar={receiptSeat?.avatar ?? "architect"}
                receiptSeatNumber={userView?.seatIndex == null ? 0 : userView.seatIndex + 1}
                receiptAvatarState={userView?.avatarState ?? "idle"}
                userRead={userView?.read ?? true}
                receiptPaused={
                  userView?.read === false &&
                  userView.seatIndex !== null &&
                  discussion.status === "paused"
                }
                selectedPath={
                  selectedDiff?.entryId === entry.id ? selectedDiff.filePath : undefined
                }
                onOpenDiff={onOpenDiff}
                {...heading}
              />
            </article>
          );
        })}
      </div>
    </div>
  );
}
