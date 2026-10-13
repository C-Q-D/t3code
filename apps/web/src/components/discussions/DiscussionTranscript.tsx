/** Renders persisted discussion records, read receipts and closing results; live speaking belongs to its own block. */
import { useAtomValue } from "@effect/atom-react";
import type {
  Discussion,
  DiscussionEntry,
  DiscussionPersonaAvatar,
  EnvironmentId,
} from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { t } from "~/i18n";
import { observeResize } from "~/lib/observeResize";
import { useEnvironmentSettings } from "~/hooks/useSettings";
import { getCustomModelOptionsByInstance } from "~/modelSelection";
import { applyProviderInstanceSettings, deriveProviderInstanceEntries } from "~/providerInstances";
import { useEnvironmentQuery } from "~/state/query";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "~/state/server";
import ChatMarkdown from "../ChatMarkdown";
import { Badge } from "../ui/badge";
import { PixelAvatar } from "./PixelAvatar";
import { discussionModelLabel } from "./discussionModelLabel";
import { discussionSeatColor } from "./discussionSeatColors";
import {
  discussionEntryFiles,
  discussionUserView,
  discussionStatementHeading,
  discussionTranscriptItems,
  type DiscussionStatementHeading,
} from "./discussionTranscript.logic";

const EMPTY_ENTRIES: readonly DiscussionEntry[] = [];
const FOLLOW_BOTTOM_DISTANCE_PX = 80;

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
 * @param props.userRead Whether the bubble uses a solid border; the topic counts as read.
 * @param props.threadId Entry-specific thread, seat fallback, or null when unavailable.
 * @param props.statusLabel Interrupted/failed text, null for completed entries.
 * @param props.badgeVariant Warning/error presentation, null for completed entries.
 * @returns A 28px avatar column and text/file presentation. File rows have no actions.
 */
function DiscussionEntryRow(props: DiscussionEntryRowProps) {
  const { entry } = props;
  if (entry.kind === "user")
    return (
      <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3.5">
        <PixelAvatar role="user" seat={0} size={28} />
        <div className="flex min-w-0 flex-col gap-1.5">
          {props.receiptLabel ? (
            <div className="flex min-h-7 items-center gap-2">
              <span
                aria-hidden="true"
                className="min-w-4 flex-1 border-t border-dashed border-foreground/15"
              />
              <span className="text-xs text-muted-foreground">{props.receiptLabel}</span>
              {props.receiptSeatNumber > 0 ? (
                <PixelAvatar
                  role={props.receiptAvatar}
                  seat={props.receiptSeatNumber}
                  size={18}
                  state={props.receiptAvatarState}
                />
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-end">
            <div
              className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl border border-border px-3.5 py-2.5 text-sm leading-relaxed ${props.userRead ? "" : "border-dashed"}`}
              style={{ background: "color-mix(in srgb, var(--foreground) 6%, var(--card))" }}
            >
              {entry.text}
            </div>
          </div>
        </div>
      </div>
    );
  const files = discussionEntryFiles(entry, t.discussions);
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3.5">
      <PixelAvatar
        role={props.avatar}
        seat={props.seatNumber}
        size={28}
        state={props.avatarState}
      />
      <div
        className={`flex min-w-0 flex-col gap-2 ${entry.kind === "summary" ? "rounded-xl border bg-card p-3.5" : ""}`}
      >
        <div className="flex min-h-7 items-center gap-2 text-sm">
          <span className="max-w-32 shrink-0 truncate font-medium">{props.personaName}</span>
          <span className="min-w-0 truncate text-xs text-muted-foreground">{props.modelLabel}</span>
          {props.roundLabel ? (
            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
              {props.roundLabel}
            </span>
          ) : null}
          {props.turnBadge ? <Badge variant="secondary">{props.turnBadge}</Badge> : null}
          {props.statusLabel && props.badgeVariant ? (
            <Badge variant={props.badgeVariant}>{props.statusLabel}</Badge>
          ) : null}
          {props.threadId ? (
            <Link
              to="/$environmentId/$threadId"
              params={{ environmentId: props.environmentId, threadId: props.threadId }}
              className="ml-auto shrink-0 rounded-sm text-xs text-muted-foreground underline decoration-muted-foreground/50 underline-offset-3 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              {t.discussions.page.viewProcess}
            </Link>
          ) : null}
        </div>
        {entry.text ? (
          <ChatMarkdown
            text={entry.text}
            cwd={props.cwd}
            environmentId={props.environmentId}
            threadRef={
              props.threadId
                ? { environmentId: props.environmentId, threadId: props.threadId }
                : undefined
            }
          />
        ) : null}
        {files === null ? null : files.kind !== "files" ? (
          <p className="text-xs text-muted-foreground">{files.label}</p>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="flex h-7.5 items-center gap-1.5 border-b px-3 text-xs">
              <span className="font-medium">{files.label}</span>
              <span className="text-success-foreground">+{files.additions}</span>
              <span className="text-destructive-foreground">−{files.deletions}</span>
            </div>
            <ul className="divide-y">
              {entry.files?.map((file) => (
                <li key={file.path} className="flex min-h-7 items-center gap-2 px-3 py-1 text-xs">
                  <span className="min-w-0 flex-1 break-all font-mono">{file.path}</span>
                  <span className="shrink-0 text-success-foreground">+{file.additions}</span>
                  <span className="shrink-0 text-destructive-foreground">−{file.deletions}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

const MemoizedDiscussionEntryRow = memo(DiscussionEntryRow);

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
    <div className="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-x-3.5">
      <PixelAvatar role={props.avatar} seat={props.seatNumber} size={28} state="next" />
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-muted-foreground">
        <span className="text-sm font-medium">{props.personaName}</span>
        <span className="text-muted-foreground">
          <Badge variant="outline">{t.discussions.page.next}</Badge>
        </span>
        {props.label ? <span className="text-xs">{props.label}</span> : null}
      </div>
    </div>
  );
}

const MemoizedDiscussionNextRow = memo(DiscussionNextRow);

/**
 * Reads the route's shared subscription atom and follows growth only while the reader is near the bottom.
 * @param props.discussion Frozen seat attribution and subscription identity; cursor changes do not change row props.
 * @param props.environmentId Registered environment already validated by the route.
 * @param props.cwd Project directory used by Markdown links and media.
 * @returns A centered 768px record column. Remount per discussion to reset initial-scroll ownership.
 */
export function DiscussionTranscript({
  discussion,
  environmentId,
  cwd,
}: {
  discussion: Discussion;
  environmentId: EnvironmentId;
  cwd: string | undefined;
}) {
  // The family keys by environment and discussion ID, so this reads the route's existing stream.
  // Transport retries and release are owned by client-runtime, not by individual entry rows.
  const query = useEnvironmentQuery(
    serverEnvironment.discussionLive({ environmentId, input: { discussionId: discussion.id } }),
  );
  const entries = query.data?.entries ?? EMPTY_ENTRIES;
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(environmentId)) ?? EMPTY_SERVER_PROVIDERS;
  const settings = useEnvironmentSettings(environmentId);
  const modelLabels = useMemo(() => {
    const instances = applyProviderInstanceSettings(
      deriveProviderInstanceEntries(providers),
      settings,
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
  }, [discussion.seats, providers, settings]);
  const items = useMemo(
    () => discussionTranscriptItems(entries, discussion, t.discussions),
    [entries, discussion],
  );
  const topicId = entries.find((entry) => entry.kind === "user")?.id;
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
    if (!content) return;
    // Markdown code/media can grow after React commits; observing content covers that delayed layout.
    return observeResize(content, () => {
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
      className="scrollbar-gutter-both min-h-0 flex-1 overflow-y-auto px-6 pt-6 pb-5"
      onScroll={(event) => {
        const viewport = event.currentTarget;
        followsBottom.current =
          viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <=
          FOLLOW_BOTTOM_DISTANCE_PX;
      }}
    >
      <div ref={contentRef} className="mx-auto flex w-full max-w-192 flex-col gap-6">
        {items.map((item, position) => {
          if (item.kind === "round") {
            const following = items[position + 1];
            const boundaryId = following?.kind === "entry" ? following.entry.id : "initial";
            return (
              <div key={`round-${item.round}-${boundaryId}`} className="flex items-center gap-2.5">
                <span className="-ml-3 inline-flex h-5 shrink-0 items-center rounded-full border bg-background px-2 text-xs text-muted-foreground">
                  {t.discussions.round(item.round)}
                </span>
                <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-foreground/6" />
              </div>
            );
          }
          if (item.kind === "closing")
            return (
              <div
                key={`closing-${item.id}`}
                className="flex items-center gap-3 text-xs text-muted-foreground"
              >
                <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-foreground/12" />
                <span>{item.label}</span>
                <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-foreground/12" />
              </div>
            );
          if (item.kind === "footer")
            return (
              <p key="ended-footer" className="text-center text-xs text-muted-foreground">
                {item.label}
              </p>
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
          const entry = item.entry;
          const seatIndex = discussion.seats.findIndex((seat) => seat.id === entry.seatId);
          const seat = discussion.seats[seatIndex];
          const userView =
            entry.kind === "user"
              ? discussionUserView(entry, entry.id === topicId, discussion, t.discussions)
              : null;
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
            <article key={entry.id} className="relative">
              {position < items.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-8.5 -bottom-5 left-3.5"
                  style={
                    entry.kind === "user"
                      ? {
                          borderLeft: `1px ${userView?.read ? "solid" : "dashed"} color-mix(in srgb, var(--foreground) 18%, transparent)`,
                        }
                      : {
                          width: 1,
                          background: `color-mix(in srgb, ${discussionSeatColor(seatIndex + 1).color} 45%, transparent)`,
                        }
                  }
                />
              ) : null}
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
                {...heading}
              />
            </article>
          );
        })}
      </div>
    </div>
  );
}
