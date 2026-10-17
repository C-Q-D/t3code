/** HTML 8a long-table strip for the page's compact/diff-panel layout, using the shared seat sprites. */
import { Fragment, type CSSProperties } from "react";
import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { PixelSeat } from "./PixelSeat";
import { PxWave } from "./PxWave";
import { longTableLayout } from "./discussionLongTable.logic";
import {
  roundTableSeatLabel,
  type DiscussionTableSeat,
  type DiscussionTableSequenceOptions,
} from "./discussionRoundTable.logic";
import { discussionSeatColor } from "./discussionSeatColors";

const TAG_CLASSES = {
  info: "bg-status-info text-info",
  warning: "bg-warning-surface text-status-warning-foreground",
  error: "bg-status-error text-status-error-foreground",
  neutral: "bg-secondary text-code-foreground",
  outline: "border border-border text-secondary-label",
} as const;

/**
 * Keeps untruncated names readable without adding hover targets to every short label.
 * @param props.label Full localized name or annotation, also exposed when the six-character limit applies.
 * @param props.className Table-owned text/badge appearance on the HTML span.
 * @returns Plain text or a keyboard-accessible shared tooltip for a truncated label.
 */
function LongTableLabel({
  label,
  className,
}: {
  readonly label: string;
  readonly className: string;
}) {
  const text = roundTableSeatLabel(label);
  if (text === label) return <span className={className}>{text}</span>;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={className} tabIndex={0} />}>{text}</TooltipTrigger>
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * Renders the S3/H1 strip; the caller switches table shapes at <1200px or when the diff panel opens.
 * @param props.seats Physical seats shared with the round table; seatIndex controls color, role artwork.
 * @param props.label Localized accessible description for the table and its scrollable sequence.
 * @param props.centerLabel Localized round/last-statement/summary capsule text, as on the round table.
 * @param props.order Optional actual sequence of unique existing ids, including finite last statements.
 * @param props.closeLoop Defaults to true; false omits the return connection after the last seat.
 * @param props.quiet Defaults to false; true uses the round table's faint solid summary/ended lines.
 * @returns A 66px inset strip; only the first physical speaker and its wave animate via existing gates.
 * @throws RangeError for ambiguous ids or invalid explicit order references.
 */
export function DiscussionLongTable({
  seats,
  label,
  centerLabel,
  order,
  closeLoop = true,
  quiet = false,
}: {
  readonly seats: readonly DiscussionTableSeat[];
  readonly label: string;
  readonly centerLabel: string;
} & DiscussionTableSequenceOptions) {
  const layout = longTableLayout(seats, {
    ...(order === undefined ? {} : { order }),
    closeLoop,
    quiet,
  });
  const connections = new Map(
    layout.connections.map((connection) => [connection.fromId, connection]),
  );
  return (
    <div
      role="group"
      aria-label={label}
      tabIndex={0}
      className="h-16.5 min-w-0 shrink-0 overflow-x-auto overflow-y-hidden rounded-card-large bg-well-surface text-body text-foreground shadow-discussion-long-well focus-visible:inset-shadow-focus"
    >
      {/* A minimum-content row preserves every seat on narrow hosts without shrinking the pixel grid. */}
      <div className="flex h-full min-w-max items-center gap-2 pr-3.5 pl-2">
        <span className="flex h-10 shrink-0 items-center rounded-card-large bg-discussion-long-capsule px-3 font-serif text-card-title leading-none font-bold shadow-discussion-long-capsule">
          {centerLabel}
        </span>
        {layout.seats.map((seat) => {
          const connection = connections.get(seat.id);
          return (
            <Fragment key={seat.id}>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="relative flex" style={{ transform: `translateY(${seat.lift}px)` }}>
                  {/* Static box shadow is a sibling of the moving sprite, avoiding a repainting filter. */}
                  {seat.state === "speaking" ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-tag shadow-discussion-long-speaker"
                    />
                  ) : null}
                  <PixelSeat
                    seatIndex={seat.seatIndex}
                    {...(seat.role === undefined ? {} : { role: seat.role })}
                    state={seat.state}
                    size={seat.size}
                    label={seat.label}
                  />
                  {seat.interjection && seat.interjection.count > 0 && seat.state !== "speaking" ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span
                            role="img"
                            aria-label={seat.interjection.label}
                            tabIndex={0}
                            className="absolute -bottom-1.25 -left-2.5 flex h-3.75 min-w-4 -rotate-8 items-center justify-center rounded-discussion-long-note bg-foreground px-0.5 text-discussion-long-note font-bold text-primary-foreground shadow-primary-edge"
                          />
                        }
                      >
                        {seat.interjection.count}
                      </TooltipTrigger>
                      <TooltipPopup>{seat.interjection.label}</TooltipPopup>
                    </Tooltip>
                  ) : null}
                </span>
                <LongTableLabel
                  label={seat.label}
                  className={cn(
                    seat.state === "speaking" && "font-bold",
                    seat.state === "next" && "text-secondary-label",
                  )}
                />
                {seat.state === "speaking" ? <PxWave seatIndex={seat.seatIndex} /> : null}
                {seat.tags?.map((tag) => (
                  <LongTableLabel
                    key={`${tag.tone}-${tag.label}`}
                    label={tag.label}
                    className={cn(
                      "flex h-5 shrink-0 items-center text-secondary-copy font-semibold",
                      tag.tone === "outline"
                        ? "rounded-discussion-table-outline px-1.5"
                        : "rounded-tag px-2",
                      TAG_CLASSES[tag.tone],
                    )}
                  />
                ))}
              </span>
              {connection ? (
                <span
                  aria-hidden="true"
                  className="flex min-w-3.5 flex-1 items-center gap-1"
                  style={
                    {
                      "--discussion-connection-from": discussionSeatColor(
                        connection.fromSeatIndex + 1,
                      ).color,
                      "--discussion-connection-to": discussionSeatColor(connection.toSeatIndex + 1)
                        .color,
                      opacity: connection.opacity,
                    } as CSSProperties
                  }
                >
                  <span
                    className={cn(
                      "min-w-3.5 flex-1 rounded-discussion-long-line",
                      connection.kind === "completed"
                        ? "bg-discussion-long-connection"
                        : "border-t border-foreground",
                    )}
                    style={
                      connection.kind === "completed"
                        ? { height: connection.width }
                        : {
                            borderTopWidth: connection.width,
                            borderTopStyle: connection.dash ? "dashed" : "solid",
                          }
                    }
                  />
                  {/* Linear rows expose the orbit's return as a static turn-back, never a second avatar. */}
                  {connection.closing ? (
                    <span className="text-secondary-copy text-foreground">↶</span>
                  ) : null}
                </span>
              ) : null}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
