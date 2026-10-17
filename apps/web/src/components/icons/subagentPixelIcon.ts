/** Selects child-agent artwork by immutable run/parent grouping and lexicographic child IDs. */
import type { PixelIconName } from "./pixelSprites";

/**
 * Assigns one of three provider variants within a run, or a parent node for runless children.
 * Sorting IDs avoids dependence on projection order or a changing start time. If a run lies
 * outside the loaded window and only its active members are loaded, their ranks may differ
 * from those computed with every member of that run present.
 * @param driver Child provider driver; unsupported or missing drivers use the generic character.
 * @param subagentId Durable child ID, or undefined when the view has no child identity.
 * @param siblings Loaded parent projection; missing identity or grouping information uses the generic character.
 * @returns The child character name, with variants cycling from 1 through 3.
 */
export function getSubagentPixelIconName(
  driver: string | undefined,
  subagentId?: string,
  siblings?: ReadonlyArray<{
    readonly id: string;
    readonly runId?: string | null;
    readonly parentNodeId?: string | null;
  }>,
): PixelIconName {
  if (!siblings || subagentId === undefined || (driver !== "claudeAgent" && driver !== "codex")) {
    return "subagent";
  }
  const member = siblings.find(({ id }) => id === subagentId);
  if (!member || (member.runId == null && member.parentNodeId == null)) return "subagent";
  const groupIds = siblings
    .filter((candidate) =>
      member.runId != null
        ? candidate.runId === member.runId
        : candidate.runId == null && candidate.parentNodeId === member.parentNodeId,
    )
    .map(({ id }) => id)
    .toSorted();
  const index = groupIds.indexOf(subagentId);
  const variants =
    driver === "claudeAgent"
      ? (["claude-sub1", "claude-sub2", "claude-sub3"] as const)
      : (["codex-sub1", "codex-sub2", "codex-sub3"] as const);
  return variants[index % variants.length]!;
}
