/** Keeps Escape navigation available to the full-page settings and usage routes. */
import { useCanGoBack, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

/** Returns a history-back action, falling back to the home route when no entry exists. */
function useNavigateBack() {
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();

  return () => {
    if (canGoBack) {
      window.history.back();
      return;
    }
    void navigate({ to: "/" });
  };
}

/** Registers Escape navigation; an optional callback overrides history and cleanup removes the listener. */
export function useEscapeToGoBack(onEscape?: () => void) {
  const navigateBack = useNavigateBack();
  const handleEscape = onEscape ?? navigateBack;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.key !== "Escape")
        return;
      event.preventDefault();

      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement) {
        activeElement.blur();
      }

      handleEscape();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleEscape]);
}
