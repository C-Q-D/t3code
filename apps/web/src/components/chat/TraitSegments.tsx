/** Feature-owned radio layout with one indicator; Base UI retains keyboard and menu semantics. */
import { Menu } from "@base-ui/react/menu";
import { useLayoutEffect, useRef } from "react";
import { createSpringIndicator } from "~/lib/motion/springIndicator";
import { observeResize } from "~/lib/observeResize";
import { isPhysicsEnabled, onPhysicsChange } from "~/lib/motion/preference";

/** Follows the checked item and its optional reasoning palette; only selection changes animate. */
export function TraitSegments({
  children,
  fastMode = false,
  ...props
}: Menu.RadioGroup.Props & { fastMode?: boolean }) {
  const groupRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLSpanElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const group = groupRef.current;
    const indicator = indicatorRef.current;
    if (!group || !indicator) return;
    const motion = createSpringIndicator(indicator, group);
    let hasSelection = false;
    let previousSelection: HTMLElement | null = null;
    let flash: Animation | undefined;
    let sweep: Animation | undefined;
    const stopFlashOnDisable = onPhysicsChange((enabled) => {
      if (!enabled) {
        flash?.cancel();
        sweep?.cancel();
      }
    });
    const align = (animate: boolean) => {
      const selected = group.querySelector<HTMLElement>(".composer-trait-segment[data-checked]");
      const level = selected?.dataset.reasoningLevel;
      const fast = selected?.dataset.fastMode === "on";
      if (fast) indicator.dataset.fastMode = "on";
      else delete indicator.dataset.fastMode;
      if (level === undefined) delete indicator.dataset.reasoningLevel;
      else if (indicator.dataset.reasoningLevel !== level) indicator.dataset.reasoningLevel = level;
      if (selected !== previousSelection) {
        flash?.cancel();
        sweep?.cancel();
        const highlight = highlightRef.current;
        // The clipped layer moves independently of the spring-driven indicator edges.
        if (
          animate &&
          isPhysicsEnabled() &&
          fast &&
          highlight &&
          typeof highlight.animate === "function"
        ) {
          sweep = highlight.animate(
            [{ transform: "translateX(-120%)" }, { transform: "translateX(240%)" }],
            { duration: 650, delay: 80 },
          );
        }
        // Resize and initial alignment must not replay selection feedback.
        if (
          animate &&
          isPhysicsEnabled() &&
          level !== undefined &&
          Number(level) >= 4 &&
          typeof indicator.animate === "function"
        ) {
          flash = indicator.animate(
            [{ filter: "brightness(1.8) saturate(1.4)" }, { filter: "none" }],
            { duration: 520, easing: "ease-out" },
          );
        }
        previousSelection = selected;
      }
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
      if (changes.every((change) => change.target === indicator)) return;
      const layoutChanged = changes.some((change) => change.type === "childList");
      if (layoutChanged) observeSizes();
      align(!layoutChanged);
    });
    selection.observe(group, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-checked", "data-reasoning-level", "data-fast-mode"],
    });
    return () => {
      selection.disconnect();
      stopResize?.();
      motion.dispose();
      flash?.cancel();
      sweep?.cancel();
      stopFlashOnDisable();
    };
  }, []);
  return (
    <Menu.RadioGroup {...props} ref={groupRef}>
      <span
        ref={indicatorRef}
        className="composer-trait-indicator"
        data-fast-mode-segment={fastMode || undefined}
        aria-hidden="true"
      >
        {fastMode ? <span ref={highlightRef} className="composer-trait-fast-highlight" /> : null}
      </span>
      {children}
    </Menu.RadioGroup>
  );
}
