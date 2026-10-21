// @vitest-environment jsdom

import { describe, expect, it, vi } from "vite-plus/test";

import {
  applyAppearanceFontVariables,
  DEFAULT_CODE_FONT_STACK,
  DEFAULT_SANS_FONT_STACK,
  DEFAULT_SERIF_FONT_STACK,
  appearanceFontStack,
  resolveDefaultFamilyLabel,
  resolveTerminalFontPreference,
  resolveTerminalFontSizePreference,
} from "./appearanceFonts";

describe("isMonospaceFamily", () => {
  it.each([
    { widths: [10, 10, 10, 10, 10, 10, 10, 10], expected: true },
    { widths: [10, 10, 7, 10, 10, 10, 10, 10], expected: false },
    { widths: [10, 10.02, 10, 10, 10, 10, 10, 10], expected: false },
    { widths: [0], expected: true },
    { widths: [Number.NaN], expected: true },
  ])("classifies canvas advances $widths as monospace=$expected", async ({ widths, expected }) => {
    vi.resetModules();
    let index = 0;
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: () => ({
          font: "",
          measureText: () => ({ width: widths[index++ % widths.length]! }),
        }),
      }),
    });
    try {
      const { isMonospaceFamily } = await import("./appearanceFonts");
      expect(isMonospaceFamily("Probe Font")).toBe(expected);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("font list normalization through appearanceFontStack", () => {
  it("uses the fallback for effectively empty input", () => {
    expect(appearanceFontStack("", "fallback")).toBe("fallback");
    expect(appearanceFontStack("   ", "fallback")).toBe("fallback");
    expect(appearanceFontStack(" , , ", "fallback")).toBe("fallback");
  });

  it("quotes names with spaces and keeps single idents bare", () => {
    expect(appearanceFontStack("Fira Code", "fallback")).toBe('"Fira Code", fallback');
    expect(appearanceFontStack("monospace", "fallback")).toBe("monospace, fallback");
    expect(appearanceFontStack('"Comic Mono"', "fallback")).toBe('"Comic Mono", fallback');
  });

  it("normalizes comma-separated lists and strips embedded quotes", () => {
    expect(appearanceFontStack(" Fira Code , Menlo ", "fallback")).toBe(
      '"Fira Code", Menlo, fallback',
    );
    expect(appearanceFontStack('Bad"Name', "fallback")).toBe('"BadName", fallback');
  });

  it("quotes names that are not single CSS idents", () => {
    expect(appearanceFontStack("3270 Nerd Font", "fallback")).toBe('"3270 Nerd Font", fallback');
    expect(appearanceFontStack("M+ 1m", "fallback")).toBe('"M+ 1m", fallback');
  });
});

describe("resolveDefaultFamilyLabel", () => {
  it("skips generic keywords and returns null for a stack of only generics", () => {
    expect(resolveDefaultFamilyLabel("system-ui, sans-serif")).toBeNull();
    expect(resolveDefaultFamilyLabel("ui-monospace, monospace")).toBeNull();
  });
});

describe("appearanceFontStack", () => {
  it("prepends the custom family to the default stack", () => {
    expect(appearanceFontStack("Fira Code", DEFAULT_CODE_FONT_STACK)).toBe(
      '"Fira Code", "IBM Plex Mono", "Noto Sans SC Variable", "SF Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace',
    );
  });

  it("falls back to the default stack when unset", () => {
    expect(appearanceFontStack("", DEFAULT_SANS_FONT_STACK)).toBe(
      '"Instrument Sans Variable", "Noto Sans SC Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    );
  });
});

describe("applyAppearanceFontVariables", () => {
  it("keeps bundled fallbacks for custom fonts and restores the fixed serif stack", () => {
    const root = document.createElement("div");
    const preferences = {
      sans: "Custom Sans",
      code: "Custom Mono",
      composer: "",
      sizeInterface: 16,
      sizePrompt: 14,
      sizeCode: 13,
      smoothing: false,
    };

    applyAppearanceFontVariables(root, preferences);

    expect(root.style.getPropertyValue("--font-sans")).toBe(
      '"Custom Sans", "Instrument Sans Variable", "Noto Sans SC Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    );
    expect(root.style.getPropertyValue("--font-mono")).toBe(
      '"Custom Mono", "IBM Plex Mono", "Noto Sans SC Variable", "SF Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace',
    );
    expect(root.style.getPropertyValue("--font-serif")).toBe(
      '"Cormorant Garamond Variable", "Noto Serif SC Variable", Georgia, serif',
    );

    applyAppearanceFontVariables(root, { ...preferences, sans: "", code: "" });

    expect(root.style.getPropertyValue("--font-sans")).toBe("");
    expect(root.style.getPropertyValue("--font-mono")).toBe("");
    expect(root.style.getPropertyValue("--font-serif")).toBe(DEFAULT_SERIF_FONT_STACK);
  });
});

describe("resolveTerminalFontPreference", () => {
  it("inherits the code font in simple mode", () => {
    expect(
      resolveTerminalFontPreference({ advanced: false, code: "Fira Code", terminal: "" }),
    ).toBe("Fira Code");
    expect(
      resolveTerminalFontPreference({
        advanced: false,
        code: "Fira Code",
        terminal: "Berkeley Mono",
      }),
    ).toBe("Fira Code");
  });

  it("keeps code and terminal fonts independent in advanced mode", () => {
    expect(resolveTerminalFontPreference({ advanced: true, code: "Fira Code", terminal: "" })).toBe(
      "",
    );
    expect(
      resolveTerminalFontPreference({
        advanced: true,
        code: "Fira Code",
        terminal: "Berkeley Mono",
      }),
    ).toBe("Berkeley Mono");
  });
});

describe("resolveTerminalFontSizePreference", () => {
  it("inherits the code font size in simple mode", () => {
    expect(resolveTerminalFontSizePreference({ advanced: false, code: 15, terminal: 12 })).toBe(15);
  });

  it("keeps code and terminal font sizes independent in advanced mode", () => {
    expect(resolveTerminalFontSizePreference({ advanced: true, code: 15, terminal: 12 })).toBe(12);
  });
});

describe("font size clamping through applied preferences", () => {
  it.each([
    { input: [16, 40, 1], expected: ["16px", "20px", "10px"] },
    { input: [2, 14, 13], expected: ["12px", "14px", "13px"] },
    { input: [96, 14, 13], expected: ["20px", "14px", "13px"] },
    { input: [Number.NaN, Number.POSITIVE_INFINITY, 13.4], expected: ["16px", "14px", "13px"] },
  ])("applies bounded sizes for $input", ({ input, expected }) => {
    const root = document.createElement("div");
    applyAppearanceFontVariables(root, {
      sans: "",
      code: "",
      composer: "",
      smoothing: false,
      sizeInterface: input[0]!,
      sizePrompt: input[1]!,
      sizeCode: input[2]!,
    });
    expect([
      root.style.fontSize,
      root.style.getPropertyValue("--font-size-prompt"),
      root.style.getPropertyValue("--font-size-code"),
    ]).toEqual(expected);
    expect(root.style.getPropertyValue("--diffs-font-size")).toBe(expected[2]);
  });
});
