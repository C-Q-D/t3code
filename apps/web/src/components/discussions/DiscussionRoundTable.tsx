/** SVG-only 8a round table; the page supplies localized labels, visual states and actual turn order. */
import { useId, type CSSProperties } from "react";
import { PixelSeatSvg } from "./PixelSeat";
import { discussionSeatColor } from "./discussionSeatColors";
import {
  ROUND_TABLE,
  roundTableLayout,
  roundTableSeatLabel,
  roundTableSegments,
  roundTableTagLayout,
  type DiscussionTableSeat,
} from "./discussionRoundTable.logic";

const WAVE_BARS = [
  ["0.9s", "0s"],
  ["1.08s", "-0.18s"],
  ["0.96s", "-0.36s"],
  ["1.26s", "-0.10s"],
  ["1.02s", "-0.28s"],
] as const;

const TAG_CLASSES = {
  info: "text-info",
  warning: "text-status-warning-foreground",
  error: "text-status-error-foreground",
  neutral: "text-secondary-label",
  outline: "text-secondary-label",
} as const;
const TAG_BACKGROUNDS = {
  info: "text-status-info",
  warning: "text-warning-surface",
  error: "text-status-error",
  neutral: "text-secondary",
  outline: "text-border",
} as const;

/**
 * Renders the G1–G7 state canvas, with no HTML, foreignObject, lifecycle mutation or animated filters.
 * @param props.seats Physical clockwise seats; seatIndex keeps color independent of role/turn order.
 * @param props.label Localized accessible description for the complete table.
 * @param props.centerLabel Round/last-statement/summary title supplied by the page.
 * @param props.subtitle Localized line below the central title.
 * @param props.userLabel Localized label for the user's neutral bottom seat.
 * @param props.order Optional actual statement sequence, referencing unique existing seat ids.
 * @param props.closeLoop Defaults to true; pass false for a finite last-statement sequence.
 * @param props.quiet Defaults to false; true draws faint solid arcs for summary/ended views.
 * @returns A 360×410 SVG; only the first speaking seat and its five bars can animate.
 * @throws RangeError for ambiguous seat ids or invalid explicit order references.
 */
export function DiscussionRoundTable({
  seats,
  label,
  centerLabel,
  subtitle,
  userLabel,
  order,
  closeLoop = true,
  quiet = false,
}: {
  readonly seats: readonly DiscussionTableSeat[];
  readonly label: string;
  readonly centerLabel: string;
  readonly subtitle: string;
  readonly userLabel: string;
  readonly order?: readonly string[];
  readonly closeLoop?: boolean;
  readonly quiet?: boolean;
}) {
  const id = useId();
  const positions = roundTableLayout(seats);
  const segments = roundTableSegments(positions, {
    ...(order === undefined ? {} : { order }),
    closeLoop,
    quiet,
  }).map((segment, index) => ({ ...segment, gradientId: `${id}-arc-${index}` }));
  return (
    <svg
      viewBox={`0 0 ${ROUND_TABLE.width} ${ROUND_TABLE.height}`}
      width={ROUND_TABLE.width}
      height={ROUND_TABLE.height}
      role="group"
      aria-label={label}
      className="overflow-visible text-body text-foreground"
    >
      <defs>
        <radialGradient id={`${id}-stone`} cx="40%" cy="32%" r="90.7%">
          <stop offset="0" stopColor="currentColor" className="text-discussion-table-top" />
          <stop
            offset="0.62"
            stopColor="currentColor"
            className="text-discussion-seat-gradient-top"
          />
          <stop offset="1" stopColor="currentColor" className="text-discussion-table-bottom" />
        </radialGradient>
        {/* Shadow-only filters never contain a moving sprite or waveform. */}
        <filter
          id={`${id}-table-shadow`}
          x="-70%"
          y="-70%"
          width="240%"
          height="240%"
          className="text-discussion-pixel-black"
          colorInterpolationFilters="sRGB"
        >
          <feMorphology in="SourceAlpha" operator="erode" radius={10} />
          <feGaussianBlur stdDeviation={20} />
          <feOffset dx={18} dy={30} result="offset" />
          <feFlood floodColor="currentColor" floodOpacity={0.85} />
          <feComposite in2="offset" operator="in" />
        </filter>
        <filter
          id={`${id}-speaker-shadow`}
          x="-100%"
          y="-100%"
          width="300%"
          height="300%"
          className="text-discussion-pixel-black"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceAlpha" stdDeviation={10} />
          <feOffset dy={8} result="offset" />
          <feFlood floodColor="currentColor" floodOpacity={0.6} />
          <feComposite in2="offset" operator="in" />
        </filter>
        <radialGradient
          id={`${id}-inset`}
          cx="50%"
          cy="0"
          r="100%"
          className="text-discussion-pixel-black"
        >
          <stop offset="0.7" stopColor="currentColor" stopOpacity={0} />
          <stop offset="1" stopColor="currentColor" stopOpacity={0.45} />
        </radialGradient>
        {segments
          .filter((segment) => segment.kind === "completed")
          .map((segment) => (
            <linearGradient
              key={segment.fromId}
              id={segment.gradientId}
              x1={segment.start.x}
              y1={segment.start.y}
              x2={segment.end.x}
              y2={segment.end.y}
              gradientUnits="userSpaceOnUse"
            >
              <stop
                offset="0"
                stopColor="currentColor"
                className={discussionSeatColor(segment.fromSeatIndex + 1).textClassName}
              />
              <stop
                offset="1"
                stopColor="currentColor"
                className={discussionSeatColor(segment.toSeatIndex + 1).textClassName}
              />
            </linearGradient>
          ))}
      </defs>
      <g aria-hidden="true" fill="none" strokeLinecap="round">
        {segments.map((segment) => (
          <path
            key={segment.fromId}
            d={segment.path}
            strokeWidth={segment.width}
            strokeDasharray={segment.dash}
            opacity={segment.opacity}
            stroke={segment.kind === "completed" ? `url(#${segment.gradientId})` : "currentColor"}
          />
        ))}
      </g>
      {/* Static material layers are siblings of the animated sprites, never their filtered ancestors. */}
      <g aria-hidden="true">
        <circle
          cx={ROUND_TABLE.centerX}
          cy={ROUND_TABLE.centerY}
          r={ROUND_TABLE.tableRadius}
          fill="currentColor"
          filter={`url(#${id}-table-shadow)`}
          className="text-discussion-pixel-black"
        />
        <circle
          cx={ROUND_TABLE.centerX}
          cy={ROUND_TABLE.centerY + 6}
          r={ROUND_TABLE.tableRadius}
          fill="currentColor"
          className="text-stone-edge"
        />
        <circle
          cx={ROUND_TABLE.centerX}
          cy={ROUND_TABLE.centerY}
          r={ROUND_TABLE.tableRadius}
          fill={`url(#${id}-stone)`}
          stroke="currentColor"
          className="text-stone-scrim"
        />
        <circle
          cx={ROUND_TABLE.centerX}
          cy={ROUND_TABLE.centerY}
          r={ROUND_TABLE.tableRadius - 1}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="text-discussion-seat-highlight"
        />
        <circle
          cx={ROUND_TABLE.centerX}
          cy={ROUND_TABLE.centerY}
          r={ROUND_TABLE.tableRadius}
          fill={`url(#${id}-inset)`}
          className="text-discussion-pixel-black"
        />
        <circle
          cx={ROUND_TABLE.centerX}
          cy={ROUND_TABLE.centerY}
          r={ROUND_TABLE.tableRadius - 14}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="text-stone-scrim"
        />
      </g>
      <text
        x={180}
        y={197}
        textAnchor="middle"
        className="font-serif text-discussion-table-title font-bold"
        fill="currentColor"
      >
        {centerLabel}
      </text>
      <text
        x={180}
        y={222}
        textAnchor="middle"
        className="text-secondary-copy text-secondary-label"
        fill="currentColor"
      >
        {subtitle}
      </text>
      {positions.map((seat) => {
        const tags = roundTableTagLayout(seat.tags ?? []);
        const nameY = seat.labelsAbove ? -seat.size / 2 - 8 : seat.size / 2 + 18;
        const tagsY = seat.labelsAbove ? -seat.size / 2 - 30 - tags.height : nameY + 6;
        return (
          <g key={seat.id} transform={`translate(${seat.x}, ${seat.y})`}>
            {seat.state === "speaking" ? (
              <rect
                x={-seat.size / 2}
                y={-seat.size / 2}
                width={seat.size}
                height={seat.size}
                rx={Math.round(seat.size * 0.3)}
                fill="currentColor"
                filter={`url(#${id}-speaker-shadow)`}
                className="text-discussion-pixel-black"
                aria-hidden="true"
              />
            ) : null}
            <g transform={`translate(${-seat.size / 2}, ${-seat.size / 2})`}>
              <PixelSeatSvg
                seatIndex={seat.seatIndex}
                {...(seat.role === undefined ? {} : { role: seat.role })}
                state={seat.state}
                size={seat.size}
                label={seat.label}
              />
              {seat.interjection && seat.interjection.count > 0 && seat.state !== "speaking" ? (
                <g
                  transform={`translate(-18, ${seat.size - 14}) rotate(-8, 11, 10)`}
                  role="img"
                  aria-label={seat.interjection.label}
                >
                  <title>{seat.interjection.label}</title>
                  <rect
                    y={2}
                    width={22}
                    height={20}
                    rx="var(--radius-discussion-table-note)"
                    fill="currentColor"
                    className="text-raise-primary-edge"
                  />
                  <rect
                    width={22}
                    height={20}
                    rx="var(--radius-discussion-table-note)"
                    fill="currentColor"
                    className="text-foreground"
                  />
                  <text
                    x={11}
                    y={14}
                    textAnchor="middle"
                    fill="currentColor"
                    className="text-meta font-bold text-primary-foreground"
                  >
                    {seat.interjection.count}
                  </text>
                </g>
              ) : null}
            </g>
            <text
              x={0}
              y={nameY}
              textAnchor="middle"
              fill="currentColor"
              className={
                seat.state === "next"
                  ? "text-secondary-label"
                  : seat.state === "speaking"
                    ? "font-bold"
                    : undefined
              }
            >
              <title>{seat.label}</title>
              {roundTableSeatLabel(seat.label)}
            </text>
            {seat.state === "speaking" ? (
              <g
                transform={`translate(${Array.from(roundTableSeatLabel(seat.label)).length * 7 + 5}, ${nameY - 12})`}
                className={discussionSeatColor(seat.seatIndex + 1).textClassName}
                aria-hidden="true"
              >
                {WAVE_BARS.map(([duration, delay], index) => (
                  <g key={duration} transform={`translate(${index * 4}, 0)`}>
                    <rect
                      width={2}
                      height={14}
                      rx="var(--radius-discussion-wave)"
                      fill="currentColor"
                      data-discussion-wave-bar=""
                      data-discussion-motion="seatWave"
                      style={
                        {
                          "--discussion-wave-duration": duration,
                          "--discussion-wave-delay": delay,
                          transformBox: "fill-box",
                        } as CSSProperties
                      }
                    />
                  </g>
                ))}
              </g>
            ) : null}
            {tags.badges.map(({ tag, width, x, y }) => (
              <g key={`${tag.tone}-${tag.label}`} transform={`translate(${x}, ${tagsY + y})`}>
                <rect
                  width={width}
                  height={20}
                  rx={
                    tag.tone === "outline"
                      ? "var(--radius-discussion-table-outline)"
                      : "var(--radius-discussion-table-tag)"
                  }
                  fill={tag.tone === "outline" ? "none" : "currentColor"}
                  stroke={tag.tone === "outline" ? "currentColor" : "none"}
                  className={TAG_BACKGROUNDS[tag.tone]}
                />
                <text
                  x={width / 2}
                  y={14}
                  textAnchor="middle"
                  fill="currentColor"
                  className={`text-secondary-copy font-semibold ${TAG_CLASSES[tag.tone]}`}
                >
                  <title>{tag.label}</title>
                  {roundTableSeatLabel(tag.label)}
                </text>
              </g>
            ))}
          </g>
        );
      })}
      <g transform={`translate(158, ${ROUND_TABLE.userY - 22})`}>
        <PixelSeatSvg seatIndex={0} role="user" state="idle" size={44} label={userLabel} />
        <text x={22} y={64} textAnchor="middle" fill="currentColor" className="font-semibold">
          {userLabel}
        </text>
      </g>
    </svg>
  );
}
