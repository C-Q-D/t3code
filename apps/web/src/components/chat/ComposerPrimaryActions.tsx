/** Renders composer actions; dispatch, permissions, and shortcuts remain caller-controlled. */
import { t } from "~/i18n";
import { memo, useContext, type MouseEventHandler, type PointerEventHandler } from "react";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Minimize2Icon,
  PlayIcon,
} from "lucide-react";
import { CornerDownRight, ListPlus } from "lucide";
import { MorphIcon } from "~/components/MorphIcon";
import { useEnvironmentIdentificationMode } from "~/hooks/useSettings";
import { formatContextWindowTokens } from "~/lib/contextWindow";
import { cn, isMacPlatform } from "~/lib/utils";
import { useShortcutModifierState } from "../../shortcutModifierState";
import { StageBackdropButtonArt, useSidebarStageBackdropVariant } from "../SidebarStageBackdrop";
import { Spinner } from "../ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ComposerSubmissionStateContext } from "./composerSubmissionState";
import { getComposerSubmissionState } from "./composerSubmissionState.logic";
import {
  alternateComposerDispatchAction,
  resolveComposerDispatchMode,
} from "@t3tools/client-runtime/state/composer-dispatch";

/** Progress and submission availability for the active provider question. */
interface PendingActionState {
  questionIndex: number;
  isLastQuestion: boolean;
  canAdvance: boolean;
  isResponding: boolean;
  isComplete: boolean;
}

/** Conversation state and existing handlers used to select the primary action. */
interface ComposerPrimaryActionsProps {
  compact: boolean;
  canOperateThread: boolean;
  pendingAction: PendingActionState | null;
  isRunning: boolean;
  canInterrupt: boolean;
  followUpBehavior?: "queue" | "steer";
  canSteer?: boolean;
  alternateShortcutLabel?: string | null;
  showPlanFollowUpPrompt: boolean;
  promptHasText: boolean;
  isSendBusy: boolean;
  sendDisabledReason: string | null;
  isConnecting: boolean;
  isEnvironmentUnavailable: boolean;
  isPreparingWorktree: boolean;
  hasSendableContent: boolean;
  canResume?: boolean;
  preserveComposerFocusOnPointerDown?: boolean;
  isEditingQueuedMessage?: boolean;
  onSubmitMessage?: MouseEventHandler<HTMLButtonElement>;
  onResume?: () => void;
  onPreviousPendingQuestion: () => void;
  onInterrupt: () => void;
  onImplementPlanInNewThread: () => void;
  compactBeforeSendTokens?: number | null;
  keepFullHistory?: boolean;
  onToggleKeepFullHistory?: () => void;
}

const formatPendingPrimaryActionLabel = (input: {
  compact: boolean;
  isLastQuestion: boolean;
  isResponding: boolean;
  questionIndex: number;
}) => {
  if (input.isResponding) {
    return t.composer.primaryActions.submitting;
  }
  if (input.compact) {
    return input.isLastQuestion ? t.composer.primaryActions.submit : t.composer.primaryActions.next;
  }
  if (!input.isLastQuestion) {
    return t.composer.primaryActions.nextQuestion;
  }
  return input.questionIndex > 0
    ? t.composer.primaryActions.submitAnswers
    : t.composer.primaryActions.submitAnswer;
};

const messageActionPillClassName =
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-message-action font-medium text-base text-message-action-foreground shadow-xs shadow-message-action/24 outline-none hover:bg-message-action-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64 disabled:shadow-none sm:text-sm";

const preventPointerFocus: PointerEventHandler<HTMLElement> = (event) => {
  event.preventDefault();
};

/** Selects and presents the action without changing form submission or alternate dispatch. */
export const ComposerPrimaryActions = memo(function ComposerPrimaryActions({
  compact,
  canOperateThread,
  pendingAction,
  isRunning,
  canInterrupt,
  followUpBehavior = "steer",
  canSteer = true,
  alternateShortcutLabel = null,
  showPlanFollowUpPrompt,
  promptHasText,
  isSendBusy,
  sendDisabledReason,
  isConnecting,
  isEnvironmentUnavailable,
  isPreparingWorktree,
  hasSendableContent,
  canResume = false,
  preserveComposerFocusOnPointerDown = false,
  isEditingQueuedMessage = false,
  onSubmitMessage,
  onResume,
  onPreviousPendingQuestion,
  onInterrupt,
  onImplementPlanInNewThread,
  compactBeforeSendTokens = null,
  keepFullHistory = false,
  onToggleKeepFullHistory,
}: ComposerPrimaryActionsProps) {
  const sharedSubmissionState = useContext(ComposerSubmissionStateContext);
  const pointerFocusProps = preserveComposerFocusOnPointerDown
    ? { onPointerDown: preventPointerFocus }
    : undefined;
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const shortcutModifiers = useShortcutModifierState();
  const isQueuing =
    !isEditingQueuedMessage &&
    resolveComposerDispatchMode({
      running: isRunning,
      activeTurnDefault: followUpBehavior,
      canSteer,
      alternateModifier: shortcutModifiers.metaKey || shortcutModifiers.ctrlKey,
    }) === "queue";
  const alternateAction = alternateComposerDispatchAction(followUpBehavior);
  const isSendDisabled = !canOperateThread || sendDisabledReason !== null;
  const stageBackdropVariant = useSidebarStageBackdropVariant(environmentIdentificationMode);

  const renderStopGenerationButton = (insidePendingAction: boolean) => (
    <Tooltip key="interrupt">
      <TooltipTrigger
        render={
          <button
            type="button"
            className={cn(
              "flex shrink-0 cursor-pointer items-center justify-center rounded-full bg-destructive/90 text-white shadow-xs shadow-destructive/24 inset-shadow-control-highlight transition-colors duration-150 hover:bg-destructive active:inset-shadow-control-pressed active:shadow-none [&_svg]:pointer-events-none",
              insidePendingAction ? "size-8 sm:size-7" : "size-8 sm:h-8 sm:w-8",
            )}
            {...pointerFocusProps}
            disabled={!canOperateThread}
            onClick={() => {
              if (canOperateThread) onInterrupt();
            }}
            aria-label={t.composer.primaryActions.stop}
          />
        }
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <rect x="2" y="2" width="8" height="8" rx="1.5" />
        </svg>
      </TooltipTrigger>
      <TooltipPopup>{t.composer.primaryActions.interrupt}</TooltipPopup>
    </Tooltip>
  );

  if (pendingAction) {
    return (
      <div className={cn("flex items-center justify-end", compact ? "gap-1.5" : "gap-2")}>
        {canInterrupt ? renderStopGenerationButton(true) : null}
        <button
          type="button"
          className="inline-flex h-9.5 shrink-0 items-center justify-center gap-1 rounded-full border-0 bg-transparent px-3 text-secondary-copy-large text-secondary-label outline-none enabled:cursor-pointer enabled:hover:bg-secondary focus-visible:inset-shadow-focus disabled:pointer-events-none disabled:text-fg-control-disabled"
          {...pointerFocusProps}
          onClick={onPreviousPendingQuestion}
          disabled={pendingAction.isResponding || pendingAction.questionIndex === 0}
          aria-label={t.composer.primaryActions.previousQuestion}
        >
          <ChevronLeftIcon className="size-3.75" aria-hidden="true" />
          {!compact ? t.composer.primaryActions.previousQuestion : null}
        </button>
        <button
          type="submit"
          className={cn(
            "composer-approval-action px-4 font-semibold",
            pendingAction.isLastQuestion
              ? "composer-primary-key bg-primary font-extrabold text-primary-foreground text-shadow-none shadow-composer-panel-primary enabled:hover:bg-message-action-hover disabled:bg-accent"
              : "bg-secondary text-foreground shadow-raise-xs enabled:hover:bg-accent",
          )}
          {...pointerFocusProps}
          disabled={
            !canOperateThread ||
            isEnvironmentUnavailable ||
            pendingAction.isResponding ||
            (pendingAction.isLastQuestion ? !pendingAction.isComplete : !pendingAction.canAdvance)
          }
        >
          {formatPendingPrimaryActionLabel({
            compact,
            isLastQuestion: pendingAction.isLastQuestion,
            isResponding: pendingAction.isResponding,
            questionIndex: pendingAction.questionIndex,
          })}
          {!pendingAction.isLastQuestion ? (
            <ChevronRightIcon className="size-3.75" aria-hidden="true" />
          ) : null}
        </button>
      </div>
    );
  }

  if (showPlanFollowUpPrompt && (promptHasText || !canResume)) {
    // U1 exposes all plan choices; disabled choices keep the existing dispatch conditions.
    return (
      <div
        data-chat-composer-implement-actions="true"
        className="flex flex-wrap items-center justify-end gap-1.5"
      >
        <button
          type="submit"
          className={cn(
            promptHasText ? messageActionPillClassName : "composer-plan-secondary",
            promptHasText && "h-9 sm:h-8",
            compact ? "px-3" : "px-4",
          )}
          {...pointerFocusProps}
          disabled={
            !promptHasText ||
            isSendBusy ||
            isSendDisabled ||
            isConnecting ||
            isEnvironmentUnavailable
          }
        >
          {promptHasText && (isConnecting || isSendBusy)
            ? t.composer.primaryActions.sending
            : t.composer.primaryActions.refine}
        </button>
        <button
          type="button"
          className="composer-plan-secondary px-3.5"
          {...pointerFocusProps}
          disabled={
            promptHasText ||
            isSendBusy ||
            isSendDisabled ||
            isConnecting ||
            isEnvironmentUnavailable
          }
          onClick={() => {
            if (canOperateThread) onImplementPlanInNewThread();
          }}
        >
          {t.composer.primaryActions.implementNewThread}
        </button>
        <button
          type="submit"
          className={cn(messageActionPillClassName, "h-9 px-4 sm:h-8")}
          {...pointerFocusProps}
          disabled={
            promptHasText ||
            isSendBusy ||
            isSendDisabled ||
            isConnecting ||
            isEnvironmentUnavailable
          }
        >
          {!promptHasText && (isConnecting || isSendBusy)
            ? t.composer.primaryActions.sending
            : t.composer.primaryActions.implement}
        </button>
      </div>
    );
  }

  if (canInterrupt && !hasSendableContent && !isEditingQueuedMessage) {
    return renderStopGenerationButton(false);
  }

  const showResume = canResume && !hasSendableContent && !isEditingQueuedMessage;
  const submissionState =
    sharedSubmissionState ??
    getComposerSubmissionState({
      canOperateThread,
      isSendBusy,
      sendDisabledReason,
      isConnecting,
      isEnvironmentUnavailable,
      hasSendableContent,
      canResume: showResume,
    });
  const showActionText = !isEditingQueuedMessage && (showResume || isRunning);

  const compactTokens =
    compactBeforeSendTokens !== null && !showResume && !isEditingQueuedMessage
      ? formatContextWindowTokens(compactBeforeSendTokens)
      : null;
  const compactsBeforeSend = compactTokens !== null && !keepFullHistory;

  const submitLabel = showResume
    ? t.composer.primaryActions.resume
    : isEditingQueuedMessage
      ? t.composer.primaryActions.saveQueued
      : compactsBeforeSend
        ? t.composer.primaryActions.compactSend
        : isQueuing
          ? t.composer.primaryActions.queue
          : isRunning
            ? t.composer.primaryActions.steer
            : t.composer.primaryActions.submitMessage;
  const submitStatus = isEnvironmentUnavailable
    ? t.composer.primaryActions.disconnected
    : (sendDisabledReason ??
      (isConnecting
        ? t.composer.primaryActions.connecting
        : isPreparingWorktree
          ? t.composer.primaryActions.preparingWorktree
          : isSendBusy
            ? isEditingQueuedMessage
              ? t.composer.primaryActions.updatingQueued
              : t.composer.primaryActions.submittingMessage
            : null));
  const submitTooltip =
    submitStatus ??
    (compactsBeforeSend
      ? t.composer.primaryActions.summarizeHistory(compactTokens)
      : isRunning && !isEditingQueuedMessage && canSteer
        ? t.composer.primaryActions
            .dispatchTooltip(followUpBehavior, alternateShortcutLabel, alternateAction)
            .replace("Ctrl/⌘", isMacPlatform(navigator.platform) ? "⌘" : "Ctrl")
        : submitLabel);

  const sendButton = (
    <button
      type={showResume ? "button" : "submit"}
      className={cn(
        "composer-primary-key relative isolate inline-flex h-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-0 font-extrabold text-body text-shadow-none outline-none enabled:cursor-pointer enabled:active:translate-y-0.5 enabled:active:shadow-primary-pressed focus-visible:inset-shadow-focus disabled:pointer-events-none disabled:bg-accent disabled:text-placeholder disabled:shadow-send-disabled [&_svg]:pointer-events-none",
        showActionText ? "gap-1.75 pr-4.5 pl-3.5" : "w-10 p-0",
        stageBackdropVariant
          ? "bg-transparent text-white enabled:shadow-primary-send enabled:hover:brightness-110"
          : "bg-primary text-primary-foreground enabled:shadow-primary-send enabled:hover:bg-message-action-hover",
      )}
      {...pointerFocusProps}
      onClick={showResume ? onResume : onSubmitMessage}
      disabled={submissionState.disabled}
      aria-busy={submissionState.busy}
      aria-label={submitStatus ?? submitLabel}
    >
      {stageBackdropVariant ? (
        <span className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
          <StageBackdropButtonArt variant={stageBackdropVariant} />
        </span>
      ) : null}
      {submissionState.busy ? (
        <Spinner size="sm" aria-hidden="true" />
      ) : showResume ? (
        <PlayIcon className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
      ) : isEditingQueuedMessage ? (
        <CheckIcon className="size-4" aria-hidden="true" />
      ) : isRunning ? (
        <MorphIcon className="size-4" icon={isQueuing ? ListPlus : CornerDownRight} />
      ) : (
        <svg width="18" height="18" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {showActionText ? <span>{submitLabel}</span> : null}
    </button>
  );

  const submit = (
    <Tooltip key="submit">
      <TooltipTrigger render={<span className="inline-flex" />}>{sendButton}</TooltipTrigger>
      <TooltipPopup>{submitTooltip}</TooltipPopup>
    </Tooltip>
  );
  if (compactTokens === null) return submit;

  return (
    <div data-chat-composer-compact-send="true" className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className={cn(
                "flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-64 sm:h-8 [&_svg]:pointer-events-none [&_svg]:size-3.5",
                keepFullHistory
                  ? "border-border text-muted-foreground hover:text-foreground"
                  : "border-warning/40 text-warning hover:bg-warning/8",
              )}
              {...pointerFocusProps}
              aria-pressed={!keepFullHistory}
              aria-label={t.composer.primaryActions.compactHistoryAria(compactTokens)}
              disabled={!canOperateThread}
              onClick={onToggleKeepFullHistory}
            />
          }
        >
          <Minimize2Icon aria-hidden="true" />
          <span className="@max-[480px]/composer-surface:hidden">
            {keepFullHistory
              ? t.composer.primaryActions.fullLabel
              : t.composer.primaryActions.compactLabel}
          </span>
          <span>{compactTokens}</span>
        </TooltipTrigger>
        <TooltipPopup>
          {keepFullHistory
            ? t.composer.primaryActions.keepHistoryTooltip(compactTokens)
            : t.composer.primaryActions.compactHistoryTooltip(compactTokens)}
        </TooltipPopup>
      </Tooltip>
      {submit}
    </div>
  );
});
