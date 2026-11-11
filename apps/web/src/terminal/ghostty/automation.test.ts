import { expect, it, vi } from "vite-plus/test";
import { GhosttyTerminalCore } from "./core";
import { readGhosttyAutomation } from "./automation";

vi.mock("./vendor/ghostty-vt.wasm?url", async () => ({
  default: (await import("./vendor/ghostty-vt.wasm?inline")).default,
}));
vi.mock("./vendor/ghostty-write-pty.wasm?url&no-inline", async () => ({
  default: (await import("./vendor/ghostty-write-pty.wasm?inline")).default,
}));

async function createCore() {
  return GhosttyTerminalCore.create(
    8,
    3,
    8,
    16,
    {
      foreground: { r: 255, g: 255, b: 255 },
      background: { r: 0, g: 0, b: 0 },
      cursor: { r: 255, g: 255, b: 255 },
    },
    () => {},
  );
}

it("reads formatter Unicode, wraps and spaces without changing selection, viewport or dirty", async () => {
  const core = await createCore();
  try {
    core.write("中🙂ab  \r\n0123456789AB\r\nLAST");
    core.scroll(-100);
    core.setSelection({ x: 0, y: 0 }, { x: 1, y: 0 });
    core.snapshot();
    const selection = core.selectionRange();
    const selectedText = core.selectionText();
    const scroll = core.scrollbarState();
    const first = core.readAutomationRows(0, 3);
    expect(first.lines.map((line) => line.text)).toEqual(["中🙂ab  ", "01234567", "89AB"]);
    expect(first.lines.map((line) => line.softWrapAfter)).toEqual([false, true, false]);
    expect(core.selectionRange()).toEqual(selection);
    expect(core.selectionText()).toBe(selectedText);
    expect(core.scrollbarState()).toEqual(scroll);
    core.scrollToBottom();
    core.snapshot();
    core.write("\rNEXT");
    core.readAutomationRows(0, 3);
    expect(core.snapshot().dirtyRows.size).toBeGreaterThan(0);
    expect(first.lines[0]?.text).toBe("中🙂ab  ");
  } finally {
    core.dispose();
  }
});

it("pages bounded history and rejects stale frames and budgets smaller than one row", async () => {
  const core = await createCore();
  try {
    core.write("中🙂ab\r\ntwo\r\nthree\r\nfour");
    const query = {
      source: "history",
      activeScreen: "primary",
      range: { startLine: 0, endLineExclusive: 4 },
      budget: { maxLines: 1, maxCodeUnits: 20 },
    } as const;
    const first = readGhosttyAutomation(core, query, 7);
    expect(first.text).toBe("中🙂ab");
    expect(first.nextCursor).toEqual({
      source: "history",
      activeScreen: "primary",
      nextLine: 1,
      frameRevision: first.frame.frameRevision,
    });
    const next = readGhosttyAutomation(
      core,
      {
        ...query,
        range: { startLine: 1, endLineExclusive: 4 },
        frameRevision: first.frame.frameRevision,
      },
      7,
    );
    expect(next.text).toBe("two");
    expect(() =>
      readGhosttyAutomation(core, { ...query, budget: { maxLines: 1, maxCodeUnits: 1 } }, 7),
    ).toThrow("budget_exceeded");
    const scroll = core.scrollbarState();
    expect(
      readGhosttyAutomation(
        core,
        { source: "screen", view: "active_bottom", budget: { maxLines: 3, maxCodeUnits: 100 } },
        7,
      ).text,
    ).toBe("two\nthree\nfour");
    expect(core.scrollbarState()).toEqual(scroll);
    core.write("\rEDIT");
    expect(() =>
      readGhosttyAutomation(core, { ...query, frameRevision: first.frame.frameRevision }, 8),
    ).toThrow("stale_request");
    expect(first.text).toBe("中🙂ab");
    core.write("\x1b[?1049h");
    expect(() => readGhosttyAutomation(core, query, 9)).toThrow("stale_request");
  } finally {
    core.dispose();
  }
});

it("reads active bottom and alternate metadata without scrolling", async () => {
  const core = await createCore();
  try {
    core.write("one\r\ntwo\r\nthree\r\n12345678");
    core.scroll(-100);
    const before = core.scrollbarState();
    const metadata = core.automationMetadata();
    expect(metadata).toMatchObject({
      cols: 8,
      rows: 3,
      activeScreen: "primary",
      pendingWrap: true,
      cursorColumn: 7,
      cursorLine: 3,
    });
    expect(
      core
        .readAutomationRows(
          metadata.retainedRange.endLineExclusive - 3,
          metadata.retainedRange.endLineExclusive,
        )
        .lines.map((line) => line.text),
    ).toEqual(["two", "three", "12345678"]);
    expect(core.scrollbarState()).toEqual(before);
    core.write("\x1b[?1049h\x1b[HALT");
    expect(core.automationMetadata().activeScreen).toBe("alternate");
    expect(core.readAutomationRows(0, 1).lines[0]?.text).toBe("ALT");
    core.write("\x1b[?1049l");
    expect(core.automationMetadata().activeScreen).toBe("primary");
  } finally {
    core.dispose();
  }
});

it("invalidates history coordinates on viewport changes, resize, and retention eviction", async () => {
  const core = await createCore();
  try {
    core.write("a\r\nb\r\nc\r\nd");
    const revision = core.automationMetadata().frameRevision;
    core.scroll(-1);
    expect(core.automationMetadata().frameRevision).toBeGreaterThan(revision);
    const scrolled = core.automationMetadata().frameRevision;
    core.resize(4, 3, 8, 16);
    expect(core.automationMetadata().frameRevision).toBeGreaterThan(scrolled);
    const query = {
      source: "history",
      activeScreen: "primary",
      range: { startLine: 0, endLineExclusive: 1 },
      frameRevision: core.automationMetadata().frameRevision,
      budget: { maxLines: 1, maxCodeUnits: 20 },
    } as const;
    core.write("x\r\n".repeat(10_020));
    expect(() => readGhosttyAutomation(core, query, 1)).toThrow("stale_request");
    const range = core.automationMetadata().retainedRange;
    expect(range.endLineExclusive - range.startLine).toBeLessThanOrEqual(10_000);
  } finally {
    core.dispose();
  }
});

it("stops before a row that exceeds the remaining UTF-16 budget", async () => {
  const core = await createCore();
  try {
    core.write("a\r\n🙂");
    const query = {
      source: "history",
      activeScreen: "primary",
      range: { startLine: 0, endLineExclusive: 2 },
      budget: { maxLines: 2, maxCodeUnits: 3 },
    } as const;
    const first = readGhosttyAutomation(core, query, 0);
    expect(first.text).toBe("a");
    expect(first.truncated).toBe(true);
    expect(first.nextCursor).toMatchObject({ nextLine: 1 });
    expect(
      readGhosttyAutomation(core, { ...query, range: { startLine: 1, endLineExclusive: 2 } }, 0)
        .text,
    ).toBe("🙂");
  } finally {
    core.dispose();
  }
});
