/** Renders accessible HTML/SVG 8a seat tiles; each instance references the shared identity sprite. */
import type { DiscussionPersonaAvatar } from "@t3tools/contracts";
import { CheckIcon } from "lucide-react";
import { useId, useInsertionEffect, type CSSProperties } from "react";
import { cn } from "~/lib/utils";
import { pixelSeatAppearance, type PixelSeatState } from "./PixelSeat.logic";
import { acquirePixelSeatSprites, pixelSeatSymbolId } from "./PixelSeat.sprites";
import { discussionSeatColor } from "./discussionSeatColors";
import "./discussionMotion";

/**
 * Seat-position color and identity artwork remain independent when seats are reordered.
 * @param props.seatIndex Zero-based speaking position; invalid positions use neutral.
 * @param props.role Existing persona avatar or user; defaults to architect, including unknown input.
 * @param props.state Occurrence appearance; only speaking animates the sprite.
 * @param props.size Positive tile width and height in CSS pixels; pixels scale in integer steps.
 * @param props.label Accessible image name, supplied by the caller's localized identity label.
 * @returns A tile with a static halo, recessed next state, or completion badge where applicable.
 */
export function PixelSeat({
  seatIndex,
  role,
  state,
  size,
  label,
}: {
  readonly seatIndex: number;
  readonly role?: DiscussionPersonaAvatar | "user";
  readonly state: PixelSeatState;
  readonly size: number;
  readonly label: string;
}) {
  useInsertionEffect(acquirePixelSeatSprites, []);
  const appearance = pixelSeatAppearance(role, state, size);
  return (
    <span
      role="img"
      aria-label={label}
      data-discussion-pixel-seat=""
      className="relative inline-flex shrink-0 rounded-discussion-seat align-middle"
      style={
        {
          width: size,
          height: size,
          "--discussion-seat-color": discussionSeatColor(
            appearance.role === "user" ? 0 : seatIndex + 1,
          ).color,
          "--discussion-seat-radius": appearance.radius,
          "--discussion-seat-halo-radius": `${Math.round(size * 0.3) + 4}px`,
          "--discussion-seat-outline-opacity": `${appearance.outlineOpacity * 100}%`,
        } as CSSProperties
      }
    >
      {appearance.halo ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 rounded-discussion-seat-halo shadow-discussion-seat-halo"
        />
      ) : null}
      <span
        aria-hidden="true"
        className={cn(
          "relative flex size-full items-end justify-center rounded-discussion-seat",
          appearance.plate === "user"
            ? "bg-secondary shadow-discussion-seat-user"
            : appearance.plate === "recessed"
              ? "bg-discussion-seat-next shadow-discussion-seat-next"
              : "bg-discussion-seat-plate shadow-discussion-seat",
        )}
        style={{ paddingBottom: appearance.bottomPadding }}
      >
        {appearance.plate === "recessed" ? (
          <span className="pointer-events-none absolute inset-0 rounded-discussion-seat border border-dashed border-discussion-seat-outline" />
        ) : null}
        <span
          className={cn(
            "flex overflow-hidden rounded-b-discussion-seat",
            appearance.desaturated && "grayscale",
          )}
          style={{ opacity: appearance.spriteOpacity }}
        >
          <svg
            width={appearance.spriteSize}
            height={appearance.spriteSize}
            viewBox="0 0 12 12"
            shapeRendering="crispEdges"
            className="block shrink-0"
            data-discussion-motion={appearance.bob ? "spriteBob" : undefined}
          >
            <use href={`#${pixelSeatSymbolId(appearance.role)}`} />
          </svg>
        </span>
      </span>
      {appearance.badgeSize > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -right-0.75 -bottom-0.75 flex items-center justify-center rounded-full bg-sidebar text-success-foreground"
          style={{ width: appearance.badgeSize, height: appearance.badgeSize }}
        >
          <CheckIcon size={appearance.badgeSize - 4} strokeWidth={3.5} />
        </span>
      ) : null}
    </span>
  );
}

/**
 * SVG-only seat for the round table; shares identity, state and sprite lifetime with the HTML tile.
 * @param props.seatIndex Zero-based color position; user always uses neutral.
 * @param props.role Existing avatar identity; omitted/unknown identities default to architect.
 * @param props.state Only speaking animates; other appearances use the shared S1 rules.
 * @param props.size Positive tile side in SVG user units, matching CSS pixels at the native canvas size.
 * @param props.label Localized accessible name.
 * @returns A g rooted at (0,0), with static SVG plate layers and an independently moving sprite.
 */
export function PixelSeatSvg({
  seatIndex,
  role,
  state,
  size,
  label,
}: {
  readonly seatIndex: number;
  readonly role?: DiscussionPersonaAvatar | "user";
  readonly state: PixelSeatState;
  readonly size: number;
  readonly label: string;
}) {
  useInsertionEffect(acquirePixelSeatSprites, []);
  const id = useId();
  const appearance = pixelSeatAppearance(role, state, size);
  const radius = appearance.role === "user" ? size / 2 : Math.round(size * 0.3);
  const spriteX = (size - appearance.spriteSize) / 2;
  const spriteY = size - appearance.spriteSize - appearance.bottomPadding;
  return (
    <g
      role="img"
      aria-label={label}
      style={
        {
          "--discussion-seat-color": discussionSeatColor(
            appearance.role === "user" ? 0 : seatIndex + 1,
          ).color,
          "--discussion-seat-outline-opacity": `${appearance.outlineOpacity * 100}%`,
        } as CSSProperties
      }
    >
      <defs>
        <linearGradient id={`${id}-plate`} x1="33%" y1="0" x2="67%" y2="100%">
          <stop offset="0" className="discussion-svg-seat-top" />
          <stop offset="1" className="discussion-svg-seat-bottom" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <rect width={size} height={size} rx={radius} />
        </clipPath>
        {/* Only the static recessed plate is filtered; the moving sprite is a separate sibling. */}
        <filter
          id={`${id}-recessed`}
          colorInterpolationFilters="sRGB"
          className="text-discussion-pixel-black"
        >
          <feGaussianBlur in="SourceAlpha" stdDeviation={1.5} />
          <feOffset dx={1} dy={2} result="offset" />
          <feComposite in="SourceAlpha" in2="offset" operator="out" result="edge" />
          <feFlood floodColor="currentColor" floodOpacity={0.55} />
          <feComposite in2="edge" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="shadow" />
          </feMerge>
        </filter>
      </defs>
      {appearance.halo ? (
        <rect
          x={-4}
          y={-4}
          width={size + 8}
          height={size + 8}
          rx={radius + 4}
          fill="none"
          strokeWidth={2}
          className="discussion-svg-seat-halo"
        />
      ) : null}
      {appearance.plate !== "recessed" ? (
        <rect
          y={1.5}
          width={size}
          height={size}
          rx={radius}
          fill="currentColor"
          className="text-raise-edge"
        />
      ) : null}
      <rect
        width={size}
        height={size}
        rx={radius}
        fill={appearance.plate === "raised" ? `url(#${id}-plate)` : "currentColor"}
        filter={appearance.plate === "recessed" ? `url(#${id}-recessed)` : undefined}
        className={appearance.plate === "user" ? "text-secondary" : "text-discussion-seat-next"}
      />
      <rect
        x={0.5}
        y={0.5}
        width={size - 1}
        height={size - 1}
        rx={radius - 0.5}
        fill="none"
        strokeWidth={1}
        strokeDasharray={appearance.plate === "recessed" ? "3 3" : undefined}
        className={
          appearance.plate === "user"
            ? "discussion-svg-user-outline"
            : appearance.plate === "recessed"
              ? "discussion-svg-seat-next-outline"
              : "discussion-svg-seat-outline"
        }
      />
      <g clipPath={`url(#${id}-clip)`}>
        {appearance.plate !== "recessed" ? (
          <rect
            x={0.5}
            y={1}
            width={size - 1}
            height={size}
            rx={radius}
            fill="none"
            stroke="currentColor"
            className="text-discussion-seat-highlight"
          />
        ) : null}
        <g
          opacity={appearance.spriteOpacity}
          className={appearance.desaturated ? "grayscale" : undefined}
        >
          <svg
            x={spriteX}
            y={spriteY}
            width={appearance.spriteSize}
            height={appearance.spriteSize}
            viewBox="0 0 12 12"
            shapeRendering="crispEdges"
            data-discussion-motion={appearance.bob ? "spriteBob" : undefined}
          >
            <use href={`#${pixelSeatSymbolId(appearance.role)}`} />
          </svg>
        </g>
      </g>
      {appearance.badgeSize > 0 ? (
        <g
          transform={`translate(${size + 3 - appearance.badgeSize}, ${size + 3 - appearance.badgeSize})`}
        >
          <circle
            cx={appearance.badgeSize / 2}
            cy={appearance.badgeSize / 2}
            r={appearance.badgeSize / 2}
            fill="currentColor"
            className="text-sidebar"
          />
          <svg
            x={2}
            y={2}
            width={appearance.badgeSize - 4}
            height={appearance.badgeSize - 4}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-success-foreground"
          >
            <path d="m20 6-11 11-5-5" />
          </svg>
        </g>
      ) : null}
    </g>
  );
}
