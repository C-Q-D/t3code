/** Persistent selection paint with feedback authorized only by a model-selection event. */
import { useLayoutEffect, useRef } from "react";
import { CheckIcon } from "lucide-react";
import { isPhysicsEnabled, onPhysicsChange } from "~/lib/motion/preference";
import { springToLinear } from "~/lib/motion/springToLinear";
import { TOKENS } from "~/lib/motion/tokens";

const CHECK_SPRING = springToLinear(TOKENS.fling);

/** A model-keyed owner consumes each user request once; mounting and external selection never replay it. */
export function ModelSelectionCheck({
  checked,
  request,
}: {
  checked: boolean;
  request?: object | undefined;
}) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const previousRequest = useRef(request);
  const previousChecked = useRef(checked);
  const feedback = useRef<{ animations: Animation[]; halo: HTMLSpanElement } | null>(null);
  useLayoutEffect(() => {
    const stop = () => {
      const old = feedback.current;
      feedback.current = null;
      old?.halo.remove();
      old?.animations.forEach((animation) => animation.cancel());
    };
    const unsubscribe = onPhysicsChange((enabled) => {
      if (!enabled) stop();
    });
    return () => {
      unsubscribe();
      stop();
    };
  }, []);
  useLayoutEffect(() => {
    const requested = previousRequest.current !== request;
    const wasChecked = previousChecked.current;
    previousRequest.current = request;
    previousChecked.current = checked;
    const old = feedback.current;
    if (!checked || requested) {
      feedback.current = null;
      old?.halo.remove();
      old?.animations.forEach((animation) => animation.cancel());
    }
    const root = rootRef.current;
    const check = root?.querySelector("svg");
    if (!requested || !request || wasChecked || !checked || !isPhysicsEnabled() || !root || !check)
      return;
    const halo = document.createElement("span");
    halo.className = "composer-model-check-halo";
    root.append(halo);
    const style = getComputedStyle(root);
    const animations = [
      check.animate([{ transform: "scale(0.4)" }, { transform: "scale(1)" }], {
        duration: CHECK_SPRING.durationMs,
        easing: CHECK_SPRING.easing,
      }),
      halo.animate(
        [
          { boxShadow: style.getPropertyValue("--model-check-halo-from") },
          { boxShadow: style.getPropertyValue("--model-check-halo-to") },
        ],
        { duration: 650, easing: "ease-out" },
      ),
    ];
    const current = { animations, halo };
    feedback.current = current;
    const finish = () => {
      if (feedback.current !== current) return;
      feedback.current = null;
      halo.remove();
      animations.forEach((animation) => animation.cancel());
    };
    void Promise.all(animations.map((animation) => animation.finished)).then(finish, finish);
  }, [checked, request]);
  return (
    <span ref={rootRef} className="composer-model-check" data-checked={checked} aria-hidden="true">
      {checked ? <CheckIcon className="size-2.75" /> : null}
    </span>
  );
}
