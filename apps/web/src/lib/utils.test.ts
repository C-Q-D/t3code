/** Protect shared platform helpers and semantic class merging at their public entry points. */
import { describe, assert, it } from "vite-plus/test";
import { cn, getLocalFileManagerName, isWindowsPlatform } from "./utils";

describe("cn", () => {
  it.each([
    ["text-body text-foreground", "text-body text-foreground"],
    ["text-fg-disabled text-reply", "text-fg-disabled text-reply"],
    ["text-heading text-status-warning-foreground", "text-heading text-status-warning-foreground"],
    ["bg-status-info text-body text-attention", "bg-status-info text-body text-attention"],
    ["text-body text-reply", "text-reply"],
    ["text-body text-2xs", "text-2xs"],
    ["text-2xs text-muted-foreground", "text-2xs text-muted-foreground"],
    ["text-fg-disabled text-attention", "text-attention"],
    ["bg-stone-chrome bg-well-surface", "bg-well-surface"],
    ["shadow-slab shadow-raise-m", "shadow-raise-m"],
    ["shadow-slab shadow-stone-edge", "shadow-slab shadow-stone-edge"],
    ["shadow-slab shadow-black/50", "shadow-slab shadow-black/50"],
    ["text-shadow-stone text-shadow-fg-disabled", "text-shadow-stone text-shadow-fg-disabled"],
    ["text-shadow-stone text-shadow-none", "text-shadow-none"],
    ["rounded-card rounded-lg", "rounded-lg"],
    ["rounded-lg rounded-card", "rounded-card"],
    ["leading-code leading-terminal", "leading-terminal"],
    ["leading-code leading-6", "leading-6"],
    ["tracking-brand tracking-wide", "tracking-wide"],
  ])("merges %s according to its utility group", (classes, expected) => {
    assert.strictEqual(cn(classes), expected);
  });
});

describe("getLocalFileManagerName", () => {
  it.each([
    ["MacIntel", "Finder"],
    ["Win32", "File Explorer"],
    ["Linux", "Files"],
  ])("uses the %s file manager name", (platform, expected) => {
    assert.strictEqual(getLocalFileManagerName(platform), expected);
  });
});

describe("isWindowsPlatform", () => {
  it("matches Windows platform identifiers", () => {
    assert.isTrue(isWindowsPlatform("Win32"));
    assert.isTrue(isWindowsPlatform("Windows"));
    assert.isTrue(isWindowsPlatform("windows_nt"));
  });

  it("does not match darwin", () => {
    assert.isFalse(isWindowsPlatform("darwin"));
  });
});
