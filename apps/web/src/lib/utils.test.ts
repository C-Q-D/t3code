/** Protect shared platform helpers and semantic class merging at their public entry points. */
import { describe, assert, it } from "vite-plus/test";
import { cn, getLocalFileManagerName, isWindowsPlatform } from "./utils";

describe("cn", () => {
  it.each([
    [
      "dark:before:bg-transparent dark:before:bg-composer-seam-below",
      "dark:before:bg-transparent dark:before:bg-composer-seam-below",
    ],
    [
      "before:bg-red-500 before:bg-composer-seam-above",
      "before:bg-red-500 before:bg-composer-seam-above",
    ],
    ["text-body text-pr-linked-heading", "text-pr-linked-heading"],
    ["shadow-raise-xs-control shadow-pr-linked-watching", "shadow-pr-linked-watching"],
    ["rounded-card-row rounded-pr-linked-row", "rounded-pr-linked-row"],
    ["leading-code leading-pr-linked-copy", "leading-pr-linked-copy"],
    ["text-body text-foreground", "text-body text-foreground"],
    ["text-fg-disabled text-reply", "text-fg-disabled text-reply"],
    ["text-heading text-status-warning-foreground", "text-heading text-status-warning-foreground"],
    ["bg-status-info text-body text-attention", "bg-status-info text-body text-attention"],
    ["text-body text-reply", "text-reply"],
    ["text-pr-detail-title text-foreground", "text-pr-detail-title text-foreground"],
    ["text-body text-pr-detail-title", "text-pr-detail-title"],
    ["text-pr-avatar text-foreground", "text-pr-avatar text-foreground"],
    ["text-body text-2xs", "text-2xs"],
    ["text-2xs text-muted-foreground", "text-2xs text-muted-foreground"],
    ["text-fg-disabled text-attention", "text-attention"],
    ["bg-stone-chrome bg-well-surface", "bg-well-surface"],
    ["shadow-slab shadow-raise-m", "shadow-raise-m"],
    ["shadow-well shadow-pr-description-well", "shadow-pr-description-well"],
    ["shadow-raise-m shadow-pr-review-card", "shadow-pr-review-card"],
    ["shadow-slab shadow-stone-edge", "shadow-slab shadow-stone-edge"],
    ["shadow-slab shadow-black/50", "shadow-slab shadow-black/50"],
    ["text-shadow-stone text-shadow-fg-disabled", "text-shadow-stone text-shadow-fg-disabled"],
    ["text-shadow-stone text-shadow-none", "text-shadow-none"],
    ["rounded-card-surface rounded-lg", "rounded-lg"],
    ["rounded-lg rounded-card-surface", "rounded-card-surface"],
    ["rounded-tag rounded-badge-large", "rounded-badge-large"],
    ["rounded-s-none rounded-s-split-join", "rounded-s-split-join"],
    ["rounded-card-row rounded-pr-description", "rounded-pr-description"],
    ["leading-code leading-terminal", "leading-terminal"],
    ["leading-code leading-6", "leading-6"],
    ["leading-code leading-pr-description", "leading-pr-description"],
    ["leading-pr-description leading-pr-comment", "leading-pr-comment"],
    ["tracking-brand tracking-wide", "tracking-wide"],
  ])("merges %s according to its utility group", (classes, expected) => {
    assert.strictEqual(cn(classes), expected);
  });

  // Existing buttons use a theme color and a shadow size together, in either order.
  it.each([
    ["shadow-primary/24 shadow-xs", "shadow-primary/24 shadow-xs"],
    ["shadow-xs shadow-primary/24", "shadow-xs shadow-primary/24"],
    ["shadow-input/24 shadow-xs", "shadow-input/24 shadow-xs"],
    ["shadow-primary/24 shadow-primary-button", "shadow-primary/24 shadow-primary-button"],
    ["shadow-primary-button shadow-primary/24", "shadow-primary-button shadow-primary/24"],
    ["shadow-input/24 shadow-input-well", "shadow-input/24 shadow-input-well"],
    ["shadow-card/24 shadow-primary-button", "shadow-card/24 shadow-primary-button"],
  ])("preserves theme shadow color and size in %s", (classes, expected) => {
    assert.strictEqual(cn(classes), expected);
  });

  it.each([
    ["shadow-raise-xs-control inset-shadow-focus", "shadow-raise-xs-control inset-shadow-focus"],
    ["shadow-raise-l inset-shadow-selected", "shadow-raise-l inset-shadow-selected"],
    [
      "shadow-raise-xs-control inset-shadow-selected-control",
      "shadow-raise-xs-control inset-shadow-selected-control",
    ],
    [
      "shadow-outline-control focus-visible:inset-shadow-focus",
      "shadow-outline-control focus-visible:inset-shadow-focus",
    ],
    ["inset-shadow-focus inset-shadow-none", "inset-shadow-none"],
    [
      "shadow-raise-l inset-shadow-selected focus-visible:inset-shadow-focus",
      "shadow-raise-l inset-shadow-selected focus-visible:inset-shadow-focus",
    ],
  ])("keeps state circles independent of layer shadows in %s", (classes, expected) => {
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
