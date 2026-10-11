/** Owns pull request link context menu on the web pull-request surface; host data and agent context remain unchanged. */
import { t } from "~/i18n";
import type { ContextMenuItem } from "@t3tools/contracts";

import { writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import { readLocalApi } from "~/localApi";

import { toastManager } from "../ui/toast";

export type PullRequestLinkContextMenuAction = "copy-link" | "open-external";

/** Named for the host rather than "externally": the point is where you will land. */
const OPEN_ON_HOST_LABELS: Partial<Record<string, string>> = {
  github: t.git.pullRequest.openOnGitHub,
  gitlab: t.git.pullRequest.openOnGitLab,
  forgejo: t.git.pullRequest.openOnForgejo,
  bitbucket: t.git.pullRequest.openOnBitbucket,
  "azure-devops": t.git.pullRequest.openOnAzureDevOps,
};

/**
 * Names the open-on-host action for a provider; unknown providers receive the generic host label.
 * @param provider Host provider identifier used only to select the menu label.
 * @returns The localized host-opening label, with a generic fallback for unknown hosts.
 */
export const openOnHostLabel = (provider: string): string =>
  OPEN_ON_HOST_LABELS[provider] ?? t.git.pullRequest.openOnHost;

/** Copy first: it is the reason to right-click a number rather than click it.
 * @param openLabel Localized action label for opening this request on its host.
 * @returns Copy-link and open-external entries in that order.
 */
function pullRequestLinkContextMenuItems(
  openLabel: string,
): readonly ContextMenuItem<PullRequestLinkContextMenuAction>[] {
  return [
    { id: "copy-link", label: t.git.pullRequest.copyLink, icon: "copy" },
    { id: "open-external", label: openLabel },
  ];
}

/**
 * The right-click on a change request's number. Everywhere else that number is written it is a
 * link, and the gesture that copies a link is the one hand reaches for — so without this the
 * platform's own edit menu opens over a control that has nothing to cut, paste or select.
 *
 * The host is named by the caller rather than guessed here: the same number belongs to GitHub,
 * GitLab, Bitbucket or Azure DevOps depending on where it was read, and the `url` the contract
 * carries is already whichever of them it came from.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns Resolves after dismissal or dispatch; returns early when no local API is available.
 */
export async function showPullRequestLinkContextMenu({
  url,
  openLabel,
  position,
}: {
  readonly url: string;
  readonly openLabel: string;
  readonly position: { readonly x: number; readonly y: number };
}): Promise<void> {
  const api = readLocalApi();
  if (!api) return;
  let action: PullRequestLinkContextMenuAction | null = null;
  try {
    action = await api.contextMenu.show(pullRequestLinkContextMenuItems(openLabel), position);
  } catch {
    // A menu that could not be shown has already cost the reader their right-click; there is
    // nothing to say about it that a second popup would not make worse.
    return;
  }
  try {
    if (action === "copy-link") await writeTextToClipboard(url, "link");
    else if (action === "open-external") await api.shell.openExternal(url);
  } catch {
    toastManager.add({
      type: "error",
      title:
        action === "copy-link"
          ? t.git.pullRequest.couldNotCopyTheLink
          : t.git.pullRequest.couldNotOpenTheLink,
    });
  }
}
