/** Applies shared web styling and localized search controls to Pierre's viewer. */
/* oxlint-disable eslint/no-restricted-imports -- This is the single styled adapter around Pierre's raw viewer. */
import {
  CodeView,
  type CodeViewHandle,
  type CodeViewProps,
  type ControlledCodeViewProps,
  type UncontrolledCodeViewProps,
} from "@pierre/diffs/react";
/* oxlint-enable eslint/no-restricted-imports */
import type { Ref } from "react";
import { t } from "~/i18n";

import { DIFF_SURFACE_THEME_UNSAFE_CSS } from "~/lib/diffRendering";
import { DiffWorkerPoolProvider } from "../DiffWorkerPoolProvider";

export const DIFF_VIEW_UNSAFE_CSS = `${DIFF_SURFACE_THEME_UNSAFE_CSS}
/* Pierre computes typography on the host, including standalone PR guide FileDiffs.
   Descendant variables cannot change the font size or line height inherited from it. */
:host {
  --diffs-font-size: var(--text-code-copy);
  --diffs-line-height: var(--text-code-copy--line-height);
}
/* A 1fr track's automatic minimum grows with the currently mounted lines. In split
   wrap mode that shifts width between columns, rewraps rows and makes the virtualizer
   repeatedly correct the scroll position. Keep both code columns at the same width. */
[data-diff-type="split"][data-overflow="wrap"] {
  --diffs-code-grid: var(--diffs-grid-number-column-width) minmax(0, 1fr);
}

:is(
  [data-line],
  [data-line-annotation],
  [data-merge-conflict],
  [data-merge-conflict-actions],
  [data-no-newline]
)[data-selected-line] {
  --diffs-line-bg: light-dark(
    color-mix(
      in lab,
      var(--code-background) 88%,
      color-mix(in srgb, var(--code-background) 50%, var(--diffs-modified-base))
    ),
    color-mix(
      in lab,
      var(--code-background) 80%,
      color-mix(in srgb, var(--code-background) 70%, var(--diffs-modified-base))
    )
  ) !important;
}

:is([data-gutter-buffer], [data-column-number])[data-selected-line] {
  --diffs-line-bg: light-dark(
    color-mix(
      in lab,
      var(--code-background) 91%,
      color-mix(in srgb, var(--code-background) 35%, var(--diffs-modified-base))
    ),
    color-mix(
      in lab,
      var(--code-background) 85%,
      color-mix(in srgb, var(--code-background) 60%, var(--diffs-modified-base))
    )
  ) !important;
}

[data-indicators="bars"]
  :is([data-column-number], [data-gutter-buffer="annotation"])[data-selected-line] {
  position: relative;
}

[data-indicators="bars"]
  :is([data-column-number], [data-gutter-buffer="annotation"])[data-selected-line]::before {
  position: absolute !important;
  inset-block: 0 !important;
  inset-inline-start: 0 !important;
  display: block !important;
  width: 4px !important;
  min-width: 4px !important;
  max-width: 4px !important;
  height: auto !important;
  padding: 0 !important;
  content: "" !important;
  background-color: var(--diffs-modified-base) !important;
  background-image: none !important;
}

/* K4 file headers are recessed 38px wells; the metrics below use the same height. */
[data-file-info] {
  background-color: var(--code-background) !important;
  border-block-color: transparent !important;
  color: var(--code-foreground) !important;
}
[data-diffs-header] {
  position: sticky !important;
  top: 0;
  z-index: 4;
  box-sizing: border-box;
  background-color: var(--color-input) !important;
  border: 0 !important;
  border-radius: var(--radius-compact-row);
  box-shadow: var(--shadow-pn3-header);
  color: var(--color-foreground) !important;
  align-items: center !important;
  font-family: var(--font-mono) !important;
  font-size: var(--text-secondary-copy) !important;
  line-height: 1 !important;
  height: calc(var(--spacing) * 9.5) !important;
  min-height: calc(var(--spacing) * 9.5) !important;
  padding-block: 0 !important;
  padding-inline: calc(var(--spacing) * 3.5) !important;
}

/* Keep the selected blue/orange or red/green palette; K4 changes tint strength only. */
:is([data-diff], [data-file], [data-virtualizer-buffer]) {
  --diffs-grid-number-column-width: calc(var(--spacing) * 11);
  --diffs-bg-context-override: var(--code-background);
  --diffs-addition-color-override: var(--diff-addition);
  --diffs-deletion-color-override: var(--diff-deletion);
  --diffs-bg-addition-override: color-mix(in srgb, var(--code-background) 90%, var(--diff-addition));
  --diffs-bg-addition-number-override: var(--diffs-bg-addition-override);
  --diffs-bg-deletion-override: color-mix(in srgb, var(--code-background) 90%, var(--diff-deletion));
  --diffs-bg-deletion-number-override: var(--diffs-bg-deletion-override);
}
/* Pierre normally mixes a supplied tint again. Use K4's final 10% tint once,
   while leaving its selected-line and hover layers above this base intact. */
[data-background] :is([data-line], [data-column-number], [data-gutter-buffer], [data-no-newline])[data-line-type="change-addition"] {
  --diffs-computed-diff-line-bg: var(--diffs-bg-addition-override);
}
[data-background] :is([data-line], [data-column-number], [data-gutter-buffer], [data-no-newline])[data-line-type="change-deletion"] {
  --diffs-computed-diff-line-bg: var(--diffs-bg-deletion-override);
}
[data-column-number] {
  color: var(--color-fg-control-disabled) !important;
  padding-inline-end: calc(var(--spacing) * 2.5);
}
[data-indicators="classic"] [data-line] {
  padding-inline-start: calc(var(--spacing) * 4);
}
[data-indicators="classic"] [data-line]::before {
  width: calc(var(--spacing) * 4);
}

/* Hunk separators are the way to the unchanged lines between hunks. They keep the library's
   layout, with the expand button in its own cell, but sit one step off the code surface so they
   read as quiet controls; hover brings them forward. */
:is([data-separator="line-info"], [data-separator="line-info-basic"]) {
  /* Exact and margin-free: the virtualizer places rows from hunkSeparatorHeight below. */
  height: 24px !important;
  margin-block: 0 !important;
  --diffs-bg-separator: color-mix(in srgb, var(--code-background) 97%, var(--code-foreground));
}

:is([data-separator="line-info"], [data-separator="line-info-basic"]) [data-separator-content] {
  color: color-mix(in srgb, var(--code-foreground) 50%, var(--code-background)) !important;
  font-family: var(--font-sans) !important;
  font-size: 11px !important;
  text-decoration: none !important;
}

:is([data-separator="line-info"], [data-separator="line-info-basic"]) [data-expand-button] {
  color: color-mix(in srgb, var(--code-foreground) 50%, var(--code-background)) !important;
}

:is([data-separator="line-info"], [data-separator="line-info-basic"])[data-expand-index]
  :is([data-separator-content], [data-expand-button]):hover {
  color: var(--code-foreground) !important;
  background-color: color-mix(
    in srgb,
    var(--code-background) 92%,
    var(--code-foreground)
  ) !important;
}

[data-diffs-header] [data-header-content] {
  align-items: center !important;
  line-height: 1 !important;
}

/* Keep clipped names tall enough for descenders in single-file renderers too. */
[data-diffs-header] [data-title],
[data-diffs-header] [data-prev-name] {
  line-height: 16px !important;
}

[data-diffs-header] [data-metadata] {
  align-items: center !important;
  line-height: 1 !important;
  font-variant-numeric: tabular-nums;
}

[data-diffs-header] [data-additions-count],
[data-diffs-header] [data-deletions-count] {
  font-family: var(--font-mono) !important;
  font-size: var(--text-secondary-copy) !important;
  font-variant-numeric: tabular-nums;
  line-height: 1 !important;
}

[data-diffs-header] [data-additions-count] {
  color: var(--diff-addition) !important;
  order: 0;
}
[data-diffs-header] [data-deletions-count] {
  color: var(--diff-deletion) !important;
  order: 1;
}
/* K4 keeps the collapse key beside the path; renamed paths retain their direction arrow. */
[data-diffs-header] [data-change-icon] {
  display: none;
}

[data-diffs-header] [data-rename-icon] {
  display: block;
  flex-shrink: 0;
}

[data-title] {
  cursor: pointer;
  font-family: var(--font-mono) !important;
}

[data-title]:hover {
  color: color-mix(in srgb, var(--code-foreground) 84%, var(--primary)) !important;
}

/* Expanding a file mounts its body all at once; easing it in matches the 200ms the app's
   collapsibles take. Appearance only: the viewer owns geometry, so height cannot animate.
   Departing content cuts, the same one-way rule the pull request chrome fold follows. */
[data-diff],
[data-file] {
  transition: opacity 200ms ease-out;
}

@starting-style {
  [data-diff],
  [data-file] {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  [data-diff],
  [data-file] {
    transition: none;
  }
}
`;

/* Only CodeView installs our split filename slot. Standalone PR excerpts retain Pierre's title. */
const CODE_VIEW_FILENAME_CSS = `
/* The React filename slot splits directory and basename, as K4 requires. */
[data-diffs-header] [data-title] {
  display: none;
}
[data-diffs-header] slot[name="header-filename-suffix"] {
  display: flex;
  flex: 1;
  min-width: 0;
}
/* renderDiffChildren wraps the React suffix in a light-DOM div assigned to this slot.
   That wrapper is the flex item; it must shrink before the inner directory can truncate. */
[data-diffs-header] slot[name="header-filename-suffix"]::slotted(div) {
  display: flex;
  flex: 1;
  min-width: 0;
}
`;

/** Caller options; this adapter owns CSS and the matching virtual row metrics. */
export type StyledDiffCodeViewOptions<LAnnotation> = Omit<
  NonNullable<CodeViewProps<LAnnotation, undefined>["options"]>,
  "unsafeCSS" | "itemMetrics" | "layout"
>;

type StyledDiffCodeViewProps<LAnnotation> = (
  | Omit<ControlledCodeViewProps<LAnnotation, undefined>, "options">
  | Omit<UncontrolledCodeViewProps<LAnnotation, undefined>, "options">
) & {
  readonly options?: StyledDiffCodeViewOptions<LAnnotation>;
  readonly viewerRef?: Ref<CodeViewHandle<LAnnotation, undefined>>;
  readonly unsafeCSSExtra?: string;
  /** H1 discussion chrome has taller headers; opt in without changing other diff surfaces. */
  readonly discussion?: boolean;
};

/** Applies local diff metrics and themes while forwarding renderer lifecycle and comment props. */
export function StyledDiffCodeView<LAnnotation = undefined>({
  options,
  viewerRef,
  className,
  unsafeCSSExtra,
  discussion = false,
  renderHeaderFilenameSuffix,
  ...props
}: StyledDiffCodeViewProps<LAnnotation>) {
  const diffHeaderHeight = discussion ? 40 : 38;
  const hunkSeparatorHeight = discussion ? 26 : 24;
  // Derive the painted heights from the virtual metrics so file reveal cannot drift.
  const geometryCSS = discussion
    ? `
[data-diffs-header] {
  height: calc(var(--spacing) * ${diffHeaderHeight / 4}) !important;
  min-height: calc(var(--spacing) * ${diffHeaderHeight / 4}) !important;
}
:is([data-separator="line-info"], [data-separator="line-info-basic"]) {
  height: calc(var(--spacing) * ${hunkSeparatorHeight / 4}) !important;
}`
    : "";
  return (
    <DiffWorkerPoolProvider>
      <CodeView<LAnnotation>
        {...props}
        renderHeaderFilenameSuffix={(item) => {
          const path = item.type === "file" ? item.file.name : item.fileDiff.name;
          const split = path.lastIndexOf("/") + 1;
          return (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span
                data-title
                className="flex min-w-0 cursor-pointer font-mono text-secondary-copy"
              >
                <span className="truncate text-muted-foreground">{path.slice(0, split)}</span>
                <span className="shrink-0 text-foreground">{path.slice(split)}</span>
              </span>
              {renderHeaderFilenameSuffix?.(item)}
            </span>
          );
        }}
        {...(viewerRef ? { ref: viewerRef } : {})}
        className={
          className
            ? `diff-render-surface pn3-code-view outline-none ${className}`
            : "diff-render-surface pn3-code-view outline-none"
        }
        options={{
          diffIndicators: "classic",
          ...options,
          searchMessages: t.git.diffSearch,
          unsafeCSS: unsafeCSSExtra
            ? `${DIFF_VIEW_UNSAFE_CSS}\n${CODE_VIEW_FILENAME_CSS}\n${unsafeCSSExtra}${geometryCSS}`
            : `${DIFF_VIEW_UNSAFE_CSS}\n${CODE_VIEW_FILENAME_CSS}${geometryCSS}`,
          itemMetrics: {
            diffHeaderHeight,
            lineHeight: 22,
            hunkSeparatorHeight,
            // Pierre uses its general file spacing as a fallback in expanded-file layout paths.
            // Keep it zero alongside the explicit paddingTop or expanding the first file can
            // reintroduce the library's default 8px gap above its header.
            spacing: 0,
            paddingTop: 0,
            // Include Pierre's 8px --diffs-gap-fallback in metrics or each expanded file loses a scrollable
            // row.
            paddingBottom: 8,
          },
          layout: { paddingTop: 0, paddingBottom: 0, gap: 0 },
        }}
      />
    </DiffWorkerPoolProvider>
  );
}
