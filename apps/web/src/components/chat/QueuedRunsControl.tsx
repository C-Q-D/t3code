import { resolveUserMessagePresentation } from "@t3tools/client-runtime/user-message";
import { Link } from "@tanstack/react-router";
import * as DateTime from "effect/DateTime";
import { FoldedMessageHeader, useScheduledTaskTitle } from "./TimelineUserMessageRow";
import { TimelineRowTimestamp } from "./TimelineRowParts";
import { InlineButton } from "../ui/button";
import type { TimestampFormat } from "@t3tools/contracts/settings";
/** Displays queued messages and their edit, reorder, steer and removal actions. */
import { t } from "~/i18n";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { deriveThreadQueueWorkflowState } from "@t3tools/client-runtime/state/thread-workflows";
import { assistantCitationsToPlainText } from "@t3tools/shared/assistantCitations";
import {
  isAttachmentOnlyBootstrapPrompt,
  replaceComposerContextReferences,
} from "@t3tools/shared/composerContextReferences";
import type {
  ChatAttachment as ContractChatAttachment,
  EnvironmentId,
  MessageId,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import {
  CalendarClockIcon,
  MessagesSquareIcon,
  Clock3Icon,
  CheckIcon,
  ChevronDownIcon,
  CornerDownRightIcon,
  GripVerticalIcon,
  ListOrderedIcon,
  SquarePenIcon,
  XIcon,
} from "lucide-react";
import { useContext, useId, useImperativeHandle, useRef, useState, type Ref } from "react";

import { useCountPop } from "../../hooks/useCountPop";
import { useAssetUrls } from "../../assets/assetUrls";
import { threadEnvironment } from "../../state/threads";
import { useQuietThreadShell, useThreadProjection } from "../../state/entities";
import { useAtomCommand } from "../../state/use-atom-command";
import { isImageAttachment, type ChatMessage } from "../../types";
import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Spinner } from "../ui/spinner";
import { ComposerSubmissionStateContext } from "./composerSubmissionState";

export interface EditQueuedRunRequest {
  readonly runId: RunId;
  readonly messageId: MessageId;
  readonly text: string;
  readonly attachments: ReadonlyArray<ContractChatAttachment>;
}

interface QueuedRowThumbnail {
  readonly key: string;
  readonly name: string;
  readonly url: string | null;
}

const QUEUED_RUN_DRAG_TYPE = "application/x-t3code-queued-run";

// E1's queue actions belong to this floating row, including its 30px hit targets.
const queueActionClassName =
  "inline-flex size-7.5 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-secondary-label outline-none enabled:cursor-pointer enabled:hover:bg-secondary enabled:hover:text-foreground focus-visible:inset-shadow-focus disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.75";

export interface QueuedRunsControlHandle {
  steerNext: (repeat: boolean) => boolean;
  editLatest: (repeat: boolean) => boolean;
}

type ThreadQueueProjection = Parameters<typeof deriveThreadQueueWorkflowState>[0];

function queuedImageResources(projection: ThreadQueueProjection | undefined) {
  if (!projection) return [];
  return deriveThreadQueueWorkflowState(projection).queuedRuns.flatMap(({ attachments }) =>
    attachments.flatMap((attachment) =>
      attachment.type === "image"
        ? [{ _tag: "attachment" as const, attachmentId: attachment.id }]
        : [],
    ),
  );
}

/**
 * Renders queued runs and their edit, steer, and removal actions.
 * @param props - Required environment/thread IDs, optimisticMessages (possibly empty), and
 * edit/cancel callbacks. editingRunId is null when no saved run is being edited; shortcut labels
 * may be null or undefined. Optional ref may be null and exposes the queue control handle.
 * @returns The queue controls when entries exist, or null for an empty queue. Render inside the
 * composer form and its ComposerSubmissionStateContext: the edit check submits that form,
 * while other actions invoke host queue commands. Saving stays disabled outside that scope.
 */
export function QueuedRunsControl({
  ref,
  ...props
}: {
  readonly ref?: Ref<QueuedRunsControlHandle>;
  readonly steerShortcutLabel?: string | null;
  readonly editShortcutLabel?: string | null;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly optimisticMessages: ReadonlyArray<
    Pick<ChatMessage, "id" | "inputIntent" | "text" | "attachments">
  >;
  readonly editingRunId: RunId | null;
  readonly timestampFormat?: TimestampFormat;
  readonly editBlockedReason?: string | null;
  readonly onOpenThread?: (threadId: ThreadId) => void;
  readonly onEditQueuedRun: (request: EditQueuedRunRequest) => void;
  readonly onCancelEdit: () => void;
}) {
  const submissionState = useContext(ComposerSubmissionStateContext);
  const projection = useThreadProjection(
    scopeThreadRef(props.environmentId, props.threadId),
  )?.projection;
  const reorder = useAtomCommand(threadEnvironment.reorderQueuedRun);
  const promote = useAtomCommand(threadEnvironment.promoteQueuedRun);
  const resume = useAtomCommand(threadEnvironment.resumeThreadQueue);
  const cancel = useAtomCommand(threadEnvironment.cancelQueuedRun);
  const [expanded, setExpanded] = useState(true);
  const queueListId = useId();
  const [busyRunId, setBusyRunId] = useState<RunId | null>(null);
  const [dragState, setDragState] = useState<{
    readonly runId: RunId;
    readonly insertIndex: number | null;
  } | null>(null);
  // Drags must start from the grip, not from an accidental text-drag on the
  // row. The grip arms its run id on pointerdown; dragstart verifies it.
  const dragArmedRunIdRef = useRef<RunId | null>(null);
  const steerInFlightRef = useRef(false);
  // Once the projection holds the message the optimistic copy is stale no
  // matter what happened to its run — keying on still-queued runs alone would
  // resurrect a phantom "pending" row after the run is cancelled or started.
  const acknowledgedMessageIds = new Set((projection?.messages ?? []).map((message) => message.id));
  const queuedImageAttachmentResources = queuedImageResources(projection);
  const queuedImageAttachmentUrls = useAssetUrls(
    props.environmentId,
    queuedImageAttachmentResources,
  );
  const workflow = projection ? deriveThreadQueueWorkflowState(projection) : null;
  const queued = workflow?.queuedRuns ?? [];
  const activeRun = workflow?.activeRun ?? null;
  const canReorder = workflow?.canReorder === true;
  const canSend = workflow?.canSendNow === true || workflow?.canPromoteToSteer === true;
  const queuedImageUrlById = new Map(
    queuedImageAttachmentUrls.flatMap((url, index) => {
      const resource = queuedImageAttachmentResources[index];
      return url && resource ? [[resource.attachmentId, url] as const] : [];
    }),
  );
  const optimisticQueued = props.optimisticMessages.filter(
    (message) => message.inputIntent === "queued_turn" && !acknowledgedMessageIds.has(message.id),
  );
  const items = [
    ...queued.map(({ run, text, attachments, message, context }, serverIndex) => ({
      message,
      editable: context?.guest === undefined,
      key: run.id,
      runId: run.id,
      messageId: run.userMessageId,
      serverIndex,
      text,
      attachments,
      thumbnails: attachments
        .filter((attachment) => attachment.type === "image")
        .map<QueuedRowThumbnail>((attachment) => ({
          key: attachment.id,
          name: attachment.name,
          url: queuedImageUrlById.get(attachment.id) ?? null,
        })),
      pending: false,
    })),
    ...optimisticQueued.map((message) => ({
      key: message.id,
      message: undefined,
      editable: true,
      runId: null,
      messageId: null,
      serverIndex: null,
      text: message.text,
      attachments: [] as ReadonlyArray<ContractChatAttachment>,
      thumbnails: (message.attachments ?? [])
        .filter(isImageAttachment)
        .map<QueuedRowThumbnail>((attachment) => ({
          key: attachment.id,
          name: attachment.name,
          url: attachment.previewUrl ?? null,
        })),
      pending: true,
    })),
  ];

  const move = async (runId: RunId, beforeRunId: RunId | null) => {
    setBusyRunId(runId);
    await reorder({
      environmentId: props.environmentId,
      input: { threadId: props.threadId, runId, beforeRunId },
    });
    setBusyRunId(null);
  };

  const completeDrag = (runId: RunId, insertIndex: number | null) => {
    setDragState(null);
    dragArmedRunIdRef.current = null;
    if (insertIndex === null || busyRunId !== null) return;
    const draggedIndex = queued.findIndex(({ run }) => run.id === runId);
    if (draggedIndex === -1) return;
    if (insertIndex === draggedIndex || insertIndex === draggedIndex + 1) return;
    void move(runId, queued[insertIndex]?.run.id ?? null);
  };

  const sendQueuedMessage = async (queuedRunId: RunId) => {
    if (!canSend || steerInFlightRef.current) return;
    steerInFlightRef.current = true;
    setBusyRunId(queuedRunId);
    if (workflow?.canSendNow) {
      await resume({
        environmentId: props.environmentId,
        input: { threadId: props.threadId, runId: queuedRunId },
      });
    } else if (activeRun !== null) {
      await promote({
        environmentId: props.environmentId,
        input: { threadId: props.threadId, queuedRunId, targetRunId: activeRun.id },
      });
    }
    steerInFlightRef.current = false;
    setBusyRunId(null);
  };

  useImperativeHandle(ref, () => ({
    steerNext(repeat) {
      const next = queued[0];
      if (!next || !canSend) return false;
      if (!repeat && busyRunId === null) void sendQueuedMessage(next.run.id);
      return true;
    },
    // Declines while a queued message is already being edited so the key keeps
    // moving the caret inside that draft.
    editLatest(repeat) {
      const latest = queued.at(-1);
      if (
        !latest ||
        latest.context?.guest !== undefined ||
        props.editBlockedReason != null ||
        props.editingRunId !== null ||
        busyRunId !== null
      )
        return false;
      if (!repeat) {
        setExpanded(true);
        props.onEditQueuedRun({
          runId: latest.run.id,
          messageId: latest.run.userMessageId,
          text: latest.text,
          attachments: latest.attachments,
        });
      }
      return true;
    },
  }));

  const expandedCountRef = useRef<HTMLSpanElement>(null);
  const collapsedCountRef = useRef<HTMLSpanElement>(null);
  useCountPop(expandedCountRef, items.length);
  useCountPop(collapsedCountRef, items.length);

  if (items.length === 0) return null;

  const remove = async (runId: RunId) => {
    setBusyRunId(runId);
    await cancel({
      environmentId: props.environmentId,
      input: { threadId: props.threadId, runId },
    });
    setBusyRunId(null);
  };

  return (
    <div
      role="region"
      aria-label={t.chat.queue.count(items.length)}
      aria-live="polite"
      data-chat-composer-collapsed-controls="true"
      className={cn(
        "surface-glass relative z-0 mb-2 w-full text-secondary-copy-large shadow-raise-m",
        expanded ? "flex flex-col gap-1 rounded-card-large p-1.5" : "rounded-full",
      )}
    >
      {expanded ? (
        <button
          type="button"
          className="flex h-8.5 w-full cursor-pointer items-center gap-2 rounded-composer-queue-toggle border-0 bg-transparent pr-1.5 pl-2.5 text-left font-bold outline-none focus-visible:inset-shadow-focus"
          aria-label={
            expanded ? t.chat.queue.collapseQueuedMessages : t.chat.queue.expandQueuedMessages
          }
          aria-expanded={expanded}
          aria-controls={queueListId}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => setExpanded((value) => !value)}
        >
          <ListOrderedIcon className="size-3.5" aria-hidden="true" />
          <span ref={expandedCountRef} className="flex-1 origin-left">
            {t.chat.queue.count(items.length)}
          </span>
          <span className="flex size-7 items-center justify-center rounded-composer-queue-toggle text-secondary-label hover:bg-secondary">
            <ChevronDownIcon className="size-3.75" aria-hidden="true" />
          </span>
        </button>
      ) : null}
      <ol
        id={queueListId}
        className={cn(
          "m-0 list-none p-0",
          expanded && "flex max-h-32 flex-col gap-1 overflow-y-auto overscroll-contain",
        )}
      >
        {items.map((item, index) => {
          const presentation = item.message ? resolveUserMessagePresentation(item.message) : null;
          const senderThreadId = item.message?.senderThreadId;
          const previewText = isAttachmentOnlyBootstrapPrompt(item.text)
            ? ""
            : assistantCitationsToPlainText(
                replaceComposerContextReferences(item.text, (reference) =>
                  reference.kind === "image" && item.thumbnails.length > 0 ? "" : reference.label,
                ),
              ).trim();
          const rowRunId = item.runId;
          const rowServerIndex = item.serverIndex;
          const isEditing = rowRunId !== null && rowRunId === props.editingRunId;
          const rowDraggable =
            rowRunId !== null && rowServerIndex !== null && canReorder && busyRunId === null;
          return (
            <li
              key={item.key}
              aria-current={isEditing ? "true" : undefined}
              className={cn(
                "relative flex h-10.5 shrink-0 items-center gap-2 pr-1.5 pl-2",
                expanded ? "rounded-composer-queue-row" : "rounded-full",
                !expanded && index > 0 && "hidden",
                isEditing &&
                  "bg-composer-queue-selected text-foreground inset-shadow-selected-control",
                dragState !== null && dragState.runId === item.runId && "opacity-50",
              )}
              draggable={rowDraggable}
              onDragStart={(event) => {
                if (item.runId === null || dragArmedRunIdRef.current !== item.runId) {
                  event.preventDefault();
                  return;
                }
                event.dataTransfer.setData(QUEUED_RUN_DRAG_TYPE, item.runId);
                event.dataTransfer.effectAllowed = "move";
                setDragState({ runId: item.runId, insertIndex: null });
              }}
              onDragEnd={() => {
                dragArmedRunIdRef.current = null;
                setDragState(null);
              }}
              onDragOver={(event) => {
                if (dragState === null || item.serverIndex === null) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const rect = event.currentTarget.getBoundingClientRect();
                const insertIndex =
                  event.clientY < rect.top + rect.height / 2
                    ? item.serverIndex
                    : item.serverIndex + 1;
                if (dragState.insertIndex !== insertIndex) {
                  setDragState({ runId: dragState.runId, insertIndex });
                }
              }}
              onDrop={(event) => {
                if (dragState === null) return;
                event.preventDefault();
                completeDrag(dragState.runId, dragState.insertIndex);
              }}
            >
              {item.serverIndex !== null && dragState?.insertIndex === item.serverIndex ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-0.5 rounded bg-primary/70"
                />
              ) : null}
              {item.serverIndex === queued.length - 1 &&
              dragState?.insertIndex === queued.length ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 rounded bg-primary/70"
                />
              ) : null}
              {!expanded ? (
                <button
                  type="button"
                  className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-composer-queue-badge px-2.5 text-secondary-copy font-semibold text-composer-queue-count shadow-well-control outline-none focus-visible:inset-shadow-focus"
                  aria-label={t.chat.queue.expandQueuedMessages}
                  aria-expanded={false}
                  aria-controls={queueListId}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => setExpanded(true)}
                >
                  <ListOrderedIcon className="size-3.25" aria-hidden="true" />
                  <span ref={index === 0 ? collapsedCountRef : undefined}>
                    {t.chat.queue.count(items.length)}
                  </span>
                </button>
              ) : null}
              {canReorder && rowRunId !== null && rowServerIndex !== null ? (
                <button
                  type="button"
                  aria-label={t.chat.queue.reorderQueuedMessageDragOrPressThe}
                  className="inline-flex w-3.75 shrink-0 cursor-grab items-center justify-center self-stretch border-0 bg-transparent p-0 text-placeholder outline-none focus-visible:inset-shadow-focus active:cursor-grabbing disabled:cursor-default"
                  disabled={busyRunId !== null}
                  onPointerDown={() => {
                    dragArmedRunIdRef.current = rowRunId;
                  }}
                  onKeyDown={(event) => {
                    if (busyRunId !== null) return;
                    if (event.key === "ArrowUp" && rowServerIndex > 0) {
                      event.preventDefault();
                      void move(rowRunId, queued[rowServerIndex - 1]?.run.id ?? null);
                    }
                    if (event.key === "ArrowDown" && rowServerIndex < queued.length - 1) {
                      event.preventDefault();
                      void move(rowRunId, queued[rowServerIndex + 2]?.run.id ?? null);
                    }
                  }}
                >
                  <GripVerticalIcon className="size-3.75" aria-hidden="true" />
                </button>
              ) : null}
              <div
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2",
                  isEditing ? "text-foreground" : "text-fg-detail",
                )}
              >
                {isEditing ? (
                  <span className="sr-only">{t.chat.queue.editingQueuedPrefix}</span>
                ) : null}
                {item.pending ? (
                  <Clock3Icon
                    aria-label={t.chat.queue.savingQueuedMessage}
                    className="size-3 shrink-0 text-muted-foreground/60"
                  />
                ) : null}
                {item.thumbnails.length > 0 ? (
                  <span className="flex shrink-0 items-center gap-0.5">
                    {item.thumbnails.map((thumbnail) => (
                      <span
                        key={thumbnail.key}
                        className="size-7 overflow-hidden rounded-keycap bg-composer-queue-badge shadow-well-control"
                      >
                        {thumbnail.url ? (
                          <img
                            src={thumbnail.url}
                            alt={thumbnail.name}
                            className="size-full object-cover"
                          />
                        ) : (
                          <span
                            aria-label={thumbnail.name}
                            className="block size-full bg-muted/60"
                          />
                        )}
                      </span>
                    ))}
                  </span>
                ) : null}
                <QueuedRunPreview
                  environmentId={props.environmentId}
                  message={item.message}
                  previewText={previewText}
                />
              </div>
              <div className="flex shrink-0 items-center">
                {presentation?.attribution === "t3code" ? (
                  <span className="text-secondary-copy text-secondary-label">Sent by T3 Code</span>
                ) : null}
                {presentation?.attribution === "agent" && senderThreadId && props.onOpenThread ? (
                  <InlineButton tone="muted" onClick={() => props.onOpenThread?.(senderThreadId)}>
                    Open thread
                  </InlineButton>
                ) : null}
                {presentation?.scheduledTaskId ? (
                  <InlineButton
                    tone="muted"
                    render={
                      <Link
                        to="/settings/scheduled-tasks"
                        search={{
                          environmentId: props.environmentId,
                          taskId: presentation.scheduledTaskId,
                        }}
                      />
                    }
                  >
                    Open automation
                  </InlineButton>
                ) : null}
                {item.message && props.timestampFormat ? (
                  <TimelineRowTimestamp
                    createdAt={DateTime.formatIso(item.message.createdAt)}
                    timestampFormat={props.timestampFormat}
                    alwaysVisible
                  />
                ) : null}

                {isEditing ? (
                  <>
                    <button
                      type="button"
                      className="h-7 cursor-pointer rounded-composer-queue-toggle border-0 bg-transparent px-2.5 text-secondary-copy-medium font-semibold text-composer-queue-action outline-none hover:bg-secondary focus-visible:inset-shadow-focus"
                      aria-label={t.chat.queue.cancelEditingQueuedMessage}
                      onClick={props.onCancelEdit}
                    >
                      {t.chat.queue.cancel}
                    </button>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="submit"
                            aria-label={t.composer.primaryActions.saveQueued}
                            disabled={submissionState?.disabled ?? true}
                            aria-busy={submissionState?.busy ?? false}
                            className="composer-primary-key ml-2 inline-flex size-7.5 shrink-0 cursor-pointer items-center justify-center rounded-menu-row border-0 bg-primary p-0 text-primary-foreground shadow-primary-edge outline-none hover:bg-message-action-hover focus-visible:inset-shadow-focus disabled:pointer-events-none disabled:opacity-50"
                          />
                        }
                      >
                        {submissionState?.busy ? (
                          <Spinner size="sm" aria-hidden="true" />
                        ) : (
                          <CheckIcon className="size-3.75" strokeWidth={2.5} aria-hidden="true" />
                        )}
                      </TooltipTrigger>
                      <TooltipPopup>{t.composer.primaryActions.saveQueued}</TooltipPopup>
                    </Tooltip>
                  </>
                ) : (
                  <>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            className={cn(
                              queueActionClassName,
                              expanded ? "rounded-menu-row" : "rounded-full",
                            )}
                            aria-label={t.chat.queue.editQueuedMessage}
                            disabled={
                              item.runId === null ||
                              !item.editable ||
                              busyRunId !== null ||
                              props.editBlockedReason != null
                            }
                            onClick={() => {
                              if (item.runId !== null && item.messageId !== null) {
                                setExpanded(true);
                                props.onEditQueuedRun({
                                  runId: item.runId,
                                  messageId: item.messageId,
                                  text: item.text,
                                  attachments: item.attachments,
                                });
                              }
                            }}
                          />
                        }
                      >
                        <SquarePenIcon aria-hidden="true" />
                      </TooltipTrigger>
                      <TooltipPopup>
                        {props.editBlockedReason ??
                          t.chat.queue.editInComposer(
                            item.serverIndex === queued.length - 1
                              ? (props.editShortcutLabel ?? null)
                              : null,
                          )}
                      </TooltipPopup>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger render={<span className="flex shrink-0" />}>
                        <button
                          type="button"
                          className={cn(
                            queueActionClassName,
                            expanded ? "rounded-menu-row" : "rounded-full",
                          )}
                          aria-label={
                            workflow?.canSendNow
                              ? t.chat.queue.sendNow
                              : t.chat.queue.sendSteer(null)
                          }
                          disabled={item.runId === null || busyRunId !== null || !canSend}
                          onClick={() => {
                            if (item.runId !== null) {
                              void sendQueuedMessage(item.runId);
                            }
                          }}
                        >
                          <CornerDownRightIcon aria-hidden="true" />
                        </button>
                      </TooltipTrigger>
                      <TooltipPopup>
                        {workflow?.canSendNow
                          ? t.chat.queue.startTurn(
                              item.serverIndex === 0 ? (props.steerShortcutLabel ?? null) : null,
                            )
                          : activeRun === null
                            ? t.chat.queue.thereIsNoActiveRunToSteer
                            : t.chat.queue.sendSteer(
                                item.serverIndex === 0 ? (props.steerShortcutLabel ?? null) : null,
                              )}
                      </TooltipPopup>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            className={cn(
                              queueActionClassName,
                              expanded ? "rounded-menu-row" : "rounded-full",
                            )}
                            aria-label={t.chat.queue.removeQueuedMessage}
                            disabled={item.runId === null || busyRunId !== null}
                            onClick={() => {
                              if (item.runId !== null) void remove(item.runId);
                            }}
                          />
                        }
                      >
                        <XIcon aria-hidden="true" />
                      </TooltipTrigger>
                      <TooltipPopup>{t.chat.queue.removeFromQueue}</TooltipPopup>
                    </Tooltip>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Keeps automation and agent attribution readable without expanding the local queue controls.
 * The caller supplies the queued message, or undefined for an optimistic user draft. */
function QueuedRunPreview({
  environmentId,
  message,
  previewText,
}: {
  environmentId: EnvironmentId;
  message: ThreadQueueProjection["messages"][number] | undefined;
  previewText: string;
}) {
  const presentation = message ? resolveUserMessagePresentation(message) : null;
  const attribution = presentation?.attribution;
  const taskTitle = useScheduledTaskTitle(environmentId, presentation?.scheduledTaskId);
  const senderShell = useQuietThreadShell(
    attribution === "agent" && message?.senderThreadId
      ? { environmentId, threadId: message.senderThreadId }
      : null,
  );
  const [expanded, setExpanded] = useState(false);
  const fold = attribution === "automation" || attribution === "agent";
  return (
    <div className="min-w-0 flex-1">
      {fold ? (
        <FoldedMessageHeader
          icon={attribution === "automation" ? CalendarClockIcon : MessagesSquareIcon}
          label={attribution === "automation" ? "Automation" : senderShell?.title.trim() || "Agent"}
          summary={
            attribution === "automation"
              ? (taskTitle ?? previewText.split(/\r?\n/, 1)[0] ?? "")
              : (previewText.split(/\r?\n/).find((line) => line.trim()) ?? "")
          }
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
        />
      ) : null}
      {fold ? (
        expanded ? (
          <p className="max-h-96 overflow-auto whitespace-pre-wrap wrap-anywhere">{previewText}</p>
        ) : null
      ) : (
        <Tooltip>
          <TooltipTrigger render={<span className="block min-w-0 truncate" />}>
            {previewText}
          </TooltipTrigger>
          <TooltipPopup side="top" className="max-w-96 break-words">
            {previewText}
          </TooltipPopup>
        </Tooltip>
      )}
    </div>
  );
}
