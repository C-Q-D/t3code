/** Keeps Mermaid source searchable while rendering completed diagrams in the chosen presentation. */
import { cn } from "../../lib/utils";
import { MarkdownTimelineContext, TIMELINE_CODE_ACTION_CLASS } from "./MarkdownCodeBlock";
import { t } from "~/i18n";
import { CodeIcon, WorkflowIcon, Maximize2Icon } from "lucide-react";
import { Suspense, use, useRef, useState, type ReactNode } from "react";

import { RenderErrorBoundary } from "../RenderErrorBoundary";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { MarkdownCodeBlock } from "./MarkdownCodeBlock";
import { findRevealRef, MarkdownFindContext } from "./markdownFindContext";
import { MermaidDiagram } from "./MermaidDiagram";

/** Keeps source visible during streaming and enables expansion only after a diagram mounts.
 * @param code Mermaid source, including incomplete streamed text.
 * @param fenceTitle Optional author-provided fence title; null omits it.
 * @param theme Code theme; diagram colors follow CSS appearance variables.
 * @param isStreaming Suppresses diagram rendering while the fence is changing.
 * @param onExpand Receives the rendered diagram image URL for the viewer.
 * @param children Highlighted source shown when diagram rendering is disabled.
 * @returns Code/diagram surface using the enclosing timeline presentation. */
export function MarkdownMermaidCodeBlock({
  code,
  fenceTitle,
  theme,
  isStreaming,
  onExpand,
  children,
}: {
  code: string;
  fenceTitle: string | null;
  theme: "light" | "dark";
  isStreaming: boolean;
  onExpand: (imageUrl: string) => void;
  children: ReactNode;
}) {
  const [showCode, setShowCode] = useState(false);
  const [diagramRendered, setDiagramRendered] = useState(false);
  const timeline = use(MarkdownTimelineContext);
  const diagramRef = useRef<HTMLDivElement>(null);
  const searching = use(MarkdownFindContext);
  const revealSource = () => setShowCode(true);
  const sourceRevealRef = findRevealRef(revealSource);
  const showDiagram = !showCode && !isStreaming && code.trim().length > 0;
  const toggleLabel = showCode ? t.chat.markdown.showDiagram : t.chat.markdown.showCode;
  return (
    <MarkdownCodeBlock
      code={code}
      language="mermaid"
      fenceTitle={fenceTitle}
      theme={theme}
      isStreaming={isStreaming}
      canWrap={!showDiagram}
      diagram={showDiagram}
      diagramRendered={showDiagram && diagramRendered}
      leadingActions={
        isStreaming ? null : timeline ? (
          <>
            <div
              className="flex h-7 shrink-0 items-stretch rounded-full bg-timeline-diagram-toggle p-0.5 text-secondary-copy whitespace-nowrap"
              role="group"
              aria-label={t.chat.markdown.mermaidDiagram}
            >
              <button
                type="button"
                aria-pressed={!showCode}
                onClick={() => setShowCode(false)}
                className={cn(
                  "cursor-pointer rounded-full px-2.25 focus-visible:outline-none focus-visible:inset-shadow-focus",
                  !showCode
                    ? "bg-segmented-selected font-bold text-foreground"
                    : "text-secondary-label hover:text-foreground",
                )}
              >
                {t.chat.markdown.showDiagram}
              </button>
              <button
                type="button"
                aria-pressed={showCode}
                onClick={() => setShowCode(true)}
                className={cn(
                  "cursor-pointer rounded-full px-2.25 focus-visible:outline-none focus-visible:inset-shadow-focus",
                  showCode
                    ? "bg-segmented-selected font-bold text-foreground"
                    : "text-secondary-label hover:text-foreground",
                )}
              >
                {t.chat.markdown.showCode}
              </button>
            </div>
            <button
              type="button"
              aria-label={t.chat.markdown.expandDiagram}
              className={cn(TIMELINE_CODE_ACTION_CLASS, "timeline-mermaid-expand size-7")}
              onClick={() =>
                diagramRef.current
                  ?.querySelector<HTMLButtonElement>("[data-mermaid-expand]")
                  ?.click()
              }
            >
              <Maximize2Icon className="size-3.5" strokeWidth={1.75} />
            </button>
          </>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost-muted"
                  size="icon-xs"
                  onClick={() => setShowCode((value) => !value)}
                  aria-label={toggleLabel}
                />
              }
            >
              {showCode ? <WorkflowIcon className="size-3" /> : <CodeIcon className="size-3" />}
            </TooltipTrigger>
            <TooltipPopup side="top">{toggleLabel}</TooltipPopup>
          </Tooltip>
        )
      }
    >
      <div
        ref={diagramRef}
        className={
          timeline
            ? "min-h-30 p-3.5 text-secondary-copy-medium leading-callout text-fg-detail text-shadow-none"
            : undefined
        }
      >
        {showDiagram ? (
          <RenderErrorBoundary resetKeys={[code, theme]} fallback={children}>
            <Suspense
              fallback={
                <div
                  className={cn(
                    "flex items-center justify-center text-muted-foreground",
                    timeline ? "min-h-23 text-secondary-copy" : "min-h-36 text-xs",
                  )}
                >
                  {t.chat.markdown.renderingDiagram}
                </div>
              }
            >
              <MermaidDiagram
                source={code}
                onRenderStateChange={setDiagramRendered}
                onExpand={onExpand}
                presentation={timeline ? "timeline" : undefined}
              />
            </Suspense>
            {/* Find counts the source; a selected match here switches to it. */}
            {searching ? (
              <pre ref={sourceRevealRef} hidden>
                {code}
              </pre>
            ) : null}
          </RenderErrorBoundary>
        ) : (
          children
        )}
      </div>
    </MarkdownCodeBlock>
  );
}
