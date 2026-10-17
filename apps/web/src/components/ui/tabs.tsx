"use client";

/** Graphite tabs preserve Base UI's stateful className, panel, and keyboard contracts. */
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";

import { cn } from "~/lib/utils";

/** Own selection through value/onValueChange, or pass defaultValue for an uncontrolled group. */
function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      className={(state) =>
        cn(
          "flex min-h-0 flex-col gap-2 data-[orientation=vertical]:flex-row",
          typeof className === "function" ? className(state) : className,
        )
      }
      data-slot="tabs"
      {...props}
    />
  );
}

/** Group tab triggers; supply an accessible label and let Base UI handle arrow-key focus. */
function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      className={(state) =>
        cn(
          "flex w-fit items-center gap-1 data-[orientation=vertical]:flex-col",
          typeof className === "function" ? className(state) : className,
        )
      }
      data-slot="tabs-list"
      {...props}
    />
  );
}

/** Match value to a TabsContent; close/menu actions belong beside this button, never inside it. */
function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      className={(state) =>
        cn(
          "relative inline-flex h-8 shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-compact-row border-0 bg-transparent px-2.5 text-secondary-copy-large font-normal text-secondary-label text-shadow-stone outline-none focus-visible:inset-shadow-focus not-data-active:not-data-disabled:hover:bg-tab-hover not-data-active:not-data-disabled:hover:text-foreground not-data-active:not-data-disabled:active:bg-tab-pressed not-data-active:not-data-disabled:active:text-foreground not-data-active:not-data-disabled:active:shadow-well-pressed not-data-active:not-data-disabled:focus-visible:text-fg-detail data-active:bg-secondary data-active:font-semibold data-active:text-foreground not-data-disabled:data-active:shadow-raise-xs data-disabled:pointer-events-none data-disabled:text-fg-icon-disabled data-disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.25 [&_svg]:stroke-[1.75]",
          typeof className === "function" ? className(state) : className,
        )
      }
      data-slot="tabs-trigger"
      {...props}
    />
  );
}

/** Render the panel associated with value; mounting and focus behavior follow Base UI props. */
function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      className={(state) =>
        cn(
          "min-h-0 flex-1 outline-none focus-visible:inset-shadow-focus",
          typeof className === "function" ? className(state) : className,
        )
      }
      data-slot="tabs-content"
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
