import { expect, it, vi } from "vite-plus/test";
import { GhosttyTerminalCore } from "./core";
import { readGhosttyAutomation, encodeGhosttyAutomation } from "./automation";

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

it("encodes keyboard input through intervening output using the current terminal modes", async () => {
  const core = await createCore();
  try {
    const revision = core.automationMetadata().frameRevision;
    core.write("log\r\n\x1b[?1h\x1b[?2004h");
    expect(
      encodeGhosttyAutomation(
        core,
        {
          type: "key",
          key: "c",
          phase: "press",
          modifiers: { shift: false, alt: false, ctrl: true, meta: false },
        },
        revision,
      ),
    ).toEqual({ status: "encoded", encodedText: "\x03" });
    expect(
      encodeGhosttyAutomation(
        core,
        {
          type: "key",
          key: "ArrowUp",
          phase: "press",
          modifiers: { shift: false, alt: false, ctrl: false, meta: false },
        },
        revision,
      ),
    ).toEqual({ status: "encoded", encodedText: "\x1bOA" });
    expect(encodeGhosttyAutomation(core, { type: "paste", text: "�🙂" }, revision)).toEqual({
      status: "encoded",
      encodedText: "\x1b[200~�🙂\x1b[201~",
    });
  } finally {
    core.dispose();
  }
});

it.each([7.25, 7.5])(
  "keeps fractional %s pixel cells aligned in cell and pixel mouse protocols",
  async (width) => {
    const core = await createCore();
    try {
      core.resize(80, 3, width, 16);
      core.write("\x1b[?1000h\x1b[?1006h");
      const revision = core.automationMetadata().frameRevision;
      const geometry = {
        cellWidth: width,
        cellHeight: 16,
        screenWidth: 80 * width + 8,
        screenHeight: 56,
        paddingLeft: 4,
        paddingRight: 4,
        paddingTop: 4,
        paddingBottom: 4,
      };
      const press = (column: number, frameRevision = revision) =>
        ({
          type: "mouse",
          event: "press",
          position: { column, row: 1 },
          button: "left",
          modifiers: { shift: false, alt: false, ctrl: false, meta: false },
          frameRevision,
        }) as const;
      expect(encodeGhosttyAutomation(core, press(0), revision, geometry)).toEqual({
        status: "encoded",
        encodedText: "\x1b[<0;1;2M",
      });
      expect(encodeGhosttyAutomation(core, press(40), revision, geometry)).toEqual({
        status: "encoded",
        encodedText: "\x1b[<0;41;2M",
      });
      expect(encodeGhosttyAutomation(core, press(79), revision, geometry)).toEqual({
        status: "encoded",
        encodedText: "\x1b[<0;80;2M",
      });
      core.write("\x1b[?1016h");
      const pixels = core.automationMetadata().frameRevision;
      expect(encodeGhosttyAutomation(core, press(40, pixels), pixels, geometry)).toEqual({
        status: "encoded",
        encodedText: width === 7.5 ? "\x1b[<0;304;24M" : "\x1b[<0;294;24M",
      });
      core.write("\x1b[?1006h");
      const cells = core.automationMetadata().frameRevision;
      for (const column of [0, 40, 79]) {
        expect(encodeGhosttyAutomation(core, press(column, cells), cells, geometry)).toEqual({
          status: "encoded",
          encodedText: `\x1b[<0;${column + 1};2M`,
        });
      }
    } finally {
      core.dispose();
    }
  },
);

it("rejects lossy legacy mouse bytes while preserving UTF-8 and SGR modes", async () => {
  const core = await createCore();
  try {
    core.resize(160, 3, 8, 16);
    core.write("\x1b[?1000h");
    const geometry = {
      cellWidth: 8,
      cellHeight: 16,
      screenWidth: 1288,
      screenHeight: 56,
      paddingLeft: 4,
      paddingRight: 4,
      paddingTop: 4,
      paddingBottom: 4,
    };
    const encode = (column: number) => {
      const revision = core.automationMetadata().frameRevision;
      return encodeGhosttyAutomation(
        core,
        {
          type: "mouse",
          event: "press",
          position: { column, row: 1 },
          button: "left",
          modifiers: { shift: false, alt: false, ctrl: false, meta: false },
          frameRevision: revision,
        },
        revision,
        geometry,
      );
    };
    expect(encode(94)).toEqual({ status: "encoded", encodedText: "\x1b[M \x7f\x22" });
    expect(() => encode(95)).toThrow("unsupported_client");
    core.write("\x1b[?1005h");
    expect(encode(95)).toEqual({ status: "encoded", encodedText: "\x1b[M \x80\x22" });
    core.write("\x1b[?1006h");
    expect(encode(95)).toEqual({ status: "encoded", encodedText: "\x1b[<0;96;2M" });
  } finally {
    core.dispose();
  }
});

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

it("encodes mode-aware keys and Unicode paste without sending, and identifies empty releases", async () => {
  const core = await createCore();
  try {
    const key = {
      type: "key",
      key: "ArrowUp",
      phase: "press",
      modifiers: { shift: false, alt: false, ctrl: false, meta: false },
    } as const;
    const encode = (action: Parameters<typeof encodeGhosttyAutomation>[1]) =>
      encodeGhosttyAutomation(core, action, core.automationMetadata().frameRevision);
    expect(encode(key)).toEqual({ status: "encoded", encodedText: "\x1b[A" });
    expect(encode({ ...key, phase: "release" })).toEqual({ status: "not_sent" });
    core.write("\x1b[?1h\x1b[?2004h");
    expect(encode(key)).toEqual({ status: "encoded", encodedText: "\x1bOA" });
    expect(encode({ type: "text", text: "中🙂" })).toEqual({
      status: "encoded",
      encodedText: "\x1b[200~中🙂\x1b[201~",
    });
    expect(
      encode({
        type: "key",
        key: "c",
        phase: "press",
        modifiers: { shift: false, alt: false, ctrl: true, meta: false },
      }),
    ).toEqual({ status: "encoded", encodedText: "\x03" });
  } finally {
    core.dispose();
  }
});

it("validates mouse frames and cell geometry and distinguishes local wheel actions", async () => {
  const core = await createCore();
  try {
    const geometry = {
      cellWidth: 8,
      cellHeight: 16,
      screenWidth: 72,
      screenHeight: 56,
      paddingLeft: 4,
      paddingRight: 4,
      paddingTop: 4,
      paddingBottom: 4,
    };
    const revision = core.automationMetadata().frameRevision;
    const wheel = {
      type: "mouse",
      event: "wheel",
      position: { column: 1, row: 1 },
      deltaColumns: 0,
      deltaRows: -1,
      modifiers: { shift: false, alt: false, ctrl: false, meta: false },
      frameRevision: revision,
    } as const;
    expect(encodeGhosttyAutomation(core, wheel, revision, geometry)).toEqual({
      status: "local_action",
      action: "scroll",
      deltaRows: -1,
    });
    core.write("\x1b[?1000h\x1b[?1006h");
    expect(() => encodeGhosttyAutomation(core, wheel, revision, geometry)).toThrow("stale_request");
    const current = core.automationMetadata().frameRevision;
    const press = {
      type: "mouse",
      event: "press",
      position: { column: 1, row: 1 },
      button: "left",
      modifiers: { shift: false, alt: false, ctrl: false, meta: false },
      frameRevision: current,
    } as const;
    expect(encodeGhosttyAutomation(core, press, current, geometry)).toEqual({
      status: "encoded",
      encodedText: "\x1b[<0;2;2M",
    });
    expect(
      encodeGhosttyAutomation(core, { ...press, event: "release" }, current, geometry),
    ).toEqual({ status: "encoded", encodedText: "\x1b[<0;2;2m" });
    expect(
      encodeGhosttyAutomation(
        core,
        { ...wheel, frameRevision: current, deltaRows: 0, deltaColumns: 1 },
        current,
        geometry,
      ),
    ).toEqual({ status: "encoded", encodedText: "\x1b[<67;2;2M" });
    expect(() =>
      encodeGhosttyAutomation(
        core,
        { ...press, position: { column: 8, row: 1 } },
        current,
        geometry,
      ),
    ).toThrow("stale_request");
    expect(() =>
      encodeGhosttyAutomation(core, press, current, { ...geometry, screenWidth: 20 }),
    ).toThrow("stale_request");
  } finally {
    core.dispose();
  }
});

it("pages bounded history and rejects stale frames", async () => {
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
      codeUnitOffset: 0,
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
    expect(
      readGhosttyAutomation(core, { ...query, budget: { maxLines: 1, maxCodeUnits: 1 } }, 7),
    ).toMatchObject({ text: "中", nextCursor: { nextLine: 0, codeUnitOffset: 1 } });
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

it("continues A😀B at codepoint boundaries and reports wraps only after completing the row", async () => {
  const core = await createCore();
  try {
    core.resize(4, 3, 8, 16);
    core.write("\r\n".repeat(10) + "A😀Bx");
    expect(core.readAutomationRows(10, 11).lines).toEqual([
      { line: 10, text: "A😀B", softWrapAfter: true },
    ]);
    const query = {
      source: "history",
      activeScreen: "primary",
      range: { startLine: 10, endLineExclusive: 12 },
      frameRevision: core.automationMetadata().frameRevision,
      budget: { maxLines: 1, maxCodeUnits: 2 },
    } as const;
    const first = readGhosttyAutomation(core, query, 0);
    expect(first).toMatchObject({
      text: "A",
      returnedRange: { startLine: 10, endLineExclusive: 11 },
      nextCursor: { nextLine: 10, codeUnitOffset: 1 },
      softWrapAfterLines: [],
    });
    const second = readGhosttyAutomation(core, { ...query, codeUnitOffset: 1 }, 0);
    expect(second).toMatchObject({
      text: "😀",
      returnedRange: { startLine: 10, endLineExclusive: 11 },
      nextCursor: { nextLine: 10, codeUnitOffset: 3 },
      softWrapAfterLines: [],
    });
    const third = readGhosttyAutomation(core, { ...query, codeUnitOffset: 3 }, 0);
    expect(third).toMatchObject({
      text: "B",
      returnedRange: { startLine: 10, endLineExclusive: 11 },
      nextCursor: { nextLine: 11, codeUnitOffset: 0 },
      softWrapAfterLines: [10],
    });
    expect(
      readGhosttyAutomation(
        core,
        { ...query, codeUnitOffset: 3, range: { startLine: 10, endLineExclusive: 11 } },
        0,
      ).nextCursor,
    ).toBeNull();
    expect(() =>
      readGhosttyAutomation(
        core,
        { ...query, codeUnitOffset: 1, budget: { maxLines: 1, maxCodeUnits: 1 } },
        0,
      ),
    ).toThrow("budget_exceeded");
    expect(() => readGhosttyAutomation(core, { ...query, codeUnitOffset: 2 }, 0)).toThrow(
      "stale_request",
    );
    expect(() => readGhosttyAutomation(core, { ...query, codeUnitOffset: 5 }, 0)).toThrow(
      "stale_request",
    );
    expect(() => readGhosttyAutomation(core, { ...query, codeUnitOffset: -1 }, 0)).toThrow(
      "stale_request",
    );
    expect(() =>
      readGhosttyAutomation(core, { ...query, codeUnitOffset: Number.MAX_SAFE_INTEGER }, 0),
    ).toThrow("stale_request");
    expect(first.text + second.text + third.text).toBe("A😀B");
  } finally {
    core.dispose();
  }
});
