/** Renders file-drop and scroll controls outside the virtualized message list. */
import { FileUpIcon } from "lucide-react";

import { t } from "~/i18n";
import { TimelineScrollToBottomButton } from "./TimelineScrollToBottomButton";

/** Mirrors the composer drop target without intercepting its drag events. */
export function WorkspaceFileDropOverlay() {
  return (
    <div
      className="pointer-events-none absolute inset-2 z-40 flex items-center justify-center"
      data-chat-workspace-drop-overlay="true"
    >
      <div
        role="status"
        className="flex h-50 w-full flex-col items-center justify-center gap-2.5 rounded-card-surface bg-timeline-drop-scrim text-secondary-copy-large font-bold text-foreground outline-2 -outline-offset-8 outline-dashed outline-ring"
      >
        <FileUpIcon className="size-6.5" strokeWidth={1.5} aria-hidden="true" />
        {t.chat.view.dropFiles}
      </div>
    </div>
  );
}

/** Sits `bottom` pixels up, clear of the composer and its attached banners. */
export function ScrollToEndButton(props: {
  readonly bottom: number;
  readonly onScrollToEnd: () => void;
}) {
  return (
    <div
      className="chat-scroll-to-bottom pointer-events-none absolute z-30 flex justify-center py-1.5"
      style={{ bottom: props.bottom }}
    >
      <TimelineScrollToBottomButton
        data-scroll-to-end
        aria-label={t.chat.view.scrollToEnd}
        onPointerDown={(event) => event.preventDefault()}
        onClick={props.onScrollToEnd}
        className="pointer-events-auto"
      >
        {t.chat.view.scrollToEnd}
      </TimelineScrollToBottomButton>
    </div>
  );
}
