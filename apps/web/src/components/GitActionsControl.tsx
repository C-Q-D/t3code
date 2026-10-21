/** Owns web Git menus, confirmations, and publishing UI; commands and host identifiers are unchanged. */
import { t } from "~/i18n";
import { ThreadDetailsControl } from "./chat/ThreadDetailsControl";
import { useAtomValue } from "@effect/atom-react";
import {
  AuthOrchestrationOperateScope,
  AuthSourceControlWriteScope,
  SourceControlProviderKind,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type {
  GitRunStackedActionResult,
  GitStackedAction,
  SourceControlCloneProtocol,
  SourceControlProviderDiscoveryItem,
  SourceControlPublishRepositoryResult,
  SourceControlRepositoryVisibility,
  VcsStatusResult,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import * as Option from "effect/Option";
import { type MouseEvent, useEffect, useEffectEvent, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  CheckIcon,
  ChevronDownIcon,
  CloudDownloadIcon,
  CloudUploadIcon,
  FileDiffIcon,
  GitBranchPlusIcon,
  GitBranchIcon,
  MinusIcon,
  CircleCheckIcon,
  CircleXIcon,
  GitCommitIcon,
  InfoIcon,
  LockIcon,
  GlobeIcon,
} from "lucide-react";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup } from "~/components/ui/radio-group";
import { Spinner } from "~/components/ui/spinner";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";
import { useOpenPrLink } from "~/lib/openPullRequestLink";
import {
  buildMenuItems,
  formatGitActionElapsed,
  GIT_ACTION_SUCCESS_VISIBLE_MS,
  type GitActionProgressPresentation,
  type GitActionIconName,
  type GitActionMenuItem,
  type GitQuickAction,
  type DefaultBranchConfirmableAction,
  requiresDefaultBranchConfirmation,
  resolveDefaultBranchActionDialogCopy,
  resolveFeatureBranchUnavailableReason,
  resolveGitActionProgressPresentation,
  resolveGitActionResultToastTiming,
  resolveLiveThreadBranchUpdate,
  resolveThreadBranchMetadataPatch,
  resolveQuickAction,
  resolveThreadBranchUpdate,
} from "./GitActionsControl.logic";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Group, GroupSeparator } from "~/components/ui/group";
import { Input } from "~/components/ui/input";
import {
  Menu,
  MenuItem,
  MenuItemLabel,
  MenuPopup,
  MenuSub,
  MenuSubTrigger,
  MenuSubPopup,
  MenuTrigger,
} from "~/components/ui/menu";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useOpenInPreferredEditor } from "~/editorPreferences";
import {
  useGitStackedAction,
  useSourceControlActionRunning,
  useSourceControlPublishRepositoryAction,
  useVcsInitAction,
  useVcsPullAction,
} from "~/lib/sourceControlActions";
import { useThreadProjection, useQuietThreadShell } from "~/state/entities";
import { readEnvironmentScope, useEnvironmentScope } from "~/state/session";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { sourceControlEnvironment } from "~/state/sourceControl";
import { threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";
import { vcsActionManager, vcsEnvironment } from "~/state/vcs";
import { randomUUID } from "~/lib/utils";
import { resolvePathLinkTarget } from "@t3tools/shared/fileLinks";
import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";
import {
  THREAD_DETAILS_PANEL_CHEVRON_CLASS,
  THREAD_DETAILS_PANEL_ICON_CLASS,
  THREAD_DETAILS_PANEL_LABEL_CLASS,
  THREAD_DETAILS_PANEL_SPLIT_GROUP_CLASS,
  THREAD_DETAILS_PANEL_SPLIT_SEPARATOR_CLASS,
} from "./chat/threadDetailsPanelStyles";
import { getSourceControlPresentation, sourceControlIcon } from "~/sourceControlPresentation";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { formatDiffCount } from "@t3tools/client-runtime/diff-count";
import { useOpenLink } from "~/browser/useOpenLink";

/** Repository action target and presentation; panel-specific options do not alter toolbar rendering. */
interface GitActionsControlProps {
  presentation?: "toolbar" | "menu";
  gitCwd: string | null;
  activeThreadRef: ScopedThreadRef | null;
  draftId?: DraftId;
  onOpenPullRequest?: ((number: number) => void) | undefined;
  displayMode?: "toolbar" | "panel";
  compact?: boolean;
  /** The details section can place the existing changes action in its heading instead. */
  showChangesRow?: boolean;
  onOpenChanges?: () => void;
}

interface PendingDefaultBranchAction {
  action: DefaultBranchConfirmableAction;
  branchName: string;
  includesCommit: boolean;
  commitMessage?: string;
  onConfirmed?: () => void;
  filePaths?: string[];
}

type GitActionToastId = ReturnType<typeof toastManager.add>;

interface RunGitActionWithToastInput {
  action: GitStackedAction;
  commitMessage?: string;
  onConfirmed?: () => void;
  skipDefaultBranchPrompt?: boolean;
  statusOverride?: VcsStatusResult | null;
  featureBranch?: boolean;
  filePaths?: string[];
}

interface InlineGitActionSuccess {
  readonly title: string;
  readonly description: string | null;
  readonly scopeKey: string;
}

const GIT_STATUS_WINDOW_REFRESH_DEBOUNCE_MS = 250;

type RefreshVcsStatus = (target: {
  readonly environmentId: ScopedThreadRef["environmentId"];
  readonly input: { readonly cwd: string };
}) => Promise<unknown>;

function requestVcsStatusRefresh(
  refresh: RefreshVcsStatus,
  environmentId: ScopedThreadRef["environmentId"] | null,
  cwd: string | null,
): void {
  if (environmentId === null || cwd === null) {
    return;
  }
  void refresh({ environmentId, input: { cwd } });
}
const RUNNING_SOURCE_CONTROL_ACTIONS = ["runStackedAction", "pull", "publishRepository"] as const;

const PUBLISH_PROVIDER_OPTIONS = sourceControlClients.definitions.map((definition) => ({
  value: definition.kind,
  label: definition.pickerLabel,
  description:
    definition.kind === "forgejo"
      ? t.git.actions.yourSignedInServer
      : definition.publishDescription,
  pathPlaceholder:
    definition.kind === "gitlab"
      ? t.git.actions.groupProjectPlaceholder
      : definition.kind === "bitbucket"
        ? t.git.actions.workspaceRepositoryPlaceholder
        : definition.kind === "azure-devops"
          ? t.git.actions.projectRepositoryPlaceholder
          : ["github", "forgejo", "gitcafe"].includes(definition.kind)
            ? t.git.actions.ownerRepositoryPlaceholder
            : definition.repositoryPathHint,
  definition,
  Icon: sourceControlIcon(definition),
}));

function publishProviderOption(provider: SourceControlProviderKind) {
  return (
    PUBLISH_PROVIDER_OPTIONS.find((option) => option.value === provider) ??
    PUBLISH_PROVIDER_OPTIONS[0]!
  );
}

function getPublishProviderReadiness(input: {
  provider: SourceControlProviderKind;
  sourceControlProviders: ReadonlyArray<SourceControlProviderDiscoveryItem>;
}): { readonly ready: boolean; readonly hint: string | null } {
  const discovered = input.sourceControlProviders.find(
    (provider) => provider.kind === input.provider,
  );
  if (!discovered) {
    return {
      ready: false,
      hint: t.git.actions.providerStatusUnavailableOpenSettingsSourceControlAndRescan,
    };
  }
  if (discovered.status !== "available") {
    return { ready: false, hint: discovered.installHint };
  }
  if (discovered.auth.status === "unauthenticated") {
    return {
      ready: false,
      hint:
        Option.getOrNull(discovered.auth.detail) ??
        t.git.actions.providerUnauthenticated(discovered.label),
    };
  }
  return { ready: true, hint: null };
}

/**
 * Explains why a disabled Git menu entry cannot run; returns null for an enabled entry.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns A display reason, or null when the menu item is enabled.
 */
function getMenuActionDisabledReason({
  item,
  gitStatus,
  isBusy,
  hasPrimaryRemote,
}: {
  item: GitActionMenuItem;
  gitStatus: VcsStatusResult | null;
  isBusy: boolean;
  hasPrimaryRemote: boolean;
}): string | null {
  if (!item.disabled) return null;
  if (isBusy) return t.git.actions.gitActionInProgress;
  if (!gitStatus) return t.git.actions.gitStatusIsUnavailable;

  const hasBranch = gitStatus.refName !== null;
  const hasChanges = gitStatus.hasWorkingTreeChanges;
  const isAhead = gitStatus.aheadCount > 0;
  const isBehind = gitStatus.behindCount > 0;
  const terminology = getSourceControlPresentation(gitStatus.sourceControlProvider).terminology;

  if (item.id === "commit") {
    if (!hasChanges) {
      return t.git.actions.worktreeIsCleanMakeChangesBeforeCommitting;
    }
    return t.git.actions.commitIsCurrentlyUnavailable;
  }

  if (item.id === "push") {
    if (!hasBranch) {
      return t.git.actions.detachedHEADCheckOutABranchBeforePushing;
    }
    if (hasChanges) {
      return t.git.actions.commitOrStashLocalChangesBeforePushing;
    }
    if (isBehind) {
      return t.git.actions.branchIsBehindUpstreamPullRebaseBeforePushing;
    }
    if (!gitStatus.hasUpstream && !hasPrimaryRemote) {
      return t.git.actions.addAnOriginRemoteBeforePushing;
    }
    if (!isAhead) {
      return t.git.actions.noLocalCommitsToPush;
    }
    return t.git.actions.pushIsCurrentlyUnavailable;
  }

  if (!hasBranch) {
    return t.git.actions.detachedBeforeRequest(terminology.singular);
  }
  if (!gitStatus.hasUpstream && !hasPrimaryRemote) {
    return t.git.actions.originBeforeRequest(terminology.singular);
  }
  if ((gitStatus.aheadOfDefaultCount ?? gitStatus.aheadCount) <= 0) {
    return t.git.actions.noCommitsForRequest(terminology.singular);
  }
  if (isBehind) {
    return t.git.actions.behindBeforeRequest(terminology.singular);
  }
  return t.git.actions.requestUnavailable(terminology.singular);
}

const COMMIT_DIALOG_TITLE = t.git.actions.commitChanges;
const COMMIT_DIALOG_DESCRIPTION =
  t.git.actions.reviewAndConfirmYourCommitLeaveTheMessageBlankToAutoGenerateOne;

function GitActionItemIcon({
  icon,
  SourceControlIcon,
}: {
  icon: GitActionIconName;
  SourceControlIcon: ReturnType<typeof getSourceControlPresentation>["Icon"];
}) {
  if (icon === "commit") return <GitCommitIcon />;
  if (icon === "push") return <CloudUploadIcon />;
  return <SourceControlIcon />;
}

/**
 * Renders the Git action icon, including disabled hint actions whose labels use the current UI language.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface.
 */
function GitQuickActionIcon({
  quickAction,
  SourceControlIcon,
  className = "size-3.5",
}: {
  quickAction: GitQuickAction;
  className?: string;
  SourceControlIcon: ReturnType<typeof getSourceControlPresentation>["Icon"];
}) {
  if (quickAction.kind === "open_publish") return <CloudUploadIcon className={className} />;
  if (quickAction.kind === "run_pull") return <CloudDownloadIcon className={className} />;
  if (quickAction.kind === "run_action") {
    if (quickAction.action === "commit") return <GitCommitIcon className={className} />;
    if (quickAction.action === "push" || quickAction.action === "commit_push") {
      return <CloudUploadIcon className={className} />;
    }
    return <SourceControlIcon className={className} />;
  }
  if (quickAction.label === t.git.actions.commit) return <GitCommitIcon className={className} />;
  if (quickAction.label === t.git.actions.push) return <CloudUploadIcon className={className} />;
  return <InfoIcon className={className} />;
}

function GitActionElapsedTime({
  startedAtMs,
  className,
}: {
  startedAtMs: number | null;
  className?: string;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (startedAtMs === null) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);
    return () => window.clearInterval(intervalId);
  }, [startedAtMs]);

  const elapsed = formatGitActionElapsed(startedAtMs, nowMs);
  if (!elapsed) {
    return null;
  }

  return <p className={className}>{elapsed}</p>;
}

function GitActionProgressButtonContent({
  progress,
  isPanel,
}: {
  progress: GitActionProgressPresentation;
  isPanel: boolean;
}) {
  const hasOutput = progress.output !== null;

  return (
    <div
      aria-atomic="false"
      aria-live="polite"
      className={cn(
        "grid min-w-0 flex-1 items-center",
        isPanel
          ? "grid-cols-[auto_minmax(0,1fr)] grid-rows-[1.5rem] gap-x-3"
          : "grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[1.25rem] gap-x-2.5 sm:grid-rows-[1rem]",
      )}
      role="status"
    >
      <Spinner aria-hidden="true" className="row-start-1 -mx-0.5 shrink-0" />
      <p
        className={cn(
          "row-start-1 min-w-0 truncate text-left",
          isPanel && THREAD_DETAILS_PANEL_LABEL_CLASS,
        )}
      >
        {progress.status}
      </p>
      {!isPanel ? (
        <GitActionElapsedTime
          startedAtMs={progress.startedAtMs}
          className="row-start-1 text-2xs font-normal tabular-nums text-muted-foreground"
        />
      ) : null}
      <div
        className={cn(
          "col-start-2 grid min-w-0 transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
          !isPanel && "col-span-2",
          hasOutput ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <Tooltip>
            <TooltipTrigger
              render={
                <p className="truncate pt-0.5 text-left text-2xs font-normal text-muted-foreground" />
              }
            >
              {progress.output}
            </TooltipTrigger>
            <TooltipPopup side="bottom" className="max-w-96 break-words">
              {progress.output}
            </TooltipPopup>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function GitActionSuccessButtonContent({ success }: { success: InlineGitActionSuccess }) {
  const hasDescription = success.description !== null;

  return (
    <div
      aria-live="polite"
      className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] grid-rows-[1.5rem] items-center gap-x-3"
      role="status"
    >
      <CheckIcon aria-hidden="true" className="size-3.5 shrink-0 text-success" />
      <p className={cn("min-w-0 truncate text-left", THREAD_DETAILS_PANEL_LABEL_CLASS)}>
        {success.title}
      </p>
      <div
        className={cn(
          "col-start-2 grid min-w-0 transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
          hasDescription ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <Tooltip>
            <TooltipTrigger
              render={
                <p className="truncate pt-0.5 text-left text-2xs font-normal text-muted-foreground" />
              }
            >
              {success.description}
            </TooltipTrigger>
            <TooltipPopup side="bottom" className="max-w-96 break-words">
              {success.description}
            </TooltipPopup>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

interface PublishRepositoryDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: ScopedThreadRef["environmentId"] | null;
  readonly threadRef: ScopedThreadRef | null;
  readonly gitCwd: string;
}

/**
 * Renders the provider, repository, and summary steps and submits the chosen publish request.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface.
 */
function PublishRepositoryDialog(props: PublishRepositoryDialogProps) {
  const openLink = useOpenLink(props.threadRef);
  const navigate = useNavigate();
  const sourceControlDiscovery = useEnvironmentQuery(
    props.environmentId === null
      ? null
      : sourceControlEnvironment.discovery({
          environmentId: props.environmentId,
          input: {},
        }),
  );
  const [selectedPublishProvider, setSelectedPublishProvider] =
    useState<SourceControlProviderKind | null>(null);
  const [publishRepositoryOverride, setPublishRepositoryOverride] = useState<string | null>(null);
  const [publishVisibility, setPublishVisibility] =
    useState<SourceControlRepositoryVisibility>("private");
  const [publishRemoteName, setPublishRemoteName] = useState("origin");
  const [publishProtocol, setPublishProtocol] = useState<SourceControlCloneProtocol>("ssh");
  const [publishWizardStep, setPublishWizardStep] = useState(0);
  const [publishAdvancedOpen, setPublishAdvancedOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<SourceControlPublishRepositoryResult | null>(
    null,
  );
  const sourceControlScope = {
    environmentId: props.environmentId,
    cwd: props.gitCwd,
  };
  const publishRepositoryAction = useSourceControlPublishRepositoryAction(sourceControlScope);
  const publishAccountByProvider = new Map<string, string | null>();
  for (const provider of sourceControlDiscovery.data?.sourceControlProviders ?? []) {
    publishAccountByProvider.set(provider.kind, Option.getOrNull(provider.auth.account));
  }
  const publishSourceControlProviders = sourceControlDiscovery.data?.sourceControlProviders ?? [];
  const publishReadinessByProvider = new Map(
    PUBLISH_PROVIDER_OPTIONS.map((option) => [
      option.value,
      getPublishProviderReadiness({
        provider: option.value,
        sourceControlProviders: publishSourceControlProviders,
      }),
    ]),
  );
  const publishProviderReadiness = (provider: SourceControlProviderKind) =>
    publishReadinessByProvider.get(provider) ?? { ready: false, hint: null };
  const hasReadyPublishProvider = PUBLISH_PROVIDER_OPTIONS.some(
    (option) => publishProviderReadiness(option.value).ready,
  );
  const sortedPublishProviderOptions = PUBLISH_PROVIDER_OPTIONS.toSorted((left, right) => {
    const leftReady = publishProviderReadiness(left.value).ready;
    const rightReady = publishProviderReadiness(right.value).ready;
    if (leftReady !== rightReady) {
      return leftReady ? -1 : 1;
    }
    return left.label.localeCompare(right.label);
  });
  const firstReadyPublishProvider = sortedPublishProviderOptions.find(
    (option) => publishProviderReadiness(option.value).ready,
  )?.value;
  const publishProvider =
    selectedPublishProvider !== null && publishProviderReadiness(selectedPublishProvider).ready
      ? selectedPublishProvider
      : (firstReadyPublishProvider ??
        selectedPublishProvider ??
        sourceControlClients.get(undefined).kind);
  const selectedPublishProviderReadiness = publishProviderReadiness(publishProvider);
  const publishAccount = publishAccountByProvider.get(publishProvider) ?? null;
  const publishRepositoryPrefill = publishAccount ? `${publishAccount}/` : "";
  const publishRepository = publishRepositoryOverride ?? publishRepositoryPrefill;
  const currentPublishProvider = publishProviderOption(publishProvider);
  const publishHost = currentPublishProvider.definition.publishHost(
    Option.getOrNull(
      sourceControlDiscovery.data?.sourceControlProviders.find(
        (provider) => provider.kind === publishProvider,
      )?.auth.host ?? Option.none(),
    ),
  );
  const publishPathPlaceholder = currentPublishProvider.pathPlaceholder;
  const publishProviderLabel = currentPublishProvider.label;
  const publishWizardSteps = [
    t.git.actions.provider,
    t.git.actions.repository,
    t.git.actions.summary,
  ] as const;
  const publishWizardStepSummaries = [
    publishProviderLabel,
    publishResult?.repository.nameWithOwner ?? null,
    null,
  ] as const;

  const publishRepositoryParts = publishRepository.trim().split("/");
  const publishRepositoryOwner = publishRepositoryParts[0]?.trim() ?? "";
  const publishRepositoryName = publishRepositoryParts.slice(1).join("/").trim();
  const canSubmitPublishRepository =
    publishRepositoryAction.isAllowed &&
    selectedPublishProviderReadiness.ready &&
    !publishRepositoryAction.isPending &&
    publishRepositoryOwner.length > 0 &&
    publishRepositoryName.length > 0;

  const submitPublishRepository = () => {
    if (!canSubmitPublishRepository) {
      return;
    }

    setPublishError(null);

    void (async () => {
      const result = await publishRepositoryAction.run({
        provider: publishProvider,
        repository: publishRepository.trim(),
        visibility: publishVisibility,
        remoteName: publishRemoteName.trim() || "origin",
        protocol: publishProtocol,
      });

      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          setPublishError(error instanceof Error ? error.message : t.git.actions.anErrorOccurred);
        }
        return;
      }

      flushSync(() => {
        setPublishResult(result.value);
        setPublishWizardStep(2);
      });
    })();
  };

  const resetState = () => {
    setPublishRemoteName("origin");
    setPublishRepositoryOverride(null);
    setPublishWizardStep(0);
    setPublishAdvancedOpen(false);
    setPublishError(null);
    setPublishResult(null);
  };

  const handleOpenChange = (open: boolean) => {
    props.onOpenChange(open);
    if (!open) {
      resetState();
    }
  };

  const openSourceControlSettings = () => {
    handleOpenChange(false);
    void navigate({ to: "/settings/source-control" });
  };

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogPopup size="wide">
        <DialogHeader>
          <DialogTitle>{t.git.actions.publishRepositoryDialogTitle}</DialogTitle>
          <DialogDescription className="sr-only">
            {t.git.actions.pickWhereToHostItThenPointUsAtARepoToPushTo}
          </DialogDescription>
          <ol className="ov1-publish-steps" aria-label={t.app.wizard.progress}>
            {publishWizardSteps.map((step, index) => (
              <li key={step} className="flex min-w-0 items-center gap-2">
                {index > 0 && <span className="h-px w-5 shrink-0 bg-border" aria-hidden />}
                <button
                  type="button"
                  className="ov1-publish-step"
                  aria-current={index === publishWizardStep ? "step" : undefined}
                  aria-label={t.app.wizard.step(
                    step,
                    index + 1,
                    index < publishWizardStep && publishWizardStepSummaries[index]
                      ? `, ${publishWizardStepSummaries[index]}`
                      : "",
                  )}
                  disabled={
                    publishWizardStep === 2 ||
                    index >= publishWizardSteps.length - 1 ||
                    index > publishWizardStep
                  }
                  onClick={() => setPublishWizardStep(index)}
                >
                  <span className="ov1-publish-step-number" aria-hidden>
                    {index < publishWizardStep ? <CheckIcon className="size-3" /> : index + 1}
                  </span>
                  <span className="truncate">{step}</span>
                </button>
              </li>
            ))}
          </ol>
        </DialogHeader>

        <DialogPanel>
          <div className={cn("space-y-2", publishWizardStep !== 0 && "hidden")}>
            <span id="publish-provider-cards-label" className="ov1-field-label">
              {t.git.actions.provider}
            </span>
            <RadioGroup
              value={publishProvider}
              onValueChange={(value) => {
                setSelectedPublishProvider(value as SourceControlProviderKind);
                setPublishRepositoryOverride(null);
              }}
              aria-labelledby="publish-provider-cards-label"
              className="grid grid-cols-2"
            >
              {sortedPublishProviderOptions.map((option) => {
                const readiness = publishProviderReadiness(option.value);
                if (!readiness.ready) {
                  return (
                    <div
                      key={option.value}
                      className="ov1-provider-card cursor-not-allowed opacity-60"
                    >
                      <option.Icon className="size-5 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-control font-semibold">
                        {option.label}
                      </span>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="warning-outline"
                              size="micro"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                openSourceControlSettings();
                              }}
                            >
                              {t.git.actions.setupRequired}
                            </Button>
                          }
                        />
                        <TooltipPopup side="top" align="end">
                          {readiness.hint ??
                            t.git.actions.openSettingsSourceControlToConfigureThisProvider}
                        </TooltipPopup>
                      </Tooltip>
                    </div>
                  );
                }

                return (
                  <RadioPrimitive.Root
                    key={option.value}
                    value={option.value}
                    className="ov1-provider-card"
                  >
                    <option.Icon className="size-5 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-control font-semibold">
                      {option.label}
                    </span>
                  </RadioPrimitive.Root>
                );
              })}
            </RadioGroup>
          </div>

          <div className={cn("space-y-5", publishWizardStep !== 1 && "hidden")}>
            <div className="space-y-2">
              <label htmlFor="publish-repository-path" className="ov1-field-label">
                {t.git.actions.repository}
              </label>
              <div className="ov1-publish-path">
                <span className="flex shrink-0 items-center gap-1.5 pl-3.5 font-mono text-secondary-copy text-muted-foreground">
                  <currentPublishProvider.Icon className="size-3.5" />
                  {publishHost}/
                </span>
                <input
                  id="publish-repository-path"
                  name="publish-repository-path"
                  value={publishRepository}
                  onChange={(event) => {
                    setPublishRepositoryOverride(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitPublishRepository();
                    }
                  }}
                  placeholder={publishPathPlaceholder}
                  disabled={publishRepositoryAction.isPending}
                  className="h-9.5 min-w-0 flex-1 bg-transparent pr-3.5 font-mono text-secondary-copy-medium text-foreground outline-none placeholder:text-placeholder"
                />
              </div>
            </div>

            <div className="space-y-2">
              <span id="publish-visibility-cards-label" className="ov1-field-label">
                {t.git.actions.visibility}
              </span>
              <RadioGroup
                value={publishVisibility}
                onValueChange={(value) =>
                  setPublishVisibility(value as SourceControlRepositoryVisibility)
                }
                aria-labelledby="publish-visibility-cards-label"
                disabled={publishRepositoryAction.isPending}
              >
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      value: "private" as const,
                      label: t.git.actions.private,
                      description: t.git.actions.onlyInvitedPeople,
                      Icon: LockIcon,
                    },
                    {
                      value: "public" as const,
                      label: t.git.actions.public,
                      description: t.git.actions.anyoneOnTheWeb,
                      Icon: GlobeIcon,
                    },
                  ].map((option) => {
                    return (
                      <RadioPrimitive.Root
                        key={option.value}
                        value={option.value}
                        className="ov1-publish-visibility"
                      >
                        <span className="flex items-center gap-1.5 font-semibold">
                          <option.Icon className="size-3.5 shrink-0" aria-hidden />
                          {option.label}
                        </span>
                        <span className="text-secondary-copy text-secondary-label">
                          {option.description}
                        </span>
                      </RadioPrimitive.Root>
                    );
                  })}
                </div>
              </RadioGroup>
            </div>

            <div>
              <div className="flex items-center gap-2 text-secondary-copy-medium text-code-foreground">
                <button
                  type="button"
                  onClick={() => setPublishAdvancedOpen((prev) => !prev)}
                  aria-expanded={publishAdvancedOpen}
                  className="flex items-center gap-2 rounded-tag outline-none focus-visible:inset-shadow-focus"
                >
                  <ChevronDownIcon
                    className={cn(
                      "size-3.25 transition-transform",
                      !publishAdvancedOpen && "-rotate-90",
                    )}
                  />
                  {t.git.actions.advanced}
                </button>
                <span id="publish-protocol-label" className="ml-auto">
                  {t.git.actions.protocol}
                </span>
                <Select
                  value={publishProtocol}
                  onValueChange={(protocol) => {
                    if (protocol === "ssh" || protocol === "https") setPublishProtocol(protocol);
                  }}
                  disabled={publishRepositoryAction.isPending}
                >
                  <SelectTrigger
                    size="compact"
                    className="w-auto min-w-0"
                    aria-labelledby="publish-protocol-label"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="ssh">SSH</SelectItem>
                    <SelectItem value="https">HTTPS</SelectItem>
                  </SelectPopup>
                </Select>
              </div>
              {publishAdvancedOpen ? (
                <label className="mt-3 grid gap-1.5" htmlFor="publish-remote-name">
                  <span className="ov1-field-label">{t.git.diff.remote}</span>
                  <Input
                    id="publish-remote-name"
                    value={publishRemoteName}
                    onChange={(event) => setPublishRemoteName(event.target.value)}
                    placeholder="origin"
                    disabled={publishRepositoryAction.isPending}
                  />
                </label>
              ) : null}
            </div>

            {publishRepositoryAction.isPending ? (
              <div
                role="status"
                aria-live="polite"
                className="flex min-h-11 items-center gap-2 rounded-ov1-option bg-ov1-option-surface px-3.5 py-2 text-secondary-copy text-secondary-label"
              >
                <Spinner size="sm" aria-hidden />
                {t.git.actions.publishingRepositoryTo}
                {publishProviderLabel}...
              </div>
            ) : null}
            {publishError && !publishRepositoryAction.isPending ? (
              <div role="alert" className="rounded-ov1-option bg-error-surface px-3.5 text-error">
                <p className="flex min-h-11 items-center gap-2 text-control font-semibold">
                  <CircleXIcon className="size-3.75 shrink-0" aria-hidden />
                  {t.git.actions.publishFailed}
                </p>
                <p className="pb-3 text-secondary-copy break-words">{publishError}</p>
              </div>
            ) : null}
          </div>

          <div className={cn("space-y-4", publishWizardStep !== 2 && "hidden")}>
            {publishResult ? (
              <>
                <div
                  role="status"
                  className="flex min-h-11 items-center gap-2 rounded-ov1-option bg-status-success px-3.5 py-2 text-control font-semibold text-success-foreground"
                >
                  <CircleCheckIcon className="size-3.75 shrink-0" aria-hidden />
                  {publishResult.status === "pushed"
                    ? t.git.actions.repositoryPublished
                    : t.git.actions.repositoryCreated}
                </div>
                <p className="text-secondary-copy text-secondary-label">
                  {publishResult.status === "pushed"
                    ? t.git.actions.publishedBranch(publishResult.branch, publishProviderLabel)
                    : t.git.actions.remoteReady(publishResult.remoteName)}
                </p>
                <div className="flex items-center gap-2 rounded-ov1-option bg-ov1-option-surface px-3.5 py-3">
                  <currentPublishProvider.Icon className="size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate font-mono text-secondary-copy text-foreground">
                    {publishResult.repository.nameWithOwner}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="dialog-action"
                  className="w-full"
                  onClick={() => {
                    void openLink(publishResult.repository.url).catch(() => undefined);
                  }}
                >
                  {t.git.actions.openOn}
                  {publishProviderLabel}
                </Button>
              </>
            ) : (
              <div className="rounded-ov1-option bg-ov1-option-surface px-3.5 py-3 text-secondary-copy text-secondary-label">
                {t.git.actions.publishResultUnavailable}
              </div>
            )}
          </div>
        </DialogPanel>

        <DialogFooter variant="bare" className="justify-between">
          {publishWizardStep === 2 ? (
            <Button
              size="dialog-action-wide"
              className="ml-auto"
              onClick={() => handleOpenChange(false)}
            >
              {t.git.actions.done}
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="dialog-action"
                disabled={publishRepositoryAction.isPending}
                onClick={() => {
                  if (publishWizardStep === 0) {
                    handleOpenChange(false);
                    return;
                  }
                  setPublishWizardStep((step) => Math.max(0, step - 1));
                }}
              >
                {publishWizardStep === 0 ? t.common.confirm.cancel : t.git.actions.back}
              </Button>
              {publishWizardStep < 1 ? (
                <Button
                  size="dialog-action-wide"
                  disabled={!hasReadyPublishProvider || !selectedPublishProviderReadiness.ready}
                  onClick={() => setPublishWizardStep((step) => Math.min(1, step + 1))}
                >
                  {t.git.actions.next}
                </Button>
              ) : (
                <Button
                  size="dialog-action-wide"
                  disabled={!canSubmitPublishRepository}
                  onClick={submitPublishRepository}
                >
                  {publishRepositoryAction.isPending ? (
                    <>
                      <Spinner size="sm" aria-hidden />
                      {t.git.actions.publishing}
                    </>
                  ) : (
                    t.git.actions.publish
                  )}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/**
 * Renders repository actions, confirmations, and publish controls; returns null without a repository working directory.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface; null under the conditions described above.
 */
export default function GitActionsControl({
  presentation = "toolbar",
  gitCwd,
  activeThreadRef,
  draftId,
  displayMode = "toolbar",
  compact = false,
  showChangesRow = true,
  onOpenChanges,
}: GitActionsControlProps) {
  const isPanel = displayMode === "panel";
  const ActionGroup = isPanel ? "div" : Group;
  const panelAnchorRef = useRef<HTMLDivElement | null>(null);
  const updateThreadMetadata = useAtomCommand(
    threadEnvironment.updateMetadata,
    "thread branch metadata update",
  );
  const activeEnvironmentId = activeThreadRef?.environmentId ?? null;
  const successScopeKey = `${activeEnvironmentId ?? ""}\u0000${gitCwd ?? ""}`;
  const canWriteSourceControl = useEnvironmentScope(
    activeEnvironmentId,
    AuthSourceControlWriteScope,
  );
  const canOperateThread = useEnvironmentScope(activeEnvironmentId, AuthOrchestrationOperateScope);
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(activeEnvironmentId));
  const openInPreferredEditor = useOpenInPreferredEditor(
    activeEnvironmentId,
    serverConfig?.availableEditors ?? [],
  );
  const threadToastData = activeThreadRef ? { threadRef: activeThreadRef } : undefined;
  const activeServerThreadShell = useQuietThreadShell(activeThreadRef);
  const openPrLink = useOpenPrLink(activeThreadRef ?? undefined);
  const activeDraftThread = useComposerDraftStore((store) =>
    draftId
      ? store.getDraftSession(draftId)
      : activeThreadRef
        ? store.getDraftThreadByRef(activeThreadRef)
        : null,
  );
  const activeServerThreadProjection = useThreadProjection(
    activeDraftThread !== null && activeServerThreadShell === null ? null : activeThreadRef,
  );
  const activeServerThread =
    activeServerThreadShell ?? activeServerThreadProjection?.projection.thread ?? null;
  const isLocalDraftThread = activeDraftThread !== null && activeServerThread === null;
  const canChangeThreadBranch = canWriteSourceControl && (isLocalDraftThread || canOperateThread);
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);
  const [isCommitDialogOpen, setIsCommitDialogOpen] = useState(false);
  const [dialogCommitMessage, setDialogCommitMessage] = useState("");
  const [excludedFiles, setExcludedFiles] = useState<ReadonlySet<string>>(new Set());
  const [commitOnNewBranch, setCommitOnNewBranch] = useState(false);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [inlineSuccess, setInlineSuccess] = useState<InlineGitActionSuccess | null>(null);
  const [pendingDefaultBranchAction, setPendingDefaultBranchAction] =
    useState<PendingDefaultBranchAction | null>(null);
  const sourceControlScope = { environmentId: activeEnvironmentId, cwd: gitCwd };
  const vcsActionState = useAtomValue(vcsActionManager.stateAtom(sourceControlScope));
  const visibleInlineSuccess = inlineSuccess?.scopeKey === successScopeKey ? inlineSuccess : null;

  useEffect(() => {
    if (!inlineSuccess) return;
    const timeoutId = window.setTimeout(() => {
      setInlineSuccess(null);
    }, GIT_ACTION_SUCCESS_VISIBLE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [inlineSuccess]);

  const persistThreadBranchSync = (branch: string | null, manualSelection = false) => {
    if (!activeThreadRef) {
      return;
    }

    if (activeServerThread) {
      if (
        !readEnvironmentScope(activeThreadRef.environmentId, AuthOrchestrationOperateScope) ||
        activeServerThread.branch === branch
      ) {
        return;
      }

      void updateThreadMetadata({
        environmentId: activeThreadRef.environmentId,
        input: {
          threadId: activeThreadRef.threadId,
          ...resolveThreadBranchMetadataPatch(branch, activeServerThread.branch),
        },
      });

      return;
    }

    if (!activeDraftThread || activeDraftThread.branch === branch) {
      return;
    }

    setDraftThreadContext(draftId ?? activeThreadRef, {
      branch,
      worktreePath: activeDraftThread.worktreePath,
      environmentSelection: manualSelection
        ? "manual"
        : (activeDraftThread.environmentSelection ??
          (activeDraftThread.branch ? "manual" : "auto")),
    });
  };
  const persistLiveThreadBranch = useEffectEvent((branch: string | null) => {
    persistThreadBranchSync(branch);
  });

  const syncThreadBranchAfterGitAction = (result: GitRunStackedActionResult) => {
    const branchUpdate = resolveThreadBranchUpdate(result);
    if (!branchUpdate) {
      return;
    }

    persistThreadBranchSync(branchUpdate.branch, true);
  };

  const gitStatusQuery = useEnvironmentQuery(
    activeEnvironmentId !== null && gitCwd !== null
      ? vcsEnvironment.status({
          environmentId: activeEnvironmentId,
          input: { cwd: gitCwd },
        })
      : null,
  );
  const refreshVcsStatus = useAtomCommand(vcsEnvironment.refreshStatus, {
    reportFailure: false,
  });
  const { data: gitStatus, error: gitStatusError } = gitStatusQuery;
  const sourceControlPresentation = getSourceControlPresentation(gitStatus?.sourceControlProvider);
  const changeRequestTerminology = sourceControlPresentation.terminology;
  const SourceControlIcon = sourceControlPresentation.Icon;
  const isRepo = gitStatus?.isRepo ?? true;
  const hasPrimaryRemote = gitStatus?.hasPrimaryRemote ?? false;
  const gitStatusForActions = gitStatus;
  const changesTotals = gitStatusForActions?.branchChanges ?? gitStatusForActions?.workingTree;

  const allFiles = gitStatusForActions?.workingTree.files ?? [];
  // Changed-file paths are repository-relative, so they must resolve against
  // the worktree root from the same status snapshot, not the project cwd.
  const workingTreeRoot = gitStatusForActions?.workingTree.rootPath ?? null;
  const selectedFiles = allFiles.filter((f) => !excludedFiles.has(f.path));
  const allSelected = excludedFiles.size === 0;
  const noneSelected = selectedFiles.length === 0;

  const initAction = useVcsInitAction(sourceControlScope);
  const runImmediateGitAction = useGitStackedAction(sourceControlScope);
  const pullAction = useVcsPullAction(sourceControlScope);
  const isGitActionRunning = useSourceControlActionRunning(
    sourceControlScope,
    RUNNING_SOURCE_CONTROL_ACTIONS,
  );
  const isSelectingWorktreeBase =
    !activeServerThread &&
    activeDraftThread?.envMode === "worktree" &&
    activeDraftThread.worktreePath === null;

  useEffect(() => {
    if (isGitActionRunning || isSelectingWorktreeBase || activeServerThread) {
      return;
    }

    const branchUpdate = resolveLiveThreadBranchUpdate({
      threadBranch: activeDraftThread?.branch ?? null,
      gitStatus: gitStatusForActions,
    });
    if (!branchUpdate) {
      return;
    }

    persistLiveThreadBranch(branchUpdate.branch);
  }, [
    activeServerThread,
    activeDraftThread?.branch,
    gitStatusForActions,
    isGitActionRunning,
    isSelectingWorktreeBase,
  ]);

  const isDefaultRef = gitStatusForActions?.isDefaultRef ?? false;

  const gitActionMenuItems = buildMenuItems(
    gitStatusForActions,
    isGitActionRunning,
    hasPrimaryRemote,
  );
  const quickAction = resolveQuickAction(
    gitStatusForActions,
    isGitActionRunning,
    isDefaultRef,
    hasPrimaryRemote,
  );
  const quickActionDisabledReason = !canWriteSourceControl
    ? t.git.actions.thisConnectionCannotChangeSourceControl
    : quickAction.disabled
      ? (quickAction.hint ?? t.git.actions.thisActionIsCurrentlyUnavailable)
      : null;
  const gitActionProgress = resolveGitActionProgressPresentation(vcsActionState);
  const pendingDefaultBranchActionCopy = pendingDefaultBranchAction
    ? resolveDefaultBranchActionDialogCopy({
        action: pendingDefaultBranchAction.action,
        branchName: pendingDefaultBranchAction.branchName,
        includesCommit: pendingDefaultBranchAction.includesCommit,
        terminology: changeRequestTerminology,
      })
    : null;
  // Follows the live status so the button tracks the tree while the dialog is open. Until the
  // status loads, keep the option enabled: the server stays the authority and rejects a stale
  // request with its own error.
  const featureBranchUnavailableReason = pendingDefaultBranchAction
    ? resolveFeatureBranchUnavailableReason({
        branchName: pendingDefaultBranchAction.branchName,
        hasWorkingTreeChanges: gitStatus?.hasWorkingTreeChanges ?? true,
      })
    : null;

  useEffect(() => {
    if (gitCwd === null) {
      return;
    }

    let refreshTimeout: number | null = null;
    const scheduleRefreshCurrentGitStatus = () => {
      if (refreshTimeout !== null) {
        window.clearTimeout(refreshTimeout);
      }
      refreshTimeout = window.setTimeout(() => {
        refreshTimeout = null;
        requestVcsStatusRefresh(refreshVcsStatus, activeEnvironmentId, gitCwd);
      }, GIT_STATUS_WINDOW_REFRESH_DEBOUNCE_MS);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleRefreshCurrentGitStatus();
      }
    };

    window.addEventListener("focus", scheduleRefreshCurrentGitStatus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (refreshTimeout !== null) {
        window.clearTimeout(refreshTimeout);
      }
      window.removeEventListener("focus", scheduleRefreshCurrentGitStatus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeEnvironmentId, gitCwd, refreshVcsStatus]);

  // Not an effect event: retained toast actions must stay bound to the checkout and
  // thread of the render that created them, not follow later selections.
  async function runGitActionWithToast({
    action,
    commitMessage,
    onConfirmed,
    skipDefaultBranchPrompt = false,
    statusOverride,
    featureBranch = false,
    filePaths,
  }: RunGitActionWithToastInput) {
    if (
      activeEnvironmentId === null ||
      !readEnvironmentScope(activeEnvironmentId, AuthSourceControlWriteScope) ||
      (featureBranch &&
        !isLocalDraftThread &&
        !readEnvironmentScope(activeEnvironmentId, AuthOrchestrationOperateScope))
    )
      return;
    const actionStatus = statusOverride ?? gitStatusForActions;
    const actionBranch = actionStatus?.refName ?? null;
    const actionIsDefaultBranch = featureBranch ? false : isDefaultRef;
    const actionCanCommit =
      action === "commit" || action === "commit_push" || action === "commit_push_pr";
    const includesCommit =
      actionCanCommit &&
      (action === "commit" || !!actionStatus?.hasWorkingTreeChanges || featureBranch);
    if (
      !skipDefaultBranchPrompt &&
      requiresDefaultBranchConfirmation(action, actionIsDefaultBranch) &&
      actionBranch
    ) {
      if (
        action !== "push" &&
        action !== "create_pr" &&
        action !== "commit_push" &&
        action !== "commit_push_pr"
      ) {
        return;
      }
      setPendingDefaultBranchAction({
        action,
        branchName: actionBranch,
        includesCommit,
        ...(commitMessage ? { commitMessage } : {}),
        ...(onConfirmed ? { onConfirmed } : {}),
        ...(filePaths ? { filePaths } : {}),
      });
      return;
    }
    onConfirmed?.();
    setInlineSuccess(null);

    const scopedToastData = threadToastData ? { ...threadToastData } : undefined;
    const actionId = randomUUID();

    const result = await runImmediateGitAction.run({
      actionId,
      action,
      ...(commitMessage ? { commitMessage } : {}),
      ...(featureBranch ? { featureBranch } : {}),
      ...(filePaths ? { filePaths } : {}),
      ...(activeServerThread ? { threadId: activeServerThread.id } : {}),
      ...(activeDraftThread ? { projectId: activeDraftThread.projectId } : {}),
    });

    if (result._tag === "Failure") {
      if (isAtomCommandInterrupted(result)) {
        return;
      }

      const error = squashAtomCommandFailure(result);
      const errorToastTiming = resolveGitActionResultToastTiming("error");
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t.git.actions.actionFailed,
          description: error instanceof Error ? error.message : t.git.actions.anErrorOccurred,
          timeout: errorToastTiming.timeout,
          ...(scopedToastData !== undefined ? { data: scopedToastData } : {}),
        }),
      );
      return;
    }

    const actionResult = result.value;
    syncThreadBranchAfterGitAction(actionResult);
    if (isPanel) {
      setInlineSuccess({
        title: actionResult.toast.title,
        description: actionResult.toast.description ?? null,
        scopeKey: successScopeKey,
      });
      return;
    }
    let resultToastId: GitActionToastId | null = null;
    const closeResultToast = () => {
      if (resultToastId !== null) {
        toastManager.close(resultToastId);
      }
    };

    const toastCta = actionResult.toast.cta;
    let toastActionProps: {
      children: string;
      onClick: (event: MouseEvent<HTMLButtonElement>) => void;
    } | null = null;
    if (toastCta.kind === "run_action") {
      toastActionProps = {
        children: toastCta.label,
        onClick: () => {
          closeResultToast();
          void runGitActionWithToast({
            action: toastCta.action.kind,
          });
        },
      };
    } else if (toastCta.kind === "open_pr") {
      toastActionProps = {
        children: toastCta.label,
        onClick: (event) => {
          closeResultToast();
          openPrLink(event, toastCta.url);
        },
      };
    }

    const successToastTiming = resolveGitActionResultToastTiming("success");
    const successToastData = {
      ...scopedToastData,
      ...(successToastTiming.dismissAfterVisibleMs !== null
        ? { dismissAfterVisibleMs: successToastTiming.dismissAfterVisibleMs }
        : {}),
    };

    if (toastActionProps) {
      resultToastId = toastManager.add(
        stackedThreadToast({
          type: "success",
          title: actionResult.toast.title,
          description: actionResult.toast.description,
          timeout: successToastTiming.timeout,
          actionProps: toastActionProps,
          data: successToastData,
        }),
      );
    } else {
      resultToastId = toastManager.add({
        type: "success",
        title: actionResult.toast.title,
        description: actionResult.toast.description,
        timeout: successToastTiming.timeout,
        data: successToastData,
      });
    }
  }

  const continuePendingDefaultBranchAction = (featureBranch: boolean) => {
    if (!pendingDefaultBranchAction || !canWriteSourceControl) return;
    if (featureBranch && (!canChangeThreadBranch || featureBranchUnavailableReason !== null))
      return;
    const { action, commitMessage, onConfirmed, filePaths } = pendingDefaultBranchAction;
    setPendingDefaultBranchAction(null);
    void runGitActionWithToast({
      action,
      ...(commitMessage ? { commitMessage } : {}),
      ...(onConfirmed ? { onConfirmed } : {}),
      ...(filePaths ? { filePaths } : {}),
      featureBranch,
      skipDefaultBranchPrompt: true,
    });
  };

  /** Submits the existing feature-branch action, then clears the dialog-only selection state. */
  const runDialogActionOnNewBranch = () => {
    if (!isCommitDialogOpen) return;
    const commitMessage = dialogCommitMessage.trim();

    setIsCommitDialogOpen(false);
    setDialogCommitMessage("");
    setExcludedFiles(new Set());
    setCommitOnNewBranch(false);

    void runGitActionWithToast({
      action: "commit",
      ...(commitMessage ? { commitMessage } : {}),
      ...(!allSelected ? { filePaths: selectedFiles.map((f) => f.path) } : {}),
      featureBranch: true,
      skipDefaultBranchPrompt: true,
    });
  };

  const runQuickAction = () => {
    if (quickAction.kind === "open_publish") {
      setIsPublishDialogOpen(true);
      return;
    }
    if (quickAction.kind === "run_pull") {
      void (async () => {
        setInlineSuccess(null);
        const result = await pullAction.run();
        if (result._tag === "Failure") {
          if (isAtomCommandInterrupted(result)) {
            return;
          }
          const error = squashAtomCommandFailure(result);
          const errorToastTiming = resolveGitActionResultToastTiming("error");
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: t.git.actions.pullFailed,
              description: error instanceof Error ? error.message : t.git.actions.anErrorOccurred,
              timeout: errorToastTiming.timeout,
              ...(threadToastData !== undefined ? { data: threadToastData } : {}),
            }),
          );
          return;
        }

        const pullResult = result.value;
        const title =
          pullResult.status === "pulled" ? t.git.actions.pulled : t.git.actions.alreadyUpToDate;
        const description =
          pullResult.status === "pulled"
            ? t.git.actions.updatedBranch(pullResult.refName, pullResult.upstreamRef ?? "upstream")
            : t.git.actions.branchSynchronized(pullResult.refName);
        if (isPanel) {
          setInlineSuccess({ title, description, scopeKey: successScopeKey });
          return;
        }
        const successToastTiming = resolveGitActionResultToastTiming("success");
        toastManager.add({
          type: "success",
          title,
          description,
          timeout: successToastTiming.timeout,
          data: {
            ...threadToastData,
            ...(successToastTiming.dismissAfterVisibleMs !== null
              ? { dismissAfterVisibleMs: successToastTiming.dismissAfterVisibleMs }
              : {}),
          },
        });
      })();
      return;
    }
    if (quickAction.kind === "show_hint") {
      toastManager.add({
        type: "info",
        title: quickAction.label,
        description: quickAction.hint,
        data: threadToastData,
      });
      return;
    }
    if (quickAction.action) {
      void runGitActionWithToast({ action: quickAction.action });
    }
  };

  /** Opens a fresh commit selection; push and PR commands keep their immediate execution path. */
  const openDialogForMenuItem = (item: GitActionMenuItem) => {
    if (item.disabled) return;
    if (item.dialogAction === "push") {
      void runGitActionWithToast({ action: "push" });
      return;
    }
    if (item.dialogAction === "create_pr") {
      void runGitActionWithToast({ action: "create_pr" });
      return;
    }
    setExcludedFiles(new Set());
    setCommitOnNewBranch(false);
    setIsCommitDialogOpen(true);
  };

  /** Submits selected files on the current branch through the existing default-branch guard. */
  const runDialogAction = () => {
    if (!isCommitDialogOpen) return;
    const commitMessage = dialogCommitMessage.trim();
    setIsCommitDialogOpen(false);
    setDialogCommitMessage("");
    setExcludedFiles(new Set());
    setCommitOnNewBranch(false);
    void runGitActionWithToast({
      action: "commit",
      ...(commitMessage ? { commitMessage } : {}),
      ...(!allSelected ? { filePaths: selectedFiles.map((f) => f.path) } : {}),
    });
  };

  const openChangedFileInEditor = (filePath: string) => {
    if (workingTreeRoot === null) {
      toastManager.add({
        type: "error",
        title: t.git.actions.editorOpeningIsUnavailable,
        data: threadToastData,
      });
      return;
    }
    const target = resolvePathLinkTarget(filePath, workingTreeRoot);
    void (async () => {
      const result = await openInPreferredEditor(target);
      if (result._tag === "Success" || isAtomCommandInterrupted(result)) {
        return;
      }
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t.git.actions.unableToOpenFile,
          description: error instanceof Error ? error.message : t.git.actions.anErrorOccurred,
          ...(threadToastData !== undefined ? { data: threadToastData } : {}),
        }),
      );
    })();
  };

  const canPublishRepository =
    canWriteSourceControl && isRepo && gitStatusForActions !== null && !hasPrimaryRemote;

  const initializeGit = () => {
    void (async () => {
      const result = await initAction.run();
      if (result._tag === "Success" || isAtomCommandInterrupted(result)) {
        return;
      }
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t.git.actions.gitInitializationFailed,
          description: error instanceof Error ? error.message : t.git.actions.anErrorOccurred,
          ...(threadToastData !== undefined ? { data: threadToastData } : {}),
        }),
      );
    })();
  };
  const gitItems = (
    <>
      {gitActionMenuItems.map((item) => {
        const disabledReason = getMenuActionDisabledReason({
          item,
          gitStatus: gitStatusForActions,
          isBusy: isGitActionRunning,
          hasPrimaryRemote,
        });
        if (item.disabled && disabledReason && presentation === "menu") {
          return (
            <div key={`${item.id}-${item.label}`}>
              <MenuItem density={presentation === "menu" ? "touch" : "default"} disabled>
                <GitActionItemIcon icon={item.icon} SourceControlIcon={SourceControlIcon} />
                <MenuItemLabel>{item.label}</MenuItemLabel>
              </MenuItem>
              <p className="max-w-64 px-2 pb-2 text-xs text-muted-foreground">{disabledReason}</p>
            </div>
          );
        }
        if (item.disabled && disabledReason) {
          return (
            <Popover key={`${item.id}-${item.label}`}>
              <PopoverTrigger
                openOnHover
                nativeButton={false}
                render={<span className="block w-full cursor-not-allowed" />}
              >
                <MenuItem
                  density={presentation === "menu" ? "touch" : "default"}
                  className="w-full"
                  disabled
                >
                  <GitActionItemIcon icon={item.icon} SourceControlIcon={SourceControlIcon} />
                  <MenuItemLabel>{item.label}</MenuItemLabel>
                </MenuItem>
              </PopoverTrigger>
              <PopoverPopup tooltipStyle side="left" align="center">
                {disabledReason}
              </PopoverPopup>
            </Popover>
          );
        }

        return (
          <MenuItem
            density={presentation === "menu" ? "touch" : "default"}
            key={`${item.id}-${item.label}`}
            disabled={!canWriteSourceControl || item.disabled}
            onClick={() => {
              openDialogForMenuItem(item);
            }}
          >
            <GitActionItemIcon icon={item.icon} SourceControlIcon={SourceControlIcon} />
            <MenuItemLabel>{item.label}</MenuItemLabel>
          </MenuItem>
        );
      })}
      {canPublishRepository ? (
        <MenuItem
          density={presentation === "menu" ? "touch" : "default"}
          disabled={isGitActionRunning}
          onClick={() => {
            setIsPublishDialogOpen(true);
          }}
        >
          <CloudUploadIcon />
          <MenuItemLabel>{t.git.actions.publishRepository2}</MenuItemLabel>
        </MenuItem>
      ) : null}
      {gitStatusForActions?.refName === null && (
        <p className="px-2 py-1.5 text-xs text-warning">
          {t.git.actions.detachedHEADCreateAndCheckOutABranchToEnablePushAndPullRequestActions}
        </p>
      )}
      {gitStatusForActions &&
        gitStatusForActions.refName !== null &&
        !gitStatusForActions.hasWorkingTreeChanges &&
        gitStatusForActions.behindCount > 0 &&
        gitStatusForActions.aheadCount === 0 && (
          <p className="px-2 py-1.5 text-xs text-warning">
            {t.git.actions.behindUpstreamPullRebaseFirst}
          </p>
        )}
      {gitStatusError && <p className="px-2 py-1.5 text-xs text-destructive">{gitStatusError}</p>}
    </>
  );

  if (!gitCwd) return null;

  return (
    <>
      {presentation === "menu" ? (
        !isRepo ? (
          <MenuItem
            density={presentation === "menu" ? "touch" : "default"}

            disabled={initAction.isPending}
            onClick={initializeGit}
          >
            <GitBranchPlusIcon className="size-4" />
            <MenuItemLabel>
              {initAction.isPending ? t.git.actions.initializing : t.git.actions.initializeGit}
            </MenuItemLabel>
          </MenuItem>
        ) : (
          <>
            <MenuItem
              density={presentation === "menu" ? "touch" : "default"}

              disabled={isGitActionRunning || quickAction.disabled || !!quickActionDisabledReason}
              onClick={runQuickAction}
            >
              <GitQuickActionIcon
                className="size-4"
                quickAction={quickAction}
                SourceControlIcon={SourceControlIcon}
              />
              <MenuItemLabel>{quickAction.label}</MenuItemLabel>
            </MenuItem>
            {quickActionDisabledReason && (
              <p className="max-w-64 px-2 py-1.5 text-xs text-warning">
                {quickActionDisabledReason}
              </p>
            )}
            <MenuSub
              onOpenChange={(open) => {
                if (open) requestVcsStatusRefresh(refreshVcsStatus, activeEnvironmentId, gitCwd);
              }}
            >
              <MenuSubTrigger density="touch" disabled={isGitActionRunning}>
                <SourceControlIcon className="size-4" />
                <MenuItemLabel>{t.git.actions.gitActions}</MenuItemLabel>
              </MenuSubTrigger>
              <MenuSubPopup>{gitItems}</MenuSubPopup>
            </MenuSub>
          </>
        )
      ) : !isRepo ? (
        <ThreadDetailsControl
          size="xs"
          variant={isPanel ? "ghost" : "outline"}
          part="row"
          panel={isPanel}
          disabled={!canWriteSourceControl || initAction.isPending}
          onClick={initializeGit}
        >
          <GitBranchPlusIcon className="size-3.5" aria-hidden />
          <span className={cn("ml-0.5", isPanel && THREAD_DETAILS_PANEL_LABEL_CLASS)}>
            {initAction.isPending ? t.git.actions.initializing : t.git.actions.initializeGit}
          </span>
        </ThreadDetailsControl>
      ) : compact && !gitActionProgress && !visibleInlineSuccess ? null : isPanel &&
        !gitActionProgress &&
        !visibleInlineSuccess ? (
        <div className="flex flex-col gap-3">
          {gitStatusForActions?.hasWorkingTreeChanges ? (
            <>
              <div className="flex gap-1.5">
                <ThreadDetailsControl
                  part="action"
                  className="flex-5"
                  disabled={
                    !canWriteSourceControl ||
                    isGitActionRunning ||
                    gitActionMenuItems.find((item) => item.id === "commit")?.disabled !== false
                  }
                  onClick={() => {
                    const item = gitActionMenuItems.find((candidate) => candidate.id === "commit");
                    if (item) openDialogForMenuItem(item);
                  }}
                >
                  {t.git.actions.commit}
                </ThreadDetailsControl>
                <ThreadDetailsControl
                  part="action"
                  tone="primary"
                  className="flex-8"
                  disabled={
                    !canWriteSourceControl ||
                    isGitActionRunning ||
                    !hasPrimaryRemote ||
                    gitStatusForActions.refName === null
                  }
                  onClick={() => void runGitActionWithToast({ action: "commit_push" })}
                >
                  {t.git.actions.commitPush}
                </ThreadDetailsControl>
              </div>
              {gitStatusForActions.pr?.state !== "open" ? (
                <ThreadDetailsControl
                  part="outline"
                  disabled={
                    !canWriteSourceControl ||
                    isGitActionRunning ||
                    !hasPrimaryRemote ||
                    gitStatusForActions.refName === null
                  }
                  onClick={() => void runGitActionWithToast({ action: "commit_push_pr" })}
                >
                  <SourceControlIcon aria-hidden className="size-3.5" />
                  {t.git.actions.commitPushRequest(changeRequestTerminology.shortLabel)}
                </ThreadDetailsControl>
              ) : null}
            </>
          ) : (
            <>
              <ThreadDetailsControl
                part="action"
                className="w-full"
                disabled={
                  !canWriteSourceControl ||
                  isGitActionRunning ||
                  quickAction.disabled ||
                  !!quickActionDisabledReason
                }
                onClick={runQuickAction}
              >
                {quickAction.disabled && gitStatusForActions?.pr?.state === "open"
                  ? t.git.actions.push
                  : quickAction.label}
              </ThreadDetailsControl>
              {quickActionDisabledReason ? (
                <p className="px-1.5 text-meta-large text-muted-foreground">
                  {quickActionDisabledReason}
                </p>
              ) : null}
            </>
          )}
          <Menu
            onOpenChange={(open) => {
              if (open) requestVcsStatusRefresh(refreshVcsStatus, activeEnvironmentId, gitCwd);
            }}
          >
            <MenuTrigger
              render={<ThreadDetailsControl part="meta" />}
              disabled={isGitActionRunning}
            >
              {t.git.actions.gitActionOptions}
              <ChevronDownIcon aria-hidden className="size-3.5" />
            </MenuTrigger>
            <MenuPopup align="end">{gitItems}</MenuPopup>
          </Menu>
        </div>
      ) : (
        <ActionGroup
          role="group"
          aria-label={t.git.actions.gitActions}
          {...(isPanel ? { ref: panelAnchorRef } : {})}
          className={cn(
            "shrink-0",
            isPanel && THREAD_DETAILS_PANEL_SPLIT_GROUP_CLASS,
            isPanel && gitActionProgress && "bg-black/[0.035] dark:bg-white/[0.055]",
          )}
        >
          {gitActionProgress ? (
            <ThreadDetailsControl
              aria-label={
                gitActionProgress.output
                  ? `${gitActionProgress.status} ${gitActionProgress.output}`
                  : gitActionProgress.status
              }
              part="primary"
              panel={isPanel}
              multiline
              className={isPanel ? undefined : "max-w-72"}
              disabled
              size="xs"
              variant={isPanel ? "ghost" : "outline"}
            >
              <GitActionProgressButtonContent isPanel={isPanel} progress={gitActionProgress} />
            </ThreadDetailsControl>
          ) : isPanel && visibleInlineSuccess ? (
            <ThreadDetailsControl part="primary" multiline disabled size="xs" variant="ghost">
              <GitActionSuccessButtonContent success={visibleInlineSuccess} />
            </ThreadDetailsControl>
          ) : quickActionDisabledReason ? (
            <Popover>
              <PopoverTrigger
                openOnHover
                render={
                  <ThreadDetailsControl
                    aria-disabled="true"
                    part="primary"
                    panel={isPanel}
                    size="xs"
                    variant={isPanel ? "ghost" : "outline"}
                  />
                }
              >
                <GitQuickActionIcon
                  quickAction={quickAction}
                  SourceControlIcon={SourceControlIcon}
                  {...(isPanel ? { className: THREAD_DETAILS_PANEL_ICON_CLASS } : {})}
                />
                <span
                  className={cn(
                    "sr-only @3xl/header-actions:not-sr-only @3xl/header-actions:ml-0.5",
                    isPanel && cn("not-sr-only ml-0 truncate", THREAD_DETAILS_PANEL_LABEL_CLASS),
                  )}
                >
                  {quickAction.label}
                </span>
              </PopoverTrigger>
              <PopoverPopup tooltipStyle side="bottom" align="start">
                {quickActionDisabledReason}
              </PopoverPopup>
            </Popover>
          ) : (
            <ThreadDetailsControl
              variant={isPanel ? "ghost" : "outline"}
              size="xs"
              part="primary"
              panel={isPanel}
              disabled={!canWriteSourceControl || isGitActionRunning || quickAction.disabled}
              onClick={runQuickAction}
            >
              <GitQuickActionIcon
                quickAction={quickAction}
                SourceControlIcon={SourceControlIcon}
                {...(isPanel ? { className: THREAD_DETAILS_PANEL_ICON_CLASS } : {})}
              />
              <span
                className={cn(
                  "sr-only @3xl/header-actions:not-sr-only @3xl/header-actions:ml-0.5",
                  isPanel && cn("not-sr-only ml-0 truncate", THREAD_DETAILS_PANEL_LABEL_CLASS),
                )}
              >
                {quickAction.label}
              </span>
            </ThreadDetailsControl>
          )}
          {isPanel && gitActionProgress ? (
            <GitActionElapsedTime
              startedAtMs={gitActionProgress.startedAtMs}
              className="flex h-8 shrink-0 items-center self-start pe-2.5 text-2xs font-normal tabular-nums text-muted-foreground"
            />
          ) : (
            <>
              {isPanel ? (
                <span aria-hidden="true" className={THREAD_DETAILS_PANEL_SPLIT_SEPARATOR_CLASS} />
              ) : (
                <GroupSeparator className="hidden @3xl/header-actions:block" />
              )}
              <Menu
                onOpenChange={(open) => {
                  if (open) {
                    requestVcsStatusRefresh(refreshVcsStatus, activeEnvironmentId, gitCwd);
                  }
                }}
              >
                <MenuTrigger
                  render={
                    <ThreadDetailsControl
                      aria-label={t.git.actions.gitActionOptions}
                      size={isPanel ? "sm" : "icon-xs"}
                      variant={isPanel ? "ghost" : "outline"}
                      part="secondary"
                      panel={isPanel}
                    />
                  }
                  disabled={isGitActionRunning}
                >
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={isPanel ? THREAD_DETAILS_PANEL_CHEVRON_CLASS : "size-4"}
                  />
                </MenuTrigger>
                <MenuPopup
                  align="end"
                  {...(isPanel ? { anchor: panelAnchorRef } : {})}
                  className={isPanel ? "w-(--anchor-width)" : "w-full"}
                >
                  {gitItems}
                </MenuPopup>
              </Menu>
            </>
          )}
        </ActionGroup>
      )}

      {isPanel && isRepo && showChangesRow ? (
        <ThreadDetailsControl
          type="button"
          variant="ghost"
          size="sm"
          part="row"
          disabled={!onOpenChanges}
          onClick={onOpenChanges}
        >
          <FileDiffIcon className={THREAD_DETAILS_PANEL_ICON_CLASS} aria-hidden />
          <span className={cn("flex-1 text-left", THREAD_DETAILS_PANEL_LABEL_CLASS)}>
            {t.git.diff.changes}
          </span>
          <span className="flex items-center gap-1 font-mono text-2xs tabular-nums">
            <span className="text-diff-addition">
              +{formatDiffCount(changesTotals?.insertions ?? 0)}
            </span>
            <span className="text-diff-deletion">
              -{formatDiffCount(changesTotals?.deletions ?? 0)}
            </span>
          </span>
        </ThreadDetailsControl>
      ) : null}

      <Dialog
        open={isCommitDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsCommitDialogOpen(false);
            setDialogCommitMessage("");
            setExcludedFiles(new Set());
            setCommitOnNewBranch(false);
          }
        }}
      >
        <DialogPopup size="wide">
          <DialogHeader>
            <DialogTitle>{COMMIT_DIALOG_TITLE}</DialogTitle>
            <DialogDescription>
              <span className="block text-control text-code-foreground">
                {COMMIT_DIALOG_DESCRIPTION}
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="ov1-commit-files">
              <label className="flex h-8 items-center gap-2.5 px-2 text-secondary-copy-medium font-bold">
                <span className="relative flex shrink-0">
                  <input
                    type="checkbox"
                    className="ov1-checkbox peer"
                    checked={allSelected}
                    disabled={allFiles.length === 0}
                    ref={(node) => {
                      if (node) node.indeterminate = !allSelected && !noneSelected;
                    }}
                    onChange={() => {
                      setExcludedFiles(
                        allSelected ? new Set(allFiles.map((f) => f.path)) : new Set(),
                      );
                    }}
                  />
                  {allSelected ? (
                    <CheckIcon className="ov1-checkbox-mark" aria-hidden />
                  ) : (
                    <MinusIcon className="ov1-checkbox-mark" aria-hidden />
                  )}
                </span>
                {t.git.actions.fileSelectionLabel(selectedFiles.length, allFiles.length)}
              </label>
              {!gitStatusForActions || allFiles.length === 0 ? (
                <p className="px-2 text-secondary-copy text-secondary-label">
                  {t.git.actions.none}
                </p>
              ) : (
                <div className="max-h-44 overflow-y-auto">
                  {allFiles.map((file) => (
                    <div
                      key={file.path}
                      className="flex h-8 w-full items-center gap-2.5 px-2 font-mono text-secondary-copy"
                    >
                      <span className="relative flex shrink-0">
                        <input
                          type="checkbox"
                          className="ov1-checkbox peer"
                          aria-label={file.path}
                          checked={!excludedFiles.has(file.path)}
                          onChange={() => {
                            setExcludedFiles((prev) => {
                              const next = new Set(prev);
                              if (next.has(file.path)) next.delete(file.path);
                              else next.add(file.path);
                              return next;
                            });
                          }}
                        />
                        <CheckIcon className="ov1-checkbox-mark" aria-hidden />
                      </span>
                      <Tooltip>
                        <TooltipTrigger
                          render={<button type="button" />}
                          className="min-w-0 flex-1 overflow-hidden text-left outline-none focus-visible:inset-shadow-focus"
                          disabled={!canOperateThread}
                          aria-label={t.git.actions.openFile(file.path)}
                          onClick={() => openChangedFileInEditor(file.path)}
                        >
                          <span className="flex min-w-0">
                            <span className="truncate text-muted-foreground">
                              {file.path.slice(0, file.path.lastIndexOf("/") + 1)}
                            </span>
                            <span
                              className={cn(
                                "shrink-0",
                                excludedFiles.has(file.path) && "text-secondary-label",
                              )}
                            >
                              {file.path.slice(file.path.lastIndexOf("/") + 1)}
                            </span>
                          </span>
                        </TooltipTrigger>
                        <TooltipPopup side="top" variant="code">
                          {file.path}
                        </TooltipPopup>
                      </Tooltip>
                      <span className="shrink-0 text-success">
                        +{formatDiffCount(file.insertions)}
                      </span>
                      <span className="shrink-0 text-error">
                        −{formatDiffCount(file.deletions)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <label className="grid gap-1.5">
              <span className="ov1-field-label">{t.git.actions.commitMessageOptional}</span>
              <textarea
                className="ov1-commit-message"
                value={dialogCommitMessage}
                onChange={(event) => setDialogCommitMessage(event.target.value)}
                placeholder={t.git.actions.leaveEmptyToAutoGenerate}
              />
            </label>
            <label
              className="ov1-script-option"
              data-disabled={!canChangeThreadBranch ? "" : undefined}
            >
              <span className="relative flex shrink-0">
                <input
                  type="checkbox"
                  className="ov1-checkbox peer"
                  checked={commitOnNewBranch}
                  disabled={!canChangeThreadBranch}
                  onChange={(event) => setCommitOnNewBranch(event.target.checked)}
                />
                <CheckIcon className="ov1-checkbox-mark" aria-hidden />
              </span>
              {t.git.actions.commitOnNewBranch}
            </label>
          </DialogPanel>
          <DialogFooter variant="bare">
            <Button
              variant="outline"
              size="dialog-action"
              onClick={() => {
                setIsCommitDialogOpen(false);
                setDialogCommitMessage("");
                setExcludedFiles(new Set());
                setCommitOnNewBranch(false);
              }}
            >
              {t.common.confirm.cancel}
            </Button>
            <Button
              size="dialog-action-wide"
              disabled={
                noneSelected ||
                (commitOnNewBranch ? !canChangeThreadBranch : !canWriteSourceControl)
              }
              onClick={commitOnNewBranch ? runDialogActionOnNewBranch : runDialogAction}
            >
              {t.git.actions.commit}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <PublishRepositoryDialog
        open={isPublishDialogOpen}
        onOpenChange={setIsPublishDialogOpen}
        environmentId={activeEnvironmentId}
        threadRef={activeThreadRef}
        gitCwd={gitCwd}
      />

      <Dialog
        open={pendingDefaultBranchAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDefaultBranchAction(null);
        }}
      >
        <DialogPopup size="wide">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <span className="ov1-default-branch-icon">
                <GitBranchIcon className="size-3.75" aria-hidden />
              </span>
              <DialogTitle>{t.git.actions.runActionOnDefaultBranch}</DialogTitle>
            </div>
            <DialogDescription className="sr-only">
              {pendingDefaultBranchActionCopy?.description}
            </DialogDescription>
            {featureBranchUnavailableReason && (
              <p className="text-xs text-muted-foreground">{featureBranchUnavailableReason}</p>
            )}
          </DialogHeader>
          <DialogFooter variant="bare" className="flex-wrap">
            <Button
              variant="ghost"
              size="dialog-action"
              onClick={() => setPendingDefaultBranchAction(null)}
            >
              {t.git.actions.abort}
            </Button>
            <Button
              variant="outline"
              size="dialog-action"
              onClick={() => continuePendingDefaultBranchAction(false)}
              disabled={!canWriteSourceControl}
            >
              {t.git.actions.continue}
            </Button>
            <Button
              size="dialog-action-wide"
              onClick={() => continuePendingDefaultBranchAction(true)}
              disabled={!canChangeThreadBranch || featureBranchUnavailableReason !== null}
            >
              {t.git.actions.checkOutFeatureBranchContinue}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
