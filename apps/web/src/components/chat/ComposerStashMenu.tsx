/** Presents saved drafts in the U7 list while retaining composer-owned keyboard and persistence behavior. */
import { t } from "~/i18n";
import { FileIcon, XIcon } from "lucide-react";
import { memo, useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";
import { assistantCitationsToPlainText } from "@t3tools/shared/assistantCitations";

import { RelativeTime } from "../RelativeTime";
import { type PromptStashEntry } from "../../promptStashStore";
import { Button } from "../ui/button";

const SNIPPET_MAX_CHARS = 90;

function missingImageCount(entry: PromptStashEntry): number {
  return entry.droppedImageNames.length + (entry.unreadableImageNames?.length ?? 0);
}

/** Formats one saved draft for a single line; attachment-only drafts retain their attachment kind. */
function stashEntrySnippet(entry: PromptStashEntry): string {
  const trimmed = assistantCitationsToPlainText(entry.prompt).trim().replace(/\s+/g, " ");
  if (trimmed.length > 0) {
    return trimmed.length > SNIPPET_MAX_CHARS ? `${trimmed.slice(0, SNIPPET_MAX_CHARS)}…` : trimmed;
  }
  const imageCount = entry.attachments.length + entry.droppedImageNames.length;
  const fileCount = entry.files?.length ?? 0;
  const attachmentCount = imageCount + fileCount;
  if (attachmentCount === 0) {
    return t.composer.stash.emptySnippet;
  }
  const label = imageCount > 0 && fileCount > 0 ? "attachment" : fileCount > 0 ? "file" : "image";
  return t.composer.stash.attachmentSnippet(attachmentCount, label);
}

/**
 * Floating list of saved prompts. Opened by the stash badge or ⌘S
 * when the empty composer cannot restore a single entry. Navigated with arrows,
 * restored with Enter, dismissed with Escape. The listener runs capture-phase
 * on window so it wins over the composer's handlers while the menu is open.
 */
export const ComposerStashMenu = memo(function ComposerStashMenu(props: {
  entries: ReadonlyArray<PromptStashEntry>;
  stashShortcutLabel: string | null;
  composerFormRef: RefObject<HTMLFormElement | null>;
  onRestore: (entry: PromptStashEntry) => void;
  onDelete: (entry: PromptStashEntry) => void;
  onClose: () => void;
}) {
  const { entries, stashShortcutLabel, composerFormRef, onRestore, onDelete, onClose } = props;
  const [highlightedId, setHighlightedId] = useState<string | null>(entries[0]?.id ?? null);

  const highlightedEntry = entries.find((entry) => entry.id === highlightedId) ?? entries[0];
  const drawerRef = useRef<HTMLDivElement>(null);

  // Both listeners read entries, highlight and callbacks at event time, so they subscribe
  // once for the menu's lifetime instead of on every highlight change.
  const closeOnOutsidePointer = useEffectEvent((event: PointerEvent) => {
    const drawer = drawerRef.current;
    if (
      (drawer && event.composedPath().includes(drawer)) ||
      (event.target instanceof Element && event.target.closest('[data-prompt-stash-badge="true"]'))
    ) {
      return;
    }
    onClose();
  });

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const drawer = drawerRef.current;
    if (!drawer) return;
    const target = event.target;
    if (
      !(target instanceof Node) ||
      (target !== document.body &&
        !(target instanceof Element && target.closest('[data-prompt-stash-badge="true"]')) &&
        !drawer.contains(target) &&
        !composerFormRef.current?.querySelector('textarea, [role="textbox"]')?.contains(target))
    ) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (entries.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const currentIndex = entries.findIndex((entry) => entry.id === highlightedEntry?.id);
      const offset = event.key === "ArrowDown" ? 1 : -1;
      const normalizedIndex = currentIndex >= 0 ? currentIndex : offset === 1 ? -1 : 0;
      const nextIndex = (normalizedIndex + offset + entries.length) % entries.length;
      setHighlightedId(entries[nextIndex]?.id ?? null);
      const nextButton =
        drawer.querySelectorAll<HTMLButtonElement>("[data-stash-restore]")[nextIndex];
      nextButton?.scrollIntoView({ block: "nearest" });
      if (drawer.contains(document.activeElement)) {
        nextButton?.focus({ preventScroll: true });
      }
      return;
    }
    if (event.key === "Enter") {
      // Let the delete button handle Enter instead of restoring its row.
      if (event.target instanceof HTMLElement && event.target.closest("button[aria-label]")) {
        return;
      }
      if (!highlightedEntry) return;
      event.preventDefault();
      event.stopPropagation();
      onRestore(highlightedEntry);
      return;
    }
    if (event.key === "Backspace" && (event.metaKey || event.ctrlKey)) {
      if (!highlightedEntry) return;
      event.preventDefault();
      event.stopPropagation();
      onDelete(highlightedEntry);
    }
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes capture-phase pointerdown and keydown listeners for outside close and keyboard navigation
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => closeOnOutsidePointer(event);
    const onKeyDown = (event: KeyboardEvent) => handleKeyDown(event);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  return (
    <div
      ref={drawerRef}
      data-composer-stash-drawer="true"
      className="composer-stash-menu dropdown-glass relative flex w-80 max-w-full flex-col gap-px rounded-overlay p-1.5"
    >
      <button
        type="button"
        className="cursor-pointer rounded-menu-row px-2.5 pt-1.5 pb-0.5 text-left text-meta-large text-composer-notice-count outline-none focus-visible:inset-shadow-focus"
        aria-label={t.composer.stash.close}
        aria-expanded="true"
        onPointerDown={(event) => event.preventDefault()}
        onClick={onClose}
      >
        {t.composer.stash.title}
        <span className="sr-only"> · {entries.length}</span>
      </button>
      <ul
        role="list"
        className="flex max-h-72 min-h-0 flex-col gap-px overflow-y-auto"
        aria-label={t.composer.stash.listAriaLabel}
      >
        {entries.length === 0 ? (
          <li className="px-2.5 py-3.5 text-center text-control text-secondary-label">
            {t.composer.stash.empty}
            {stashShortcutLabel ? (
              <span className="mt-1 block text-secondary-copy">
                {t.composer.stash.shortcutHint(stashShortcutLabel)}
              </span>
            ) : null}
          </li>
        ) : (
          entries.map((entry) => (
            <li
              key={entry.id}
              data-stash-entry={entry.id}
              data-highlighted={highlightedEntry?.id === entry.id || undefined}
              className="composer-stash-row relative flex min-h-8.5 shrink-0 items-center gap-2.5 rounded-menu-row px-2.5 py-1 text-control text-composer-notice-label data-highlighted:bg-accent data-highlighted:text-foreground"
              onMouseMove={() => {
                if (highlightedId !== entry.id) setHighlightedId(entry.id);
              }}
              onFocus={() => setHighlightedId(entry.id)}
            >
              <button
                type="button"
                className="min-w-0 flex-1 cursor-pointer truncate text-left outline-none before:absolute before:inset-0 before:rounded-menu-row"
                data-stash-restore={entry.id}
                aria-label={t.composer.stash.restoreAriaLabel(stashEntrySnippet(entry))}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => onRestore(entry)}
              >
                {stashEntrySnippet(entry)}
              </button>
              <span className="flex shrink-0 items-center gap-1.5 text-meta-large">
                {entry.pendingImageCount ? (
                  <span className="shrink-0 text-secondary-label">
                    {t.composer.stash.savingImagesHint(entry.pendingImageCount)}
                  </span>
                ) : missingImageCount(entry) > 0 ? (
                  <span className="shrink-0 text-warning-foreground">
                    {t.composer.stash.droppedImagesCountHint(missingImageCount(entry))}
                  </span>
                ) : null}
                {entry.attachments.length > 0 ? (
                  <span className="flex shrink-0 items-center -space-x-1.5">
                    {entry.attachments.slice(0, 3).map((attachment) => (
                      <img
                        key={attachment.id}
                        src={attachment.dataUrl}
                        alt=""
                        aria-hidden="true"
                        className="size-4 rounded-sm border border-border object-cover"
                      />
                    ))}
                  </span>
                ) : null}
                {(entry.files?.length ?? 0) > 0 ? (
                  <span className="flex shrink-0 items-center gap-1 text-secondary-label">
                    <FileIcon className="size-3" aria-hidden />
                    {entry.files!.length}
                  </span>
                ) : null}
                <time
                  dateTime={entry.createdAt}
                  className="shrink-0 text-secondary-label tabular-nums max-sm:hidden"
                >
                  <RelativeTime timestamp={entry.createdAt} />
                </time>
                <Button
                  size="icon-micro"
                  variant="ghost-destructive"
                  className="z-10"
                  aria-label={t.composer.stash.delete}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => onDelete(entry)}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
});
