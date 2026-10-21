import { t } from "~/i18n";
export const OFF_HEAD_PULL_REQUEST_CHECKOUT_TOAST = {
  type: "warning",
  get title() {
    return t.git.pullRequest.checkedOutButNotOnTheLatestCommits;
  },
  get description() {
    return t.git.pullRequest
      .theCheckoutCouldNotBeMovedOntoThePullRequestSLatestCommitsSoTheCodeThereIsOlderThanTh;
  },
} as const;
