/** Renders the shared discussion sprites in a static tile; turn-state animation belongs to the discussion view. */
import type { DiscussionPersonaAvatar } from "@t3tools/contracts";
import { CheckIcon } from "lucide-react";
import { t } from "~/i18n";
import { discussionSeatColor } from "./discussionSeatColors";

const MAPS = {
  architect: [
    "....yyyy....",
    "...yyyyyy...",
    "..yyyyyyyy..",
    ".YYYYYYYYYY.",
    "..ssssssss..",
    "..skssssks..",
    "..ssssssss..",
    "...ssmmss...",
    "....ssss....",
    "..ccwwwwcc..",
    ".cccwwwwccc.",
    ".ccccwwcccc.",
  ],
  opponent: [
    ".r........r.",
    ".rr......rr.",
    "..rhhhhhhr..",
    "..hhhhhhhh..",
    "..hksssskh..",
    "..skssssks..",
    "..ssssssss..",
    "..sssssmms..",
    "...ssssss...",
    "..cccccccc..",
    ".cccccccccc.",
    ".cccccccccc.",
  ],
  implementer: [
    "...hhhhhh...",
    "..hhhhhhhh..",
    "..cccccccc..",
    "..hssssssh..",
    "..ssssssss..",
    "..skssssks..",
    "..ssssssss..",
    "...smmmms...",
    "....ssss...g",
    "..cdccccdc.g",
    ".ccdccccdcgg",
    ".cccccccccg.",
  ],
  reviewer: [
    "...hhhhhh...",
    "..hhhhhhhh..",
    "..hssssssh..",
    "..ssssssss..",
    ".kkkkskkkkk.",
    ".kwkkskkwkk.",
    "..ssssssss..",
    "...ssmmss...",
    "....ssss....",
    "..cccccccc..",
    ".cccccccccc.",
    ".cccccccccc.",
  ],
  product: [
    "............",
    "...cccccc...",
    "..cccccccc..",
    ".ddddddddd..",
    "..ssssssss..",
    "..skssssks..",
    "..ssssssss..",
    "...smmmms...",
    "....ssss....",
    "..wwccccww..",
    ".wwccccccww.",
    ".wccccccccww",
  ],
  user: [
    "..y..yy..y..",
    "..yyyyyyyy..",
    "..yryyyyry..",
    "..hhhhhhhh..",
    "..hssssssh..",
    "..skssssks..",
    "..ssssssss..",
    "...smmmms...",
    "....ssss....",
    "..nnnnnnnn..",
    ".nnnnnnnnnn.",
    ".nnnnnnnnnn.",
  ],
} as const;
const PAL: Readonly<Record<string, string>> = {
  s: "#f5c9a0",
  k: "#1c1917",
  h: "#4a3426",
  m: "#c2410c",
  y: "#facc15",
  Y: "#ca8a04",
  w: "#f8fafc",
  r: "#ef4444",
  g: "#a1a1aa",
  n: "#71717a",
};

/**
 * Static avatar with a seat-colored outfit and a localized accessible name.
 * @param props.role Persona sprite, or the user's nonassignable sprite.
 * @param props.seat Zero for neutral previews; positive integer for speaking order.
 * @param props.size Tile dimensions in CSS pixels; sprite pixels remain integer-scaled.
 * @param props.state Turn appearance; idle preserves existing callers. No state adds animation.
 * @returns A fixed-size tile; done adds a check only above 20 CSS pixels.
 */
export function PixelAvatar({
  role,
  seat,
  size,
  state = "idle",
}: {
  readonly role: DiscussionPersonaAvatar | "user";
  readonly seat: number;
  readonly size: number;
  readonly state?: "idle" | "speaking" | "next" | "done";
}) {
  const isUser = role === "user";
  const color = discussionSeatColor(isUser ? 0 : seat).color;
  const fills: Readonly<Record<string, string>> = {
    ...PAL,
    c: color,
    d: `color-mix(in srgb, ${color} 60%, #000)`,
  };
  const spriteSize = size <= 20 ? 12 : Math.round((size - 4) / 12) * 12;
  return (
    <span
      role="img"
      aria-label={t.settings.discussions.avatars[role]}
      className="relative inline-flex shrink-0 align-middle"
      style={{ width: size, height: size }}
    >
      <span
        className="flex size-full items-end justify-center overflow-hidden"
        style={{
          borderRadius: isUser ? "50%" : Math.round(size * 0.3),
          background:
            state === "next"
              ? "transparent"
              : isUser
                ? "color-mix(in srgb, var(--foreground) 8%, var(--background))"
                : `linear-gradient(160deg, color-mix(in srgb, ${color} 34%, var(--background)), color-mix(in srgb, ${color} 10%, var(--background)))`,
          boxShadow:
            state === "next"
              ? "none"
              : `inset 0 0 0 1px color-mix(in srgb, ${isUser ? "var(--foreground)" : color} ${isUser ? 14 : state === "speaking" ? 70 : 45}%, transparent)`,
          border:
            state === "next"
              ? `1px dashed color-mix(in srgb, ${color} 65%, transparent)`
              : undefined,
        }}
      >
        <svg
          aria-hidden="true"
          width={spriteSize}
          height={spriteSize}
          viewBox="0 0 12 12"
          shapeRendering="crispEdges"
          className="block shrink-0"
          style={{
            marginBottom: size <= 20 ? 1 : 0,
            opacity: state === "next" ? 0.45 : undefined,
            filter: state === "next" ? "grayscale(1)" : undefined,
          }}
        >
          {MAPS[role].flatMap((row, y) =>
            [...row].flatMap((character, x) =>
              character === "."
                ? []
                : [
                    <rect
                      key={`${x}:${y}`}
                      x={x}
                      y={y}
                      width={1.02}
                      height={1.02}
                      fill={fills[character]}
                    />,
                  ],
            ),
          )}
        </svg>
      </span>
      {state === "done" && size > 20 ? (
        <span
          aria-hidden="true"
          className="absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-full bg-background text-success-foreground"
        >
          <CheckIcon className="size-2.5" />
        </span>
      ) : null}
    </span>
  );
}
