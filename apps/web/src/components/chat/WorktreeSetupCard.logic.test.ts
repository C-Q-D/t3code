/** Protects the four T4 phases and the existing embedded, terminal, and script-output rules. */
import type { WorktreeSetupStage } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { worktreeSetupPresentation } from "./WorktreeSetupCard.logic";

/** Makes a script-stage fixture with only its status and emitted output varying. */
function scriptStage(
  status: WorktreeSetupStage["status"],
  tail: string[] = [],
): WorktreeSetupStage {
  return {
    id: "setup-script",
    status,
    startedAt: null,
    endedAt: null,
    percent: null,
    detail: null,
    tail,
  };
}

describe("worktreeSetupPresentation", () => {
  it.each([
    ["running", "settingUpWorktree", false],
    ["done", "worktreeReady", true],
    ["failed", "worktreeSetupFailed", true],
    ["cancelled", "worktreeSetupCancelled", true],
  ] as const)(
    "keeps %s distinct and collapses only settled embedded setups",
    (phase, headingKey, collapsed) => {
      expect(worktreeSetupPresentation({ phase, stages: [] }, true, false)).toEqual({
        headingKey,
        collapsed,
        showTerminal: false,
        showTail: false,
      });
      expect(worktreeSetupPresentation({ phase, stages: [] }, false, false).collapsed).toBe(false);
    },
  );

  it("keeps a failed script visible as ready with a warning rather than a clean success", () => {
    expect(
      worktreeSetupPresentation({ phase: "done", stages: [scriptStage("failed")] }, false, true),
    ).toEqual({
      headingKey: "worktreeReadySetupScriptFailed",
      collapsed: false,
      showTerminal: true,
      showTail: true,
    });
  });

  it.each([
    ["pending", true, false],
    ["running", false, false],
    ["running", true, true],
    ["done", true, true],
  ] as const)(
    "offers a terminal for %s only with the host callback (%s)",
    (status, granted, expected) => {
      expect(
        worktreeSetupPresentation(
          { phase: "running", stages: [scriptStage(status)] },
          false,
          granted,
        ).showTerminal,
      ).toBe(expected);
    },
  );

  it.each([
    ["pending", ["queued"], false],
    ["running", [], false],
    ["running", ["installing"], true],
    ["failed", [], true],
    ["done", ["finished"], false],
  ] as const)("shows script output for %s with %j only when useful", (status, tail, expected) => {
    expect(
      worktreeSetupPresentation(
        { phase: "running", stages: [scriptStage(status, [...tail])] },
        false,
        true,
      ).showTail,
    ).toBe(expected);
  });
});
