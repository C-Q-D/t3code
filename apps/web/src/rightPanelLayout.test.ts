/** Protects the approved 1024px overlay boundary and the original sidebar snapshot across a panel session. */
import { describe, expect, it } from "vite-plus/test";
import {
  DISCUSSION_PANEL_OVERLAY_MEDIA_QUERY,
  resolveRightPanelSidebarAction,
  shouldUseRightPanelSheet,
  shouldUseDiscussionPanelSheet,
} from "./rightPanelLayout";

describe("discussion panel placement", () => {
  it.each([
    [1024, true],
    [1025, false],
  ])("uses the H2 overlay at %spx: %s", (width, sheet) => {
    expect(DISCUSSION_PANEL_OVERLAY_MEDIA_QUERY).toBe("(max-width: 1024px)");
    expect(shouldUseDiscussionPanelSheet(width)).toBe(sheet);
  });
});

describe("right panel placement", () => {
  it.each([
    [760, true],
    [1023, true],
    [1023.5, true],
    [1024, false],
    [1440, false],
  ])("uses an overlay at %spx: %s", (width, sheet) => {
    expect(shouldUseRightPanelSheet(width)).toBe(sheet);
  });
});

describe("temporary sidebar visibility", () => {
  it("captures only when a wide panel opens, including a panel widened from an overlay", () => {
    expect(
      resolveRightPanelSidebarAction({ snapshotActive: false, panelOpen: true, sheet: true }),
    ).toBe("none");
    expect(
      resolveRightPanelSidebarAction({ snapshotActive: false, panelOpen: true, sheet: false }),
    ).toBe("capture-and-collapse");
  });

  it("retains the original snapshot across conversations, panel types, manual toggles and narrowing", () => {
    expect(
      resolveRightPanelSidebarAction({ snapshotActive: true, panelOpen: true, sheet: false }),
    ).toBe("none");
    expect(
      resolveRightPanelSidebarAction({ snapshotActive: true, panelOpen: true, sheet: true }),
    ).toBe("none");
  });

  it.each([false, true])(
    "restores on close in sheet=%s and consumes the snapshot once",
    (sheet) => {
      expect(
        resolveRightPanelSidebarAction({ snapshotActive: true, panelOpen: false, sheet }),
      ).toBe("restore");
      expect(
        resolveRightPanelSidebarAction({ snapshotActive: false, panelOpen: false, sheet }),
      ).toBe("none");
    },
  );
});
