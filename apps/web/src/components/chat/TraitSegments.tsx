/** Feature-owned radio layout with one indicator; Base UI retains keyboard and menu semantics. */
import { Menu } from "@base-ui/react/menu";
import { useLayoutEffect, useRef } from "react";
import { createSpringIndicator } from "~/lib/motion/springIndicator";
import { observeResize } from "~/lib/observeResize";

/** Follows the checked item, snapping on mount and layout changes and animating only selection. */
export function TraitSegments({ children, ...props }: Menu.RadioGroup.Props) {
  const groupRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const group = groupRef.current;
    const indicator = indicatorRef.current;
    if (!group || !indicator) return;
    const motion = createSpringIndicator(indicator, group);
    let hasSelection = false;
    const align = (animate: boolean) => {
      const selected = group.querySelector<HTMLElement>(".composer-trait-segment[data-checked]");
      indicator.hidden = !selected;
      if (!selected) {
        hasSelection = false;
        return;
      }
      motion.move(
        [selected.offsetLeft, selected.offsetLeft + selected.offsetWidth],
        animate && hasSelection,
      );
      hasSelection = true;
    };
    align(false);
    let stopResize: (() => void) | undefined;
    const observeSizes = () => {
      stopResize?.();
      stopResize = observeResize(
        [group, ...group.querySelectorAll(".composer-trait-segment")],
        () => align(false),
      );
    };
    observeSizes();
    const selection = new MutationObserver((changes) => {
      const layoutChanged = changes.some((change) => change.type === "childList");
      if (layoutChanged) observeSizes();
      align(!layoutChanged);
    });
    selection.observe(group, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-checked"],
    });
    return () => {
      selection.disconnect();
      stopResize?.();
      motion.dispose();
    };
  }, []);
  return (
    <Menu.RadioGroup {...props} ref={groupRef}>
      <span ref={indicatorRef} className="composer-trait-indicator" aria-hidden="true" />
      {children}
    </Menu.RadioGroup>
  );
}
