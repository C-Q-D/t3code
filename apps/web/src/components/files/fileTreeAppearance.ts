/** K3 file-tree geometry and shadow-root presentation; Pierre retains virtualization and interaction. */

/** Panel8a K3 rows are 26px. Pass this to Pierre so its virtual offsets match the painted rows. */
export const FILE_TREE_ROW_HEIGHT = 26;

/** Scoped shadow-root rules for K3; app theme variables cross the host boundary. */
export const FILE_TREE_APPEARANCE = `
  :host {
    --trees-bg-override: transparent;
    --trees-fg-override: var(--code-foreground);
    --trees-fg-muted-override: var(--placeholder);
    --trees-bg-muted-override: var(--secondary);
    --trees-selected-bg-override: var(--secondary);
    --trees-selected-fg-override: var(--foreground);
    --trees-focus-ring-color-override: var(--ring);
    --trees-selected-focused-border-color-override: var(--ring);
    --trees-font-family-override: var(--font-mono);
    --trees-font-size-override: var(--text-secondary-copy);
    --trees-border-radius-override: var(--radius-keycap);
    --trees-indent-guide-bg-override: transparent;
    --trees-icon-width-override: calc(var(--spacing) * 3.25);
    --trees-level-gap-override: var(--spacing);
    --trees-item-row-gap-override: calc(var(--spacing) * 1.25);
    --trees-item-padding-x-override: var(--spacing);
    --trees-status-modified-override: var(--color-files-modified);
  }
  button[data-type='item'], button[data-type='item']::before {
    border-radius: var(--radius-keycap);
  }
  [data-item-type='file'] > [data-item-section='icon'] { visibility: hidden; }
  [data-icon-name='file-tree-icon-chevron'] { width: calc(var(--spacing) * 3); }
  svg[data-icon-name='t3-tree-icon-loading'] { opacity: 0.6; }
`;
