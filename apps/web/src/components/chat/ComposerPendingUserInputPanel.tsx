import { isInSideChatPane } from "~/lib/sideChatPane";
import type { PendingUserInputDraftAnswer } from "@t3tools/client-runtime/state/pending-user-input";
import { t } from "~/i18n";
import { type RuntimeRequestId, type ScopedThreadRef } from "@t3tools/contracts";
import { memo, use, useEffect, useEffectEvent, useRef, useState } from "react";
import { BackgroundThreadContext } from "./backgroundThread";
import { useStableCallback } from "~/hooks/useStableCallback";
import { type PendingUserInput } from "../../session-logic";
import { derivePendingUserInputProgress } from "../../pendingUserInput";
import { CheckIcon, ChevronDownIcon, PencilIcon, XIcon } from "lucide-react";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import ChatMarkdown from "../ChatMarkdown";

interface PendingUserInputPanelProps {
  pendingUserInputs: PendingUserInput[];
  cwd: string | undefined;
  threadRef: ScopedThreadRef;
  disabled?: boolean;
  respondingRequestIds: RuntimeRequestId[];
  answers: Record<string, PendingUserInputDraftAnswer>;
  questionIndex: number;
  onToggleOption: (questionId: string, optionValue: string) => void;
  onAdvance: () => void;
  onDismiss: (requestId: RuntimeRequestId) => void;
  /** Focuses the existing custom-answer editor when the provider allows free text. */
  onCustomAnswer?: () => void;
}

/** Presents E1's option rows while retaining the request's answer and keyboard state. */
export const ComposerPendingUserInputPanel = memo(function ComposerPendingUserInputPanel({
  pendingUserInputs,
  cwd,
  threadRef,
  disabled = false,
  respondingRequestIds,
  answers,
  questionIndex,
  onToggleOption,
  onAdvance,
  onDismiss,
  onCustomAnswer,
}: PendingUserInputPanelProps) {
  if (pendingUserInputs.length === 0) return null;
  const activePrompt = pendingUserInputs[0];
  if (!activePrompt) return null;

  return (
    <ComposerPendingUserInputCard
      key={activePrompt.requestId}
      prompt={activePrompt}
      cwd={cwd}
      threadRef={threadRef}
      disabled={disabled}
      isResponding={respondingRequestIds.includes(activePrompt.requestId)}
      answers={answers}
      questionIndex={questionIndex}
      onToggleOption={onToggleOption}
      onAdvance={onAdvance}
      onDismiss={onDismiss}
      onCustomAnswer={onCustomAnswer}
    />
  );
});

const ComposerPendingUserInputCard = memo(function ComposerPendingUserInputCard({
  prompt,
  cwd,
  threadRef,
  disabled,
  isResponding,
  answers,
  questionIndex,
  onToggleOption,
  onAdvance,
  onDismiss,
  onCustomAnswer,
}: {
  prompt: PendingUserInput;
  cwd: string | undefined;
  threadRef: ScopedThreadRef;
  disabled: boolean;
  isResponding: boolean;
  answers: Record<string, PendingUserInputDraftAnswer>;
  questionIndex: number;
  onToggleOption: (questionId: string, optionValue: string) => void;
  onAdvance: () => void;
  onDismiss: (requestId: RuntimeRequestId) => void;
  onCustomAnswer?: (() => void) | undefined;
}) {
  // Message-mode requests remain answerable after their provider turn ends.
  const canRespond = prompt.responseCapability !== "not_resumable";
  const responseDisabled = disabled || isResponding || !canRespond;
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const advance = useStableCallback(onAdvance);
  const [optimisticSingleSelect, setOptimisticSingleSelect] = useState<{
    questionId: string;
    optionValue: string;
  } | null>(null);
  const [collapsedQuestionId, setCollapsedQuestionId] = useState<string | null>(null);
  // Keep question identity stable for its shortcut listener.
  const progress = derivePendingUserInputProgress(prompt.questions, answers, questionIndex);
  const activeQuestion = progress.activeQuestion;
  const customAnswerActive = progress.customAnswer.trim().length > 0;
  const isCollapsed = collapsedQuestionId !== null && collapsedQuestionId === activeQuestion?.id;

  if (
    optimisticSingleSelect &&
    activeQuestion &&
    !activeQuestion.multiSelect &&
    (optimisticSingleSelect.questionId !== activeQuestion.id ||
      (!customAnswerActive &&
        progress.selectedOptionValues.includes(optimisticSingleSelect.optionValue)))
  ) {
    setOptimisticSingleSelect(null);
  }

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clears the auto-advance timer when the question changes, input is disabled, or the panel unmounts
  useEffect(() => {
    const clearAutoAdvance = () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    };
    if (disabled || activeQuestion?.id === undefined) clearAutoAdvance();
    return clearAutoAdvance;
  }, [activeQuestion?.id, disabled]);

  const handleOptionSelection = (questionId: string, optionValue: string) => {
    if (disabled || isResponding) return;
    if (activeQuestion?.multiSelect) {
      onToggleOption(questionId, optionValue);
      return;
    }
    setOptimisticSingleSelect({ questionId, optionValue });
    onToggleOption(questionId, optionValue);
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
    }
    autoAdvanceTimerRef.current = window.setTimeout(() => {
      autoAdvanceTimerRef.current = null;
      advance();
    }, 200);
  };

  const selectOptionFromShortcut = useEffectEvent(handleOptionSelection);
  const backgroundThread = use(BackgroundThreadContext);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes a document keydown listener for digit shortcuts while a question is answerable
  useEffect(() => {
    if (!activeQuestion || responseDisabled || isCollapsed || backgroundThread) return;
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (isInSideChatPane(target)) return;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      if (
        target instanceof HTMLElement &&
        target.closest('[contenteditable]:not([contenteditable="false"])')
      ) {
        return;
      }
      const digit = Number.parseInt(event.key, 10);
      if (Number.isNaN(digit) || digit < 1 || digit > 9) return;
      const optionIndex = digit - 1;
      if (optionIndex >= activeQuestion.options.length) return;
      const option = activeQuestion.options[optionIndex];
      if (!option) return;
      event.preventDefault();
      selectOptionFromShortcut(activeQuestion.id, option.value ?? option.label);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activeQuestion, backgroundThread, isCollapsed, responseDisabled]);

  if (!activeQuestion) {
    return null;
  }

  return (
    <Collapsible
      open={!isCollapsed}
      onOpenChange={(open) => {
        setCollapsedQuestionId(open ? null : activeQuestion.id);
      }}
    >
      <div className="flex items-start gap-2.5 px-2">
        {prompt.questions.length > 1 ? (
          <span className="shrink-0 pt-0.5 font-mono text-secondary-copy text-muted-foreground tabular-nums">
            {questionIndex + 1} / {prompt.questions.length}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <span className="sr-only">{activeQuestion.header}</span>
          {isCollapsed ? (
            <span className="block truncate text-composer-question font-bold text-foreground">
              {activeQuestion.question}
            </span>
          ) : (
            <div className="max-h-32 overflow-y-auto overscroll-contain">
              <ChatMarkdown
                text={activeQuestion.question}
                cwd={cwd}
                threadRef={threadRef}
                className="text-composer-question font-bold text-foreground"
              />
            </div>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex shrink-0" />}>
            <CollapsibleTrigger
              render={
                <button
                  type="button"
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-composer-queue-toggle border-0 bg-transparent p-0 text-secondary-label outline-none hover:bg-secondary focus-visible:inset-shadow-focus"
                />
              }
              aria-label={
                isCollapsed ? t.composer.userInput.showQuestion : t.composer.userInput.hideQuestion
              }
              data-pending-user-input-toggle={isCollapsed ? "collapsed" : "expanded"}
            >
              <ChevronDownIcon
                className={cn("size-3.75", !isCollapsed && "rotate-180")}
                aria-hidden="true"
              />
            </CollapsibleTrigger>
          </TooltipTrigger>
          <TooltipPopup>
            {isCollapsed ? t.composer.userInput.showQuestion : t.composer.userInput.hideQuestion}
          </TooltipPopup>
        </Tooltip>
        {prompt.dismissible ? (
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex shrink-0" />}>
              <button
                type="button"
                className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-composer-queue-toggle border-0 bg-transparent p-0 text-secondary-label outline-none hover:bg-secondary focus-visible:inset-shadow-focus disabled:pointer-events-none disabled:text-fg-icon-disabled"
                aria-label={t.composer.userInput.dismiss}
                disabled={isResponding}
                data-pending-user-input-dismiss
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onDismiss(prompt.requestId);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.stopPropagation();
                  onDismiss(prompt.requestId);
                }}
              >
                <XIcon className="size-3.75" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipPopup>{t.composer.userInput.dismiss}</TooltipPopup>
          </Tooltip>
        ) : null}
      </div>
      <CollapsiblePanel animate={false}>
        <div className="mt-2.5 max-h-72 overflow-y-auto overscroll-contain wrap-anywhere">
          {activeQuestion.multiSelect ? (
            <p className="mb-1.5 px-2 text-secondary-copy text-secondary-label">
              {t.composer.userInput.selectMultipleHint}
            </p>
          ) : null}
          <div className="space-y-1.5">
            {activeQuestion.options.map((option, index) => {
              const optionValue = option.value ?? option.label;
              const isOptimisticallySelected =
                optimisticSingleSelect?.questionId === activeQuestion.id &&
                optimisticSingleSelect.optionValue === optionValue;
              const isSelected =
                isOptimisticallySelected ||
                (!customAnswerActive && progress.selectedOptionValues.includes(optionValue));
              const shortcutKey = index < 9 ? index + 1 : null;
              const className = cn(
                "group flex min-h-10.5 w-full items-center gap-3 rounded-composer-panel-row border-0 px-3.5 py-2 text-left text-control outline-none focus-visible:inset-shadow-focus",
                isSelected
                  ? "bg-accent font-semibold text-foreground shadow-composer-option-selected inset-shadow-selected-control"
                  : "bg-secondary text-foreground shadow-raise-xs hover:bg-accent",
                (disabled || isResponding) && "opacity-50 cursor-not-allowed",
                !disabled && !isResponding && "cursor-pointer",
              );
              const content = (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center",
                      activeQuestion.multiSelect ? "rounded-composer-split" : "rounded-full",
                      isSelected
                        ? "composer-primary-key bg-primary text-primary-foreground"
                        : "shadow-composer-choice",
                    )}
                  >
                    {isSelected ? (
                      activeQuestion.multiSelect ? (
                        <CheckIcon className="size-3" />
                      ) : (
                        <span className="size-1.5 rounded-full bg-primary-foreground" />
                      )
                    ) : null}
                  </span>
                  <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                    <span>{option.label}</span>
                    {option.description && option.description !== option.label ? (
                      <span className="text-secondary-copy text-secondary-label">
                        {option.description}
                      </span>
                    ) : null}
                  </div>
                  {shortcutKey !== null ? <kbd className="sr-only">{shortcutKey}</kbd> : null}
                </>
              );
              return (
                <button
                  key={`${activeQuestion.id}:${optionValue}`}
                  type="button"
                  disabled={disabled || isResponding}
                  aria-pressed={isSelected}
                  onClick={() => {
                    handleOptionSelection(activeQuestion.id, optionValue);
                  }}
                  className={className}
                >
                  {content}
                </button>
              );
            })}
            {activeQuestion.allowCustomAnswer !== false && onCustomAnswer ? (
              <button
                type="button"
                disabled={responseDisabled}
                onClick={onCustomAnswer}
                className="composer-custom-answer flex h-10.5 w-full cursor-pointer items-center gap-2 rounded-composer-panel-row border-0 bg-transparent px-3.5 text-control text-secondary-label hover:bg-secondary focus-visible:inset-shadow-focus disabled:pointer-events-none disabled:text-fg-control-disabled"
              >
                <PencilIcon className="size-3.75" aria-hidden="true" />
                {t.composer.placeholder.customAnswer}
              </button>
            ) : null}
          </div>
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
});
