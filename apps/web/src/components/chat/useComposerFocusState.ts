/** Coordinates focus restoration with the desktop composer scroll gesture. */
import { useState } from "react";

/** Keeps focus and scroll-collapse state together so reaching the timeline end can restore the editor. */
export function useComposerFocusState() {
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [isComposerScrollCollapsed, setIsComposerScrollCollapsed] = useState(false);

  const restoreAfterTimelineReachedEnd = () => {
    setIsComposerScrollCollapsed(false);
  };

  return {
    isComposerFocused,
    setIsComposerFocused,
    isComposerScrollCollapsed,
    setIsComposerScrollCollapsed,
    restoreAfterTimelineReachedEnd,
  };
}
