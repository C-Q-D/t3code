/** Resolves one named keyboard action through the composer's real shortcut parser. */
import { isMacPlatform, matchesKeybindingShortcutModifiers } from "@t3tools/shared/keybindings";
import { composerRequiresModifier, composerSubmissionIntentForKey } from "../../composer-logic";
import { effectiveShortcutsForCommand, formatShortcutLabel } from "../../keybindings";
import type { ShortcutModifierState } from "../../shortcutModifierState";

export function composerReplyRewriteKeyboardAction(
  input: Omit<Parameters<typeof composerSubmissionIntentForKey>[0], "event"> & {
    modifiers: ShortcutModifierState;
  },
) {
  const { modifiers, ...parserInput } = input;
  const platform = input.platform ?? navigator.platform;
  const requiresModifier = composerRequiresModifier(input.sendShortcut, input.prompt ?? "");
  const alternate = effectiveShortcutsForCommand(input.keybindings, "composer.sendAlternate", {
    platform,
    context: {
      composerFocus: true,
      draftThreadRoute: input.isDraftThread,
      turnRunning: input.isRunning === true,
      composerRequiresModifier: requiresModifier,
    },
  }).filter((shortcut) => matchesKeybindingShortcutModifiers(modifiers, shortcut, platform));
  const events = [
    ...alternate.map((shortcut) => ({ ...modifiers, key: shortcut.key })),
    { ...modifiers, key: "Enter" },
    {
      key: "Enter",
      ctrlKey: requiresModifier && !isMacPlatform(platform),
      metaKey: requiresModifier && isMacPlatform(platform),
      altKey: false,
      shiftKey: false,
    },
  ];
  for (const event of events) {
    const intent = composerSubmissionIntentForKey({ ...parserInput, event });
    if (intent !== null) {
      return {
        intent,
        label: formatShortcutLabel(
          { ...event, key: event.key.toLowerCase(), modKey: false },
          platform,
        ),
      };
    }
  }
  return null;
}
