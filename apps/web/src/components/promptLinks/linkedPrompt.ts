import { t } from "~/i18n";
import type { LinkedPrompt } from "@t3tools/shared/promptLinks";

import { type ComposerThreadTarget, useComposerDraftStore } from "~/composerDraftStore";

import { toastManager } from "../ui/toast";

export function warnAboutHiddenCharacters(prompt: LinkedPrompt): void {
  if (prompt.hiddenCharacters === 0) return;
  toastManager.add({
    type: "warning",
    title: t.app.linkedPromptUi.hidden,
    description: t.app.linkedPromptText.removed(prompt.hiddenCharacters),
    timeout: 0,
  });
}

export function placeLinkedPrompt(
  target: ComposerThreadTarget,
  prompt: LinkedPrompt,
  notes: ReadonlyArray<string> = [],
): void {
  warnAboutHiddenCharacters(prompt);
  const place = () => {
    useComposerDraftStore.getState().setPrompt(target, prompt.text);
    toastManager.add({
      type: "info",
      title: t.app.linkedPromptUi.added,
      description: [t.app.linkedPromptUi.read, ...notes].join(" "),
    });
  };
  const existing = useComposerDraftStore.getState().getComposerDraft(target)?.prompt ?? "";
  if (existing.trim().length === 0 || existing === prompt.text) {
    place();
    return;
  }
  const id = toastManager.add({
    type: "info",
    title: t.app.linkedPromptUi.ready,
    description: t.app.linkedPromptUi.replaceHint,
    timeout: 0,
    actionProps: {
      children: t.app.linkedPromptUi.replace,
      onClick: () => {
        toastManager.close(id);
        place();
      },
    },
  });
}
