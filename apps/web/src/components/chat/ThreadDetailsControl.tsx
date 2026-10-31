/** Owns F1 detail-control geometry while delegating toolbar rendering to the shared Button. */
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import {
  THREAD_DETAILS_PANEL_AGENT_ROW_CLASS,
  THREAD_DETAILS_PANEL_ROW_CLASS,
  THREAD_DETAILS_PANEL_SELECT_ROW_CLASS,
  THREAD_DETAILS_PANEL_SPLIT_PRIMARY_CLASS,
  THREAD_DETAILS_PANEL_SPLIT_SECONDARY_CLASS,
  THREAD_DETAILS_PANEL_ICON_ACTION_CLASS,
  THREAD_DETAILS_PANEL_META_ACTION_CLASS,
  THREAD_DETAILS_PANEL_CHEVRON_CLASS,
  THREAD_DETAILS_PANEL_ACTION_CLASS,
  THREAD_DETAILS_PANEL_SELECT_LABEL_CLASS,
  THREAD_DETAILS_PANEL_SELECT_ICON_CLASS,
} from "./threadDetailsPanelStyles";
import { ChevronDownIcon } from "lucide-react";

const parts = {
  row: THREAD_DETAILS_PANEL_ROW_CLASS,
  agent: THREAD_DETAILS_PANEL_AGENT_ROW_CLASS,
  link: "h-auto w-fit border-0 bg-transparent p-0 -mt-1 text-secondary-copy-medium font-semibold text-code-foreground underline decoration-border underline-offset-3",
  select: THREAD_DETAILS_PANEL_SELECT_ROW_CLASS,
  context: `${THREAD_DETAILS_PANEL_SELECT_ROW_CLASS} disabled:bg-thread-details-well disabled:text-foreground disabled:shadow-well-control`,
  primary: THREAD_DETAILS_PANEL_SPLIT_PRIMARY_CLASS,
  secondary: THREAD_DETAILS_PANEL_SPLIT_SECONDARY_CLASS,
  icon: THREAD_DETAILS_PANEL_ICON_ACTION_CLASS,
  meta: THREAD_DETAILS_PANEL_META_ACTION_CLASS,
  action: THREAD_DETAILS_PANEL_ACTION_CLASS,
  outline:
    "h-8.5 justify-center rounded-full border-0 px-3 text-secondary-copy-medium font-semibold text-code-foreground bg-transparent shadow-outline-control",
  branch: `${THREAD_DETAILS_PANEL_ROW_CLASS} font-mono text-secondary-copy`,
  stat: `${THREAD_DETAILS_PANEL_ICON_ACTION_CLASS} h-auto w-auto gap-1 font-mono text-secondary-copy font-normal`,
  watch: `${THREAD_DETAILS_PANEL_META_ACTION_CLASS} aria-pressed:bg-accent aria-pressed:inset-shadow-selected-control`,
};

/**
 * Panel parts own F1 density and appearance; toolbar controls use the shared Button variants.
 * @param props - Native/rendered button props, panel part, optional multiline content and tone.
 * @returns One control; panel=false delegates its size and variant to Button unchanged.
 */
export function ThreadDetailsControl({
  panel = true,
  part = "row",
  multiline = false,
  tone = "default",
  className,
  children,
  size = "default",
  variant = "default",
  render,
  ...props
}: ComponentProps<typeof Button> & {
  panel?: boolean;
  part?: keyof typeof parts;
  multiline?: boolean;
  tone?: "default" | "muted" | "primary" | "destructive";
}) {
  const control = useRender({
    defaultTagName: "button",
    render,
    props: mergeProps<"button">(
      {
        type: render ? undefined : "button",
        className: cn(
          "relative inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap outline-none focus-visible:inset-shadow-focus pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3.5 disabled:pointer-events-none disabled:bg-accent disabled:text-fg-control-disabled disabled:shadow-none aria-disabled:cursor-not-allowed aria-disabled:text-fg-control-disabled [&_svg]:shrink-0",
          parts[part],
          multiline && "h-auto min-h-9.5 py-1 whitespace-normal",
          tone === "muted" && "text-secondary-label enabled:hover:text-foreground",
          tone === "primary" &&
            "bg-primary text-primary-foreground font-bold text-shadow-none shadow-primary-button enabled:hover:bg-message-action-hover [--lucide-hue-override:currentColor]",
          tone === "destructive" &&
            "text-destructive hover:text-destructive data-pressed:text-destructive",
          // PR row actions share one 20px pill with a 1px inset focus ring that stays clear of the
          // label. The solid pill draws it in the canvas color so it shows against the fill.
          part === "meta" &&
            (tone === "primary" || tone === "destructive") &&
            "h-5 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-offset-0",
          part === "meta" && tone === "primary" && "focus-visible:ring-background",
          part === "meta" &&
            tone === "destructive" &&
            "bg-destructive/10 hover:!bg-destructive/16 data-pressed:!bg-destructive/16 dark:hover:!bg-destructive/16 dark:data-pressed:!bg-destructive/16",
          className,
        ),
      },
      props,
      {
        children:
          part === "select" || part === "context" ? (
            <>
              <span data-slot="select-label" className={THREAD_DETAILS_PANEL_SELECT_LABEL_CLASS}>
                {children}
              </span>
              <span data-slot="select-icon" className={THREAD_DETAILS_PANEL_SELECT_ICON_CLASS}>
                <ChevronDownIcon className={THREAD_DETAILS_PANEL_CHEVRON_CLASS} />
              </span>
            </>
          ) : (
            children
          ),
      },
    ),
  });
  if (!panel) {
    return (
      <Button
        {...props}
        render={render}
        size={multiline ? "sm-multiline" : size}
        variant={variant}
        className={className}
      >
        {children}
      </Button>
    );
  }
  return control;
}
