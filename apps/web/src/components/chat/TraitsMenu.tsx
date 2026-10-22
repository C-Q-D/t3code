/** Feature-owned menu boundary for selection feedback; shared menu primitives stay unchanged. */
import { Menu } from "@base-ui/react/menu";
import { useEffect, useRef } from "react";
import { useStableCallback } from "~/hooks/useStableCallback";
import { isPhysicsEnabled } from "~/lib/motion/preference";
import { MOTION_SNAP_DURATION_MS } from "~/lib/motion/springToLinear";

/** Hosts traits in standalone and overflow menus using Base UI dismissal semantics. */
export function TraitsMenu({ onOpenChange, ...props }: Omit<Menu.Root.Props, "actionsRef">) {
  const actionsRef = useRef<Menu.Root.Actions>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelPending = useStableCallback(() => {
    clearTimeout(pending.current);
    pending.current = undefined;
  });
  useEffect(() => cancelPending, [cancelPending]);
  useEffect(() => {
    if (props.open === false) cancelPending();
  }, [props.open, cancelPending]);
  return (
    <Menu.Root
      {...props}
      actionsRef={actionsRef}
      onOpenChange={(open, details) => {
        cancelPending();
        const target = details.event.target;
        if (
          !open &&
          details.reason === "item-press" &&
          isPhysicsEnabled() &&
          target instanceof Element &&
          target.closest(".composer-traits-content")
        ) {
          // Cancel only dismissal: Base UI still commits the radio/checkbox selection.
          details.cancel();
          pending.current = setTimeout(() => {
            pending.current = undefined;
            actionsRef.current?.close();
          }, MOTION_SNAP_DURATION_MS);
          return;
        }
        onOpenChange?.(open, details);
      }}
    />
  );
}
