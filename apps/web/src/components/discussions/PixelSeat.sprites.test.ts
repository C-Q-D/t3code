// @vitest-environment jsdom
/** Guards shared-sheet lifetime and the fixed palette needed by SVG presentation attributes. */
import * as NodeURL from "node:url";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { compile } from "tailwindcss";
import { expect } from "vite-plus/test";
import { acquirePixelSeatSprites, pixelSeatSymbolId } from "./PixelSeat.sprites";

it.effect("retains the handoff pixel palette even when no color utility references it", () =>
  Effect.gen(function* () {
    const cssPath = NodeURL.fileURLToPath(
      new NodeURL.URL("../../styles/discussions.css", import.meta.url),
    );
    const fs = yield* FileSystem.FileSystem;
    const css = yield* fs.readFileString(cssPath);
    const compiler = yield* Effect.promise(() => compile(css));
    const palette = Object.fromEntries(
      [...compiler.build([]).matchAll(/--color-discussion-pixel-([a-z-]+):\s*(#[0-9a-f]+);/g)].map(
        (match) => [match[1], match[2]],
      ),
    );
    expect(palette).toEqual({
      skin: "#f5c9a0",
      ink: "#1c1917",
      hair: "#4a3426",
      mouth: "#c2410c",
      gold: "#facc15",
      "gold-shade": "#ca8a04",
      white: "#f8fafc",
      red: "#ef4444",
      metal: "#a1a1aa",
      neutral: "#71717a",
      black: "#000000",
    });
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it("shares six rect-grid symbols across seats and releases them after the last seat", () => {
  const releaseFirst = acquirePixelSeatSprites(document);
  const sheet = document.querySelector("[data-discussion-seat-sprites]");
  const releaseSecond = acquirePixelSeatSprites(document);
  try {
    try {
      expect(document.querySelectorAll("[data-discussion-seat-sprites]")).toHaveLength(1);
      expect(sheet?.querySelectorAll("symbol")).toHaveLength(6);
      const hat = document
        .getElementById(pixelSeatSymbolId("architect"))
        ?.querySelector('rect[x="4"][y="0"]');
      expect(hat?.getAttribute("fill")).toBe("var(--color-discussion-pixel-gold)");
      expect(hat?.getAttribute("width")).toBe("1");
      expect(hat?.getAttribute("height")).toBe("1");
    } finally {
      releaseFirst();
    }
    expect(document.querySelector("[data-discussion-seat-sprites]")).toBe(sheet);
  } finally {
    releaseSecond();
  }
  expect(document.querySelector("[data-discussion-seat-sprites]")).toBeNull();
});
