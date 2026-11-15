/** Keeps composer writing tools tied to the current draft and dispatch intent. */
import type { ClientSettings, EnvironmentId, ResolvedKeybindingsConfig } from "@t3tools/contracts";
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
import { composerReplyRewriteKeyboardAction } from "./composerReplyRewriteKeyboard";

export function ComposerAssistTools(props: {
  environmentId: EnvironmentId;
  keybindings: ResolvedKeybindingsConfig;
  sendShortcut: ClientSettings["sendShortcut"];
  draftThread: boolean;
  softwareKeyboardOpen: boolean;
  platform?: string;
  previewButton?: boolean;
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
  const keyboardAction = composerReplyRewriteKeyboardAction({
    keybindings: props.keybindings,
    sendShortcut: props.sendShortcut,
    isDraftThread: props.draftThread,
    isSoftwareKeyboardOpen: props.softwareKeyboardOpen,
    isRunning: props.running,
    prompt: props.prompt,
    platform: props.platform ?? navigator.platform,
    modifiers,
  });
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
          alternateModifier: props.previewButton
            ? modifiers.ctrlKey || modifiers.metaKey
            : keyboardAction?.intent === "alternate",
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
          : !props.previewButton && keyboardAction === null
            ? copy.noKeyboardSend
            : null;
  return (
    <ComposerAssistPopover
      optimizer={props.optimizer}
      shortcut={props.shortcut ?? null}
      sendActionLabel={
        props.previewButton
          ? copy.clickSend
          : keyboardAction
            ? copy.keyboardSend(keyboardAction.label)
            : copy.noKeyboardSend
      }
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
