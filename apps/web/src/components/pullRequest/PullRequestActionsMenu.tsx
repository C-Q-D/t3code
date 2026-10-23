/** Renders overflow actions; the panel owns command execution and confirmation state. */
import { PixelSparkIcon } from "../icons/PixelLucideIcon";
import { t } from "~/i18n";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import {
  type EnvironmentId,
  type PullRequestAction,
  type PullRequestDetail,
  type PullRequestMergeMethod,
  type PullRequestRef,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import {
  ArrowUpRightIcon,
  EyeIcon,
  FolderGit2Icon,
  HammerIcon,
  MoreHorizontalIcon,
  Undo2Icon,
  Trash2Icon,
} from "lucide-react";

import { readLocalApi } from "~/localApi";
import { PullRequestThreadLinks } from "./PullRequestThreadLinks";

import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";
import { resolvePullRequestActionGroups } from "./pullRequestDetail.logic";
import { type PickableEnvironment } from "./pullRequestProjectAssignment.logic";
import { PullRequestGlyph } from "./pullRequestIcons";
import { useInlineActionConfirm } from "./useInlineActionConfirm";

import { ActOnEnvironmentPicker, type PerformPullRequestAction } from "./PullRequestDetailActions";
/** Preserves the fork header behavior within the upstream component boundary. */
export function PullRequestActionsMenu({
  environmentId,
  reference,
  detail,
  linkThreadRef,
  onThreadPickerOpenChange,
  refreshing,
  refreshFromHost,
  handoff,
  canFixFindings,
  startFixFindings,
  handoffLabels,
  canWriteGuide,
  guideRunning,
  guideWritten,
  writeGuide,
  pickableEnvironments,
  actingEnvironmentId,
  onActingEnvironmentChange,
  can,
  headerActions,
  selectedMergeMethod,
  showsDeleteBranch,
  environmentConnected,
  confirmDeleteBranch,
  pendingAction,
  perform,
  openOnHostText,
  repositoryUrl,
  conflicting,
  conflictsUnavailable,
  startResolveConflicts,
  inlineConfirm,
}: {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  detail: PullRequestDetail;
  linkThreadRef: ScopedThreadRef | null;
  onThreadPickerOpenChange: (open: boolean) => void;
  refreshing: boolean;
  refreshFromHost: () => Promise<void>;
  handoff: string | null;
  canFixFindings: boolean;
  startFixFindings: () => void;
  handoffLabels: { readonly fixFindings: string };
  canWriteGuide: boolean;
  guideRunning: boolean;
  guideWritten: boolean;
  writeGuide: () => void;
  pickableEnvironments: ReadonlyArray<PickableEnvironment>;
  actingEnvironmentId: EnvironmentId;
  onActingEnvironmentChange: (environmentId: EnvironmentId) => void;
  can: (action: PullRequestAction) => boolean;
  headerActions: ReturnType<typeof resolvePullRequestActionGroups>;
  selectedMergeMethod: PullRequestMergeMethod;
  showsDeleteBranch: boolean;
  environmentConnected: boolean;
  confirmDeleteBranch: () => Promise<void>;
  pendingAction: PullRequestAction | null;
  perform: PerformPullRequestAction;
  openOnHostText: string;
  repositoryUrl: string | null;
  conflicting: boolean;
  conflictsUnavailable: boolean;
  startResolveConflicts: () => void;
  inlineConfirm: ReturnType<typeof useInlineActionConfirm>;
}) {
  const actionPending = pendingAction !== null;
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="icon"
            variant="ghost"
            aria-label={t.git.pullRequest.morePullRequestActions}
          />
        }
      >
        {refreshing ? (
          <RefreshIcon refreshing size="md" />
        ) : (
          <MoreHorizontalIcon aria-hidden className="size-4" />
        )}
      </MenuTrigger>
      <MenuPopup align="end" className="w-42.5">
        <MenuItem
          density="compact"
          closeOnClick={
            headerActions.disableAutoMerge || inlineConfirm.isArmed("enable-auto-merge")
          }
          disabled={
            actionPending || !(headerActions.enableAutoMerge || headerActions.disableAutoMerge)
          }
          aria-label={
            headerActions.disableAutoMerge
              ? t.git.pullRequest.disableAutoMerge
              : inlineConfirm.isArmed("enable-auto-merge")
                ? t.git.pullRequest.confirmAutoMerge
                : t.git.pullRequest.enableAutoMerge
          }
          {...(headerActions.disableAutoMerge
            ? { onClick: () => void perform("disable-auto-merge") }
            : inlineConfirm.props(
                "enable-auto-merge",
                () => void perform("enable-auto-merge", selectedMergeMethod),
              ))}
        >
          <PullRequestGlyph.merged aria-hidden className="size-3.5" />
          {headerActions.disableAutoMerge
            ? t.git.pullRequest.disableAutoMerge
            : pendingAction === "enable-auto-merge"
              ? t.git.pullRequest.enabling
              : inlineConfirm.isArmed("enable-auto-merge")
                ? t.git.pullRequest.confirmAutoMerge
                : t.git.pullRequest.autoMerge}
        </MenuItem>
        <MenuItem
          density="compact"
          disabled={actionPending || !headerActions.ready}
          onClick={() => void perform("ready")}
        >
          <EyeIcon aria-hidden className="size-3.5" />
          {t.git.pullRequest.readyForReview}
        </MenuItem>
        <MenuItem
          density="compact"
          disabled={actionPending || !headerActions.draft}
          onClick={() => void perform("draft")}
        >
          <PullRequestGlyph.draft aria-hidden className="size-3.5" />
          {t.git.pullRequest.convertToDraft}
        </MenuItem>
        <MenuItem
          density="compact"
          closeOnClick={inlineConfirm.isArmed("revert")}
          disabled={actionPending || detail.state !== "merged" || !can("revert")}
          variant={inlineConfirm.isArmed("revert") ? "destructive" : "default"}
          {...inlineConfirm.props("revert", () => void perform("revert"))}
        >
          <Undo2Icon aria-hidden className="size-3.5" />
          {inlineConfirm.isArmed("revert")
            ? t.git.pullRequest.confirmRevert
            : t.git.pullRequest.revertChanges}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          density="compact"
          disabled={actionPending || detail.state !== "closed" || !can("reopen")}
          onClick={() => void perform("reopen")}
        >
          <PullRequestGlyph.reopen aria-hidden className="size-3.5" />
          {t.git.pullRequest.reopen}
        </MenuItem>
        <MenuItem
          density="compact"
          closeOnClick={inlineConfirm.isArmed("close")}
          variant="destructive"
          disabled={actionPending || detail.state !== "open" || !can("close")}
          {...inlineConfirm.props("close", () => void perform("close"))}
        >
          <PullRequestGlyph.closed aria-hidden className="size-3.5" />
          {inlineConfirm.isArmed("close")
            ? t.git.pullRequest.confirmClose
            : t.git.pullRequest.close}
        </MenuItem>
        <MenuSeparator />
        {conflicting ? (
          <MenuItem
            density="compact"
            disabled={handoff !== null || conflictsUnavailable}
            onClick={startResolveConflicts}
          >
            <PullRequestGlyph.conflicting aria-hidden className="size-3.5" />
            {handoff === "conflicts"
              ? t.git.pullRequest.preparing
              : t.git.pullRequest.resolveConflicts}
          </MenuItem>
        ) : null}
        <PullRequestThreadLinks
          display="menu-item"
          environmentId={environmentId}
          reference={reference}
          url={detail.url}
          threadRef={linkThreadRef}
          onPickerOpenChange={onThreadPickerOpenChange}
        />
        <MenuItem density="compact" disabled={refreshing} onClick={() => void refreshFromHost()}>
          <RefreshIcon size="sm" refreshing={refreshing} />
          {t.git.pullRequest.refresh}
        </MenuItem>
        <MenuItem
          density="compact"
          disabled={handoff !== null || !canFixFindings}
          onClick={startFixFindings}
        >
          <HammerIcon aria-hidden className="size-3.5" />
          {handoff === "findings" ? t.git.pullRequest.preparing : handoffLabels.fixFindings}
        </MenuItem>
        {canWriteGuide ? (
          <MenuItem density="compact" disabled={guideRunning} onClick={writeGuide}>
            <PixelSparkIcon aria-hidden className="size-3.5" />
            {guideRunning ? "Writing guide..." : !guideWritten ? "Write guide" : "Rewrite guide"}
          </MenuItem>
        ) : null}
        {pickableEnvironments.length > 0 ? (
          <ActOnEnvironmentPicker
            environments={pickableEnvironments}
            value={actingEnvironmentId}
            onChange={onActingEnvironmentChange}
            disabled={handoff !== null}
          />
        ) : null}
        {showsDeleteBranch ? (
          <>
            <MenuSeparator />
            <MenuItem
              variant="destructive"
              disabled={actionPending || !environmentConnected}
              onClick={() => void confirmDeleteBranch()}
            >
              <Trash2Icon className="mt-1 size-3.5 shrink-0 self-start" />
              <span className="flex min-w-0 flex-col">
                <span>
                  {pendingAction === "delete-branch"
                    ? t.git.branchDeletionUi.deleting
                    : t.git.branchDeletionUi.delete}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {environmentConnected ? detail.headBranch : t.git.branchDeletionUi.reconnect}
                </span>
              </span>
            </MenuItem>
          </>
        ) : null}
        <MenuSeparator />
        <MenuItem
          density="compact"
          onClick={() => void readLocalApi()?.shell.openExternal(detail.url)}
        >
          <ArrowUpRightIcon aria-hidden className="size-3.5" />
          {openOnHostText}
        </MenuItem>
        {repositoryUrl ? (
          <MenuItem
            density="compact"
            onClick={() => void readLocalApi()?.shell.openExternal(repositoryUrl)}
          >
            <FolderGit2Icon aria-hidden className="size-3.5" />
            {t.git.pullRequest.openRepository(detail.repository)}
          </MenuItem>
        ) : null}
      </MenuPopup>
    </Menu>
  );
}
