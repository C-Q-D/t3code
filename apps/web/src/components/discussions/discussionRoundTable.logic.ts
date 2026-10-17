/** Maps presentation seats to the 8a circular geometry; no discussion lifecycle decisions live here. */
import type { DiscussionPersonaAvatar } from "@t3tools/contracts";
import type { PixelSeatState } from "./PixelSeat.logic";

/** Localized annotation supplied by the page, including paused/failure/summarizer labels. */
export interface DiscussionSeatTag {
  readonly label: string;
  readonly tone: "info" | "warning" | "error" | "neutral" | "outline";
}

/** A stable physical seat; its zero-based color index does not change with the current turn order. */
export interface DiscussionTableSeat {
  readonly id: string;
  readonly seatIndex: number;
  readonly role?: DiscussionPersonaAvatar;
  readonly label: string;
  readonly state: PixelSeatState;
  /** Completed turn for arc styling; separate from the summarizer's done/check avatar state. */
  readonly completed?: boolean;
  readonly tags?: readonly DiscussionSeatTag[];
  readonly interjection?: { readonly count: number; readonly label: string };
}

/** G1–G7 use the 360×410 state canvas, including the user at the bottom of the orbit. */
export const ROUND_TABLE = {
  width: 360,
  height: 410,
  centerX: 180,
  centerY: 200,
  radius: 160,
  tableRadius: 96,
  userY: 360,
  gapDegrees: 12,
} as const;

/**
 * Places a point on the design's clockwise orbit, rounding as the handoff's pt() does.
 * @param degrees SVG angle in degrees: -90 is above the table; angles may exceed 360.
 * @returns CSS-pixel coordinates rounded to one decimal place.
 */
export function roundTablePoint(degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: Number((ROUND_TABLE.centerX + ROUND_TABLE.radius * Math.cos(radians)).toFixed(1)),
    y: Number((ROUND_TABLE.centerY + ROUND_TABLE.radius * Math.sin(radians)).toFixed(1)),
  };
}

/**
 * Keeps physical positions stable while choosing the handoff's normal/dense avatar sizes.
 * @param seats Unique seat ids in physical clockwise order; empty and singleton previews are supported.
 * @returns Positioned seats with outside-label direction and one animated speaker at most.
 * @throws RangeError when ids repeat; turn references would otherwise be ambiguous.
 */
export function roundTableLayout(
  seats: readonly DiscussionTableSeat[],
): RoundTablePositionedSeat[] {
  if (new Set(seats.map((seat) => seat.id)).size !== seats.length) {
    throw new RangeError("Round-table seat ids must be unique");
  }
  const count = seats.length;
  // 讨论页-8a v3 状态.dc.html:87,105 ties the 160° dense orbit to k > 4 (38px seats).
  // 讨论列表与新建-8a.dc.html:263 independently names >4 as the threshold for a longer arc.
  const span = count < 2 ? 0 : count === 2 ? 90 : count <= 4 ? 120 : 160;
  const step = count > 1 ? span / (count - 1) : 0;
  const speaker = seats.findIndex((seat) => seat.state === "speaking");
  return seats.map((seat, index) => {
    const angle = -90 - span / 2 + index * step;
    // A transient duplicate speaker must not start another continuous animation.
    const state = seat.state === "speaking" && index !== speaker ? "idle" : seat.state;
    const size = state === "speaking" ? 48 : count > 4 ? 38 : 44;
    const labelsAbove = Math.sin((angle * Math.PI) / 180) < -0.9;
    return {
      ...seat,
      state,
      angle,
      ...roundTablePoint(angle),
      size,
      labelsAbove,
    };
  });
}

/** Physical orbit position in CSS pixels, with outside-label direction for the SVG renderer. */
export interface RoundTablePositionedSeat extends DiscussionTableSeat {
  readonly angle: number;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly labelsAbove: boolean;
}

/**
 * Trims the orbit around both seats and draws clockwise, including the long arc behind the user.
 * @param fromDegrees Source physical angle in degrees.
 * @param toDegrees Destination physical angle; a smaller angle wraps through the bottom of the table.
 * @returns Arc endpoints and an SVG path, or null if no room remains after both 12-degree gaps.
 */
export function roundTableArc(fromDegrees: number, toDegrees: number) {
  const sweep = (((toDegrees - fromDegrees) % 360) + 360) % 360;
  if (sweep <= ROUND_TABLE.gapDegrees * 2) return null;
  const start = roundTablePoint(fromDegrees + ROUND_TABLE.gapDegrees);
  const end = roundTablePoint(fromDegrees + sweep - ROUND_TABLE.gapDegrees);
  const largeArc = sweep - ROUND_TABLE.gapDegrees * 2 > 180 ? 1 : 0;
  return {
    start,
    end,
    path: `M${start.x} ${start.y} A${ROUND_TABLE.radius} ${ROUND_TABLE.radius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
  };
}

/**
 * Connects actual speaking order without moving physical seats or choosing a discussion phase.
 * @param seats Positioned seats from roundTableLayout.
 * @param options.order Explicit ids for last statements; omitted uses physical order.
 * @param options.closeLoop Defaults to true; false leaves the supplied statement sequence open.
 * @param options.quiet Defaults to false; true makes all arcs faint solid for summary/ended views.
 * @returns Visible clockwise segments with completed/next/pending styling semantics and stable colors.
 * @throws RangeError for unknown or repeated ids in the explicit order.
 */
export function roundTableSegments(
  seats: readonly RoundTablePositionedSeat[],
  options: {
    readonly order?: readonly string[];
    readonly closeLoop?: boolean;
    readonly quiet?: boolean;
  } = {},
) {
  const byId = new Map(seats.map((seat) => [seat.id, seat]));
  const ids = options.order ?? seats.map((seat) => seat.id);
  if (new Set(ids).size !== ids.length || ids.some((id) => !byId.has(id))) {
    throw new RangeError("Round-table order must reference unique existing seat ids");
  }
  const ordered = ids.map((id) => byId.get(id)!);
  return ordered.flatMap((from, index) => {
    const closing = index === ordered.length - 1;
    if (closing && (options.closeLoop === false || ordered.length < 2)) return [];
    const to = ordered[(index + 1) % ordered.length]!;
    const geometry = roundTableArc(from.angle, to.angle);
    if (!geometry) return [];
    const kind = options.quiet
      ? "quiet"
      : closing
        ? "pending"
        : (from.completed ?? from.state === "done")
          ? "completed"
          : from.state === "speaking" && to.state === "next"
            ? "next"
            : "pending";
    return [
      {
        ...geometry,
        fromId: from.id,
        toId: to.id,
        fromSeatIndex: from.seatIndex,
        toSeatIndex: to.seatIndex,
        kind,
        width: closing || kind === "next" || kind === "pending" ? 1.5 : 2.5,
        opacity: kind === "completed" ? 0.7 : kind === "next" ? 0.3 : 0.13,
        dash: kind === "next" || kind === "pending" ? "4 5" : undefined,
      },
    ];
  });
}

/**
 * Limits the outside seat label without cutting a supplementary Unicode character in half.
 * @param label Full localized identity label; retained separately for the SVG title.
 * @returns At most six characters plus an ellipsis, as specified by S6.
 */
export function roundTableSeatLabel(label: string) {
  const characters = Array.from(label);
  return characters.length > 6 ? `${characters.slice(0, 6).join("")}…` : label;
}

/**
 * Fits the handoff's 20px badges in centered rows, without measuring or changing the DOM.
 * @param tags Localized page annotations; empty input occupies no vertical space.
 * @returns Badge rectangles with a 4px gap and 120px row limit, plus their total height.
 */
export function roundTableTagLayout(tags: readonly DiscussionSeatTag[]) {
  const rows: { tag: DiscussionSeatTag; width: number }[][] = [];
  let row: { tag: DiscussionSeatTag; width: number }[] = [];
  let usedWidth = 0;
  for (const tag of tags) {
    // A CJK glyph occupies 12px; Latin glyphs use half an em for these short status labels.
    const textWidth = Array.from(tag.label).reduce(
      (sum, character) => sum + (character.charCodeAt(0) > 127 ? 12 : 6),
      0,
    );
    const width = Math.min(120, textWidth + 16);
    const gap = row.length > 0 ? 4 : 0;
    if (usedWidth + gap + width > 120 && row.length > 0) {
      rows.push(row);
      row = [];
      usedWidth = 0;
    }
    usedWidth += (row.length > 0 ? 4 : 0) + width;
    row.push({ tag, width });
  }
  if (row.length > 0) rows.push(row);
  return {
    height: rows.length > 0 ? rows.length * 24 - 4 : 0,
    badges: rows.flatMap((badges, rowIndex) => {
      const rowWidth =
        badges.reduce((sum, badge) => sum + badge.width, 0) + (badges.length - 1) * 4;
      let x = -rowWidth / 2;
      return badges.map((badge) => {
        const positioned = { ...badge, x, y: rowIndex * 24 };
        x += badge.width + 4;
        return positioned;
      });
    }),
  };
}
