import { expect, it, vi } from "vite-plus/test";
import { GhosttyTerminalCore } from "./core";

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
