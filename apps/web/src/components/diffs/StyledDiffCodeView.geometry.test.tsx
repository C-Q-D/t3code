/**
 * Protects H1 discussion geometry and the unchanged default virtualized file height.
 * @vitest-environment jsdom
 */
import { parsePatchFiles, VirtualizedFileDiff, Virtualizer } from "@pierre/diffs";
import type { CodeViewProps } from "@pierre/diffs/react";
import { act, type ReactNode } from "react";
import { create } from "react-test-renderer";
import { expect, it, vi } from "vite-plus/test";

import { StyledDiffCodeView } from "./StyledDiffCodeView";

type ViewerProps = CodeViewProps<undefined, undefined>;

const captured = vi.hoisted(() => ({ options: undefined as ViewerProps["options"] }));

vi.mock("../DiffWorkerPoolProvider", () => ({
  /** Geometry does not require syntax workers; leave the actual layout library intact. */
  DiffWorkerPoolProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@pierre/diffs/react", () => ({
  /** Capture the adapter boundary so the real virtualized layout consumes its metrics. */
  CodeView: ({ options }: ViewerProps) => {
    captured.options = options;
    return null;
  },
}));

it("pairs discussion 40/26 geometry with CSS while retaining default 38/24/22 metrics", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fileDiff = parsePatchFiles(
    "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n",
  )[0]!.files[0]!;
  try {
    for (const discussion of [false, true]) {
      let renderer: ReturnType<typeof create> | undefined;
      await act(async () => {
        renderer = create(
          <StyledDiffCodeView items={[]} {...(discussion ? { discussion } : {})} />,
        );
      });
      const options = captured.options!;
      expect(options.itemMetrics).toEqual({
        diffHeaderHeight: discussion ? 40 : 38,
        hunkSeparatorHeight: discussion ? 26 : 24,
        lineHeight: 22,
        spacing: 0,
        paddingTop: 0,
        paddingBottom: 8,
      });
      const virtualizer = new Virtualizer();
      const file = new VirtualizedFileDiff({ collapsed: true }, virtualizer, options.itemMetrics);
      expect(file.updateCodeViewLayout(fileDiff, 0)).toBe(discussion ? 40 : 38);
      if (discussion) {
        expect(options.unsafeCSS).toContain("height: calc(var(--spacing) * 10) !important");
        expect(options.unsafeCSS).toContain("height: calc(var(--spacing) * 6.5) !important");
      } else {
        expect(options.unsafeCSS).not.toContain("height: calc(var(--spacing) * 10) !important");
        expect(options.unsafeCSS).toContain("height: calc(var(--spacing) * 9.5) !important");
        expect(options.unsafeCSS).toContain("height: 24px !important");
      }
      file.cleanUp();
      virtualizer.cleanUp();
      await act(async () => renderer?.unmount());
    }
  } finally {
    vi.unstubAllGlobals();
  }
});
