/** Renders an accessible 8a seat tile; each instance references the shared identity sprite. */
import type { DiscussionPersonaAvatar } from "@t3tools/contracts";
import { CheckIcon } from "lucide-react";
import { useInsertionEffect, type CSSProperties } from "react";
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
