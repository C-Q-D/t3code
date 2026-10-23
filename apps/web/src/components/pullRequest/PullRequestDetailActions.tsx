/** Owns header action rendering; the panel retains host commands and handoffs. */
import { t } from "~/i18n";
import { Group } from "../ui/group";
import {
  resolvePullRequestActionGroups,
  resolveBaseFreshness,
  PULL_REQUEST_MERGE_METHOD_LABELS,
} from "./pullRequestDetail.logic";
import type {
  EnvironmentId,
  PullRequestAction,
  PullRequestMergeMethod,
  PullRequestUpdateMethod,
} from "@t3tools/contracts";
import { ChevronDownIcon, FolderGit2Icon, GitBranchIcon, PlayIcon } from "lucide-react";

import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { Button } from "../ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { PullRequestGlyph } from "./pullRequestIcons";
import type { PickableEnvironment } from "./pullRequestProjectAssignment.logic";
import { useInlineActionConfirm } from "./useInlineActionConfirm";

export type PerformPullRequestAction = (
  action: PullRequestAction,
  method?: PullRequestMergeMethod,
  updateMethod?: PullRequestUpdateMethod,
) => Promise<boolean>;

export function ActOnEnvironmentPicker({
  environments,
  value,
  onChange,
  disabled,
}: {
  environments: ReadonlyArray<PickableEnvironment>;
  value: EnvironmentId;
  onChange: (environmentId: EnvironmentId) => void;
  disabled: boolean;
}) {
  return (
    <>
      <MenuSeparator />
      <MenuRadioGroup
        value={value}
        onValueChange={(environmentId) => onChange(environmentId as EnvironmentId)}
      >
        {environments.map((environment) => (
          <MenuRadioItem
            key={environment.environmentId}
            value={environment.environmentId}
            disabled={disabled}
          >
            <span className="flex min-w-0 items-center gap-2">
              <EnvironmentMachineIcon
                kind={environment.machine ?? "server"}
                className="size-3.5 shrink-0"
              />
              <span className="truncate">{environment.label}</span>
            </span>
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </>
  );
}

export function PullRequestCheckoutMenu({
  handoff,
  checkoutRoot,
  canPrepareWorktree,
  canCheckoutHere,
  onCheckout,
  pickableEnvironments,
  actingEnvironmentId,
  onActingEnvironmentChange,
}: {
  handoff: string | null;
  checkoutRoot: string | null;
  canPrepareWorktree: boolean;
  canCheckoutHere: boolean;
  onCheckout: (mode: "worktree" | "local") => void;
  pickableEnvironments: ReadonlyArray<PickableEnvironment>;
  actingEnvironmentId: EnvironmentId;
  onActingEnvironmentChange: (environmentId: EnvironmentId) => void;
}) {
  return (
    <Menu>
      <Group variant="split" leadingIcon aria-label={t.git.pullRequest.checkOutThisPullRequest}>
        <MenuTrigger
          disabled={handoff !== null || checkoutRoot === null}
          render={
            <Button
              size="default"
              variant="secondary"
              aria-label={
                handoff?.startsWith("checkout")
                  ? t.git.pullRequest.checkingOut
                  : t.git.pullRequest.checkOut
              }
            />
          }
        >
          <GitBranchIcon aria-hidden className="size-3.5" />
          {handoff?.startsWith("checkout")
            ? t.git.pullRequest.checkingOut
            : t.git.pullRequest.checkOutThisPullRequest}
        </MenuTrigger>
        <MenuTrigger
          disabled={handoff !== null || checkoutRoot === null}
          render={
            <Button size="icon" variant="secondary" aria-label={t.git.pullRequest.checkoutMethod} />
          }
        >
          <ChevronDownIcon aria-hidden className="size-3.5" />
        </MenuTrigger>
      </Group>
      <MenuPopup align="end" side="bottom">
        <MenuItem disabled={!canPrepareWorktree} onClick={() => onCheckout("worktree")}>
          <GitBranchIcon className="mt-1 size-3.5 shrink-0 self-start" />
          <span className="flex min-w-0 flex-col">
            <span>{t.git.pullRequest.inASeparateWorktree}</span>
            <span className="text-xs text-muted-foreground">
              {t.git.pullRequest.itsOwnFolderAndThreadNothingYouHaveOpenMoves}
            </span>
          </span>
        </MenuItem>
        <MenuItem disabled={!canCheckoutHere} onClick={() => onCheckout("local")}>
          <FolderGit2Icon className="mt-1 size-3.5 shrink-0 self-start" />
          <span className="flex min-w-0 flex-col">
            <span>{t.git.pullRequest.inThisRepository}</span>
            <span className="text-xs text-muted-foreground">
              {t.git.pullRequest.switchesTheBranchYouAreWorkingInLikeGhPrCheckout}
            </span>
          </span>
        </MenuItem>
        {pickableEnvironments.length > 0 ? (
          <ActOnEnvironmentPicker
            environments={pickableEnvironments}
            value={actingEnvironmentId}
            onChange={onActingEnvironmentChange}
            disabled={handoff !== null}
          />
        ) : null}
      </MenuPopup>
    </Menu>
  );
}

export function PullRequestResolveConflictsButton({
  handoff,
  unavailable,
  onResolve,
}: {
  handoff: string | null;
  unavailable: boolean;
  onResolve: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex shrink-0">
            <Button
              size="xs"
              variant="destructive-outline"
              disabled={handoff !== null || unavailable}
              onClick={onResolve}
              aria-label={
                handoff === "conflicts"
                  ? t.git.pullRequest.preparing
                  : t.git.pullRequest.resolveConflicts
              }
            >
              <PullRequestGlyph.conflicting aria-hidden className="size-3.5" />
              <span className="@max-[30rem]/pr-header:hidden">
                {handoff === "conflicts"
                  ? t.git.pullRequest.preparing
                  : t.git.pullRequest.resolveConflicts}
              </span>
            </Button>
          </span>
        }
      />
      <TooltipPopup side="top">
        {handoff === "conflicts" ? t.git.pullRequest.preparing : t.git.pullRequest.resolveConflicts}
      </TooltipPopup>
    </Tooltip>
  );
}

/** Preserves the fork header behavior within the upstream component boundary. */
export function PullRequestPrimaryAction({
  headerActions,
  inlineConfirm,
  pendingAction,
  selectedMergeMethod,
  allowedMergeMethods,
  onSelectMergeMethod,
  freshness,
  perform,
}: {
  headerActions: ReturnType<typeof resolvePullRequestActionGroups>;
  inlineConfirm: ReturnType<typeof useInlineActionConfirm>;
  pendingAction: PullRequestAction | null;
  selectedMergeMethod: PullRequestMergeMethod;
  allowedMergeMethods: ReadonlyArray<PullRequestMergeMethod>;
  onSelectMergeMethod: (method: PullRequestMergeMethod) => void;
  freshness: ReturnType<typeof resolveBaseFreshness>;
  perform: PerformPullRequestAction;
}) {
  const actionPending = pendingAction !== null;
  return (
    <>
      <Menu>
        <Group variant="split" leadingIcon={false} aria-label={t.git.pullRequest.merge}>
          <Button
            variant="default"
            disabled={actionPending || !headerActions.merge}
            {...inlineConfirm.props("merge", () => void perform("merge", selectedMergeMethod))}
            aria-label={
              pendingAction === "merge"
                ? t.git.pullRequest.merging
                : inlineConfirm.isArmed("merge")
                  ? t.git.pullRequest.confirmMerge
                  : t.git.pullRequest.merge
            }
          >
            {pendingAction === "merge"
              ? t.git.pullRequest.merging
              : inlineConfirm.isArmed("merge")
                ? t.git.pullRequest.confirmMerge
                : t.git.pullRequest.merge}
          </Button>
          <MenuTrigger
            disabled={actionPending || !headerActions.mergeMethods}
            render={
              <Button size="icon" variant="default" aria-label={t.git.pullRequest.mergeMethod} />
            }
          >
            <ChevronDownIcon aria-hidden className="size-3.5" />
          </MenuTrigger>
        </Group>
        <MenuPopup align="start">
          <MenuRadioGroup
            value={selectedMergeMethod}
            onValueChange={(method) => {
              const selectedMethod = method as PullRequestMergeMethod;
              onSelectMergeMethod(selectedMethod);
            }}
          >
            {allowedMergeMethods.map((method) => (
              <MenuRadioItem key={method} value={method} disabled={actionPending} closeOnClick>
                {PULL_REQUEST_MERGE_METHOD_LABELS[method]}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuPopup>
      </Menu>
      <Menu>
        <MenuTrigger
          disabled={actionPending || !freshness?.methods.length}
          render={<Button variant={freshness?.methods.length ? "default" : "secondary"} />}
        >
          {t.git.pullRequest.updateBranch}
        </MenuTrigger>
        <MenuPopup align="start">
          {freshness?.methods.map((method) => (
            <MenuItem
              key={method}
              disabled={actionPending}
              onClick={() => void perform("update-branch", undefined, method)}
            >
              {method === "rebase"
                ? t.git.pullRequest.updateWithRebase
                : t.git.pullRequest.updateBranch}
            </MenuItem>
          ))}
        </MenuPopup>
      </Menu>
    </>
  );
}

/** Preserves the fork header behavior within the upstream component boundary. */
export function PullRequestApproveWorkflowsButton({
  pendingAction,
  inlineConfirm,
  perform,
}: {
  pendingAction: PullRequestAction | null;
  inlineConfirm: ReturnType<typeof useInlineActionConfirm>;
  perform: PerformPullRequestAction;
}) {
  const actionPending = pendingAction !== null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="ml-auto inline-flex shrink-0">
            <Button
              size="xs"
              variant="warning-outline"
              disabled={actionPending}
              {...inlineConfirm.props("approve-workflows", () => void perform("approve-workflows"))}
              aria-label={
                pendingAction === "approve-workflows"
                  ? t.git.pullRequest.approving
                  : inlineConfirm.isArmed("approve-workflows")
                    ? t.git.pullRequest.confirmApprove
                    : t.git.pullRequest.approveWorkflowsToRun
              }
            >
              <PlayIcon aria-hidden className="size-3.5" />
              <span className="inline-grid">
                <span aria-hidden className="invisible col-start-1 row-start-1">
                  {t.git.pullRequest.approveWorkflowsToRun}
                </span>
                <span aria-hidden className="invisible col-start-1 row-start-1">
                  {t.git.pullRequest.confirmApprove}
                </span>
                <span className="col-start-1 row-start-1">
                  {pendingAction === "approve-workflows"
                    ? t.git.pullRequest.approving
                    : inlineConfirm.isArmed("approve-workflows")
                      ? t.git.pullRequest.confirmApprove
                      : t.git.pullRequest.approveWorkflowsToRun}
                </span>
              </span>
            </Button>
          </span>
        }
      />
      <TooltipPopup side="top">
        {pendingAction === "approve-workflows"
          ? t.git.pullRequest.approving
          : inlineConfirm.isArmed("approve-workflows")
            ? t.git.pullRequest.confirmApprove
            : t.git.pullRequest.approveWorkflowsToRun}
      </TooltipPopup>
    </Tooltip>
  );
}
