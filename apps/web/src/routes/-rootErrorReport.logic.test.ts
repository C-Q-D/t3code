/** Characterizes the existing clipboard report contract, not a new report format. */
import { describe, expect, it } from "vite-plus/test";
import { errorReport } from "./-rootErrorReport.logic";

describe("router error report", () => {
  it("retains build, router path, timestamp, stack and cause order", () => {
    const cause = new Error("offline");
    cause.stack = "Error: offline\n    at connect";
    const error = new Error("load failed", { cause });
    error.stack = "Error: load failed\n    at load";
    expect(errorReport(error, "/thread/42", "T3 Code 1.0", "2026-10-17T00:00:00.000Z")).toBe(
      "T3 Code 1.0\nPath: /thread/42\nTime: 2026-10-17T00:00:00.000Z\n\nError: load failed\n    at load\n\nCaused by:\nError: offline\n    at connect",
    );
  });

  it("caps a cyclic cause chain at five entries so the fallback remains usable", () => {
    const error = new Error("loop");
    error.stack = "Error: loop";
    error.cause = error;
    const report = errorReport(error, "/", "T3 Code 1.0", "2026-10-17T00:00:00.000Z");
    expect(report.match(/Caused by:/g)).toHaveLength(5);
    expect(report.match(/Error: loop/g)).toHaveLength(6);
  });

  it.each([
    ["plain failure", "plain failure"],
    [{ reason: "offline" }, '{\n  "reason": "offline"\n}'],
    [undefined, ""],
  ])("retains non-Error details for %j", (error, details) => {
    expect(errorReport(error, "/", "T3 Code 1.0", "2026-10-17T00:00:00.000Z")).toBe(
      `T3 Code 1.0\nPath: /\nTime: 2026-10-17T00:00:00.000Z\n\n${details}`,
    );
  });

  it("reports unserializable thrown values without throwing again", () => {
    const error: { self?: unknown } = {};
    error.self = error;
    expect(errorReport(error, "/", "T3 Code 1.0", "2026-10-17T00:00:00.000Z")).toBe(
      "T3 Code 1.0\nPath: /\nTime: 2026-10-17T00:00:00.000Z\n\nNo additional error details are available.",
    );
  });
});
