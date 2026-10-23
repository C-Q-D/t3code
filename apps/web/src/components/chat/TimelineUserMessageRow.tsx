/** Renders user inputs and attachments while keeping automation and agent messages foldable. */
import { PencilLineIcon } from "lucide-react";
import { t } from "~/i18n";
import { findRevealRef } from "./markdownFindContext";
import { type MessageId, type ServerProviderSkill, ThreadId } from "@t3tools/contracts";
import { resolveUserMessagePresentation } from "@t3tools/client-runtime/user-message";
import { Link } from "@tanstack/react-router";
import { useQuietThreadShell } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { replaceComposerContextReferences } from "@t3tools/shared/composerContextReferences";
import { memo, use, useState, type ReactNode } from "react";
import {
  createMessageAttachmentPreviewProjector,
  selectMessageImageResources,
} from "../../session-logic";
import {
  type ChatFileAttachment,
  isFileAttachment,
  isImageAttachment,
  isVideoAttachment,
} from "../../types";
import ChatMarkdown from "../ChatMarkdown";
import {
  CalendarClockIcon,
  ChevronDownIcon,
  DownloadIcon,
  EyeIcon,
  type LucideIcon,
  MessagesSquareIcon,
  Redo2Icon,
} from "lucide-react";
import { Link as LinkIconNode } from "lucide";
import { Button, InlineButton } from "../ui/button";
import { useAssetUrlRefresh, useAssetUrls, useAssetUrlState } from "../../assets/assetUrls";
import { AttachmentImage } from "../media/AttachmentImage";
import { MediaVideoPlayer } from "../media/MediaVideoPlayer";
import {
  buildAttachmentVideoAsset,
  buildAttachmentVideoPreview,
  buildExpandedImagePreview,
} from "./ExpandedImagePreview";
import {
  SNAP_SHOT_ATTACHMENT_FRAME_CLASS,
  SnapShotAttachmentDetails,
} from "./SnapShotAttachmentDetails";
import { MessageCopyButton } from "./MessageCopyButton";
import { promptLinkFor } from "../promptLinks/copyPromptLink";
import { PierreEntryIcon } from "./PierreEntryIcon";
import { shouldCollapseUserMessage } from "./MessagesTimeline.logic";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  asKnownContextRecord,
  resolveUserMessageContext,
  selectedMessageContextFragment,
} from "~/lib/composerContextRecords";
import { collectComposerContextReferences } from "@t3tools/shared/composerContextReferences";
import {
  COMPOSER_CONTEXT_CLIPBOARD_MIME,
  encodeComposerContextClipboardHtml,
  encodeComposerContextFragment,
} from "@t3tools/shared/composerContextClipboard";
import { chatMarkdownClipboardPayload } from "../../markdown-clipboard";
import type { ChatMarkdownContextReference } from "../ChatMarkdown";
import { cn } from "~/lib/utils";
import { formatChatTimestampTooltip, formatDayAwareTimestamp } from "../../timestampFormat";
import { WorkflowOpeningBlock } from "./WorkflowOpeningBlock";
import { TimelineRowCtx, TimelineRowActivityCtx, type TimelineRow } from "./timelineRowContext";
import {
  MESSAGE_HEADING_LEVEL,
  MessageAuthorHeading,
  TimelineRowTimestamp,
} from "./TimelineRowParts";
import { UserMessageContextReferenceChip } from "./UserMessageContextChips";
import { resolvePreviewAnnotationImage } from "./TimelineUserMessageRow.logic";

function UserVideoAttachment({ file }: { readonly file: ChatFileAttachment }) {
  const ctx = use(TimelineRowCtx);
  // Row updates rebuild attachment objects, so the asset follows only the
  // fields it reads.
  const { downloadable, id, mimeType, name } = file;
  const environmentId = ctx.activeThreadEnvironmentId;
  const asset =
    downloadable === false
      ? null
      : buildAttachmentVideoAsset(environmentId, { id, mimeType, name });
  const resource = asset?.resource ?? null;
  const assetUrl = useAssetUrlState(ctx.activeThreadEnvironmentId, resource);
  const refreshAssetUrl = useAssetUrlRefresh(ctx.activeThreadEnvironmentId, resource);
  const src = assetUrl._tag === "Success" ? assetUrl.url : (file.previewUrl ?? null);

  if (asset === null && src === null) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-border/80 bg-black px-2 py-3 text-center text-2xs text-white/70">
        {file.name}
      </div>
    );
  }

  return (
    <MediaVideoPlayer
      src={src}
      sourceFailed={
        file.previewUrl === undefined && resource !== null && assetUrl._tag === "Failure"
      }
      label={file.name}
      preload="visible"
      onOpen={() => {
        const preview = buildAttachmentVideoPreview(ctx.activeThreadEnvironmentId, file);
        if (preview) ctx.onImageExpand(preview);
      }}
      className="block aspect-[4/3] w-full"
      videoClassName="aspect-auto size-full rounded-lg border border-border/80"
      stateClassName="aspect-auto min-h-full rounded-lg border border-border/80 bg-black text-white"
      onRetry={asset ? refreshAssetUrl : undefined}
      actionsSource={asset ? { kind: "video", name: file.name, src, asset } : undefined}
    />
  );
}

export function UserMessageRow({ row }: { row: Extract<TimelineRow, { kind: "message" }> }) {
  const ctx = use(TimelineRowCtx);
  return ctx.workflowOpening?.messageId === row.message.id ? (
    <WorkflowOpeningBlock
      opening={ctx.workflowOpening}
      environmentId={ctx.activeThreadEnvironmentId}
      onOpenThread={(threadId) => ctx.onOpenThread(ThreadId.make(threadId))}
    />
  ) : resolveUserMessagePresentation(row.message).attribution === "automation" ? (
    <AutomationMessageRow row={row} />
  ) : (
    <UserTimelineRow row={row} />
  );
}

/** Automation prompts are long, repeated runbooks; a folded bubble keeps them out of the way. */
function AutomationMessageRow({ row }: { row: Extract<TimelineRow, { kind: "message" }> }) {
  const ctx = use(TimelineRowCtx);
  const [expanded, setExpanded] = useState(false);
  const revealRef = findRevealRef(() => setExpanded(true));
  const { text, scheduledTaskId } = resolveUserMessagePresentation(row.message);
  const tasksQuery = useEnvironmentQuery(
    scheduledTaskId
      ? serverEnvironment.scheduledTasksLive({
          environmentId: ctx.activeThreadEnvironmentId,
          input: {},
        })
      : null,
  );
  const taskTitle = tasksQuery.data?.tasks.find((task) => task.id === scheduledTaskId)?.title;
  const summary = taskTitle ?? text.trim().split(/\r?\n/, 1)[0] ?? "";

  const revertTurnCount = row.revertTurnCount;
  const promptLink = promptLinkFor(text);
  // Find reads the DOM, so a folded prompt stays mounted but hidden while find is open.
  const bodyMounted = expanded || ctx.findActive;

  return (
    <div
      className="group flex flex-col items-end gap-1.5"
      data-user-message-attribution="automation"
    >
      {row.message.inputIntent === "steer" ||
      row.message.inputIntent === "promoted_queued_to_steer" ? (
        <UserMessageIntentMarker intent={row.message.inputIntent} />
      ) : null}
      <div
        className={cn(
          "min-w-0 max-w-timeline-user rounded-timeline-user bg-message text-body leading-timeline-user text-message-foreground shadow-timeline-user",
          expanded && "w-full",
        )}
      >
        <FoldedMessageHeader
          icon={CalendarClockIcon}
          label={t.chat.timeline.sentByAutomation}
          summary={summary}
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
        />
        {bodyMounted ? (
          // `beforematch` does not bubble, so the reveal listener sits on the hidden fold itself.
          <div
            ref={revealRef}
            hidden={!expanded}
            className={cn("px-3 pb-3", !ctx.findActive && "max-h-96 overflow-auto")}
            data-thread-find-text="true"
          >
            <UserMessageBody text={text} skills={ctx.skills} markdownCwd={ctx.markdownCwd} />
          </div>
        ) : null}
      </div>
      <UserMessageProjectedStatus row={row} />
      {expanded ? (
        <div className="flex w-full max-w-timeline-user items-center justify-end text-secondary-copy tabular-nums opacity-0 transition-opacity duration-150 pointer-coarse:opacity-100 focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none">
          <div className="flex shrink-0 items-center gap-2">
            {scheduledTaskId ? (
              <Link
                to="/settings/scheduled-tasks"
                search={{ environmentId: ctx.activeThreadEnvironmentId, taskId: scheduledTaskId }}
                className="rounded-sm text-xs text-muted-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                Open automation
              </Link>
            ) : null}
            <TimelineRowTimestamp
              createdAt={row.message.createdAt}
              timestampFormat={ctx.timestampFormat}
              alwaysVisible
            />
            <div className="flex items-center gap-0.5">
              {typeof revertTurnCount === "number" && (
                <RevertUserMessageButton turnCount={revertTurnCount} messageId={row.message.id} />
              )}
              <MessageCopyButton text={text} variant="ghost" />
              {promptLink !== null && (
                <MessageCopyButton
                  text={promptLink}
                  label={t.chat.timelineUi.copyLink}
                  icon={LinkIconNode}
                  variant="ghost"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FoldedMessageHeader(props: {
  icon: LucideIcon;
  label: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      aria-expanded={props.expanded}
      data-scroll-anchor-ignore
      onClick={props.onToggle}
      className="flex w-full min-w-0 items-center gap-1.5 rounded-timeline-user px-4.5 py-2 text-left text-body focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Icon className="size-4 shrink-0 stroke-2 text-muted-foreground" />
      <span className="max-w-1/2 shrink-0 truncate text-muted-foreground">{props.label}</span>
      <span className="min-w-0 flex-1 truncate">{props.summary}</span>
      <ChevronDownIcon
        className={cn(
          "size-3.5 shrink-0 text-muted-foreground transition-transform",
          props.expanded && "rotate-180",
        )}
      />
    </button>
  );
}

function UserMessageProjectedStatus({ row }: { row: Extract<TimelineRow, { kind: "message" }> }) {
  const status = row.projectedItem?.item.status;
  if (
    status === undefined ||
    status === "completed" ||
    status === "pending" ||
    status === "waiting"
  )
    return null;
  return (
    <div className="me-1 flex items-center gap-1.5">
      <span className="flex h-5 items-center whitespace-nowrap rounded-tag bg-error-surface px-2.25 text-meta-large font-semibold text-error shadow-tag">
        {status}
      </span>
    </div>
  );
}

/**
 * Renders a user message with attachments, context chips, and available message actions.
 * @param props - Required message row, including any optional attachment/context metadata. Requires
 * TimelineRowCtx from the parent timeline.
 * @returns The user-message row; never null. User actions may open media, files, or context
 * details.
 */
function UserTimelineRow({ row }: { row: Extract<TimelineRow, { kind: "message" }> }) {
  const ctx = use(TimelineRowCtx);
  const { onImageExpand, onFileOpen } = ctx;
  const senderThreadId = row.message.senderThreadId;
  const resources = selectMessageImageResources(row.message.attachments);
  const previewUrls = useAssetUrls(ctx.activeThreadEnvironmentId, resources);
  const [projectPreviews] = useState(createMessageAttachmentPreviewProjector);
  const previewUrlsById = new Map(
    resources.flatMap((resource, index) => {
      const url = previewUrls[index];
      return url ? [[resource.attachmentId, url] as const] : [];
    }),
  );
  const messageWithPreviews = projectPreviews(row.message, (attachment) =>
    previewUrlsById.get(attachment.id),
  );
  const userImages = (messageWithPreviews.attachments ?? []).filter(isImageAttachment);
  const userFiles = (row.message.attachments ?? []).filter(isFileAttachment);
  const userVideos = userFiles.filter(isVideoAttachment);
  const otherUserFiles = userFiles.filter((file) => !isVideoAttachment(file));
  const unknownAttachments = (row.message.attachments ?? []).filter(
    (attachment) => !isImageAttachment(attachment) && !isFileAttachment(attachment),
  );
  const userMessage = resolveUserMessagePresentation(row.message);
  // Sent inputs only mark steering; queued inputs remain in the composer's queue panel.
  const intentMarker =
    row.message.inputIntent === "steer" || row.message.inputIntent === "promoted_queued_to_steer"
      ? row.message.inputIntent
      : null;
  const itemStatus = row.projectedItem?.item.status;
  const visibleItemStatus =
    itemStatus !== "completed" && itemStatus !== "pending" && itemStatus !== "waiting"
      ? itemStatus
      : undefined;
  // Messages from other agents fold to one line so the user's own messages stay easy to find.
  const folded = userMessage.attribution === "agent";
  const [expanded, setExpanded] = useState(false);
  const revealFoldRef = findRevealRef(() => setExpanded(true));
  const senderShell = useQuietThreadShell(
    folded && senderThreadId
      ? { environmentId: ctx.activeThreadEnvironmentId, threadId: senderThreadId }
      : null,
  );
  const resolvedContext = resolveUserMessageContext(row.message);
  const previewImages = userImages.filter((image) => image.name.startsWith("preview-annotation-"));
  const revertTurnCount = row.revertTurnCount;
  const chippedAttachmentIds = new Set(
    collectComposerContextReferences(resolvedContext.text).flatMap((occurrence) => {
      const record = asKnownContextRecord(resolvedContext.recordsById.get(occurrence.contextId));
      return record?.kind === "file" || record?.kind === "image" ? [record.attachmentId] : [];
    }),
  );
  const regularImages = userImages.filter((image) => !image.name.startsWith("preview-annotation-"));
  const unchippedFiles = otherUserFiles.filter((file) => !chippedAttachmentIds.has(file.id));
  const annotationRecordIds = resolvedContext.records
    .filter((record) => record.kind === "preview-annotation")
    .map((record) => record.contextId);
  const plainText = replaceComposerContextReferences(
    resolvedContext.text,
    (reference) => reference.label,
  );
  const promptLink = promptLinkFor(plainText);
  const foldSummary =
    plainText
      .split(/\r?\n/)
      .find((line) => line.trim().length > 0)
      ?.trim() ?? "";
  const contextClipboardFragment =
    resolvedContext.records.length === 0
      ? null
      : encodeComposerContextFragment({
          version: 1,
          source: {
            environmentId: ctx.activeThreadEnvironmentId,
            ...(ctx.threadRef ? { threadId: ctx.threadRef.threadId } : {}),
            messageId: row.message.id,
          },
          records: resolvedContext.records,
        });
  const onBodyCopyCapture = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (resolvedContext.records.length === 0 || !event.clipboardData) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const copiedMarkdown: string[] = [];
    for (let index = 0; index < selection.rangeCount; index += 1) {
      const container = document.createElement("div");
      container.appendChild(selection.getRangeAt(index).cloneContents());
      // Diagram source is copied text, not authority to export context records.
      for (const element of container.querySelectorAll(
        "[data-markdown-copy]:not([data-markdown-mermaid])",
      )) {
        copiedMarkdown.push(element.getAttribute("data-markdown-copy") ?? "");
      }
    }
    const fragment = selectedMessageContextFragment({
      markdown: copiedMarkdown.join("\n"),
      records: resolvedContext.records,
      environmentId: ctx.activeThreadEnvironmentId,
      ...(ctx.threadRef ? { threadId: ctx.threadRef.threadId } : {}),
      messageId: row.message.id,
    });
    if (!fragment) return;
    // Claim the copy: without preventDefault the browser default overwrites the
    // custom MIME type. The default content must then be written back explicitly.
    const payload = chatMarkdownClipboardPayload(selection);
    event.preventDefault();
    event.clipboardData.setData("text/plain", payload?.text ?? selection.toString());
    if (payload) {
      event.clipboardData.setData(
        "text/html",
        encodeComposerContextClipboardHtml(payload.text, fragment, payload.html),
      );
    }
    event.clipboardData.setData(COMPOSER_CONTEXT_CLIPBOARD_MIME, fragment);
  };
  const renderContextReference = (reference: ChatMarkdownContextReference) => {
    const record = asKnownContextRecord(resolvedContext.recordsById.get(reference.contextId));
    const annotationImage =
      record?.kind === "preview-annotation"
        ? resolvePreviewAnnotationImage({
            record,
            recordsById: resolvedContext.recordsById,
            userImages,
            previewImages,
            annotationRecordIds,
          })
        : null;
    const attachment =
      record?.kind === "image"
        ? (userImages.find((image) => image.id === record.attachmentId) ?? null)
        : record?.kind === "file"
          ? (userFiles.find((file) => file.id === record.attachmentId) ?? null)
          : null;
    return (
      <span data-thread-find-ignore>
        <UserMessageContextReferenceChip
          reference={reference}
          record={record}
          annotationImage={annotationImage}
          attachment={attachment}
          onExpandImage={(image) => {
            const preview = buildExpandedImagePreview(userImages, image.id);
            if (preview) onImageExpand(preview);
          }}
          onOpenFile={onFileOpen}
          onExpandVideo={(file) => {
            const preview = buildAttachmentVideoPreview(ctx.activeThreadEnvironmentId, file);
            if (preview) onImageExpand(preview);
          }}
        />
      </span>
    );
  };

  return (
    <div
      className="group flex flex-col items-end gap-1.5"
      data-user-message-attribution={folded ? "agent" : undefined}
    >
      <div
        className={cn(
          "relative min-w-0 max-w-timeline-user rounded-timeline-user bg-message text-body leading-timeline-user text-message-foreground shadow-timeline-user",
          !folded && "px-4.5 py-3",
          folded && expanded && "w-full",
        )}
      >
        {folded ? (
          <FoldedMessageHeader
            icon={MessagesSquareIcon}
            label={senderShell?.title.trim() || t.chat.timeline.sentByAnotherAgent}
            summary={foldSummary}
            expanded={expanded}
            onToggle={() => setExpanded((value) => !value)}
          />
        ) : null}
        {/* Find reads the DOM, so a folded message stays mounted but hidden while find is open. */}
        {!folded || expanded || ctx.findActive ? (
          <div
            ref={folded ? revealFoldRef : undefined}
            hidden={folded && !expanded}
            className={cn(
              "flex flex-col gap-2.5",
              folded && "px-4.5 pb-3",
              folded && !ctx.findActive && "max-h-96 overflow-auto",
            )}
          >
            <MessageAuthorHeading>{t.chat.timeline.you}</MessageAuthorHeading>
            {userMessage.attribution === "t3code" || intentMarker || visibleItemStatus ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {userMessage.attribution === "t3code" ? (
                  <p
                    className="flex h-5 items-center whitespace-nowrap rounded-tag bg-timeline-file px-2.25 text-meta-large font-semibold text-code-foreground"
                    data-user-message-attribution="t3code"
                  >
                    {t.chat.timeline.sentByT3Code}
                  </p>
                ) : null}
                {row.message.inputIntent === "steer" ||
                row.message.inputIntent === "promoted_queued_to_steer" ? (
                  <UserMessageIntentMarker intent={row.message.inputIntent} />
                ) : null}
                <UserMessageProjectedStatus row={row} />
              </div>
            ) : null}
            {(regularImages.length > 0 || userVideos.length > 0) && (
              <div className="grid max-w-52.5 grid-cols-2 gap-2">
                {regularImages.map((image) => (
                  <div
                    key={image.id}
                    className={cn(
                      "bg-background/70",
                      image.source?.kind === "snap-shot" && image.previewUrl
                        ? cn(SNAP_SHOT_ATTACHMENT_FRAME_CLASS, "col-span-2")
                        : "aspect-[4/3] overflow-hidden rounded-lg border border-border/80",
                    )}
                  >
                    {image.previewUrl ? (
                      <button
                        type="button"
                        className="block h-full w-full cursor-zoom-in"
                        aria-label={t.chat.timeline.preview(image.name)}
                        onClick={() => {
                          const preview = buildExpandedImagePreview(regularImages, image.id);
                          if (!preview) return;
                          ctx.onImageExpand(preview);
                        }}
                      >
                        <AttachmentImage
                          name={image.name}
                          mimeType={image.mimeType}
                          src={image.previewUrl}
                          alt={image.name}
                          decoding="async"
                          className="block size-full object-cover"
                        />
                      </button>
                    ) : (
                      <div className="flex min-h-18 items-center justify-center px-2 py-3 text-center text-2xs text-muted-foreground/70">
                        {image.name}
                      </div>
                    )}
                    {image.previewUrl && image.source?.kind === "snap-shot" ? (
                      <SnapShotAttachmentDetails source={image.source} />
                    ) : null}
                  </div>
                ))}
                {userVideos.map((file) => (
                  <UserVideoAttachment key={file.id} file={file} />
                ))}
              </div>
            )}
            {unchippedFiles.length > 0 || unknownAttachments.length > 0 ? (
              <div className="flex flex-col items-start gap-2">
                {unchippedFiles.map((file) => {
                  const fileIdentity = (
                    <>
                      <PierreEntryIcon
                        pathValue={file.name}
                        kind="file"
                        theme={ctx.resolvedTheme}
                        className="size-3.5"
                      />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    </>
                  );
                  if (file.downloadable !== false) {
                    return (
                      <div
                        key={file.id}
                        className="flex h-8.5 min-w-0 max-w-full items-center gap-1 rounded-tag bg-timeline-file ps-2.5 pe-3 font-mono text-secondary-copy text-fg-detail shadow-timeline-file"
                      >
                        <button
                          type="button"
                          aria-label={t.chat.timeline.preview(file.name)}
                          onClick={() => ctx.onFileOpen(file)}
                          className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-tag text-left hover:underline focus-visible:inset-shadow-focus focus-visible:outline-none"
                        >
                          {fileIdentity}
                          <EyeIcon className="size-4 shrink-0" />
                        </button>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                size="icon-xs"
                                variant="ghost-muted"
                                aria-label={t.chat.timeline.download(file.name)}
                                onClick={() => ctx.onFileDownload(file)}
                              />
                            }
                          >
                            <DownloadIcon />
                          </TooltipTrigger>
                          <TooltipPopup side="top">
                            {t.chat.timeline.download(file.name)}
                          </TooltipPopup>
                        </Tooltip>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={file.id}
                      className="flex h-8.5 min-w-0 max-w-full items-center gap-2 rounded-tag bg-timeline-file ps-2.5 pe-3 font-mono text-secondary-copy text-fg-detail shadow-timeline-file"
                    >
                      {fileIdentity}
                    </div>
                  );
                })}
                {unknownAttachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex h-8.5 min-w-0 max-w-full items-center gap-2 rounded-tag bg-timeline-file ps-2.5 pe-3 font-mono text-secondary-copy text-fg-detail shadow-timeline-file"
                  >
                    <PierreEntryIcon
                      pathValue={attachment.name}
                      kind="file"
                      theme={ctx.resolvedTheme}
                      className="size-3.5"
                    />
                    <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div onCopyCapture={onBodyCopyCapture}>
              <CollapsibleUserMessageBody
                text={resolvedContext.text}
                renderContextReference={renderContextReference}
                skills={ctx.skills}
                markdownCwd={ctx.markdownCwd}
                collapsible={!folded}
              />
            </div>
          </div>
        ) : null}
      </div>
      {folded && !expanded ? <UserMessageProjectedStatus row={row} /> : null}
      {!folded || expanded ? (
        <div className="flex w-full max-w-timeline-user items-center justify-end text-secondary-copy tabular-nums opacity-0 transition-opacity duration-150 pointer-coarse:opacity-100 focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none">
          <div className="flex shrink-0 items-center gap-2">
            {folded && senderThreadId ? (
              <InlineButton
                onClick={() => ctx.onOpenThread(senderThreadId)}
                aria-label={t.chat.timeline.openSendingThread}
                tone="muted"
              >
                Open thread
              </InlineButton>
            ) : null}
            <Tooltip>
              <TooltipTrigger
                render={<p className="text-placeholder text-secondary-copy tabular-nums" />}
              >
                {formatDayAwareTimestamp(row.message.createdAt, ctx.timestampFormat)}
              </TooltipTrigger>
              <TooltipPopup>
                {formatChatTimestampTooltip(row.message.createdAt, ctx.timestampFormat)}
              </TooltipPopup>
            </Tooltip>
            <div className="flex items-center gap-0.5">
              {typeof revertTurnCount === "number" && (
                <RevertUserMessageButton turnCount={revertTurnCount} messageId={row.message.id} />
              )}
              {resolvedContext.text && (
                <MessageCopyButton
                  text={contextClipboardFragment ? resolvedContext.text : plainText}
                  {...(contextClipboardFragment
                    ? {
                        extraFlavors: {
                          [COMPOSER_CONTEXT_CLIPBOARD_MIME]: contextClipboardFragment,
                        },
                      }
                    : {})}
                  variant="ghost"
                  size="icon-md"
                />
              )}
              {promptLink !== null && (
                <MessageCopyButton
                  text={promptLink}
                  label={t.chat.timelineUi.copyLink}
                  icon={LinkIconNode}
                  variant="ghost"
                  size="icon-md"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Renders the steer marker on a sent user message; the tooltip says whether it began queued. */
function UserMessageIntentMarker({
  intent,
}: {
  readonly intent: "steer" | "promoted_queued_to_steer";
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className="flex h-5 items-center gap-1 whitespace-nowrap rounded-tag bg-update-surface px-2.25 text-meta-large font-semibold text-update-foreground shadow-tag"
            data-user-message-intent={intent}
          />
        }
      >
        <Redo2Icon aria-hidden="true" className="size-3" />
        {t.chat.timeline.steer}
      </TooltipTrigger>
      <TooltipPopup side="top">
        {intent === "promoted_queued_to_steer"
          ? t.chat.timeline.originallyQueuedThenPromotedToSteerThe
          : t.chat.timeline.steeredTheActiveTurn}
      </TooltipPopup>
    </Tooltip>
  );
}

/**
 * Renders the action to revert the conversation to a user-message boundary.
 * @param props - Required target turnCount and messageId; neither may be null. Uses TimelineRowCtx
 * for pending state and the revert callback.
 * @returns The revert button; never null. Invokes the host revert action only after a user click.
 */
function RevertUserMessageButton({
  turnCount,
  messageId,
}: {
  turnCount: number;
  messageId: MessageId;
}) {
  const ctx = use(TimelineRowCtx);
  const activity = use(TimelineRowActivityCtx);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon-md"
            variant="ghost-muted"
            disabled={activity.isRevertingCheckpoint || activity.isWorking}
            onClick={() => ctx.onRevertToTurnCount(turnCount, messageId)}
            aria-label={t.chat.timeline.editFromHere}
          />
        }
      >
        <PencilLineIcon className="size-3.75" />
      </TooltipTrigger>
      <TooltipPopup side="top">{t.chat.timeline.editFromHere}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * Clips D1 previews to three lines without changing the length policy or find-reveal behavior.
 * @param props - Message text, context renderer, skills, working directory and optional footer.
 * @returns The complete body in the DOM, with a local expand/collapse control for long messages.
 */
const CollapsibleUserMessageBody = memo(function CollapsibleUserMessageBody(props: {
  text: string;
  renderContextReference: (reference: ChatMarkdownContextReference) => ReactNode;
  skills: ReadonlyArray<Pick<ServerProviderSkill, "name" | "displayName">>;
  markdownCwd: string | undefined;
  collapsible?: boolean;
  footer?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const revealForFind = () => setExpanded(true);
  const revealRef = findRevealRef(revealForFind);
  const hasVisibleBody = props.text.trim().length > 0;
  const canCollapse =
    props.collapsible !== false && hasVisibleBody && shouldCollapseUserMessage(props.text);
  const isCollapsed = canCollapse && !expanded;
  const showCollapseControl = canCollapse;

  return (
    <div>
      {hasVisibleBody ? (
        <div
          ref={revealRef}
          className={cn("relative", isCollapsed && "line-clamp-3")}
          data-user-message-body="true"
          data-thread-find-text="true"
          data-thread-find-fold={isCollapsed ? "" : undefined}
          data-user-message-collapsed={isCollapsed ? "true" : "false"}
          data-user-message-collapsible={canCollapse ? "true" : "false"}
        >
          <UserMessageBody
            text={props.text}
            renderContextReference={props.renderContextReference}
            skills={props.skills}
            markdownCwd={props.markdownCwd}
          />
        </div>
      ) : null}
      {showCollapseControl || props.footer ? (
        <div
          className={cn(
            "mt-2 flex items-center gap-2",
            showCollapseControl ? "justify-between" : "justify-end",
          )}
          data-user-message-footer="true"
        >
          {showCollapseControl ? (
            <button
              type="button"
              aria-expanded={expanded}
              data-scroll-anchor-ignore
              onClick={() => setExpanded((value) => !value)}
              className="cursor-pointer self-start rounded-sm text-secondary-copy-medium font-semibold text-code-foreground underline decoration-border underline-offset-3 hover:text-message-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {expanded ? t.chat.timeline.showLess : t.chat.timeline.showFullMessage}
            </button>
          ) : null}
          {props.footer ? (
            <div className="ml-auto flex items-center gap-2">{props.footer}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

/**
 * Renders user Markdown with D1 typography, context links and literal HTML.
 * @param props - Message text, optional context renderer, skills and working directory.
 * @returns Markdown content, or null for empty text; uses TimelineRowCtx for thread navigation.
 */
const UserMessageBody = memo(function UserMessageBody(props: {
  text: string;
  renderContextReference?: (reference: ChatMarkdownContextReference) => ReactNode;
  skills: ReadonlyArray<Pick<ServerProviderSkill, "name" | "displayName">>;
  markdownCwd: string | undefined;
}) {
  const ctx = use(TimelineRowCtx);
  if (props.text.length === 0) {
    return null;
  }
  return (
    <ChatMarkdown
      text={props.text}
      cwd={props.markdownCwd}
      threadRef={ctx.threadRef ?? undefined}
      skills={props.skills}
      className="text-body leading-timeline-user text-message-foreground"
      lineBreaks
      parseRawHtml={false}
      renderContextReference={props.renderContextReference}
      headingLevelOffset={MESSAGE_HEADING_LEVEL}
    />
  );
});
