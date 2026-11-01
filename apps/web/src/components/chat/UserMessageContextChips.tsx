/** Renders sent-message context references and delegates resource actions to the timeline. */
import { PierreEntryIcon } from "./PierreEntryIcon";
import { t } from "~/i18n";
import { documentChipKindForFileName } from "~/pierre-icons";
import { isSvgAttachment } from "@t3tools/shared/image";
import { useRenderedAppearance } from "../../hooks/useTheme";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { ReadOnlySourcePreview } from "../files/AttachmentFilePreview";
import { useRightPanelStore } from "~/rightPanelStore";
import { COMPOSER_CONTEXT_KINDS } from "@t3tools/contracts";
import { formatAttachmentSize } from "@t3tools/client-runtime/state/attachments";
import { use, type ReactNode } from "react";
import { FileDiff } from "@pierre/diffs/react";
import { DiffWorkerPoolProvider } from "../DiffWorkerPoolProvider";
import {
  type ChatFileAttachment,
  type ChatImageAttachment,
  isImageAttachment,
  isVideoAttachment,
} from "../../types";
import {
  getRenderablePatch,
  resolveDiffThemeName,
  resolveFileDiffPath,
} from "../../lib/diffRendering";
import { PREFERRED_HIGHLIGHTER } from "../../lib/syntaxHighlighting";
import ChatMarkdown from "../ChatMarkdown";
import { ThreadContextChip } from "../ThreadContextChip";
import { MessageCircleIcon, MousePointerClickIcon, PaintbrushIcon } from "lucide-react";
import type { ComposerContextId, KnownComposerContextRecord } from "@t3tools/contracts";
import { buildExpandedImagePreview } from "./ExpandedImagePreview";
import { WorkspaceEntryIcon, WorkspaceEntryTooltip } from "./WorkspaceEntryIcon";
import { TerminalContextInlineChip } from "./TerminalContextInlineChip";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  ContextChipPopover as UserMessageContextPopover,
  FileChip,
  ImageChipButton,
  PULL_REQUEST_CHIP_KINDS,
  PullRequestChip,
  UnresolvedChip,
} from "../contextChipParts";
import {
  isPullRequestSummaryContext,
  pullRequestContextDisplayState,
  pullRequestContextKindLabel,
  reviewCommentContextLabel,
} from "~/lib/composerContextRecords";
import { formatComposerContextReference } from "@t3tools/shared/composerContextReferences";
import { ContextChip, ContextChipLabel, type ContextChipKind } from "../ContextChip";
import { createContextPresentationRegistry } from "../contextPresentationRegistry";
import type { ChatMarkdownContextReference } from "../ChatMarkdown";
import {
  SkillChipPopover,
  skillInstructionsOpener,
  skillPopoverDescription,
} from "./SkillInlineText";
import { formatWorkspaceRelativePath } from "../../filePathDisplay";
import {
  buildReviewCommentRenderablePatch,
  formatReviewCommentFence,
  type ReviewCommentContext,
} from "../../reviewCommentContext";
import { TimelineRowCtx } from "./timelineRowContext";
import { userMessageFilePresentation } from "./TimelineUserMessageRow.logic";

/**
 * Renders a user-message file mention and its available open actions.
 * @param props - Required mention record and copyMarkdown string, which may be empty. Requires
 * TimelineRowCtx for workspace and file actions.
 * @returns The mention chip element; never null.
 */
function UserMessageMentionChip(props: {
  record: Extract<KnownComposerContextRecord, { kind: "mention" }>;
  copyMarkdown: string;
}) {
  const ctx = use(TimelineRowCtx);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <ContextChip
            kind={documentChipKindForFileName(props.record.path) ?? "mention"}
            render={<button type="button" />}
            aria-label={t.chat.timeline.preview(props.record.path)}
            data-markdown-copy={props.copyMarkdown}
            onClick={() => {
              if (ctx.threadRef)
                useRightPanelStore.getState().openFile(ctx.threadRef, props.record.path);
            }}
          >
            <WorkspaceEntryIcon
              path={props.record.path}
              environmentId={ctx.activeThreadEnvironmentId}
              cwd={ctx.workspaceRoot}
              theme={ctx.resolvedTheme}
            />
            <ContextChipLabel>{props.record.label}</ContextChipLabel>
          </ContextChip>
        }
      />
      <TooltipPopup>
        <WorkspaceEntryTooltip
          path={props.record.path}
          environmentId={ctx.activeThreadEnvironmentId}
          cwd={ctx.workspaceRoot}
        />
      </TooltipPopup>
    </Tooltip>
  );
}

/** Resolves a recorded skill against the current thread skills; unavailable instructions remain non-actionable. */
function UserMessageSkillChip(props: {
  record: Extract<KnownComposerContextRecord, { kind: "skill" }>;
  copyMarkdown: string;
}) {
  const { skills, threadRef } = use(TimelineRowCtx);
  const skill = skills.find((candidate) => candidate.name === props.record.name);
  return (
    <SkillChipPopover
      label={props.record.label || props.record.name}
      description={skill ? skillPopoverDescription(skill) : null}
      copyMarkdown={props.copyMarkdown}
      onViewInstructions={skillInstructionsOpener(threadRef, skill)}
    />
  );
}

function UserMessagePullRequestContextChip(props: {
  record: Extract<KnownComposerContextRecord, { kind: "review-comment" }>;
  copyMarkdown: string;
  kind: ContextChipKind;
}) {
  const { activeThreadEnvironmentId, openPullRequest } = use(TimelineRowCtx);
  const metadata = props.record.pullRequest;
  if (metadata === undefined) return null;
  return (
    <PullRequestChip
      metadata={metadata}
      environmentId={activeThreadEnvironmentId}
      label={reviewCommentContextLabel(props.record)}
      kindLabel={pullRequestContextKindLabel(props.record)}
      kind={props.kind}
      copyMarkdown={props.copyMarkdown}
      onOpen={openPullRequest}
    />
  );
}

/**
 * Renders the details and optional screenshot of a user preview annotation.
 * @param props - Required annotation record; image is null when no screenshot attachment is
 * available. Requires TimelineRowCtx for preview actions.
 * @returns The annotation details element; never null.
 */
function UserMessagePreviewAnnotationDetails(props: {
  record: Extract<KnownComposerContextRecord, { kind: "preview-annotation" }>;
  image: ChatImageAttachment | null;
}) {
  const ctx = use(TimelineRowCtx);
  const visibleElements = props.record.elements ?? [];
  return (
    <div className="max-w-full overflow-hidden rounded-lg border border-border/70 bg-background/70">
      {props.image?.previewUrl ? (
        <button
          type="button"
          className="block max-h-64 w-full cursor-zoom-in overflow-hidden border-b border-border/70 bg-muted"
          aria-label={t.chat.timeline.preview(props.image.name)}
          onClick={() => {
            if (!props.image) return;
            const preview = buildExpandedImagePreview([props.image], props.image.id);
            if (preview) ctx.onImageExpand(preview);
          }}
        >
          <img
            src={props.image.previewUrl}
            alt={t.chat.timeline.annotatedPreviewCrop}
            className="max-h-64 w-full object-contain"
          />
        </button>
      ) : (
        <div className="border-b border-border/70 bg-muted/40 px-3 py-2 text-secondary-label text-xs">
          {t.chat.timeline.screenshotUnavailable}
        </div>
      )}
      <div className="min-w-0 px-3 py-2.5">
        <div className="text-message-foreground text-xs font-medium">
          {props.record.pageTitle?.trim() ||
            props.record.pageUrl ||
            t.chat.timeline.previewAnnotation}
        </div>
        {props.record.comment ? (
          <div className="mt-1 whitespace-pre-wrap wrap-break-word text-sm">
            {props.record.comment}
          </div>
        ) : null}
        <div className="mt-1 flex items-center gap-2 text-secondary-label text-3xs">
          {props.record.targetSummary ? (
            <span className="truncate">{props.record.targetSummary}</span>
          ) : null}
          {(props.record.styleChanges?.length ?? 0) > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1">
              <PaintbrushIcon className="size-3" />
              {props.record.styleChanges?.length ?? 0}
            </span>
          ) : null}
        </div>
        {visibleElements.length > 0 ? (
          <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
            {visibleElements.map((element) => {
              const source = element.source;
              const sourceLabel = source?.fileName
                ? `${source.fileName}${source.lineNumber === null ? "" : `:${source.lineNumber}`}`
                : null;
              return (
                <div
                  key={`${element.selector}\u0000${element.tagName}\u0000${sourceLabel ?? ""}\u0000${element.htmlPreview}`}
                  className="min-w-0"
                >
                  <div className="flex min-w-0 items-center gap-2 text-xs">
                    <code className="truncate text-message-foreground">
                      {element.selector || `<${element.tagName}>`}
                    </code>
                    {sourceLabel ? (
                      <span className="ml-auto shrink-0 text-secondary-label">{sourceLabel}</span>
                    ) : null}
                  </div>
                  {element.htmlPreview?.trim() ? (
                    <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-muted/60 px-2 py-1.5 text-3xs leading-relaxed">
                      {element.htmlPreview.trim()}
                    </pre>
                  ) : null}
                </div>
              );
            })}
            {(props.record.elements?.length ?? 0) > visibleElements.length ? (
              <div className="text-secondary-label text-3xs">
                {t.chat.timeline.moreSelectedElements(
                  (props.record.elements?.length ?? 0) - visibleElements.length,
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function UserMessageElementDetails({
  record,
}: {
  record: Extract<KnownComposerContextRecord, { kind: "element" }>;
}) {
  const sourceLabel = record.source?.fileName
    ? `${record.source.fileName}${record.source.lineNumber === null ? "" : `:${record.source.lineNumber}`}`
    : null;
  return (
    <div className="max-w-full overflow-hidden rounded-lg border border-border/70 bg-background/70">
      <div className="border-b border-border/70 px-3 py-2.5">
        <div className="truncate text-message-foreground text-xs font-medium">
          {record.pageTitle?.trim() || record.pageUrl}
        </div>
        <div className="mt-0.5 truncate text-secondary-label text-3xs">{record.pageUrl}</div>
      </div>
      <div className="space-y-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <code className="truncate text-message-foreground">
            {record.selector || `<${record.tagName}>`}
          </code>
          {sourceLabel ? (
            <span className="ml-auto shrink-0 text-secondary-label">{sourceLabel}</span>
          ) : null}
        </div>
        {record.htmlPreview?.trim() ? (
          <div className="flex h-40 flex-col overflow-hidden rounded border border-border">
            <ReadOnlySourcePreview name="element.html" text={record.htmlPreview} />
          </div>
        ) : null}
        {record.styles?.trim() ? (
          <div className="flex h-32 flex-col overflow-hidden rounded border border-border">
            <ReadOnlySourcePreview name="styles.css" text={record.styles} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface UserMessageContextRenderContext {
  environmentId: import("@t3tools/contracts").EnvironmentId;
  reference: ChatMarkdownContextReference;
  annotationImage: ChatImageAttachment | null;
  attachment: ChatImageAttachment | ChatFileAttachment | null;
  resolvedTheme: "light" | "dark";
  copyMarkdown: string;
  onExpandImage: (image: ChatImageAttachment) => void;
  onExpandVideo: (file: ChatFileAttachment) => void;
  onOpenFile: (file: ChatFileAttachment) => void;
}

/**
 * Renders an unresolved context chip while retaining its copyable reference.
 * @param props - Required rendering context with reference and copyMarkdown (possibly empty);
 * annotationImage and attachment may be null. Other context fields retain the host theme and action
 * callbacks.
 * @returns The unavailable-context chip element; never null.
 */
function UnavailableUserMessageContextChip(props: UserMessageContextRenderContext) {
  return (
    <UnresolvedChip
      label={props.reference.label}
      copyMarkdown={props.copyMarkdown}
      tooltip={t.chat.timeline.thisContextIsNoLongerAvailable}
    />
  );
}

const userMessageContextPresentationRegistry = createContextPresentationRegistry<
  KnownComposerContextRecord,
  UserMessageContextRenderContext,
  ReactNode
>({
  requiredKinds: COMPOSER_CONTEXT_KINDS.filter((kind) => kind !== "environment"),
  handlers: [
    {
      kind: "mention",
      canRender: (record) => record.kind === "mention",
      render: (record, context) =>
        record.kind === "mention" ? (
          <UserMessageMentionChip record={record} copyMarkdown={context.copyMarkdown} />
        ) : (
          <UnavailableUserMessageContextChip {...context} />
        ),
    },
    {
      kind: "skill",
      canRender: (record) => record.kind === "skill",
      render: (record, context) =>
        record.kind === "skill" ? (
          <UserMessageSkillChip record={record} copyMarkdown={context.copyMarkdown} />
        ) : (
          <UnavailableUserMessageContextChip {...context} />
        ),
    },
    {
      kind: "thread",
      canRender: (record) => record.kind === "thread",
      render: (record, context) =>
        record.kind === "thread" ? (
          <ThreadContextChip record={record} copyMarkdown={context.copyMarkdown} />
        ) : (
          <UnavailableUserMessageContextChip {...context} />
        ),
    },
    {
      kind: "image",
      canRender: (record, context) =>
        record.kind === "image" &&
        context.attachment !== null &&
        isImageAttachment(context.attachment),
      render: (record, context) => {
        if (
          record.kind !== "image" ||
          context.attachment === null ||
          !isImageAttachment(context.attachment)
        ) {
          return <UnavailableUserMessageContextChip {...context} />;
        }
        const attachment = context.attachment;
        return (
          <ImageChipButton
            name={record.name}
            previewUrl={attachment.previewUrl}
            size={formatAttachmentSize(record.sizeBytes)}
            data-markdown-copy={context.copyMarkdown}
            onClick={() => context.onExpandImage(attachment)}
          />
        );
      },
    },
    {
      kind: "file",
      canRender: (record, context) =>
        record.kind === "file" && context.attachment !== null && context.attachment.type === "file",
      render: (record, context) => {
        if (
          record.kind !== "file" ||
          context.attachment === null ||
          context.attachment.type !== "file"
        ) {
          return <UnavailableUserMessageContextChip {...context} />;
        }
        const attachment = context.attachment;
        const isVideo = isVideoAttachment(attachment);
        const { label, useFileWell } = userMessageFilePresentation(attachment);
        const disabled =
          attachment.downloadable === false && (!isVideo || attachment.previewUrl === undefined);
        const size =
          attachment.downloadable === false ? "Sending…" : formatAttachmentSize(record.sizeBytes);
        // D1's file well belongs to sent messages; the composer keeps its inline chip.
        if (useFileWell) {
          return (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={t.chat.timeline.attachment(false, label, size)}
                    data-markdown-copy={context.copyMarkdown}
                    onClick={() => context.onOpenFile(attachment)}
                    className="inline-flex h-8.5 max-w-full cursor-pointer items-center gap-2 rounded-tag bg-timeline-file ps-2.5 pe-3 align-middle font-mono text-secondary-copy text-fg-detail shadow-timeline-file hover:underline focus-visible:inset-shadow-focus focus-visible:outline-none disabled:cursor-default"
                  />
                }
              >
                <PierreEntryIcon
                  pathValue={record.name}
                  kind="file"
                  theme={context.resolvedTheme}
                  className="size-3.5"
                />
                <span className="min-w-0 truncate">{label}</span>
              </TooltipTrigger>
              <TooltipPopup side="top">
                {label}
                <br />
                {size}
              </TooltipPopup>
            </Tooltip>
          );
        }
        return (
          <FileChip
            name={label}
            svgPreview={
              isSvgAttachment(attachment)
                ? { environmentId: context.environmentId, attachmentId: attachment.id }
                : undefined
            }
            size={size}
            isVideo={isVideo}
            theme={context.resolvedTheme}
            disabled={disabled}
            accessibleLabel={t.chat.timeline.attachment(isVideo, label, size)}
            copyMarkdown={context.copyMarkdown}
            onOpen={() =>
              isVideo ? context.onExpandVideo(attachment) : context.onOpenFile(attachment)
            }
            tooltip={`${label}\n${size}`}
          />
        );
      },
    },
    {
      kind: "terminal",
      canRender: (record) => record.kind === "terminal",
      render: (record, context, definition) =>
        record.kind === "terminal" ? (
          <span data-markdown-copy={context.copyMarkdown}>
            <TerminalContextInlineChip
              label={record.label}
              terminalLabel={record.terminalLabel}
              lineStart={record.lineStart}
              lineEnd={record.lineEnd}
              text={record.text}
              detailsMode={definition.capabilities.details}
            />
          </span>
        ) : (
          <UnavailableUserMessageContextChip {...context} />
        ),
    },
    {
      kind: "element",
      canRender: (record) => record.kind === "element",
      render: (record, context) =>
        record.kind === "element" ? (
          <UserMessageContextPopover
            copyMarkdown={context.copyMarkdown}
            accessibleLabel={t.chat.timeline.browserElement(record.label)}
            kind="element"
            icon={<MousePointerClickIcon />}
            label={record.label}
          >
            <UserMessageElementDetails record={record} />
          </UserMessageContextPopover>
        ) : (
          <UnavailableUserMessageContextChip {...context} />
        ),
    },
    {
      kind: "review-comment",
      canRender: (record) => record.kind === "review-comment",
      render: (record, context) => {
        if (record.kind !== "review-comment") {
          return <UnavailableUserMessageContextChip {...context} />;
        }
        const isPullRequest = isPullRequestSummaryContext(record);
        const label = reviewCommentContextLabel(record);
        const kindLabel = isPullRequest
          ? pullRequestContextKindLabel(record)
          : t.chat.timeline.reviewComment;
        const pullRequestState = pullRequestContextDisplayState(record) ?? "unknown";
        if (isPullRequest && record.pullRequest !== undefined) {
          return (
            <UserMessagePullRequestContextChip
              record={record}
              copyMarkdown={context.copyMarkdown}
              kind={PULL_REQUEST_CHIP_KINDS[pullRequestState]}
            />
          );
        }
        return (
          <UserMessageContextPopover
            copyMarkdown={context.copyMarkdown}
            accessibleLabel={`${kindLabel}, ${label}${record.pullRequest ? `, ${record.pullRequest.title}` : ""}`}
            kind={isPullRequest ? PULL_REQUEST_CHIP_KINDS[pullRequestState] : "review-comment"}
            icon={isPullRequest ? <PullRequestGlyph.pullRequest /> : <MessageCircleIcon />}
            label={label}
          >
            <UserMessageReviewCommentCard
              comment={{
                id: record.contextId,
                sectionId: record.sectionId,
                sectionTitle: record.sectionTitle,
                filePath: record.filePath,
                startIndex: record.startIndex,
                endIndex: record.endIndex,
                rangeLabel: record.rangeLabel,
                text: record.text,
                diff: record.diff,
                ...(record.fenceLanguage !== undefined
                  ? { fenceLanguage: record.fenceLanguage }
                  : {}),
                ...(record.pullRequest !== undefined ? { pullRequest: record.pullRequest } : {}),
              }}
            />
          </UserMessageContextPopover>
        );
      },
    },
    {
      kind: "preview-annotation",
      canRender: (record) => record.kind === "preview-annotation",
      render: (record, context) =>
        record.kind === "preview-annotation" ? (
          <UserMessageContextPopover
            copyMarkdown={context.copyMarkdown}
            accessibleLabel={t.chat.timeline.annotation(record.label)}
            kind="preview-annotation"
            icon={<MousePointerClickIcon />}
            label={record.label}
          >
            <UserMessagePreviewAnnotationDetails record={record} image={context.annotationImage} />
          </UserMessageContextPopover>
        ) : (
          <UnavailableUserMessageContextChip {...context} />
        ),
    },
  ],
  fallback: (_kind, _record, context) => <UnavailableUserMessageContextChip {...context} />,
});

/** Renders the stored context kind with its source-specific opener instead of assuming a workspace file. */
export function UserMessageContextReferenceChip(props: {
  reference: ChatMarkdownContextReference;
  record: KnownComposerContextRecord | undefined;
  annotationImage: ChatImageAttachment | null;
  attachment: ChatImageAttachment | ChatFileAttachment | null;
  onExpandImage: (image: ChatImageAttachment) => void;
  onExpandVideo: (file: ChatFileAttachment) => void;
  onOpenFile: (file: ChatFileAttachment) => void;
}) {
  const { resolvedTheme, activeThreadEnvironmentId } = use(TimelineRowCtx);
  const copyMarkdown = formatComposerContextReference({
    kind: props.reference.kind,
    contextId: props.reference.contextId as ComposerContextId,
    label: props.reference.label,
  });
  return userMessageContextPresentationRegistry.render(props.reference.kind, props.record, {
    environmentId: activeThreadEnvironmentId,
    reference: props.reference,
    annotationImage: props.annotationImage,
    attachment: props.attachment,
    resolvedTheme,
    copyMarkdown,
    onExpandImage: props.onExpandImage,
    onExpandVideo: props.onExpandVideo,
    onOpenFile: props.onOpenFile,
  });
}

/** Keeps review-comment text and its source link together when replaying a user message. */
function UserMessageReviewCommentCard({ comment }: { comment: ReviewCommentContext }) {
  const renderedAppearance = useRenderedAppearance();
  const ctx = use(TimelineRowCtx);
  const fenceLanguage = comment.fenceLanguage ?? "diff";
  const renderablePatch = getRenderablePatch(
    buildReviewCommentRenderablePatch(comment),
    `review-comment:${comment.id}`,
  );

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-background/70 p-3">
      <div className="space-y-1">
        <div className="text-xs font-medium text-foreground">
          {formatWorkspaceRelativePath(comment.filePath, ctx.workspaceRoot)}
        </div>
        <div className="text-2xs text-muted-foreground">
          {comment.sectionTitle} · {comment.rangeLabel}
        </div>
      </div>
      {comment.text.length > 0 && (
        <div className="wrap-break-word text-sm">
          <ChatMarkdown
            text={comment.text}
            cwd={ctx.markdownCwd}
            threadRef={ctx.threadRef ?? undefined}
            skills={ctx.skills}
            parseRawHtml={false}
            lineBreaks
          />
        </div>
      )}
      {fenceLanguage !== "diff" && comment.diff.trim().length > 0 && (
        <ChatMarkdown
          text={formatReviewCommentFence(fenceLanguage, comment.diff)}
          cwd={ctx.markdownCwd}
          threadRef={ctx.threadRef ?? undefined}
          skills={ctx.skills}
          className="text-foreground"
        />
      )}
      {renderablePatch?.kind === "files" && (
        <DiffWorkerPoolProvider>
          {renderablePatch.files.map((fileDiff) => (
            <FileDiff
              key={resolveFileDiffPath(fileDiff)}
              fileDiff={fileDiff}
              options={{
                collapsed: false,
                diffStyle: "unified",
                theme: resolveDiffThemeName(renderedAppearance),
                preferredHighlighter: PREFERRED_HIGHLIGHTER,
              }}
            />
          ))}
        </DiffWorkerPoolProvider>
      )}
      {renderablePatch?.kind === "raw" && (
        <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 text-xs">
          {renderablePatch.text}
        </pre>
      )}
    </div>
  );
}
