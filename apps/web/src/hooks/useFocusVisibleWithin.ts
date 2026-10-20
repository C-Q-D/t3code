/** Exposes descendant focus-visible state through React focus events, without DOM observers. */
import { useState, type FocusEventHandler } from "react";

/**
 * Spread handlers onto the container and render active as its styling attribute.
 * Focus reads the browser's input-modality decision; internal blur keeps the
 * previous value until the next focus event, avoiding a false intermediate state.
 * React portals bubble focus through this handler, but only DOM descendants count.
 */
export function useFocusVisibleWithin(): {
  active: boolean;
  handlers: { onFocus: FocusEventHandler; onBlur: FocusEventHandler };
} {
  const [active, setActive] = useState(false);
  const onFocus: FocusEventHandler = (event) => {
    setActive(event.currentTarget.contains(event.target) && event.target.matches(":focus-visible"));
  };
  const onBlur: FocusEventHandler = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setActive(false);
  };
  return { active, handlers: { onFocus, onBlur } };
}
