/** Fixed CSS-pixel bounds from StyleM-8a's drawer; independent of stored desktop widths. */
export const FRAME_SIDEBAR_DRAWER_GEOMETRY = {
  drawer: { position: "fixed", left: 76, top: 52, bottom: 20, width: 300 },
  backdrop: { position: "fixed", left: 68, top: 48, right: 0, bottom: 0 },
} as const;
