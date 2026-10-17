/** Paints the agent pointer over its existing browser surface; page coordinates stay store-owned. */
"use client";

import type { DesktopPreviewPointerEvent } from "@t3tools/contracts";
import { MousePointer2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useBrowserPointerStore } from "~/browser/browserPointerStore";
import { useBrowserSurfaceStore } from "~/browser/browserSurfaceStore";
import { t } from "~/i18n";

import { agentBrowserCursorOpacity, type BrowserController } from "./agentBrowserCursorLogic";

const CURSOR_ACTIVE_MS = 700;

/** Observes one runtime tab's latest pointer event and page-content geometry. */
export function AgentBrowserCursor(props: {
  readonly tabId: string;
  readonly zoomFactor: number;
  readonly controller: BrowserController;
}) {
  const { tabId, zoomFactor, controller } = props;
  const event = useBrowserPointerStore((state) => state.byTabId[tabId] ?? null);
  const content = useBrowserSurfaceStore((state) => state.byTabId[tabId]?.content ?? null);

  if (!event) return null;

  return (
    <AgentBrowserCursorEvent
      event={event}
      content={content}
      zoomFactor={zoomFactor}
      controller={controller}
    />
  );
}

/** Applies the existing zoom, content scale and scroll offsets to the agent's page coordinates. */
function AgentBrowserCursorEvent(props: {
  readonly event: DesktopPreviewPointerEvent;
  readonly content: {
    readonly x: number;
    readonly y: number;
    readonly scale: number;
    readonly scrollLeft: number;
    readonly scrollTop: number;
  } | null;
  readonly zoomFactor: number;
  readonly controller: BrowserController;
}) {
  const { event, content, zoomFactor, controller } = props;
  const scale = zoomFactor * (content?.scale ?? 1);
  return (
    <AgentCursorMark
      phase={event.phase}
      sequence={event.sequence}
      left={event.x * scale + (content?.x ?? 0) - (content?.scrollLeft ?? 0)}
      top={event.y * scale + (content?.y ?? 0) - (content?.scrollTop ?? 0)}
      controller={controller}
    />
  );
}

/** Labels the agent's surface position; only movement transitions, while the existing idle dimming stays intact. */
export function AgentCursorMark(props: {
  readonly phase: "move" | "click";
  readonly sequence: number;
  readonly left: number;
  readonly top: number;
  readonly controller: BrowserController;
}) {
  const { phase, sequence, left, top, controller } = props;
  const [inactiveSequence, setInactiveSequence] = useState<number | null>(null);
  const active = inactiveSequence !== sequence;

  useEffect(() => {
    const timeout = window.setTimeout(() => setInactiveSequence(sequence), CURSOR_ACTIVE_MS);
    return () => window.clearTimeout(timeout);
  }, [sequence]);

  return (
    <div
      className="browser-agent-shadow pointer-events-none absolute left-0 top-0 z-40 flex items-start gap-0.5 text-attention transition-transform duration-150 ease-out motion-reduce:transition-none"
      style={{
        opacity: agentBrowserCursorOpacity(active, controller),
        transform: `translate3d(${left}px, ${top}px, 0)`,
      }}
      aria-hidden="true"
      data-agent-browser-cursor
    >
      {phase === "click" ? (
        <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-attention/25" />
      ) : null}
      <MousePointer2
        className="relative size-5.5 -translate-x-0.5 -translate-y-0.5 fill-current"
        strokeWidth={2}
      />
      <span className="mt-4 flex h-5 items-center rounded-tag bg-attention px-2 font-sans text-meta font-bold text-browser-agent-foreground text-shadow-none">
        {t.tools.preview.agentCursorLabel}
      </span>
    </div>
  );
}
