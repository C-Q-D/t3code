/** Renders localized thread search controls; search and navigation state belongs to the caller. */
import { t } from "~/i18n";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { ChevronDownIcon, ChevronUpIcon, SearchIcon, XIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { formatThreadFindCount } from "./threadFind";
import { THREAD_DETAILS_CARD_GAP } from "./threadDetailsCardLayout";

/** Search state and callbacks supplied by the thread search controller. */
interface ThreadFindBarProps {
  readonly open: boolean;
  readonly query: string;
  readonly matchCount: number;
  readonly counting?: boolean;
  readonly status: "loading" | "error" | null;
  readonly onRetry: () => void;
  readonly activeIndex: number;
  readonly focusRequestId: number;
  readonly onQueryChange: (query: string) => void;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly onClose: () => void;
}

/**
 * Room the open bar takes at the top of the chat canvas: its 42px height plus
 * the shared 12px gap below it, so the details card starts on the same rhythm.
 */
export const THREAD_FIND_BAR_RESERVED_HEIGHT = 42 + THREAD_DETAILS_CARD_GAP;

/** Renders the search bar, focuses it on request, and delegates all search actions to props. */
export function ThreadFindBar(props: ThreadFindBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- focuses and selects the input DOM node when the bar opens or a find shortcut fires
  useEffect(() => {
    if (!props.open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Each find shortcut bumps the request id, so an already-open bar refocuses and reselects its query.
    props.focusRequestId,
    props.open,
  ]);

  if (!props.open) return null;

  const hasQuery = props.query.trim().length > 0;
  const noResults = hasQuery && !props.status && props.matchCount === 0;
  let label = "";
  if (hasQuery) {
    label = props.counting ? "1/…" : formatThreadFindCount(props.activeIndex, props.matchCount);
  }
  if (props.status === "loading") label = t.chat.threadFind.searching;
  if (props.status === "error") label = t.chat.threadFind.failed;
  const navigationDisabled =
    props.matchCount === 0 || props.status === "loading" || props.counting === true;
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) props.onPrevious();
      else props.onNext();
    }
  };

  return (
    <div data-thread-find-bar className="timeline-find-bar">
      <div
        onContextMenu={(event) => event.stopPropagation()}
        role="search"
        aria-label={t.chat.threadFind.label}
        aria-busy={props.status === "loading" || props.counting === true}
        className="timeline-find-controls dropdown-glass"
      >
        <SearchIcon aria-hidden="true" className="timeline-find-icon" />
        <input
          ref={inputRef}
          type="search"
          className="timeline-find-input"
          value={props.query}
          aria-label={t.chat.threadFind.label}
          placeholder={t.chat.threadFind.label}
          maxLength={200}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => props.onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <span
          aria-live="polite"
          className={cn("timeline-find-count", noResults && "timeline-find-count-empty")}
        >
          {label}
        </span>
        {props.status === "error" ? (
          <button type="button" className="timeline-find-retry" onClick={props.onRetry}>
            {t.chat.threadFind.retry}
          </button>
        ) : null}
        <button
          type="button"
          className="timeline-find-button"
          aria-label={t.chat.threadFind.previous}
          disabled={navigationDisabled}
          onClick={props.onPrevious}
        >
          <ChevronUpIcon />
        </button>
        <button
          type="button"
          className="timeline-find-button"
          aria-label={t.chat.threadFind.next}
          disabled={navigationDisabled}
          onClick={props.onNext}
        >
          <ChevronDownIcon />
        </button>
        <button
          type="button"
          className="timeline-find-button"
          aria-label={t.chat.threadFind.close}
          onClick={props.onClose}
        >
          <XIcon />
        </button>
      </div>
    </div>
  );
}
