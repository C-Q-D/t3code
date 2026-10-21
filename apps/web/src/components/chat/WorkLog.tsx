/** Shared work-log geometry joins separately virtualized headers and entries without measuring them. */
import { useLayoutEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "../../lib/utils";

/** Split the stone surface at virtual-list boundaries; each part owns its trailing space. */
export function WorkLogBlock({
  layout = "standalone",
  continues = false,
  children,
}: {
  layout?: "standalone" | "group-header" | "group-content";
  continues?: boolean | undefined;
  children: ReactNode;
}) {
  return (
    <div
      className={
        continues || layout === "group-header"
          ? "pb-0"
          : layout === "group-content"
            ? "pb-1"
            : "pb-2"
      }
    >
      <div
        className={cn(
          layout === "group-header" &&
            "timeline-worklog-header rounded-t-card-surface bg-sidebar-row-hover px-1.5 pt-1.5 shadow-raise-m",
          layout === "group-content" &&
            "timeline-worklog-content rounded-b-card-surface bg-sidebar-row-hover px-1.5 pb-2 shadow-timeline-log-content",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function WorkLogList({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-col">{children}</div>;
}

type RowContent = {
  disclosure?: ReactNode;
  icon?: ReactNode;
  label: ReactNode;
  trailing?: ReactNode;
  wrapLabel?: boolean;
  presentation?: "entry" | "summary" | "header";
};

/** Keep the label line fixed-height; expanded detail lives outside it for stable size estimates. */
function WorkLogLine({ disclosure, icon, label, trailing, wrapLabel, presentation }: RowContent) {
  return (
    <div
      className={cn(
        "flex min-w-0 gap-2 text-secondary-copy-large select-none [&_*]:select-none",
        presentation === "header" ? "min-h-9.5" : "min-h-8",
        presentation !== "summary" &&
          "rounded-compact-row px-3 group-hover/log-control:bg-timeline-log-hover",
        wrapLabel ? "items-start" : "items-center",
      )}
    >
      {disclosure}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {icon ? (
          <span className="flex size-3.5 shrink-0 items-center justify-center">{icon}</span>
        ) : null}
        <div
          className={cn(
            "min-w-0 flex-1 text-code-foreground",
            !wrapLabel && "truncate [&_*]:whitespace-nowrap",
          )}
        >
          {label}
        </div>
      </div>
      {trailing}
    </div>
  );
}

const interactionClassName =
  "cursor-pointer focus-visible:outline-none focus-visible:inset-shadow-focus";

/** Callers select a D1 presentation instead of overriding shared row geometry. */
function rowClassName(interactive: boolean, presentation: RowContent["presentation"]) {
  return cn(
    "group/timeline-row relative min-w-0 text-left",
    presentation === "summary"
      ? "w-fit max-w-full rounded-card-row bg-popover ps-2.5 pe-3.5 shadow-raise-xs-control"
      : presentation === "entry"
        ? "w-full pb-0.5"
        : "w-full",
    presentation !== "summary" && "rounded-compact-row",
    interactive && "group/log-control",
    interactive && interactionClassName,
  );
}

/** Keep disclosure behavior native while owning D1 row geometry instead of accepting style overrides. */
export function WorkLogButton({
  disclosure,
  icon,
  label,
  trailing,
  wrapLabel = false,
  presentation = "entry",
  ...buttonProps
}: RowContent & Omit<ComponentProps<"button">, "className" | "style" | "children">) {
  const className = rowClassName(true, presentation);
  return (
    <button {...buttonProps} type="button" className={className}>
      <WorkLogLine
        disclosure={disclosure}
        icon={icon}
        label={label}
        trailing={trailing}
        wrapLabel={wrapLabel}
        presentation={presentation}
      />
    </button>
  );
}

/** Div-based disclosure supports selectable detail and nested actions in an entry. */
export function WorkLogRow({
  disclosure,
  icon,
  label,
  trailing,
  wrapLabel = false,
  presentation = "entry",
  children,
  ...rowProps
}: RowContent & Omit<ComponentProps<"div">, "className" | "style">) {
  const className = rowClassName(rowProps.onClick !== undefined, presentation);
  return (
    <div {...rowProps} className={className}>
      <WorkLogLine
        disclosure={disclosure}
        icon={icon}
        label={label}
        trailing={trailing}
        wrapLabel={wrapLabel}
        presentation={presentation}
      />
      {children}
    </div>
  );
}

const LIVE_EDGE_PX = 4;

/**
 * Render expanded log content without letting pointer actions toggle its parent disclosure.
 * @param props Children and content kind (text by default); panel/media keep their existing shells.
 * followLive defaults false. When true, text updates follow the end before paint while the reader
 * is within 4px of it. Scrolling up pauses following until the reader scrolls back to the end.
 * @returns The detail container; updates use its existing scroll geometry without timers or polling.
 */
export function WorkLogDetails({
  children,
  kind = "text",
  followLive = false,
}: {
  children: ReactNode;
  kind?: "text" | "panel" | "media";

  followLive?: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const atLiveEdgeRef = useRef(true);
  // No deps: each streamed chunk re-renders this, and pinning before paint
  // shows the new text without a visible jump.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (followLive && atLiveEdgeRef.current && scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  });
  return (
    <div
      ref={scrollerRef}
      onScroll={(event) => {
        const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
        atLiveEdgeRef.current = scrollHeight - scrollTop - clientHeight <= LIVE_EDGE_PX;
      }}
      className={cn(
        "cursor-auto",
        kind === "text"
          ? "ms-8.5 me-1.5 flex max-h-96 flex-col gap-3 overflow-auto py-1 select-text"
          : kind === "panel"
            ? "ms-8.5 me-1.5 mt-0.5 mb-1 rounded-timeline-command bg-code px-3.5 py-2.5 text-terminal-copy leading-terminal text-secondary-label shadow-well-control"
            : "mt-1",
      )}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}
