/** Edits citation comments within the existing length and keyboard constraints. */
import { t } from "~/i18n";
import { ASSISTANT_CITATION_MAX_COMMENT_LENGTH, type AssistantCitation } from "@t3tools/contracts";
import { useState, type Ref } from "react";

import { Button } from "../ui/button";

/**
 * Edits a citation comment within the shared length limit and handles save/cancel keyboard actions.
 * @param props - Required citation (a missing comment starts empty), onSubmit and onCancel
 * callbacks. inputRef may be undefined or null; optional onSubmitAndSend falls back to onSubmit,
 * and optional onDraftChange observes edits. Save callbacks return whether the caller accepted the
 * comment.
 * @returns The textarea and save controls; never null. Overlong comments cannot be submitted.
 */
export function AssistantCitationCommentEditor({
  citation,
  inputRef,
  onSubmit,
  onSubmitAndSend,
  onCancel,
  onDraftChange,
}: {
  citation: AssistantCitation;
  inputRef?: Ref<HTMLTextAreaElement>;
  onSubmit: (comment: string) => boolean;
  onSubmitAndSend?: (comment: string) => boolean;
  onCancel: () => void;
  onDraftChange?: (comment: string) => void;
}) {
  const [comment, setComment] = useState(citation.comment ?? "");
  const commentTooLong = comment.length > ASSISTANT_CITATION_MAX_COMMENT_LENGTH;
  const submit = () => {
    if (!commentTooLong) onSubmit(comment);
  };
  const submitAndSend = () => {
    if (commentTooLong) return;
    if (onSubmitAndSend) {
      onSubmitAndSend(comment);
    } else {
      onSubmit(comment);
    }
  };

  return (
    <div
      data-citation-comment-editor="true"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <textarea
        ref={inputRef}
        aria-label={t.chat.citation.commentOnSelectedText}
        aria-description={t.chat.citation.enterToSaveTheCitationCommentCommand}
        aria-invalid={commentTooLong || undefined}
        placeholder={t.chat.citation.addAnOptionalComment}
        rows={2}
        className="field-sizing-content block max-h-40 min-h-16 w-full resize-none bg-transparent px-1 py-1.5 text-base outline-none placeholder:text-muted-foreground sm:text-sm"
        value={comment}
        onChange={(event) => {
          setComment(event.currentTarget.value);
          onDraftChange?.(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing &&
            event.keyCode !== 229
          ) {
            event.preventDefault();
            if (event.metaKey || event.ctrlKey) {
              submitAndSend();
            } else {
              submit();
            }
          }
        }}
      />
      {commentTooLong ? (
        <p role="status" className="pt-1 text-xs text-destructive">
          {t.chat.citation.commentLimit(ASSISTANT_CITATION_MAX_COMMENT_LENGTH.toLocaleString())}
        </p>
      ) : null}
      <div className="mt-2 flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="xs"
          onPointerDown={(event) => event.preventDefault()}
          onClick={onCancel}
        >
          {t.chat.citation.cancel}
        </Button>
        <Button
          size="xs"
          disabled={commentTooLong}
          onPointerDown={(event) => event.preventDefault()}
          onClick={submit}
        >
          {commentTooLong ? t.chat.citation.shortenComment : t.chat.citation.save}
        </Button>
      </div>
    </div>
  );
}
