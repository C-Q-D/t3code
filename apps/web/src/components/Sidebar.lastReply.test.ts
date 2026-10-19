/**
 * Protects hover-card reply state selection against missing and active run timestamps.
 * @vitest-environment jsdom
 */
import { expect, it } from "vite-plus/test";
import { resolveSidebarLastReply } from "./Sidebar";

it("uses the completed run timestamp for the last reply", () => {
  expect(
    resolveSidebarLastReply({ status: "completed", completedAt: "2026-10-15T10:07:00Z" }),
  ).toEqual({ status: "completed", completedAt: "2026-10-15T10:07:00Z" });
});

it("omits the last reply when no run exists", () => {
  expect(resolveSidebarLastReply(null)).toBeNull();
});

it("shows replying while the latest run is active without a completion timestamp", () => {
  expect(resolveSidebarLastReply({ status: "running", completedAt: null })).toEqual({
    status: "replying",
  });
});

it("omits a terminal run that has no completion timestamp", () => {
  expect(resolveSidebarLastReply({ status: "failed", completedAt: null })).toBeNull();
});
