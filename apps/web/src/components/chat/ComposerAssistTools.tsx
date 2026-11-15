/** Keeps composer writing tools tied to the current draft and dispatch intent. */
import type { EnvironmentId } from "@t3tools/contracts";
import {
  resolveComposerDispatchMode,
  type ActiveTurnComposerAction,
} from "@t3tools/client-runtime/state/composer-dispatch";
import { useComposerDraftStore, type ComposerThreadTarget } from "../../composerDraftStore";
import { t } from "~/i18n";
import { ComposerAssistPopover } from "./ComposerAssistPopover";
import { composerReplyRewriteState } from "./composerSend.logic";
import type { useComposerPromptOptimizer } from "./useComposerPromptOptimizer";
import { useShortcutModifierState } from "../../shortcutModifierState";

export function ComposerAssistTools(props: {
  environmentId: EnvironmentId;
  target: ComposerThreadTarget;
  provider: string;
  defaultEnabled: boolean;
  running: boolean;
  followUpBehavior: ActiveTurnComposerAction;
  canSteer: boolean;
  editingQueue: boolean;
  unavailable: boolean;
  prompt: string;
  sideChatAvailable: boolean;
  activeRun: { readonly replyRewrite?: boolean | undefined } | null | undefined;
  optimizer: ReturnType<typeof useComposerPromptOptimizer>;
  shortcut?: string | null;
}) {
  const modifiers = useShortcutModifierState();
  const selection = useComposerDraftStore(
    (state) => state.getComposerDraft(props.target)?.replyRewriteSelections?.[props.environmentId],
  );
  const state = composerReplyRewriteState({
    provider: props.provider,
    defaultEnabled: props.defaultEnabled,
    selection,
    running: props.running || props.editingQueue,
    dispatchMode: props.editingQueue
      ? "steer"
      : resolveComposerDispatchMode({
          running: props.running,
          alternateModifier: modifiers.ctrlKey || modifiers.metaKey,
          activeTurnDefault: props.followUpBehavior,
          canSteer: props.canSteer,
        }),
    activeRun: props.activeRun,
    prompt: props.editingQueue ? "" : props.prompt,
    sideChatAvailable: props.sideChatAvailable,
  });
  const copy = t.composer.assist.tools;
  const disabledReason = !state.supported
    ? copy.codexOnly
    : props.editingQueue
      ? copy.editingQueue
      : state.inherited
        ? copy.inherited
        : props.unavailable
          ? copy.unavailable
          : null;
  return (
    <ComposerAssistPopover
      optimizer={props.optimizer}
      shortcut={props.shortcut ?? null}
      rewrite={{
        checked: state.checked,
        known: state.known,
        supported: state.supported,
        disabledReason,
        onCheckedChange: (checked) => {
          if (disabledReason !== null) return;
          useComposerDraftStore
            .getState()
            .setReplyRewrite(props.target, checked, props.environmentId);
        },
      }}
    />
  );
}
