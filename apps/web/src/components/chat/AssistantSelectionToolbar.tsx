/** Offers citation actions for selected assistant text. */
import { t } from "~/i18n";
import {
  ASSISTANT_CITATION_MAX_TEXT_LENGTH,
  MessageId,
  type AssistantCitation,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { QuoteIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  captureAssistantTextSelection,
  type AssistantCitationSourceAnchor,
} from "~/lib/assistantTextSelection";
import {
  observeSelectionActions,
  resolveSelectionActionPosition,
  type SelectionActionPoint,
} from "~/lib/selectionActions";

/**
 * Observes assistant text selection and offers a citation action above the selection.
 * @param props - viewport may be null until mounted; threadRef identifies the citation source.
 * Required onCite returns whether the citation was accepted, after which the selection is cleared.
 * @returns A toolbar portal, or null when no eligible visible selection exists. Selection listeners
 * are removed on unmount or viewport change.
 */
export function AssistantSelectionToolbar({
  viewport,
  threadRef,
  onCite,
}: {
  viewport: HTMLElement | null;
  threadRef: ScopedThreadRef;
  onCite: (citation: AssistantCitation, sourceAnchor: AssistantCitationSourceAnchor) => boolean;
}) {
  const [selection, setSelection] = useState<{
    citation: AssistantCitation;
    position: SelectionActionPoint;
    sourceAnchor: AssistantCitationSourceAnchor;
  } | null>(null);
  const toolbarRef = useRef<HTMLButtonElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<ReturnType<typeof observeSelectionActions> | null>(null);

  useLayoutEffect(() => {
    const toolbar = shellRef.current;
    if (!toolbar || !selection) return;
    const rect = toolbar.getBoundingClientRect();
    toolbar.style.left = `${Math.max(8, Math.min(selection.position.x, window.innerWidth - rect.width - 8))}px`;
    toolbar.style.top = `${Math.max(8, Math.min(selection.position.y, window.innerHeight - rect.height - 8))}px`;
  }, [selection]);

  useEffect(() => {
    if (!viewport) return;
    const clear = () => setSelection(null);
    const update = (pointer: SelectionActionPoint | null) => {
      const nativeSelection = window.getSelection();
      const captured = captureAssistantTextSelection(viewport, nativeSelection);
      const messageId = captured?.source.dataset.assistantCitationSource;
      if (!captured || !messageId) {
        clear();
        return;
      }
      const rect = captured.range.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      if (rect.bottom < viewportRect.top || rect.top > viewportRect.bottom || rect.width === 0) {
        clear();
        return;
      }
      const rects = captured.range.getClientRects();
      const pointerOnText =
        pointer !== null &&
        Array.from(rects).some(
          (line) =>
            pointer.x >= line.left - 8 &&
            pointer.x <= line.right + 8 &&
            pointer.y >= line.top - 8 &&
            pointer.y <= line.bottom + 8,
        );
      setSelection({
        sourceAnchor: { source: captured.source, range: captured.range, viewport },
        citation: {
          version: 1,
          ...threadRef,
          messageId: MessageId.make(messageId),
          ...captured.selector,
        },
        position: {
          ...resolveSelectionActionPosition({
            bounds: viewportRect,
            selectionRect: rects.item(rects.length - 1) ?? rect,
            pointer: pointerOnText ? pointer : null,
            viewport: { width: window.innerWidth, height: window.innerHeight },
          }),
          // T3 places the 34px toolbar 10px above the selection; clamp after measuring.
          y: rect.top - 44,
        },
      });
    };
    const actions = observeSelectionActions({
      element: viewport,
      getActionElement: () => shellRef.current,
      onSelection: update,
      onDismiss: clear,
    });
    actionsRef.current = actions;
    const focusActions = (event: KeyboardEvent) => {
      const toolbar = toolbarRef.current;
      if (
        event.key !== "Tab" ||
        event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.isComposing ||
        event.defaultPrevented ||
        !toolbar ||
        toolbar.contains(event.target as Node)
      ) {
        return;
      }
      if (toolbar.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      toolbar.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", focusActions, true);
    document.addEventListener("selectionchange", actions.selectionChanged);
    return () => {
      document.removeEventListener("keydown", focusActions, true);
      document.removeEventListener("selectionchange", actions.selectionChanged);
      actions.dispose();
      actionsRef.current = null;
    };
  }, [threadRef, viewport]);

  if (!selection) return null;
  const tooLong = selection.citation.text.length > ASSISTANT_CITATION_MAX_TEXT_LENGTH;
  const dismiss = () => {
    actionsRef.current?.cancel();
    setSelection(null);
  };
  const cite = () => {
    if (tooLong || !onCite(selection.citation, selection.sourceAnchor)) return false;
    window.getSelection()?.removeAllRanges();
    dismiss();
    return true;
  };
  return createPortal(
    <div
      ref={shellRef}
      className="timeline-selection-toolbar fixed z-50 max-w-full rounded-notice bg-primary p-0.75 text-shadow-none shadow-timeline-quote-toolbar"
      style={{ left: selection.position.x, top: selection.position.y }}
      onPointerDown={(event) => event.preventDefault()}
    >
      <button
        ref={toolbarRef}
        type="button"
        disabled={tooLong}
        aria-label={
          tooLong
            ? t.chat.citation.selectionIsTooLongToCite
            : t.chat.citation.citeSelectionInComposer
        }
        className="flex h-7 cursor-pointer items-center gap-1.25 rounded-timeline-quote-key bg-primary-foreground px-2.5 text-secondary-copy-medium font-bold text-primary hover:opacity-90 focus-visible:outline-none focus-visible:inset-shadow-focus disabled:cursor-default disabled:opacity-50"
        onClick={cite}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            dismiss();
          }
        }}
      >
        <QuoteIcon aria-hidden="true" className="size-3.25" />
        {tooLong ? t.chat.citation.shortenSelection : t.chat.citation.cite}
      </button>
    </div>,
    document.body,
  );
}
