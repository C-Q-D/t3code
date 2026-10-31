/** Keeps checkout uncertainty visible without claiming local work was discarded. */
import type { ChangeRequestTerminology } from "@t3tools/client-runtime/source-control-clients";
import { t } from "~/i18n";
/** Reports checkout completion separately from confirmation of the requested head. */
export function offHeadPullRequestCheckoutToast(_terminology: ChangeRequestTerminology) {
  return {
    type: "warning",
    get title() {
      return t.git.pullRequest.checkedOutButNotOnTheLatestCommits;
    },
    get description() {
      return t.git.pullRequest
        .theCheckoutCouldNotBeMovedOntoThePullRequestSLatestCommitsSoTheCodeThereIsOlderThanTh;
    },
  } as const;
}
