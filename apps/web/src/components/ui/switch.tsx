/** Provides the shared graphite switch without changing Base UI's checked or form semantics. */
"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "~/lib/utils";

/**
 * `mixed` renders the thumb centred on a muted track for a selection whose
 * targets disagree (the macOS mixed-state convention). It is presentational:
 * the caller still decides what a click sets, usually on for everyone.
 * The default track is 36×20; `sm` keeps the existing compact desktop geometry.
 * Pressed thumbs grow inward so both ends retain the same 2px outer inset.
 */
function Switch({
  className,
  size = "default",
  mixed = false,
  ...props
}: SwitchPrimitive.Root.Props & { size?: "default" | "sm"; mixed?: boolean }) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "group/switch inline-flex shrink-0 cursor-pointer items-center rounded-full bg-input p-0.5 shadow-switch-track outline-none [--switch-press-extra:0px] not-data-disabled:hover:bg-sidebar not-data-disabled:hover:shadow-switch-hover not-data-disabled:active:bg-input not-data-disabled:active:shadow-switch-pressed not-data-disabled:active:[--switch-press-extra:--spacing(1)] focus-visible:shadow-switch-pressed focus-visible:inset-shadow-focus data-disabled:cursor-not-allowed data-disabled:opacity-38 data-disabled:shadow-none",
        !mixed &&
          "data-checked:bg-message-action data-checked:shadow-switch-on not-data-disabled:data-checked:hover:bg-message-action-hover not-data-disabled:data-checked:hover:shadow-none not-data-disabled:data-checked:active:bg-switch-on-pressed not-data-disabled:data-checked:active:shadow-none data-checked:focus-visible:shadow-none data-checked:data-disabled:shadow-none",
        size === "sm"
          ? "h-4 w-6.5 [--switch-thumb:--spacing(3)] [--switch-travel:--spacing(2.5)]"
          : "h-5 w-9 [--switch-thumb:--spacing(4)] [--switch-travel:--spacing(4)]",
        className,
      )}
      data-size={size}
      data-slot="switch"
      data-mixed={mixed ? "" : undefined}
      // Base UI overwrites aria-checked even with undefined; pass it only for mixed state.
      {...(mixed ? { "aria-checked": "mixed" as const } : {})}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block physics:transition-[translate] physics:duration-(--motion-snap-duration) physics:ease-(--ease-snap) h-(--switch-thumb) w-[calc(var(--switch-thumb)+var(--switch-press-extra))] shrink-0 rounded-full bg-fg-control-disabled shadow-switch-thumb group-not-data-disabled/switch:group-hover/switch:bg-placeholder group-not-data-disabled/switch:group-active/switch:bg-placeholder group-not-data-disabled/switch:group-active/switch:shadow-none group-focus-visible/switch:shadow-none data-disabled:shadow-none",
          !mixed &&
            "data-checked:translate-x-[calc(var(--switch-travel)-var(--switch-press-extra))] data-checked:bg-message-action-foreground data-checked:shadow-switch-thumb-on group-not-data-disabled/switch:group-hover/switch:data-checked:bg-message-action-foreground group-not-data-disabled/switch:group-hover/switch:data-checked:shadow-none group-not-data-disabled/switch:group-active/switch:data-checked:bg-message-action-foreground group-not-data-disabled/switch:group-active/switch:data-checked:shadow-none data-checked:data-disabled:shadow-none data-checked:group-focus-visible/switch:shadow-none",
          mixed &&
            "translate-x-[calc((var(--switch-travel)-var(--switch-press-extra))/2)] opacity-70",
        )}
        data-slot="switch-thumb"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
