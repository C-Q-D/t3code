/** Resolves identity and 8a seat appearance without DOM, provider, or discussion lifecycle state. */
import type { DiscussionPersonaAvatar } from "@t3tools/contracts";

/** The four visual states assigned by a discussion's current seat occurrence. */
export type PixelSeatState = "idle" | "speaking" | "next" | "done";

/**
 * Resolves persisted or optional avatar input without allowing prototype names as sprite keys.
 * @param role Existing persona avatar or user; omitted and unknown values use architect.
 * @returns A supported identity, independently of seat position.
 */
export function pixelSeatRole(role: unknown): DiscussionPersonaAvatar | "user" {
  switch (role) {
    case "architect":
    case "opponent":
    case "implementer":
    case "reviewer":
    case "product":
    case "user":
      return role;
    default:
      return "architect";
  }
}

/**
 * Applies S1's state, pixel scaling, and user-avatar exceptions.
 * @param role Existing avatar input; unknown values fall back to architect.
 * @param state Occurrence state; only speaking enables the sprite's animation.
 * @param size Positive tile size in CSS pixels, as supplied by the layout.
 * @returns Sprite geometry, plate variant, motion and completion badge size (zero means hidden).
 */
export function pixelSeatAppearance(role: unknown, state: PixelSeatState, size: number) {
  const identity = pixelSeatRole(role);
  const isUser = identity === "user";
  const pixelScale = size <= 20 ? 1 : Math.max(1, Math.round((size - 4) / 12));
  return {
    role: identity,
    plate: isUser ? "user" : state === "next" ? "recessed" : "raised",
    spriteSize: pixelScale * 12,
    bottomPadding: pixelScale === 1 ? 1 : 0,
    radius: isUser ? "50%" : `${Math.round(size * 0.3)}px`,
    bob: state === "speaking",
    halo: !isUser && state === "speaking",
    outlineOpacity: state === "speaking" ? 0.7 : 0.45,
    desaturated: !isUser && state === "next",
    spriteOpacity: !isUser && state === "next" ? 0.45 : 1,
    badgeSize: !isUser && state === "done" && size > 20 ? Math.round(size * 0.42) : 0,
  } as const;
}
