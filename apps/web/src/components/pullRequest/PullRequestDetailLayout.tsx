/** Shared layout for live and loading pull-request details. */
import { t } from "~/i18n";
import { ArrowRightIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "~/lib/utils";

import { Toggle, ToggleGroup } from "../ui/toggle-group";

/**
 * Renders title and head-to-base metadata for loaded and loading details.
 * @param props Header slots; updated and files remain accessible metadata, and checkout is an optional loading-state control.
 * @returns Expanded header rows; the caller owns actions, collapse behavior, and tabs.
 */
export function PullRequestDetailHeaderBody({
  title,
  author,
  updated,
  checkout,
  base,
  head,
  files,
  diffStat,
}: {
  title: ReactNode;
  author: ReactNode;
  updated: ReactNode;
  checkout?: ReactNode;
  base: ReactNode;
  head: ReactNode;
  files: ReactNode;
  diffStat: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 px-4 pb-2.5">
      {title}
      <div className="flex min-h-5 min-w-0 items-center gap-2 font-mono text-secondary-copy text-secondary-label">
        {author}
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {head}
          <ArrowRightIcon
            aria-label={t.git.pullRequest.receivesChangesFrom}
            className="size-3 shrink-0"
          />
          {base}
        </span>
        <span className="ml-auto shrink-0">{diffStat}</span>
      </div>
      <span className="sr-only">
        {updated} · {files}
      </span>
      {checkout}
    </div>
  );
}

/** Keeps the title row height consistent while details load. */
export function PullRequestDetailTitleRow({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex min-h-8 min-w-0 items-center", className)} {...props} />;
}

/** Renders accessible detail tabs and optional intent preloading. */
export function PullRequestDetailTabBar<Tab extends string>({
  tabs,
  value,
  onValueChange,
  onTabIntent,
  inert,
  children,
}: {
  tabs: ReadonlyArray<{ readonly value: Tab; readonly label: string }>;
  value: Tab;
  onValueChange?: (tab: Tab) => void;
  onTabIntent?: (tab: Tab) => void;
  inert?: boolean;
  children?: ReactNode;
}) {
  return (
    <nav
      className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 border-t border-border/60 px-4 py-2"
      aria-label={t.git.pullRequest.pullRequestTabs}
      inert={inert}
    >
      <ToggleGroup
        className="shrink-0"
        size="segmented"
        variant="segmented"
        value={[value]}
        onValueChange={(next) => {
          const nextTab = tabs.find((item) => item.value === next[0])?.value;
          if (nextTab) onValueChange?.(nextTab);
        }}
      >
        {tabs.map((tab) => (
          <Toggle
            key={tab.value}
            value={tab.value}
            onPointerEnter={onTabIntent ? () => onTabIntent(tab.value) : undefined}
            onFocus={onTabIntent ? () => onTabIntent(tab.value) : undefined}
          >
            {tab.label}
          </Toggle>
        ))}
      </ToggleGroup>
      {children}
    </nav>
  );
}

/** Shows a compact checks icon and label without expanding the header. */
export function PullRequestChecksStatusLine({
  icon,
  label,
  className,
  ...props
}: Omit<ComponentProps<"span">, "children"> & { icon: ReactNode; label: ReactNode }) {
  return (
    <span
      className={cn(
        "ml-auto flex h-4 min-w-0 flex-1 flex-wrap content-start items-center justify-end gap-x-1.5 overflow-hidden text-xs",
        className,
      )}
      {...props}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
}
