/** Dispatches composer keyboard commands without owning editor or request state. */
import type { BranchToolbarHandle } from "../BranchToolbar";
import type { ChatComposerHandle } from "./ChatComposer";
import type { ChatShortcutCommands } from "./useChatShortcuts";

/** The keyboard dispatcher depends only on these imperative composer actions. */
type ComposerShortcutRef = {
  readonly current: Pick<
    ChatComposerHandle,
    "openControl" | "toggleModelPicker" | "stepReasoningEffort" | "optimizePrompt"
  > | null;
};

/** Opens the requested composer control on the first keydown, ignoring held-key repeats. */
const openControl =
  (composerRef: ComposerShortcutRef, control: Parameters<ChatComposerHandle["openControl"]>[0]) =>
  ({ event }: { readonly event: KeyboardEvent }) => {
    if (!event.repeat) composerRef.current?.openControl(control);
  };

/** Chords that open or step the composer's controls and its branch toolbar. Held keys do not repeat them. */
export function composerShortcutCommands(
  composerRef: ComposerShortcutRef,
  branchToolbarRef: { readonly current: BranchToolbarHandle | null },
): ChatShortcutCommands {
  return {
    "composer.optimizePrompt": ({ event }) => {
      if (!event.repeat && !event.isComposing) void composerRef.current?.optimizePrompt();
    },
    "modelPicker.toggle": ({ event }) => {
      if (!event.repeat) composerRef.current?.toggleModelPicker();
    },
    "composer.increaseEffort": ({ event }) => {
      if (!event.repeat) composerRef.current?.stepReasoningEffort(1);
    },
    "composer.decreaseEffort": ({ event }) => {
      if (!event.repeat) composerRef.current?.stepReasoningEffort(-1);
    },
    "composer.host": openControl(composerRef, "composer.host"),
    "composer.effort": openControl(composerRef, "composer.effort"),
    "composer.mode": openControl(composerRef, "composer.mode"),
    "composer.workspace": openControl(composerRef, "composer.workspace"),
    "composer.branch": ({ event }) => {
      if (!event.repeat) branchToolbarRef.current?.openBranchPicker();
    },
    "composer.previousWorktree": ({ event }) => {
      if (!event.repeat) branchToolbarRef.current?.usePreviousWorktree();
    },
  } satisfies ChatShortcutCommands;
}
