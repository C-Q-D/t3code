/** Keeps prompt-backed and provider-backed switches on the same interaction path. */
import { Menu } from "@base-ui/react/menu";
import { useEffect, useRef } from "react";
import { PixelThinkIcon } from "../icons/PixelLucideIcon";
import { isPhysicsEnabled, onPhysicsChange } from "~/lib/motion/preference";
import { MOTION_SNAP_DURATION_MS } from "~/lib/motion/springToLinear";

type TraitSwitchRowProps = Omit<Menu.CheckboxItem.Props, "children" | "checked"> & {
  label: string;
  checked: boolean;
};

/** User events own the halo so opening a menu never replays feedback for saved state. */
export function TraitSwitchRow({ label, checked, onCheckedChange, ...props }: TraitSwitchRowProps) {
  const haloRef = useRef<HTMLSpanElement>(null);
  const animationRef = useRef<Animation | null>(null);
  useEffect(() => {
    const unsubscribe = onPhysicsChange((enabled) => {
      if (!enabled) animationRef.current?.cancel();
    });
    return () => {
      unsubscribe();
      animationRef.current?.cancel();
    };
  }, []);
  return (
    <Menu.CheckboxItem
      {...props}
      checked={checked}
      onCheckedChange={(next, details) => {
        animationRef.current?.cancel();
        const halo = haloRef.current;
        if (next && !checked && isPhysicsEnabled() && halo && typeof halo.animate === "function") {
          const style = getComputedStyle(halo);
          animationRef.current = halo.animate(
            [
              { boxShadow: style.getPropertyValue("--trait-switch-halo-from") },
              { boxShadow: style.getPropertyValue("--trait-switch-halo-to") },
            ],
            { duration: MOTION_SNAP_DURATION_MS, easing: "ease-out" },
          );
        }
        onCheckedChange?.(next, details);
      }}
    >
      <PixelThinkIcon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="composer-trait-switch-label min-w-0 flex-1">{label}</span>
      <span className="composer-trait-switch" aria-hidden="true">
        <span className="composer-trait-switch-halo" ref={haloRef} />
        <span className="composer-trait-switch-thumb" />
      </span>
    </Menu.CheckboxItem>
  );
}
