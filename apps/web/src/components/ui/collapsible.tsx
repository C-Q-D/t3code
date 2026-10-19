"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";

import { cn } from "~/lib/utils";

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({ className, ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      className={cn("cursor-pointer", className)}
      data-slot="collapsible-trigger"
      {...props}
    />
  );
}

/**
 * Render collapsible content with caller className and forwarded Base UI panel props.
 * animate=false disables height travel; otherwise physics uses settle, while legacy
 * keeps its 200ms transition and honors the system's reduced-motion preference.
 */
function CollapsiblePanel({
  className,
  animate = true,
  ...props
}: CollapsiblePrimitive.Panel.Props & { animate?: boolean }) {
  // Base UI supplies measured height and owns mounting and accessibility.
  // https://ui.shadcn.com/docs/components/base/collapsible
  return (
    <CollapsiblePrimitive.Panel
      className={cn(
        "overflow-hidden",
        animate &&
          "h-(--collapsible-panel-height) transition-[height] legacy:duration-200 legacy:motion-reduce:transition-none physics:duration-(--motion-settle-duration) physics:ease-(--ease-settle) data-ending-style:h-0 data-starting-style:h-0 data-open:data-ending-style:[height:var(--collapsible-panel-height)]",
        className,
      )}
      data-slot="collapsible-panel"
      {...props}
    />
  );
}

export {
  Collapsible,
  CollapsibleTrigger,
  CollapsiblePanel,
  CollapsiblePanel as CollapsibleContent,
};
