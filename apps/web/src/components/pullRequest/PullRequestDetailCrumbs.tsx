/** Owns the PR identity row and local ask, explain, and copy controls. */
import { PixelSparkIcon } from "../icons/PixelLucideIcon";
import { t } from "~/i18n";
import { useAtomValue } from "@effect/atom-react";
import { type PullRequestDetail } from "@t3tools/contracts";
import {
  ArrowLeftIcon,
  CopyIcon,
  ChevronDownIcon,
  GitBranchIcon,
  MessageCircleQuestionIcon,
  LinkIcon,
  HashIcon,
  PanelRightIcon,
  TerminalIcon,
} from "lucide-react";
import { type MouseEvent as ReactMouseEvent } from "react";

import { shortcutLabelForCommand } from "~/keybindings";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { readLocalApi } from "~/localApi";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuShortcut, MenuTrigger } from "../ui/menu";
import { openOnHostLabel, showPullRequestLinkContextMenu } from "./pullRequestLinkContextMenu";
import { resolvePullRequestState } from "./pullRequestPresentation";

const openNumberContextMenu = (
  event: ReactMouseEvent,
  detail: { readonly url: string; readonly provider: string },
): void => {
  event.preventDefault();
  event.stopPropagation();
  void showPullRequestLinkContextMenu({
    url: detail.url,
    openLabel: openOnHostLabel(sourceControlClients.get(detail.provider)),
    position: { x: event.clientX, y: event.clientY },
  });
};

/** Preserves the fork header behavior within the upstream component boundary. */
export function PullRequestDetailCrumbs({
  detail,
  onBack,
  onClose,
  handoff,
  askAboutPullRequest,
  explainPullRequest,
  copyReference,
  checkoutCommand,
}: {
  detail: PullRequestDetail | null;
  onBack: (() => void) | undefined;
  onClose: (() => void) | undefined;
  handoff: string | null;
  askAboutPullRequest: () => void;
  explainPullRequest: () => void;
  copyReference: (value: string, label: string) => void;
  checkoutCommand: string | null;
}) {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const statePresentation = detail
    ? resolvePullRequestState({ state: detail.state, isDraft: detail.isDraft })
    : null;
  return (
    <div className="flex min-h-7 min-w-0 flex-wrap items-center gap-2 px-4 pt-1 pb-2.5">
      {onBack ? (
        <Button
          size="icon-sm"
          variant="ghost-muted"
          onClick={onBack}
          aria-label={t.git.pullRequest.backToThisThreadSPullRequests}
        >
          <ArrowLeftIcon aria-hidden className="size-3.5" />
        </Button>
      ) : null}
      {detail && statePresentation ? (
        <>
          <Badge
            size="lg"
            variant={
              detail.state === "open" && detail.isDraft
                ? "neutral"
                : detail.state === "open"
                  ? "success"
                  : detail.state === "merged"
                    ? "accent"
                    : "danger"
            }
          >
            <statePresentation.Icon aria-hidden className="size-3" />
            {statePresentation.label}
          </Badge>
          <button
            type="button"
            onClick={() => void readLocalApi()?.shell.openExternal(detail.url)}
            onAuxClick={(event) => {
              if (event.button === 1) void readLocalApi()?.shell.openExternal(detail.url);
            }}
            onContextMenu={(event) => openNumberContextMenu(event, detail)}
            className="shrink-0 cursor-pointer rounded-keycap font-mono text-secondary-copy-medium text-muted-foreground underline-offset-2 hover:underline focus-visible:inset-shadow-focus"
            aria-label={t.git.pullRequest.openRequestOnHost(detail.number)}
          >
            #{detail.number}
          </button>
        </>
      ) : null}
      <div className="ml-auto flex min-w-0 items-center gap-1">
        {detail ? (
          <>
            <Button
              size="md"
              variant="ghost"
              disabled={handoff !== null}
              onClick={askAboutPullRequest}
            >
              <MessageCircleQuestionIcon aria-hidden className="size-3.5" />
              {handoff === "ask" ? t.git.pullRequest.opening : t.git.pullRequest.askAQuestion}
            </Button>
            <Button
              size="md"
              variant="secondary"
              disabled={handoff !== null}
              onClick={explainPullRequest}
            >
              <PixelSparkIcon aria-hidden className="size-3.5" />
              {handoff === "explain" ? t.git.pullRequest.opening : t.git.pullRequest.explainThisPR}
            </Button>
            <Menu>
              <MenuTrigger
                render={
                  <Button
                    size="icon-menu"
                    variant="ghost-muted"
                    aria-label={t.git.pullRequest.copyMenu}
                  />
                }
              >
                <CopyIcon aria-hidden className="size-3.5" />
                <ChevronDownIcon aria-hidden className="size-3" />
              </MenuTrigger>
              <MenuPopup align="end">
                <MenuItem onClick={() => copyReference(detail.url, t.git.pullRequest.pRLink)}>
                  <LinkIcon aria-hidden className="size-3.5" />
                  {t.git.pullRequest.copyLinkLabel}
                  <MenuShortcut>
                    {shortcutLabelForCommand(keybindings, "thread.copyReference")}
                  </MenuShortcut>
                </MenuItem>
                <MenuItem
                  onClick={() => copyReference(`#${detail.number}`, t.git.pullRequest.pRNumber)}
                >
                  <HashIcon aria-hidden className="size-3.5" />
                  {t.git.pullRequest.copyNumberLabel}
                  <MenuShortcut>
                    {shortcutLabelForCommand(keybindings, "pullRequest.copyNumber")}
                  </MenuShortcut>
                </MenuItem>
                <MenuItem
                  onClick={() => copyReference(detail.headBranch, t.git.pullRequest.branchName)}
                >
                  <GitBranchIcon aria-hidden className="size-3.5" />
                  {t.git.pullRequest.copyBranchLabel}
                </MenuItem>
                {checkoutCommand ? (
                  <MenuItem
                    onClick={() =>
                      copyReference(checkoutCommand, t.git.pullRequest.pullRequestCheckoutCommand)
                    }
                  >
                    <TerminalIcon aria-hidden className="size-3.5" />
                    {t.git.pullRequest.copyCheckoutLabel}
                  </MenuItem>
                ) : null}
              </MenuPopup>
            </Menu>
          </>
        ) : null}
        {onClose ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t.git.pullRequest.collapsePullRequestPanel}
            onClick={onClose}
          >
            <PanelRightIcon aria-hidden className="size-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
