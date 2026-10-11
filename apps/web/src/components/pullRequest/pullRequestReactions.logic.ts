/** Owns pull request reactions logic on the web pull-request surface; host data and agent context remain unchanged. */
import { t } from "~/i18n";
import type { PullRequestReaction, PullRequestReactionContent } from "@t3tools/contracts";

/** The picker's order, which is GitHub's: the two verdicts first, then the rest as it lists them. */
export const PULL_REQUEST_REACTION_ORDER: ReadonlyArray<PullRequestReactionContent> = [
  "thumbs-up",
  "thumbs-down",
  "laugh",
  "hooray",
  "confused",
  "heart",
  "rocket",
  "eyes",
];

const REACTION_EMOJI: Record<PullRequestReactionContent, string> = {
  "thumbs-up": "👍",
  "thumbs-down": "👎",
  laugh: "😄",
  hooray: "🎉",
  confused: "😕",
  heart: "❤️",
  rocket: "🚀",
  eyes: "👀",
};

/** Dictionary keys keep host reaction identifiers separate from their spoken UI names. */
const REACTION_NAME: Record<
  PullRequestReactionContent,
  keyof typeof t.git.pullRequest.reactionNames
> = {
  "thumbs-up": "thumbsUp",
  "thumbs-down": "thumbsDown",
  laugh: "laugh",
  hooray: "hooray",
  confused: "confused",
  heart: "heart",
  rocket: "rocket",
  eyes: "eyes",
};

export function pullRequestReactionEmoji(content: PullRequestReactionContent): string {
  return REACTION_EMOJI[content];
}

/**
 * Returns the current UI dictionary's spoken name for a host reaction identifier.
 * @param content Host reaction identifier; it is never localized.
 * @returns The spoken UI name for the supplied host reaction id.
 */
export function pullRequestReactionName(content: PullRequestReactionContent): string {
  return t.git.pullRequest.reactionNames[REACTION_NAME[content]];
}

/** Past three names the sentence stops being readable and starts being a list. */
const NAMED_ACTOR_LIMIT = 3;

/**
 * Joins supplied reaction actor names for display; returns an empty string for an empty list.
 * @param parts Actor names to join in their supplied order; may be empty.
 * @returns Joined actor names, or an empty string when no names are supplied.
 */
function joinNames(parts: ReadonlyArray<string>): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return t.git.pullRequest.joinTwoNames(parts[0], parts[1]);
  return t.git.pullRequest.joinMoreNames(parts.slice(0, -1).join(", "), parts.at(-1));
}

/** "others" only alongside somebody named; on its own a count is people, not other people.
 * @param count Number of unnamed actors reported by the host.
 * @param named Whether at least one actor has already been named.
 * @returns The localized unnamed-actor count.
 */
function countRemainder(count: number, named: boolean): string {
  if (named) return t.git.pullRequest.reactionOthers(count);
  return t.git.pullRequest.reactionPeople(count);
}

/**
 * Who reacted, in GitHub's sentence. The viewer reads as "You" and comes first, because that is
 * the name they are looking for; a compliant host already leaves the viewer's own login out of
 * `actors` when they have reacted, leaving room for "You" without ever exceeding `count`. This
 * function has no viewer login to match against `actors`, so it cannot tell a non-compliant host
 * apart by name — but such a host gives itself away by leaving no room: `actors` alone already
 * accounts for everyone `count` claims. Then the viewer is already in `actors` under their own
 * login, and naming them "You" too would either invent a person or hide a real one, so `actors`
 * is named as given instead. The cap still guards further: the sentence never names more people
 * than `count` claims, and the remainder is counted rather than named — a host reports fewer
 * logins than it counts, so `count` is the only trustworthy total.
 * @param reaction Host count, actor logins, reaction identifier, and viewer reaction state.
 * @returns A localized reaction sentence that names no more actors than the host count.
 */
export function pullRequestReactionTooltip(reaction: PullRequestReaction): string {
  const viewerHasRoom = reaction.actors.length < reaction.count;
  const names =
    reaction.viewerHasReacted && viewerHasRoom
      ? [t.git.pullRequest.reactionViewer, ...reaction.actors]
      : [...reaction.actors];
  const shown = names.slice(0, Math.min(NAMED_ACTOR_LIMIT, reaction.count));
  const others = Math.max(0, reaction.count - shown.length);
  const parts = [...shown, ...(others > 0 ? [countRemainder(others, shown.length > 0)] : [])];
  return t.git.pullRequest.reactionTooltip(
    joinNames(parts),
    pullRequestReactionName(reaction.content),
  );
}

/**
 * The list as it should be drawn while a reaction is still in flight. Reading a change request
 * back from the host takes seconds, and a pill that does not move until then reads as a press
 * that did nothing.
 */
export function applyPendingPullRequestReactions(
  reactions: ReadonlyArray<PullRequestReaction>,
  pending: ReadonlyMap<PullRequestReactionContent, boolean>,
): ReadonlyArray<PullRequestReaction> {
  if (pending.size === 0) return reactions;
  const byContent = new Map(reactions.map((reaction) => [reaction.content, reaction] as const));
  for (const [content, reacted] of pending) {
    const current = byContent.get(content);
    if (current === undefined) {
      if (reacted) {
        byContent.set(content, { content, count: 1, actors: [], viewerHasReacted: true });
      }
      continue;
    }
    if (current.viewerHasReacted === reacted) continue;
    const count = current.count + (reacted ? 1 : -1);
    if (count <= 0) byContent.delete(content);
    else byContent.set(content, { ...current, count, viewerHasReacted: reacted });
  }
  return PULL_REQUEST_REACTION_ORDER.flatMap((content) => byContent.get(content) ?? []);
}
