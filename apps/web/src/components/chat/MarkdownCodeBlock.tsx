/** Renders code fences and shared timeline chrome without changing authored code. */
import { t } from "~/i18n";
import { Check, Copy } from "lucide";
import { PlayIcon, WrapTextIcon } from "lucide-react";
import { toHtml } from "hast-util-to-html";
import React, { use, useEffect, useState, type ReactNode } from "react";

import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { getClientSettings } from "../../hooks/useSettings";
import type { DiffThemeName } from "../../lib/diffRendering";
import {
  createIncrementalHighlightedDocument,
  highlightCodeToHast,
} from "../../lib/incrementalHighlighting";
import { LRUCache } from "../../lib/lruCache";
import { getSyntaxHighlighterPromise } from "../../lib/syntaxHighlighting";
import { cn } from "../../lib/utils";
import {
  hasSpecificPierreIconForFileName,
  syntheticFileNameForLanguageId,
} from "../../pierre-icons";
import { MorphIcon } from "../MorphIcon";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { HighlightedCodeLines } from "./HighlightedCodeLines";
import {
  createHighlightCacheKey,
  estimateHighlightedSize,
  extractFenceLanguage,
} from "./MarkdownCodeBlock.logic";
import { reportMarkdownActionFailure } from "./markdownActionFailure";
import { PierreEntryIcon } from "./PierreEntryIcon";

// One value per Markdown tree keeps code, tables and diagrams on the same presentation.
export const MarkdownTimelineContext = React.createContext(false);

const MAX_HIGHLIGHT_CACHE_ENTRIES = 500;
const MAX_HIGHLIGHT_CACHE_MEMORY_BYTES = 50 * 1024 * 1024;

const highlightedCodeCache = new LRUCache<string>(
  MAX_HIGHLIGHT_CACHE_ENTRIES,
  MAX_HIGHLIGHT_CACHE_MEMORY_BYTES,
);

const THREAD_FIND_IGNORE_PROPS = {
  "data-thread-find-ignore": "",
} as React.HTMLAttributes<HTMLDivElement>;

/**
 * Frame rendered and editable fences; only a timeline Markdown parent enables D1 chrome.
 * @param props Language/optional filename, theme, wrap state (defaults true), content and optional
 * header actions/title. as defaults to div and supports the composer's existing node-view wrapper.
 * @returns The code surface and header; timeline Mermaid uses its own inset frame.
 */
export function MarkdownCodeBlockFrame({
  as: Wrapper = "div",
  language,
  fenceTitle,
  theme,
  wrapped = true,
  diagramRendered = false,
  title,
  actions,
  headerProps,
  children,
}: {
  as?: React.ElementType;
  language: string;
  fenceTitle: string | null;
  theme: "light" | "dark";
  wrapped?: boolean;
  /** Whether a committed Mermaid diagram can handle the header's expand action. */
  diagramRendered?: boolean;
  /** Replaces the language title, as the composer does with its language picker. */
  title?: React.ReactNode;
  actions?: React.ReactNode;
  headerProps?: React.HTMLAttributes<HTMLDivElement>;
  children: React.ReactNode;
}) {
  const inTimeline = use(MarkdownTimelineContext);
  const mermaidTimeline = inTimeline && language === "mermaid";
  const timeline = inTimeline && !mermaidTimeline;
  return (
    <Wrapper
      dir="ltr"
      className={
        mermaidTimeline
          ? "chat-markdown-codeblock timeline-mermaid-frame mt-4.5 mb-3 overflow-hidden rounded-card-row bg-code text-code-foreground shadow-timeline-diagram-well"
          : timeline
            ? "chat-markdown-codeblock timeline-codeblock my-3.5 overflow-hidden rounded-card-surface bg-code text-code-foreground shadow-well-control"
            : "chat-markdown-codeblock my-[0.65rem] overflow-hidden rounded-lg border border-border/70 bg-secondary leading-snug dark:border-transparent dark:bg-input/32"
      }
      data-language={language}
      data-wrap={wrapped ? "true" : "false"}
      data-diagram-rendered={mermaidTimeline ? (diagramRendered ? "true" : "false") : undefined}
    >
      <div
        {...headerProps}
        className={cn(
          "chat-markdown-codeblock-header flex items-center justify-between select-none",
          mermaidTimeline
            ? "h-10 gap-1.5 ps-3.5 pe-2"
            : timeline
              ? "h-10 gap-0.5 ps-4 pe-2"
              : "gap-2 pt-1.5 pr-1.5 pb-0 pl-3",
          headerProps?.className,
        )}
      >
        {title ?? (
          <span
            className={
              inTimeline
                ? "inline-flex h-5.5 min-w-0 items-center gap-1.5 rounded-full bg-timeline-log-hover px-2.5 text-secondary-copy font-semibold text-timeline-code-label"
                : "inline-flex min-w-0 items-center gap-1.5 font-mono text-2xs"
            }
          >
            {inTimeline && !fenceTitle ? (
              <span className="truncate">
                {language === "typescript"
                  ? "TypeScript"
                  : language === "mermaid"
                    ? "Mermaid"
                    : language}
              </span>
            ) : (
              <MarkdownCodeBlockTitleContent
                fenceTitle={fenceTitle}
                language={language}
                theme={theme}
              />
            )}
          </span>
        )}
        {actions}
      </div>
      {children}
    </Wrapper>
  );
}

function MarkdownCodeBlockTitleContent({
  fenceTitle,
  language,
  theme,
}: {
  fenceTitle: string | null;
  language: string;
  theme: "light" | "dark";
}) {
  if (fenceTitle) {
    return (
      <>
        <PierreEntryIcon pathValue={fenceTitle} kind="file" theme={theme} className="size-3.5" />
        <span className="truncate">{fenceTitle}</span>
      </>
    );
  }

  const fileName = syntheticFileNameForLanguageId(language);
  if (!hasSpecificPierreIconForFileName(fileName)) {
    return <span className="truncate">{language}</span>;
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="inline-flex shrink-0 rounded-sm"
            aria-label={t.chat.markdown.language(language)}
          />
        }
      >
        <PierreEntryIcon pathValue={fileName} kind="file" theme={theme} className="size-3.5" />
      </TooltipTrigger>
      <TooltipPopup side="top">{language}</TooltipPopup>
    </Tooltip>
  );
}

// D1 code-well actions are circular and use the well's hover, unlike the 10px-corner message actions.
export const TIMELINE_CODE_ACTION_CLASS =
  "flex size-7.5 shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent text-secondary-label hover:bg-timeline-log-hover hover:text-foreground focus-visible:outline-none focus-visible:inset-shadow-focus";

/**
 * Renders code or diagram content with copy, wrapping, and optional shell execution controls.
 * @param props - Required code and language strings (which may be empty), light/dark theme,
 * streaming state, and children (which may be null). A null fenceTitle omits the filename; optional
 * leadingActions may be empty. canWrap defaults to true and diagram to false. Optional
 * onRunShellCommand receives complete eligible commands only after a user action.
 * @returns The code block and available actions; never null. Clipboard failures are reported to the
 * console.
 */
export function MarkdownCodeBlock({
  code,
  language,
  fenceTitle,
  theme,
  onRunShellCommand,
  isStreaming,
  leadingActions,
  canWrap = true,
  diagram = false,
  diagramRendered = false,
  children,
}: {
  code: string;
  language: string;
  fenceTitle: string | null;
  theme: "light" | "dark";
  onRunShellCommand?: ((command: string) => void) | undefined;
  isStreaming: boolean;
  leadingActions?: ReactNode;
  canWrap?: boolean;
  diagram?: boolean;
  /** Forwards the Mermaid renderer's committed availability to its frame. */
  diagramRendered?: boolean;
  children: ReactNode;
}) {
  const inTimeline = use(MarkdownTimelineContext);
  const mermaidTimeline = inTimeline && language === "mermaid";
  const timeline = inTimeline && !mermaidTimeline;
  const { copyToClipboard, isCopied: copied } = useCopyToClipboard({
    timeout: 1200,
    onError: (cause) =>
      reportMarkdownActionFailure(
        {
          operation: "copy-code-block",
          language,
          ...(fenceTitle ? { fenceTitle } : {}),
        },
        cause,
      ),
  });
  const [wrapped, setWrapped] = useState(() => getClientSettings().wordWrap);
  const wrapLabel = wrapped ? t.chat.markdown.disableLineWrap : t.chat.markdown.wrapLines;
  const copyLabel = copied ? t.chat.markdown.copied : t.chat.markdown.copyCode;
  const command = code.trim();
  const canRun =
    onRunShellCommand !== undefined &&
    !isStreaming &&
    /^(?:sh|bash|zsh|fish|shell|powershell|pwsh)$/.test(language) &&
    code.endsWith("\n") &&
    command.length > 0 &&
    !command.endsWith("\\") &&
    // Control and invisible format characters (bidi overrides, zero-width) can
    // make the rendered command differ from what the terminal would receive.
    !/[\p{Cc}\p{Cf}]/u.test(code.slice(0, -1));

  const handleCopy = () => copyToClipboard(code);

  const copyButton = (
    <Tooltip>
      <TooltipTrigger
        render={
          inTimeline ? (
            <button
              type="button"
              className={cn(TIMELINE_CODE_ACTION_CLASS, mermaidTimeline && "size-7")}
              onClick={handleCopy}
              aria-label={copyLabel}
            />
          ) : (
            <Button
              type="button"
              variant="ghost-muted"
              size="icon-xs"
              onClick={handleCopy}
              aria-label={copyLabel}
            />
          )
        }
      >
        <MorphIcon
          className={mermaidTimeline ? "size-3.5" : timeline ? "size-3.75" : "size-3"}
          icon={copied ? Check : Copy}
        />
      </TooltipTrigger>
      <TooltipPopup side="top">{copyLabel}</TooltipPopup>
    </Tooltip>
  );

  if (diagram) {
    if (mermaidTimeline) {
      return (
        <MarkdownCodeBlockFrame
          language={language}
          diagramRendered={diagramRendered}
          fenceTitle={fenceTitle}
          theme={theme}
          headerProps={THREAD_FIND_IGNORE_PROPS}
          actions={
            <div className="flex items-center gap-1.5">
              {leadingActions}
              {copyButton}
            </div>
          }
        >
          {children}
        </MarkdownCodeBlockFrame>
      );
    }
    return (
      <div className="my-[0.65rem] border border-transparent" data-language={language}>
        <div className="flex items-center justify-end gap-0.5 pt-1.5 pr-1.5 select-none">
          {leadingActions}
          {copyButton}
        </div>
        {children}
      </div>
    );
  }

  return (
    <MarkdownCodeBlockFrame
      language={language}
      fenceTitle={fenceTitle}
      theme={theme}
      wrapped={wrapped}
      headerProps={THREAD_FIND_IGNORE_PROPS}
      actions={
        <span
          className="flex items-center gap-0.5"
          role="toolbar"
          aria-label={t.chat.markdown.codeBlockActions}
        >
          {leadingActions}
          {inTimeline ? copyButton : null}
          {canWrap ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  timeline ? (
                    <button
                      type="button"
                      className={TIMELINE_CODE_ACTION_CLASS}
                      aria-pressed={wrapped}
                      onClick={() => setWrapped((value) => !value)}
                      aria-label={wrapLabel}
                    />
                  ) : (
                    <Button
                      type="button"
                      variant={wrapped ? "secondary" : "ghost-muted"}
                      size="icon-xs"
                      aria-pressed={wrapped}
                      onClick={() => setWrapped((value) => !value)}
                      aria-label={wrapLabel}
                    />
                  )
                }
              >
                <WrapTextIcon className={timeline ? "size-3.75" : "size-3"} />
              </TooltipTrigger>
              <TooltipPopup side="top">{wrapLabel}</TooltipPopup>
            </Tooltip>
          ) : null}
          {canRun ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  timeline ? (
                    <button
                      type="button"
                      className={TIMELINE_CODE_ACTION_CLASS}
                      onClick={() => onRunShellCommand(command)}
                      aria-label={t.chat.markdown.runInTerminal}
                    />
                  ) : (
                    <Button
                      type="button"
                      variant="ghost-muted"
                      size="icon-xs"
                      onClick={() => onRunShellCommand(command)}
                      aria-label={t.chat.markdown.runInTerminal}
                    />
                  )
                }
              >
                <PlayIcon className={timeline ? "size-3.75" : "size-3"} />
              </TooltipTrigger>
              <TooltipPopup side="top">{t.chat.markdown.runInTerminal}</TooltipPopup>
            </Tooltip>
          ) : null}
          {inTimeline ? null : copyButton}
        </span>
      }
    >
      {children}
    </MarkdownCodeBlockFrame>
  );
}

interface SuspenseShikiCodeBlockProps {
  className: string | undefined;
  code: string;
  themeName: DiffThemeName;
  isStreaming: boolean;
}

export function SuspenseShikiCodeBlock({
  className,
  code,
  themeName,
  isStreaming,
}: SuspenseShikiCodeBlockProps) {
  const [hasStreamed, setHasStreamed] = useState(isStreaming);
  if (isStreaming && !hasStreamed) setHasStreamed(true);
  const language = extractFenceLanguage(className);
  const cacheKey = createHighlightCacheKey(code, language, themeName);
  // Once lines are mounted individually, keep that renderer when streaming
  // finishes so switching to cached HTML cannot clear an existing selection.
  const cachedHighlightedHtml =
    !isStreaming && !hasStreamed ? highlightedCodeCache.get(cacheKey) : null;

  if (cachedHighlightedHtml != null) {
    return (
      <div
        className="chat-markdown-shiki"
        dangerouslySetInnerHTML={{ __html: cachedHighlightedHtml }}
      />
    );
  }

  return (
    <UncachedShikiCodeBlock
      code={code}
      language={language}
      themeName={themeName}
      cacheKey={cacheKey}
      isStreaming={isStreaming}
      preserveLines={isStreaming || hasStreamed}
    />
  );
}

interface UncachedShikiCodeBlockProps {
  code: string;
  language: string;
  themeName: DiffThemeName;
  cacheKey: string;
  isStreaming: boolean;
  preserveLines: boolean;
}

function UncachedShikiCodeBlock({
  code,
  language,
  themeName,
  cacheKey,
  isStreaming,
  preserveLines,
}: UncachedShikiCodeBlockProps) {
  const highlighter = use(getSyntaxHighlighterPromise(language));
  const incrementalHighlight = preserveLines
    ? createIncrementalHighlightedDocument(highlighter, language, themeName)
    : null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- disposes the incremental Shiki highlighter when it is replaced or the block unmounts
  useEffect(() => () => incrementalHighlight?.dispose(), [incrementalHighlight]);
  const highlighted = (() => {
    const result = (() => {
      try {
        if (incrementalHighlight) return incrementalHighlight(code);
        return preserveLines
          ? highlightCodeToHast(highlighter, code, language, themeName)
          : highlighter.codeToHtml(code, { lang: language, theme: themeName });
      } catch (error) {
        console.warn(
          `Code highlighting failed for language "${language}", falling back to plain text.`,
          error instanceof Error ? error.message : error,
        );
        return preserveLines
          ? highlightCodeToHast(highlighter, code, "text", themeName)
          : highlighter.codeToHtml(code, { lang: "text", theme: themeName });
      }
    })();
    // A finished block is cached for the next mount; a streaming one is still changing.
    if (!isStreaming) {
      const highlightedHtml = typeof result === "string" ? result : toHtml(result);
      highlightedCodeCache.set(
        cacheKey,
        highlightedHtml,
        estimateHighlightedSize(highlightedHtml, code),
      );
    }
    return result;
  })();

  return typeof highlighted === "string" ? (
    <div className="chat-markdown-shiki" dangerouslySetInnerHTML={{ __html: highlighted }} />
  ) : (
    <div className="chat-markdown-shiki">
      <HighlightedCodeLines root={highlighted} />
    </div>
  );
}
