/** Checks identity fallback and S1 appearance contracts, without rendering or asserting CSS classes. */
import { describe, expect, it } from "vite-plus/test";
import { pixelSeatAppearance, pixelSeatRole } from "./PixelSeat.logic";
import { PIXEL_SEAT_SPRITES } from "./PixelSeat.sprites";

describe("8a pixel seat", () => {
  it("maps existing roles to their distinct handoff artwork", () => {
    expect([
      PIXEL_SEAT_SPRITES[pixelSeatRole("architect")][0],
      PIXEL_SEAT_SPRITES[pixelSeatRole("opponent")][0],
      PIXEL_SEAT_SPRITES[pixelSeatRole("implementer")][10],
      PIXEL_SEAT_SPRITES[pixelSeatRole("reviewer")][4],
      PIXEL_SEAT_SPRITES[pixelSeatRole("product")][3],
      PIXEL_SEAT_SPRITES[pixelSeatRole("user")][0],
    ]).toEqual([
      "....yyyy....",
      ".r........r.",
      ".ccdccccdcgg",
      ".kkkkskkkkk.",
      ".ddddddddd..",
      "..y..yy..y..",
    ]);
  });

  it("defaults omitted, missing and prototype-shaped identities to architect", () => {
    expect([
      pixelSeatRole(undefined),
      pixelSeatRole("missing"),
      pixelSeatRole("toString"),
      pixelSeatRole("__proto__"),
      pixelSeatRole(null),
    ]).toEqual(["architect", "architect", "architect", "architect", "architect"]);
  });

  it.each([
    ["idle", "raised", false, false, 0.45, false, 1, 0],
    ["speaking", "raised", true, true, 0.7, false, 1, 0],
    ["next", "recessed", false, false, 0.45, true, 0.45, 0],
    ["done", "raised", false, false, 0.45, false, 1, 17],
  ] as const)(
    "%s applies only its specified motion, plate, outline and badge",
    (state, plate, bob, halo, outlineOpacity, desaturated, spriteOpacity, badgeSize) => {
      const appearance = pixelSeatAppearance("opponent", state, 40);
      expect({
        plate: appearance.plate,
        bob: appearance.bob,
        halo: appearance.halo,
        outlineOpacity: appearance.outlineOpacity,
        desaturated: appearance.desaturated,
        spriteOpacity: appearance.spriteOpacity,
        badgeSize: appearance.badgeSize,
      }).toEqual({ plate, bob, halo, outlineOpacity, desaturated, spriteOpacity, badgeSize });
    },
  );

  it("shows the completion badge only above 20 CSS pixels", () => {
    expect([
      pixelSeatAppearance("architect", "done", 20).badgeSize,
      pixelSeatAppearance("architect", "done", 21).badgeSize,
    ]).toEqual([0, 9]);
  });

  it("keeps the user's circular neutral plate outside persona next/done treatments", () => {
    const next = pixelSeatAppearance("user", "next", 40);
    const done = pixelSeatAppearance("user", "done", 40);
    expect([next.plate, next.radius, next.desaturated, next.spriteOpacity, done.badgeSize]).toEqual(
      ["user", "50%", false, 1, 0],
    );
  });

  it("scales sprite pixels in integer steps and aligns small sprites above the bottom edge", () => {
    expect([
      pixelSeatAppearance("architect", "idle", 18).spriteSize,
      pixelSeatAppearance("architect", "idle", 24).spriteSize,
      pixelSeatAppearance("architect", "idle", 28).spriteSize,
      pixelSeatAppearance("architect", "idle", 40).spriteSize,
      pixelSeatAppearance("architect", "idle", 44).spriteSize,
      pixelSeatAppearance("architect", "idle", 48).spriteSize,
      pixelSeatAppearance("architect", "idle", 18).bottomPadding,
      pixelSeatAppearance("architect", "idle", 40).bottomPadding,
    ]).toEqual([12, 24, 24, 36, 36, 48, 1, 0]);
  });
});
