/** Renders work groups and live activity while preserving independent disclosure state. */
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { t } from "~/i18n";
import { WorkLogButton, WorkLogList, WorkLogRow } from "./WorkLog";
import type { WorktreeSetupSnapshot } from "@t3tools/contracts";
import {
  getQuestionAnswerPreview,
  getQuestionTextPreview,
  hasQuestionAnswer,
} from "@t3tools/client-runtime/work-log/user-input";
import { type ToolActivityIcon } from "@t3tools/contracts";
import { liveThoughtLine } from "@t3tools/client-runtime/work-log/presentation";
import { resolveWorkGroupScrollAnchor } from "@t3tools/client-runtime/work-log/scroll-anchor";
import { observeResize } from "~/lib/observeResize";
import { observeVisibleAnimation } from "../../lib/visibleAnimation";
import { memo, use, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { LegendList, type LegendListRef } from "@legendapp/list/react";
import { workEntryDisplayIndicatesToolFailure } from "../../session-logic";
import ChatMarkdown from "../ChatMarkdown";
import { Minimize2Icon, XIcon } from "lucide-react";
import { Button } from "../ui/button";
import { getVirtualizedScrollFadeClassName } from "../ui/scroll-area";
import {
  liveWorkEntryLabel,
  resolveWorkGroupScrollIndex,
  shouldFollowWorkGroupAppend,
  workEntryIsVisibleInGroup,
  type MessagesTimelineRow,
} from "./MessagesTimeline.logic";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Spinner } from "../ui/spinner";
import { WorktreeSetupCard } from "./WorktreeSetupCard";
import { cn } from "~/lib/utils";
import { type TimestampFormat } from "@t3tools/contracts/settings";
import {
  TimelineRowCtx,
  TimelineRowActivityCtx,
  WorkGroupViewCtx,
  type TimelineWorkEntry,
  type TimelineRow,
} from "./timelineRowContext";
import { TimelineRowTimestamp, ActivityShimmerOverlay } from "./TimelineRowParts";
import {
  failedToolIconClassName,
  toolIconAcceptsTint,
  type WorkEntryIconName,
  ToolActivityIconView,
} from "./TimelineToolActivityIcon";
import {
  useThreadReadTarget,
  threadReadLabel,
  ThreadReadLabel,
  ReasoningTraceContent,
  SimpleWorkEntryRow,
} from "./TimelineWorkEntryRow";
import {
  remarkThoughtPreview,
  toolGroupSummaryIconName,
  workEntryIconName,
} from "./TimelineWorkEntryRow.logic";
import { formatWorkingTimerNow } from "./TimelineWorkGroupRows.logic";

export const WorkGroupSection = memo(function WorkGroupSection({
  anchorKey,
  disclosureAnchorKey = anchorKey,
  groupedEntries,
  isExpandedToolGroup,
  displayLabel,
}: {
  anchorKey: string;
  disclosureAnchorKey?: string;
  groupedEntries: Extract<MessagesTimelineRow, { kind: "work" }>["groupedEntries"];
  isExpandedToolGroup: boolean;
  displayLabel?: string | undefined;
}) {
  const { workspaceRoot, routeThreadKey, onToggleWorkEntry } = use(TimelineRowCtx);
  const onToggleStandaloneEntry = (collapsed: boolean) =>
    onToggleWorkEntry(disclosureAnchorKey, collapsed);
  const nonEmptyEntries = groupedEntries.filter((entry) =>
    workEntryIsVisibleInGroup(entry, isExpandedToolGroup),
  );

  if (nonEmptyEntries.length === 0) return null;
  if (isExpandedToolGroup && nonEmptyEntries.every((entry) => entry.itemType === "reasoning")) {
    return <ReasoningTraceContent entries={nonEmptyEntries} />;
  }
  if (isExpandedToolGroup) {
    return (
      <ExpandedWorkGroupEntries
        key={`${routeThreadKey}:${anchorKey}`}
        anchorKey={anchorKey}
        disclosureAnchorKey={disclosureAnchorKey}
        entries={nonEmptyEntries}
        workspaceRoot={workspaceRoot}
      />
    );
  }

  return (
    <section aria-label={t.chat.timeline.activity}>
      {nonEmptyEntries.map((workEntry) => (
        <SimpleWorkEntryRow
          key={workEntry.id}
          workEntry={workEntry}
          workspaceRoot={workspaceRoot}
          displayLabel={displayLabel}
          onToggleEntry={onToggleStandaloneEntry}
        />
      ))}
    </section>
  );
});

function WorkingTimer({ createdAt }: { createdAt: string }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const initialText = formatWorkingTimerNow(createdAt);

  useEffect(() => {
    const updateText = () => {
      if (textRef.current) {
        textRef.current.textContent = formatWorkingTimerNow(createdAt);
      }
    };
    updateText();
    const id = setInterval(updateText, 1000);
    return () => clearInterval(id);
  }, [createdAt]);

  return (
    <span ref={textRef} className="tabular-nums">
      {initialText}
    </span>
  );
}

// D1 labels occupy 32px plus a 2px row gap; include both in the virtualizer's initial estimate.
const compactWorkEntryHeight = 34;

/**
 * Renders an expanded work group while preserving its scroll and disclosure anchors.
 * @param props - Required anchor keys and entry array, which may be empty; workspaceRoot may be
 * undefined. Requires TimelineRowCtx for group state and entry toggles.
 * @returns The expanded entry list; an empty list renders no entry rows, and the element is never
 * null.
 */
function ExpandedWorkGroupEntries({
  anchorKey,
  disclosureAnchorKey,
  entries,
  workspaceRoot,
}: {
  anchorKey: string;
  disclosureAnchorKey: string;
  entries: TimelineWorkEntry[];
  workspaceRoot: string | undefined;
}) {
  const { workGroupViewState: viewState, onToggleWorkEntry } = use(TimelineRowCtx);
  const [initialScrollIndex] = useState(() =>
    resolveWorkGroupScrollIndex(entries, viewState.scrollPositions.get(anchorKey)),
  );
  const [restoringPosition, setRestoringPosition] = useState(initialScrollIndex !== undefined);
  const listRef = useRef<LegendListRef>(null);
  const [expandedContentHeight, setExpandedContentHeight] = useState(0);
  const [fades, setFades] = useState({ top: false, bottom: false, viewportHeight: 0 });
  const [appendState, setAppendState] = useState({ entries, follow: false });
  // Capture the pre-change edge once per incoming array, before new layout
  // metrics arrive. Edge/viewport changes never turn a status update into a follow.
  if (appendState.entries !== entries) {
    setAppendState({
      entries,
      follow:
        fades.viewportHeight > 0 &&
        shouldFollowWorkGroupAppend(appendState.entries, entries, fades.bottom ? Infinity : 0),
    });
  }

  const groupView = {
    state: viewState,
    onToggleEntry: (collapsed: boolean) => onToggleWorkEntry(disclosureAnchorKey, collapsed),
  };
  const updateScrollFades = () => {
    const element = listRef.current?.getScrollableNode();
    if (!element) return;
    const distanceFromEnd = element.scrollHeight - element.clientHeight - element.scrollTop;
    const viewportHeight = element.clientHeight;
    const top = element.scrollTop > 1;
    const bottom = distanceFromEnd > 1;
    setFades((previous) =>
      previous.top === top &&
      previous.bottom === bottom &&
      previous.viewportHeight === viewportHeight
        ? previous
        : { top, bottom, viewportHeight },
    );
  };

  const handleScroll = () => {
    const state = listRef.current?.getState();
    const position = state && resolveWorkGroupScrollAnchor(state);
    if (position) {
      viewState.scrollPositions.set(anchorKey, {
        entryId: position.rowId,
        offset: position.offsetWithinRow,
      });
    }
    updateScrollFades();
  };

  const handleLoad = () => {
    const list = listRef.current;
    const element = list?.getScrollableNode();
    if (initialScrollIndex && list && element) {
      // Bootstrap can report the restored target before the DOM has applied it.
      // Reconcile once at load, before releasing the measured anchor row.
      const offset = Math.max(
        0,
        Math.min(list.getState().scroll, element.scrollHeight - element.clientHeight),
      );
      if (Math.abs(element.scrollTop - offset) > 1) {
        void list.scrollToOffset({ offset, animated: false });
      }
    }
    setRestoringPosition(false);
  };

  useLayoutEffect(() => {
    const element = listRef.current?.getScrollableNode();
    if (!element) return;
    updateScrollFades();
    const content = element.firstElementChild;
    return observeResize(content ? [element, content] : element, updateScrollFades);
  }, [updateScrollFades]);

  const renderEntry = ({ item }: { item: TimelineWorkEntry }) => (
    <SimpleWorkEntryRow key={item.id} workEntry={item} workspaceRoot={workspaceRoot} />
  );

  const updateExpandedContentHeight = () => {
    const state = listRef.current?.getState();
    let height = 0;
    for (const entryId of viewState.expandedEntries) {
      if (state?.indexByKey(entryId) === undefined) continue;
      height += Math.max(
        0,
        (state.sizes.get(entryId) ?? compactWorkEntryHeight) - compactWorkEntryHeight,
      );
    }
    setExpandedContentHeight(height);
  };

  useLayoutEffect(updateExpandedContentHeight, [entries, updateExpandedContentHeight]);

  return (
    <WorkGroupViewCtx value={groupView}>
      <WorkLogList>
        <LegendList
          ref={listRef}
          data={entries}
          extraData={workspaceRoot}
          keyExtractor={workEntryKey}
          renderItem={renderEntry}
          estimatedItemSize={compactWorkEntryHeight}
          drawDistance={240}
          recycleItems
          {...(initialScrollIndex ? { initialScrollIndex } : {})}
          maintainScrollAtEnd={
            appendState.follow ? { animated: false, on: { dataChange: true } } : false
          }
          maintainScrollAtEndThreshold={1 / Math.max(1, fades.viewportHeight)}
          // Measure the restored row even when an intra-row offset puts its
          // estimated bounds outside the list's small bootstrap render window.
          {...(restoringPosition && initialScrollIndex
            ? { alwaysRender: { indices: [initialScrollIndex.index] } }
            : {})}
          maintainVisibleContentPosition
          onLoad={handleLoad}
          onScroll={handleScroll}
          onLayout={updateScrollFades}
          onItemSizeChanged={updateExpandedContentHeight}
          tabIndex={0}
          role="region"
          aria-label={t.chat.timeline.toolCalls}
          data-tool-group-scroll
          style={{ maxHeight: `calc(min(18rem, 50dvh) + ${expandedContentHeight}px)` }}
          className={cn(
            "scrollbar-gutter-stable scroll-py-6 overflow-x-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
            getVirtualizedScrollFadeClassName(fades),
          )}
        />
      </WorkLogList>
    </WorkGroupViewCtx>
  );
}

const workEntryKey = (entry: TimelineWorkEntry) => entry.id;

export /**
 * Renders the current working indicator, including compaction or workspace preparation state.
 * @param props - Required working row; requires TimelineRowCtx for live activity and setup state.
 * @returns The working row element; never null.
 */
function WorkingTimelineRow({ row }: { row: Extract<TimelineRow, { kind: "working" }> }) {
  const { isCompacting, isPreparingWorktree, backgroundWorktreeSetup } =
    use(TimelineRowActivityCtx);
  const shimmer = isPreparingWorktree || isCompacting;
  const label = isPreparingWorktree ? (
    t.chat.timeline.settingUpWorktree
  ) : isCompacting ? (
    <CompactingLabel />
  ) : row.createdAt ? (
    <>
      {t.chat.timeline.workingForPrefix}
      <WorkingTimer createdAt={row.createdAt} />
    </>
  ) : (
    t.chat.timeline.working
  );
  return (
    <div className="border-b border-border/60 pb-2 pt-1">
      <div className="flex h-6 min-w-0 items-baseline gap-2 px-1 text-sm leading-relaxed text-muted-foreground tabular-nums">
        <span
          ref={shimmer ? observeVisibleAnimation : undefined}
          className="relative shrink-0 overflow-hidden whitespace-nowrap"
        >
          {label}
          {shimmer ? <ActivityShimmerOverlay>{label}</ActivityShimmerOverlay> : null}
        </span>
        {backgroundWorktreeSetup ? (
          <BackgroundWorktreeSetupChip snapshot={backgroundWorktreeSetup} />
        ) : null}
      </div>
    </div>
  );
}

/** Exposes setup progress without making the background job cancellable from this chip.
 * @param snapshot Current setup state; a terminal action is available only when both its ID and the timeline callback exist.
 * @returns Localized progress popover backed by the supplied snapshot. */
function BackgroundWorktreeSetupChip({ snapshot }: { snapshot: WorktreeSetupSnapshot }) {
  const ctx = use(TimelineRowCtx);
  const terminalId = snapshot.setupScript?.terminalId ?? null;
  const openTerminal = ctx.onOpenWorktreeSetupTerminal;
  const onOpenTerminal = openTerminal && terminalId ? () => openTerminal(terminalId) : null;
  const scriptName = snapshot.setupScript?.name ?? t.chat.timeline.setupScript;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost-muted"
            size="micro"
            className="ml-auto min-w-0 shrink-0"
            aria-label={t.chat.timeline.setupStillRunning(scriptName)}
          />
        }
      >
        <Spinner className="size-3 shrink-0" />
        <span className="truncate">{t.chat.timeline.backgroundSetup}</span>
      </PopoverTrigger>
      <PopoverPopup side="bottom" align="end" width="lg" padding="compact">
        <WorktreeSetupCard
          snapshot={snapshot}
          embedded
          onCancel={null}
          onWorkLocally={null}
          onOpenTerminal={onOpenTerminal}
        />
      </PopoverPopup>
    </Popover>
  );
}

/**
 * Renders the context-compaction activity label with its visibility-aware shimmer.
 * @returns The label element; never null.
 */
function CompactingLabel() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Minimize2Icon aria-hidden="true" className="size-3" />
      {t.chat.timeline.compacting}
    </span>
  );
}

/**
 * Renders live reasoning and its work-group disclosure when available.
 * @param props - Required thinking row; requires TimelineRowCtx for active work and group state.
 * @returns The reasoning row, or an empty-label placeholder while compaction or workspace
 * preparation owns the activity slot; never null.
 */
export function ThinkingTimelineRow({ row }: { row: Extract<TimelineRow, { kind: "thinking" }> }) {
  const ctx = use(TimelineRowCtx);
  const { isCompacting, isPreparingWorktree } = use(TimelineRowActivityCtx);
  if (isPreparingWorktree || isCompacting) return <WorkLogRow label="" />;
  const activity = (
    <LiveActivityRow
      label={t.chat.timeline.thinking}
      iconName="brain"
      active
      expanded={row.groupId === undefined ? undefined : row.expanded === true}
    />
  );
  const { groupId } = row;
  if (groupId === undefined) return activity;
  return (
    <button
      type="button"
      className="group/live-work flex w-full max-w-full cursor-pointer items-center rounded-compact-row text-left focus-visible:outline-none focus-visible:inset-shadow-focus"
      aria-expanded={row.expanded === true}
      onClick={() => ctx.onToggleWorkGroup(groupId, row.id)}
    >
      {activity}
    </button>
  );
}

/** Use static status color for live work so long conversations do not continuously repaint. */
function LiveActivityRow({
  label,
  iconName,
  toolIcon,
  failed = false,
  active = false,
  expanded,
}: {
  label: ReactNode;
  iconName?: WorkEntryIconName;
  toolIcon?: ToolActivityIcon | undefined;
  failed?: boolean;
  active?: boolean;
  expanded?: boolean | undefined;
}) {
  return (
    <LiveActivityContent
      label={label}
      iconName={iconName}
      toolIcon={toolIcon}
      failed={failed}
      announceFailure={failed}
      active={active && !failed}
      expanded={expanded}
    />
  );
}

/**
 * Renders an activity label with tool status and optional failure announcement.
 * @param props - label may be null or empty; iconName may be undefined and toolIcon is optional.
 * failed, announceFailure and active default to false. Undefined expanded means no group disclosure.
 * @returns The activity content element; never null.
 */
function LiveActivityContent({
  label,
  iconName,
  toolIcon,
  failed = false,
  announceFailure = false,
  active = false,
  expanded,
}: {
  label: ReactNode;
  iconName: WorkEntryIconName | undefined;
  toolIcon?: ToolActivityIcon | undefined;
  failed?: boolean;
  announceFailure?: boolean;
  active?: boolean;
  expanded?: boolean | undefined;
}) {
  const showTrailingFailureMark =
    failed && iconName !== undefined && !toolIconAcceptsTint(toolIcon);

  return (
    <WorkLogRow
      presentation={expanded === undefined ? "entry" : expanded ? "header" : "summary"}
      disclosure={
        expanded ? <ChevronDownIcon aria-hidden className="size-3.5 shrink-0" /> : undefined
      }
      icon={
        iconName ? (
          <span
            className={cn(
              "flex size-3.5 items-center justify-center",
              failed ? failedToolIconClassName : "text-secondary-label",
            )}
            role={announceFailure ? "img" : undefined}
            aria-label={announceFailure ? t.chat.timeline.toolCallFailed : undefined}
          >
            <ToolActivityIconView
              icon={toolIcon}
              fallbackName={iconName}
              className="block size-3.5 shrink-0 stroke-2"
              muted
            />
          </span>
        ) : null
      }
      label={
        <span className={cn("block truncate", active && "font-bold text-update")}>
          {expanded && active ? t.chat.timeline.working : label}
        </span>
      }
      trailing={
        <>
          {showTrailingFailureMark ? (
            <XIcon aria-hidden className={cn("size-3 shrink-0", failedToolIconClassName)} />
          ) : null}
          {expanded === false ? (
            <ChevronRightIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          ) : null}
        </>
      }
    />
  );
}

/**
 * Renders a live work entry with its status and optional expandable details.
 * @param props - Required work-live row; requires TimelineRowCtx for workspace, timestamp, and
 * interaction state.
 * @returns The live work row element; never null.
 */
export function LiveWorkEntryTimelineRow({
  row,
}: {
  row: Extract<TimelineRow, { kind: "work-live" }>;
}) {
  const ctx = use(TimelineRowCtx);
  const threadTarget = useThreadReadTarget(row.entry, ctx.activeThreadEnvironmentId);
  const questionHeading = row.entry.questionAnswer
    ? getQuestionTextPreview(row.entry.questionAnswer)
    : "";
  const label = questionHeading || liveWorkEntryLabel(row.entry, ctx.workspaceRoot, row.active);
  const threadLabel = threadReadLabel(row.entry, threadTarget, row.active);

  const failed = workEntryDisplayIndicatesToolFailure(row.entry);
  const thoughtLine = row.thought && !row.expanded ? liveThoughtLine(row.thought.detail ?? "") : "";
  const thoughtIsStatus = thoughtLine !== "" && row.entry === row.thought;

  return (
    <button
      type="button"
      className={cn(
        "group/live-work flex w-full max-w-full cursor-pointer rounded-compact-row text-left focus-visible:outline-none focus-visible:inset-shadow-focus",
        thoughtLine ? "flex-col items-start" : "items-center",
      )}
      aria-label={
        failed
          ? t.chat.timeline.toolFailure(
              `${thoughtLine ? `${thoughtLine} ` : ""}${threadLabel?.text ?? label}`,
            )
          : undefined
      }
      aria-expanded={row.expanded}
      onClick={() => ctx.onToggleWorkGroup(row.groupId, row.id)}
    >
      {thoughtLine ? (
        <WorkLogRow
          icon={
            <span className="flex size-4 items-center justify-center text-icon-muted">
              <ToolActivityIconView
                icon={undefined}
                fallbackName="brain"
                className="block size-4 shrink-0 stroke-2"
                muted
              />
            </span>
          }
          label={
            <span className="line-clamp-4">
              <ChatMarkdown
                inline
                text={thoughtLine}
                cwd={ctx.markdownCwd}
                parseRawHtml={false}
                extraRemarkPlugins={[[remarkThoughtPreview, t.chat.timeline.thought]]}
              />
            </span>
          }
          wrapLabel
        />
      ) : null}
      <LiveActivityRow
        label={
          thoughtIsStatus ? (
            row.active ? (
              t.chat.timeline.thinking
            ) : (
              t.chat.timeline.thought
            )
          ) : row.entry.questionAnswer && hasQuestionAnswer(row.entry.questionAnswer) ? (
            <span className="flex min-w-0 gap-1.5">
              <span className="min-w-0 truncate">{label}</span>
              <span className="min-w-0 truncate text-foreground">
                {getQuestionAnswerPreview(row.entry.questionAnswer)}
              </span>
            </span>
          ) : row.entry.itemType === "reasoning" ? (
            <ChatMarkdown
              inline
              text={row.entry.detail ?? label}
              cwd={ctx.markdownCwd}
              parseRawHtml={false}
              extraRemarkPlugins={[
                [
                  remarkThoughtPreview,
                  row.active ? t.chat.timeline.thinking : t.chat.timeline.thought,
                ],
              ]}
            />
          ) : threadLabel ? (
            <ThreadReadLabel
              label={threadLabel}
              environmentId={ctx.activeThreadEnvironmentId}
              linked={false}
            />
          ) : (
            label
          )
        }
        iconName={workEntryIconName(row.entry)}
        toolIcon={row.entry.toolIcon ?? row.entry.toolSource?.icon}
        failed={failed}
        active={row.active}
        expanded={row.expanded}
      />
    </button>
  );
}

export function WorkGroupToggleTimelineRow({
  row,
}: {
  row: Extract<TimelineRow, { kind: "work-toggle" }>;
}) {
  const ctx = use(TimelineRowCtx);
  return (
    <WorkGroupHeader
      label={row.summary}
      iconName={row.summaryToolIcon ?? row.toolSurface ?? toolGroupSummaryIconName(row.summaryKind)}
      toolIcon={row.toolIcon}
      failed={row.hasFailure}
      expanded={row.expanded}
      createdAt={row.createdAt}
      timestampFormat={ctx.timestampFormat}
      onToggle={() => ctx.onToggleWorkGroup(row.groupId, row.id)}
    />
  );
}

/**
 * Renders a work-group disclosure header with its status icon and timestamp.
 * @param props - Required label (possibly empty), iconName, expanded state, creation timestamp,
 * timestamp format, and toggle callback. toolIcon, failed, and active may be undefined.
 * @returns The work-group header element; never null.
 */
function WorkGroupHeader(props: {
  label: string;
  iconName: WorkEntryIconName;
  toolIcon?: ToolActivityIcon | undefined;
  failed?: boolean | undefined;
  active?: boolean | undefined;
  expanded: boolean;
  createdAt: string;
  timestampFormat: TimestampFormat;
  onToggle: () => void;
}) {
  return (
    <WorkLogButton
      presentation={props.expanded ? "header" : "summary"}
      disclosure={
        props.expanded ? <ChevronDownIcon aria-hidden className="size-3.5 shrink-0" /> : undefined
      }
      aria-label={props.failed ? t.chat.timeline.toolFailure(props.label) : props.label}
      aria-expanded={props.expanded}
      onClick={props.onToggle}
      icon={
        <ToolActivityIconView
          icon={props.toolIcon}
          fallbackName={props.iconName}
          className="size-3.5 shrink-0 stroke-2 text-secondary-label"
          muted
        />
      }
      label={
        <span
          className={cn(
            "block truncate font-semibold",
            props.active && !props.failed ? "text-update" : "text-foreground",
          )}
        >
          {props.label}
        </span>
      }
      trailing={
        <>
          <TimelineRowTimestamp
            createdAt={props.createdAt}
            timestampFormat={props.timestampFormat}
          />
          {!props.expanded ? (
            <ChevronRightIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          ) : null}
        </>
      }
    />
  );
}
