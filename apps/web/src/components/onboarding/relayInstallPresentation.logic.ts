/** Maps installer protocol stages to Q3's three display groups; does not change installation progress or control. */
import type { RelayClientInstallProgressStage } from "@t3tools/contracts";

const stageGroups = {
  checking: 0,
  waiting_for_lock: 0,
  downloading: 0,
  verifying: 0,
  installing: 1,
  validating: 1,
  activating: 2,
} as const satisfies Record<RelayClientInstallProgressStage, number>;

/** Returns the active Download (0), Install (1), or Start (2) row for a real installer stage; verification remains part of the work it verifies. */
export function relayInstallGroup(stage: RelayClientInstallProgressStage) {
  return stageGroups[stage];
}
