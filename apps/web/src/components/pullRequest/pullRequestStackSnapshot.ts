/** Owns pull request stack snapshot on the web pull-request surface; host data and agent context remain unchanged. */
import { t } from "~/i18n";
import type { PullRequestRef, PullRequestStack, ThreadPullRequestLink } from "@t3tools/contracts";

/** Saved native membership is enough for navigation, but never supplies action head SHAs. */
export function savedPullRequestStack(
  links: ReadonlyArray<ThreadPullRequestLink>,
  reference: PullRequestRef,
): PullRequestStack | null {
  const host = reference.host?.toLowerCase();
  if (!host) return null;
  const matching = links.filter(
    (link) =>
      link.host.toLowerCase() === host &&
      link.repository.toLowerCase() === reference.repository.toLowerCase(),
  );
  const exact = matching.filter((link) => link.number === reference.number);
  const candidates =
    exact.length > 0
      ? exact
      : matching.filter((link) =>
          link.stack?.layers.some((layer) => layer.number === reference.number),
        );
  const newest = candidates.toSorted(
    (a, b) =>
      Date.parse(b.snapshot?.syncedAt ?? b.linkedAt) -
      Date.parse(a.snapshot?.syncedAt ?? a.linkedAt),
  )[0];
  const stack = newest?.stack;
  if (!stack || !stack.layers.some((layer) => layer.number === reference.number)) return null;
  return {
    id: stack.id,
    number: stack.number,
    url: stack.url,
    base: stack.base,
    layers: stack.layers.map((layer) => {
      const snapshot = matching
        .filter((link) => link.number === layer.number)
        .toSorted(
          (a, b) =>
            Date.parse(b.snapshot?.syncedAt ?? b.linkedAt) -
            Date.parse(a.snapshot?.syncedAt ?? a.linkedAt),
        )[0]?.snapshot;
      return {
        ...layer,
        ...(snapshot ? { title: snapshot.title, isDraft: snapshot.isDraft } : {}),
      };
    }),
  };
}

/**
 * A fresh absence overrides saved membership; failed refreshes preserve available navigation.
 * A background refresh keeps the last successful lookup fresh, so stack-dependent actions do
 * not blink out every time the detail revalidates.
 * @param query Current stack query data, success/pending flags, and optional refresh error.
 * @param saved Previously observed stack, or null when no saved membership exists.
 * @returns Stack data, freshness state, and an optional refresh notice; data may be null.
 */
export function pullRequestStackView(
  query: {
    data: PullRequestStack | null;
    isSuccess: boolean;
    isPending: boolean;
    error: string | null;
  },
  saved: PullRequestStack | null,
) {
  const data = query.isSuccess ? query.data : (query.data ?? saved);
  return {
    data,
    isFresh: query.isSuccess,
    notice:
      data === null
        ? null
        : query.error
          ? t.git.pullRequest.stackDataMayBeStaleWeCouldnTRefreshIt
          : !query.isSuccess || query.isPending
            ? t.git.pullRequest.refreshingStackShowingSavedData
            : null,
  };
}
