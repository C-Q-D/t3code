/** Tracks whether the user is preparing an editor shortcut or pointing at send controls. */
import { useState, type SyntheticEvent } from "react";

export function useComposerSendPreviewTarget() {
  const [previewButton, setPreviewButton] = useState(false);
  const onEditorEvent = (event: SyntheticEvent) => {
    if (event.target instanceof Element && event.target.closest('[data-testid="composer-editor"]'))
      setPreviewButton(false);
  };
  return {
    previewButton,
    onFocusCapture: onEditorEvent,
    onKeyDownCapture: onEditorEvent,
    onPointerOverCapture: (event: SyntheticEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('[data-composer-send-preview="button"]')
      )
        setPreviewButton(true);
    },
  };
}
