import { t } from "~/i18n";
import { writeTextToClipboard } from "../hooks/useCopyToClipboard";
import { formatFilePathForClipboard } from "@t3tools/client-runtime/media-actions";
import { readLocalApi } from "../localApi";
import { stackedThreadToast, toastManager } from "./ui/toast";
import { ComposerContextLabel } from "./ComposerContextLabel";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import {
  ChevronDownIcon,
  FolderGit2Icon,
  FolderGitIcon,
  FolderIcon,
  ScaleIcon,
} from "lucide-react";
import {
  type Ref,
  type MouseEvent as ReactMouseEvent,
  memo,
  useImperativeHandle,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useComposerDraftStore, type DraftId } from "../composerDraftStore";
import { EnvironmentMachineIcon } from "./EnvironmentMachineIcon";
import { useProject, useThreadShellsForProjectRefs } from "../state/entities";
import {
  type EnvMode,
  type EnvironmentOption,
  resolveContextStripLabelsCompact,
  resolveCurrentWorkspaceLabel,
  resolveEnvModeLabel,
  resolveLockedWorkspaceLabel,
  resolvePreviousWorktreeLabel,
  resolvePreviousWorktreeSeed,
  shouldShowEnvironmentIndicator,
} from "./BranchToolbar.logic";
import {
  BranchToolbarBranchSelector,
  type BranchToolbarBranchSelectorHandle,
} from "./BranchToolbarBranchSelector";
import { BranchToolbarEnvironmentSelector } from "./BranchToolbarEnvironmentSelector";
import { BranchToolbarEnvModeSelector } from "./BranchToolbarEnvModeSelector";
import { PreviousWorktreeItemContent } from "./PreviousWorktreeItemContent";
import { ThreadDetailsControl } from "./chat/ThreadDetailsControl";
import { THREAD_DETAILS_PANEL_ICON_CLASS } from "./chat/threadDetailsPanelStyles";
import { ComposerControl } from "./chat/ComposerControl";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "./ui/menu";
import { Separator } from "./ui/separator";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { MiddleTruncate } from "./ui/middle-truncate";
import { ComposerSurface } from "./chat/ComposerSurface";
import { useComposerMenuProps } from "./chat/composerEventScope";
import { measureRestingComposerControls } from "./chat/restingComposerControlsMeasurement";
import { resolveRestingComposerControlsNaturalWidth } from "./composerFooterLayout";
import { cn } from "~/lib/utils";
import { observeResize } from "~/lib/observeResize";

export interface BranchToolbarHandle {
  openBranchPicker: () => void;
  usePreviousWorktree: () => void;
}

interface BranchToolbarProps {
  layout?: "composer" | "panel";
  panelSection?: "all" | "workspace" | "branch";
  forceNewWorktree?: boolean;
  ref?: Ref<BranchToolbarHandle>;
  environmentId: EnvironmentId;
  threadId: ThreadId;
  projectId: ProjectId;
  worktreePath: string | null;
  isServerThread: boolean;
  showGitControls: boolean;
  draftId?: DraftId;
  onEnvModeChange: (mode: EnvMode) => void;
  envMode: EnvMode;
  activeThreadBranchOverride?: string | null;
  onActiveThreadBranchOverrideChange?: (branch: string | null) => void;
  startFromOrigin: boolean;
  onStartFromOriginChange: (startFromOrigin: boolean) => void;
  autoEnvironmentLabel?: string | undefined;
  onAutoEnvironment?: (() => void) | undefined;
  envLocked: boolean;
  onCheckoutPullRequestRequest?: (reference: string) => void;
  onComposerFocusRequest?: () => void;
  availableEnvironments?: readonly EnvironmentOption[];
  onEnvironmentChange?: (environmentId: EnvironmentId) => void;
  composerControlsHostRef?: (element: HTMLDivElement | null) => void;
  contextStripVisible?: boolean;
}

/**
 * Offers copying an existing workspace path using the host's path separators.
 * @param event Pointer location for the native menu; left untouched when no local API exists.
 * @param workspacePath Existing workspace directory to copy, not a planned worktree path.
 * @returns Nothing; clipboard completion is reported through success or failure toasts.
 */
function showWorkspaceContextMenu(event: ReactMouseEvent, workspacePath: string) {
  const api = readLocalApi();
  if (!api) return;
  event.preventDefault();
  event.stopPropagation();
  void api.contextMenu
    .show([{ id: "copy-path", label: t.chat.branchToolbar.copyFullPath, icon: "copy" }], {
      x: event.clientX,
      y: event.clientY,
    })
    .then((action) => {
      if (action !== "copy-path") return;
      const clipboardPath = formatFilePathForClipboard(workspacePath);
      void writeTextToClipboard(clipboardPath, t.chat.branchToolbar.workspacePath).then(
        (didCopy) => {
          if (didCopy) {
            toastManager.add({
              type: "success",
              title: t.chat.branchToolbar.pathCopiedToast,
              description: clipboardPath,
            });
          }
        },
        (error: unknown) => {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: t.chat.branchToolbar.copyPathError,
              description:
                error instanceof Error ? error.message : t.chat.branchToolbar.genericError,
            }),
          );
        },
      );
    });
}

interface RunContextSelectorProps {
  displayMode?: "toolbar" | "panel";
  workspaceRoot?: string;
  forceNewWorktree: boolean;
  autoEnvironmentLabel?: string | undefined;
  onAutoEnvironment?: (() => void) | undefined;
  envLocked: boolean;
  envModeLocked: boolean;
  environmentId: EnvironmentId;
  availableEnvironments: readonly EnvironmentOption[] | undefined;
  showEnvironmentPicker: boolean;
  showEnvironmentIndicator: boolean;
  onEnvironmentChange: ((environmentId: EnvironmentId) => void) | undefined;
  effectiveEnvMode: EnvMode;
  activeWorktreePath: string | null;
  onEnvModeChange: (mode: EnvMode) => void;
  previousWorktreeLabel: string | null;
  previousWorktreeBranch: string | null;
  onUsePreviousWorktree: () => void;
}

const RunContextSelector = memo(function RunContextSelector({
  displayMode = "toolbar",
  workspaceRoot,
  forceNewWorktree,
  autoEnvironmentLabel,
  onAutoEnvironment,
  envLocked,
  envModeLocked,
  environmentId,
  availableEnvironments,
  showEnvironmentPicker,
  showEnvironmentIndicator,
  onEnvironmentChange,
  effectiveEnvMode,
  activeWorktreePath,
  onEnvModeChange,
  previousWorktreeLabel,
  previousWorktreeBranch,
  onUsePreviousWorktree,
}: RunContextSelectorProps) {
  const composerFloatingLayerProps = useComposerMenuProps();
  const activeEnvironment =
    availableEnvironments?.find((env) => env.environmentId === environmentId) ?? null;
  const WorkspaceIcon =
    effectiveEnvMode === "worktree"
      ? FolderGit2Icon
      : activeWorktreePath
        ? FolderGitIcon
        : FolderIcon;
  const workspaceLabel = forceNewWorktree
    ? resolveEnvModeLabel("worktree")
    : envModeLocked
      ? resolveLockedWorkspaceLabel(activeWorktreePath, effectiveEnvMode)
      : effectiveEnvMode === "worktree"
        ? resolveEnvModeLabel("worktree")
        : resolveCurrentWorkspaceLabel(activeWorktreePath);
  const isPanel = displayMode === "panel";
  const isLocked = envLocked || envModeLocked;
  const workspacePath =
    forceNewWorktree || (effectiveEnvMode === "worktree" && !activeWorktreePath)
      ? null
      : (activeWorktreePath ?? workspaceRoot);
  const handleContextMenu = (event: ReactMouseEvent) => {
    if (isPanel && workspacePath) {
      showWorkspaceContextMenu(event, workspacePath);
    }
  };
  const workspaceIcon = (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex shrink-0" />}>
        <WorkspaceIcon
          className={
            isPanel
              ? THREAD_DETAILS_PANEL_ICON_CLASS
              : cn("size-3 shrink-0", showEnvironmentIndicator && "mx-0!")
          }
        />
      </TooltipTrigger>
      <TooltipPopup>
        {isPanel
          ? forceNewWorktree
            ? "Each model starts in its own worktree."
            : (workspacePath ?? workspaceLabel)
          : workspaceLabel}
      </TooltipPopup>
    </Tooltip>
  );
  const icon = showEnvironmentIndicator ? (
    // Button's base styles apply `-mx-0.5` to descendant SVGs, which eats 4px
    // out of whatever gap we set. mx-0! cancels that so gap-0.5 reads as 2px.
    <span className="inline-flex shrink-0 items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex shrink-0" />}>
          {autoEnvironmentLabel ? (
            <ScaleIcon
              className={isPanel ? THREAD_DETAILS_PANEL_ICON_CLASS : "size-3 shrink-0 mx-0!"}
              aria-hidden="true"
            />
          ) : (
            <EnvironmentMachineIcon
              kind={activeEnvironment?.machine ?? "server"}
              className={isPanel ? THREAD_DETAILS_PANEL_ICON_CLASS : "size-3 shrink-0 mx-0!"}
            />
          )}
        </TooltipTrigger>
        <TooltipPopup>
          {autoEnvironmentLabel ?? activeEnvironment?.label ?? t.chat.branchToolbar.runOn}
        </TooltipPopup>
      </Tooltip>
      {workspaceIcon}
    </span>
  ) : (
    workspaceIcon
  );
  const triggerContent = (
    <>
      {icon}
      <ComposerContextLabel displayMode={displayMode}>
        {autoEnvironmentLabel ??
          (showEnvironmentIndicator
            ? (activeEnvironment?.label ?? t.chat.branchToolbar.runOn)
            : workspaceLabel)}
      </ComposerContextLabel>
    </>
  );

  // Share the choices and callbacks with the composer while giving F1 each field its own well.
  const environmentChoices =
    availableEnvironments && showEnvironmentPicker && onEnvironmentChange ? (
      <MenuGroup>
        <MenuGroupLabel>{t.chat.branchToolbar.runOn}</MenuGroupLabel>
        <MenuRadioGroup
          value={autoEnvironmentLabel ? "auto" : environmentId}
          onValueChange={(value) =>
            value === "auto" ? onAutoEnvironment?.() : onEnvironmentChange?.(value as EnvironmentId)
          }
        >
          {onAutoEnvironment && (
            <MenuRadioItem
              value="auto"
              disabled={envLocked}
              closeOnClick
              onClick={() => {
                if (autoEnvironmentLabel) onAutoEnvironment?.();
              }}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <ScaleIcon className="size-3" aria-hidden="true" />
                <span className="min-w-0 truncate">
                  {autoEnvironmentLabel ?? t.chat.branchToolbar.autoBalance}
                </span>
              </span>
            </MenuRadioItem>
          )}
          {availableEnvironments.map((env) => (
            <MenuRadioItem
              key={env.environmentId}
              disabled={envLocked || (!onEnvironmentChange && env.environmentId !== environmentId)}
              value={env.environmentId}
              closeOnClick
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <EnvironmentMachineIcon kind={env.machine} className="size-3" />
                <span className="min-w-0 truncate">{env.label}</span>
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuGroup>
    ) : null;
  const workspaceChoices = (
    <MenuGroup>
      <MenuGroupLabel>{t.chat.branchToolbar.workspace}</MenuGroupLabel>
      <MenuRadioGroup
        value={effectiveEnvMode}
        onValueChange={(value) => {
          if (value === "previous-worktree") {
            onUsePreviousWorktree();
            return;
          }
          onEnvModeChange(value as EnvMode);
        }}
      >
        <MenuRadioItem disabled={envModeLocked || forceNewWorktree} value="local" closeOnClick>
          <span className="flex min-w-0 items-center gap-1.5">
            {activeWorktreePath ? (
              <FolderGitIcon className="size-3" />
            ) : (
              <FolderIcon className="size-3" />
            )}
            <MiddleTruncate value={resolveCurrentWorkspaceLabel(activeWorktreePath)} />
          </span>
        </MenuRadioItem>
        <MenuRadioItem disabled={envModeLocked} value="worktree" closeOnClick>
          <span className="flex min-w-0 items-center gap-1.5">
            <FolderGit2Icon className="size-3" />
            <span className="min-w-0 truncate">{resolveEnvModeLabel("worktree")}</span>
          </span>
        </MenuRadioItem>
        {previousWorktreeLabel ? (
          <MenuRadioItem disabled={envModeLocked} value="previous-worktree" closeOnClick>
            <PreviousWorktreeItemContent branch={previousWorktreeBranch} />
          </MenuRadioItem>
        ) : null}
      </MenuRadioGroup>
    </MenuGroup>
  );
  if (isPanel) {
    return (
      <>
        {[
          {
            label: t.chat.branchToolbar.runOn,
            value:
              autoEnvironmentLabel ?? activeEnvironment?.label ?? t.chat.branchToolbar.thisDevice,
            locked: envLocked || !showEnvironmentPicker,
            choices: environmentChoices,
            shortcut: "composer.host",
            onContextMenu: undefined,
          },
          {
            label: t.chat.branchToolbar.workspace,
            value: workspaceLabel,
            locked: envModeLocked,
            choices: workspaceChoices,
            shortcut: "composer.workspace",
            onContextMenu: handleContextMenu,
          },
        ].map((field) => (
          <Menu key={field.label}>
            <MenuTrigger
              render={<ThreadDetailsControl part="context" />}
              aria-label={field.label}
              disabled={field.locked}
              onContextMenu={field.onContextMenu}
              onMouseDownCapture={(event) => {
                if (event.button !== 0 || event.ctrlKey) event.stopPropagation();
              }}
              data-composer-shortcut={field.locked ? undefined : field.shortcut}
            >
              <span className="text-secondary-copy text-secondary-label font-normal">
                {field.label}
              </span>
              <span className="min-w-0 flex-1 truncate text-right">{field.value}</span>
            </MenuTrigger>
            <MenuPopup align="start" side="bottom" className="w-(--anchor-width)">
              {field.choices}
            </MenuPopup>
          </Menu>
        ))}
      </>
    );
  }

  if (isLocked) {
    return (
      <span
        className="inline-flex h-7 min-w-0 max-w-[48%] flex-initial items-center justify-start gap-1 rounded-md border border-transparent px-1.75 font-normal text-muted-foreground/70 text-xs sm:h-6"
        data-composer-context-control
      >
        {triggerContent}
      </span>
    );
  }

  return (
    <Menu>
      <MenuTrigger
        render={<ComposerControl size="xs" />}
        className="min-w-0 max-w-[48%] flex-initial justify-start"
        data-composer-context-control
        data-composer-shortcut={[
          showEnvironmentPicker && !envLocked ? "composer.host" : "",
          !envModeLocked ? "composer.workspace" : "",
        ].join(" ")}
      >
        {triggerContent}
        <ChevronDownIcon className="size-3 shrink-0 opacity-50" />
      </MenuTrigger>
      <MenuPopup
        align="start"
        side="top"
        className={previousWorktreeLabel ? "w-[min(21rem,calc(100vw-2rem))]" : undefined}
        {...composerFloatingLayerProps}
      >
        {environmentChoices}
        {showEnvironmentPicker ? <MenuSeparator /> : null}
        {workspaceChoices}
      </MenuPopup>
    </Menu>
  );
});

const COMPOSER_CONTEXT_MOTION_DURATION_MS = 180;
const COMPOSER_CONTEXT_MOTION_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
const COMPOSER_CONTEXT_LABEL_SELECTOR = "[data-composer-label]";

/**
 * Reading one element's scrollWidth drops the tail when the label is hidden or
 * squeezed, and the strip then flips between labels and icons on every measure.
 */
function labelTextWidth(label: HTMLElement, range: Range): number {
  const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
  let width = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    range.selectNodeContents(node);
    width += range.getBoundingClientRect().width;
  }
  const motion = label.querySelector<HTMLElement>("[data-composer-label-motion]");
  const maxWidth = motion ? Number.parseFloat(getComputedStyle(motion).maxWidth) : Number.NaN;
  return Number.isFinite(maxWidth) ? Math.min(width, maxWidth) : width;
}

function useLabelsOverflow(element: HTMLDivElement | null): boolean {
  const [overflows, setOverflows] = useState(false);
  const pendingLabelRectsRef = useRef<Map<HTMLElement, DOMRect> | null>(null);
  const labelAnimationsRef = useRef(new Map<HTMLElement, Animation>());
  const measure = useEffectEvent(() => {
    const current = element;
    const compact = overflows;
    if (!current) return;
    const stripWidth = current.clientWidth;
    if (stripWidth === 0) return;
    const stripStyle = getComputedStyle(current);
    const available =
      stripWidth -
      (Number.parseFloat(stripStyle.paddingInlineStart) || 0) -
      (Number.parseFloat(stripStyle.paddingInlineEnd) || 0);
    const contentWidth = (parent: Element): number => {
      const gap = Number.parseFloat(getComputedStyle(parent).columnGap) || 0;
      let width = 0;
      let counted = 0;
      for (const child of parent.children) {
        if (!(child instanceof HTMLElement)) continue;
        if (child.offsetWidth === 0) continue;
        const style = getComputedStyle(child);
        const position = style.position;
        if (position === "absolute" || position === "fixed") continue;
        width +=
          child.offsetWidth +
          (Number.parseFloat(style.marginInlineStart) || 0) +
          (Number.parseFloat(style.marginInlineEnd) || 0);
        counted += 1;
      }
      return width + gap * Math.max(0, counted - 1);
    };
    const stripGap = Number.parseFloat(stripStyle.columnGap) || 0;
    let needed = 0;
    let groups = 0;
    for (const child of current.children) {
      if (!(child instanceof HTMLElement)) continue;
      // Reserve the natural width of the controls inside it, blocks in overflow
      // included, so Git labels compact before squeezing out the model picker.
      // Reserving only the visible controls would let the labels expand into
      // room the composer just freed, shrink the host, and hide the controls
      // again.
      const hostedControls = child.matches('[data-chat-resting-composer-controls-host="true"]')
        ? child.querySelector<HTMLElement>('[data-chat-composer-resting-controls="true"]')
        : null;
      const hostedMeasurement = hostedControls
        ? measureRestingComposerControls(hostedControls)
        : null;
      const width = hostedMeasurement
        ? resolveRestingComposerControlsNaturalWidth(hostedMeasurement)
        : contentWidth(hostedControls ?? child);
      if (width <= 1) continue;
      groups += 1;
      needed += width;
    }
    needed += stripGap * Math.max(0, groups - 1);
    const range = document.createRange();
    for (const label of current.querySelectorAll<HTMLElement>("[data-composer-label]")) {
      needed += Math.max(0, labelTextWidth(label, range) - label.getBoundingClientRect().width);
    }
    const nextOverflows = resolveContextStripLabelsCompact({
      compact,
      neededWidth: needed,
      availableWidth: available,
    });
    if (nextOverflows !== compact) {
      pendingLabelRectsRef.current = new Map(
        Array.from(current.querySelectorAll<HTMLElement>(COMPOSER_CONTEXT_LABEL_SELECTOR)).map(
          (label) => [label, label.getBoundingClientRect()],
        ),
      );
    }
    setOverflows(nextOverflows);
  });

  useLayoutEffect(() => {
    const previousRects = pendingLabelRectsRef.current;
    if (!previousRects) return;
    pendingLabelRectsRef.current = null;

    for (const animation of labelAnimationsRef.current.values()) {
      animation.cancel();
    }
    labelAnimationsRef.current.clear();

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    for (const [label, previousRect] of previousRects) {
      if (!label.isConnected) continue;
      const nextWidth = label.getBoundingClientRect().width;
      if (Math.abs(previousRect.width - nextWidth) < 0.5) continue;

      const animation = label.animate(
        [
          { width: `${previousRect.width}px`, maxWidth: `${previousRect.width}px` },
          { width: `${nextWidth}px`, maxWidth: `${nextWidth}px` },
        ],
        {
          duration: COMPOSER_CONTEXT_MOTION_DURATION_MS,
          easing: COMPOSER_CONTEXT_MOTION_EASING,
          fill: "backwards",
        },
      );
      labelAnimationsRef.current.set(label, animation);
      animation.addEventListener(
        "finish",
        () => {
          if (labelAnimationsRef.current.get(label) === animation) {
            labelAnimationsRef.current.delete(label);
          }
        },
        { once: true },
      );
    }
  });

  useEffect(
    () => () => {
      for (const animation of labelAnimationsRef.current.values()) {
        animation.cancel();
      }
    },
    [],
  );

  useLayoutEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- The label mode comes from measuring the committed DOM, which render cannot read.
    measure();
  });

  useEffect(() => {
    if (!element) return;
    const stopObserving = observeResize(element, measure);
    document.fonts.addEventListener("loadingdone", measure);
    return () => {
      stopObserving();
      document.fonts.removeEventListener("loadingdone", measure);
    };
  }, [element]);

  return overflows;
}

export const BranchToolbar = memo(function BranchToolbar({
  layout = "composer",
  panelSection = "all",
  forceNewWorktree = false,
  ref,
  environmentId,
  threadId,
  projectId,
  worktreePath,
  isServerThread,
  showGitControls,
  draftId,
  onEnvModeChange,
  envMode,
  activeThreadBranchOverride,
  onActiveThreadBranchOverrideChange,
  startFromOrigin,
  onStartFromOriginChange,
  autoEnvironmentLabel,
  onAutoEnvironment,
  envLocked,
  onCheckoutPullRequestRequest,
  onComposerFocusRequest,
  availableEnvironments,
  onEnvironmentChange,
  composerControlsHostRef,
  contextStripVisible = true,
}: BranchToolbarProps) {
  const branchSelectorRef = useRef<BranchToolbarBranchSelectorHandle>(null);
  const threadRef = scopeThreadRef(environmentId, threadId);
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);
  // The composer retains resolved thread details while bootstrap cleanup can remove its shell.
  const activeProjectRef = scopeProjectRef(environmentId, projectId);
  const activeProject = useProject(activeProjectRef);
  const activeWorktreePath = forceNewWorktree ? null : worktreePath;
  const effectiveEnvMode = forceNewWorktree ? "worktree" : envMode;
  const envModeLocked = envLocked || (isServerThread && activeWorktreePath !== null);

  const canUsePreviousWorktree = !isServerThread && !envModeLocked && !forceNewWorktree;
  const projectRefsForWorktreeLookup = canUsePreviousWorktree ? [activeProjectRef] : [];
  const projectThreads = useThreadShellsForProjectRefs(projectRefsForWorktreeLookup);
  const previousWorktreeSeed = canUsePreviousWorktree
    ? resolvePreviousWorktreeSeed({
        threads: projectThreads,
        currentWorktreePath: activeWorktreePath,
      })
    : null;
  const previousWorktreeLabel = previousWorktreeSeed
    ? resolvePreviousWorktreeLabel(previousWorktreeSeed)
    : null;
  const onUsePreviousWorktree = () => {
    if (!previousWorktreeSeed) return;
    setDraftThreadContext(draftId ?? threadRef, {
      branch: previousWorktreeSeed.branch,
      worktreePath: previousWorktreeSeed.worktreePath,
      envMode: "worktree",
      projectRef: activeProjectRef,
    });
  };

  useImperativeHandle(
    ref,
    () => ({
      openBranchPicker: () => branchSelectorRef.current?.open(),
      usePreviousWorktree: () => {
        if (!showGitControls || !canUsePreviousWorktree || !previousWorktreeSeed) return;
        onUsePreviousWorktree();
        onComposerFocusRequest?.();
      },
    }),
    [
      canUsePreviousWorktree,
      onComposerFocusRequest,
      onUsePreviousWorktree,
      previousWorktreeSeed,
      showGitControls,
    ],
  );

  const hasMultipleEnvironments = (availableEnvironments?.length ?? 0) > 1;
  const showEnvironmentPicker = hasMultipleEnvironments && onEnvironmentChange !== undefined;
  const activeEnvironmentOption =
    availableEnvironments?.find((env) => env.environmentId === environmentId) ?? null;
  // Started threads get no handler but still show which machine they run on,
  // matching the strip visibility ChatView computes from the same inputs.
  const showEnvironmentIndicator = shouldShowEnvironmentIndicator({
    activeEnvironment: activeEnvironmentOption,
    canPickEnvironment: hasMultipleEnvironments,
  });
  const [stripElement, setStripElement] = useState<HTMLDivElement | null>(null);
  const labelsOverflow = useLabelsOverflow(stripElement);

  if (!activeProject) return null;

  if (layout === "panel") {
    return (
      <div className="flex w-full flex-col" data-thread-panel-run-context>
        {panelSection !== "branch" ? (
          <RunContextSelector
            displayMode="panel"
            workspaceRoot={activeProject.workspaceRoot}
            forceNewWorktree={forceNewWorktree}
            autoEnvironmentLabel={autoEnvironmentLabel}
            onAutoEnvironment={onAutoEnvironment}
            envLocked={envLocked}
            envModeLocked={envModeLocked}
            environmentId={environmentId}
            availableEnvironments={availableEnvironments}
            showEnvironmentPicker={showEnvironmentPicker}
            showEnvironmentIndicator={activeEnvironmentOption !== null}
            onEnvironmentChange={onEnvironmentChange}
            effectiveEnvMode={effectiveEnvMode}
            activeWorktreePath={activeWorktreePath}
            onEnvModeChange={onEnvModeChange}
            previousWorktreeLabel={previousWorktreeLabel}
            previousWorktreeBranch={previousWorktreeSeed?.branch ?? null}
            onUsePreviousWorktree={onUsePreviousWorktree}
          />
        ) : null}
        {panelSection !== "workspace" ? (
          <BranchToolbarBranchSelector
            displayMode="panel"
            className="w-full"
            environmentId={environmentId}
            threadId={threadId}
            {...(draftId ? { draftId } : {})}
            envLocked={envLocked}
            effectiveEnvModeOverride={effectiveEnvMode}
            {...(activeThreadBranchOverride !== undefined ? { activeThreadBranchOverride } : {})}
            {...(onActiveThreadBranchOverrideChange ? { onActiveThreadBranchOverrideChange } : {})}
            startFromOrigin={startFromOrigin}
            onStartFromOriginChange={onStartFromOriginChange}
            {...(onCheckoutPullRequestRequest ? { onCheckoutPullRequestRequest } : {})}
            {...(onComposerFocusRequest ? { onComposerFocusRequest } : {})}
          />
        ) : null}
      </div>
    );
  }

  return (
    <ComposerSurface.ContextStrip
      ref={setStripElement}
      data-compact={labelsOverflow ? "" : undefined}
      className={cn(
        "gap-1 text-xs font-normal text-muted-foreground/70",
        // A non-Git strip with no visible composer controls should occupy no
        // space, but its host must retain a prospective width so controls can
        // become visible again when the chat view grows.
        !contextStripVisible && "pointer-events-none invisible absolute inset-x-0 top-full",
      )}
    >
      {showGitControls ? (
        <div className="contents @3xl/composer-surface:hidden">
          <RunContextSelector
            forceNewWorktree={forceNewWorktree}
            autoEnvironmentLabel={autoEnvironmentLabel}
            onAutoEnvironment={onAutoEnvironment}
            envLocked={envLocked}
            envModeLocked={envModeLocked}
            environmentId={environmentId}
            availableEnvironments={availableEnvironments}
            showEnvironmentPicker={showEnvironmentPicker}
            showEnvironmentIndicator={showEnvironmentIndicator}
            onEnvironmentChange={onEnvironmentChange}
            effectiveEnvMode={effectiveEnvMode}
            activeWorktreePath={activeWorktreePath}
            onEnvModeChange={onEnvModeChange}
            previousWorktreeLabel={previousWorktreeLabel}
            previousWorktreeBranch={previousWorktreeSeed?.branch ?? null}
            onUsePreviousWorktree={onUsePreviousWorktree}
          />
        </div>
      ) : null}
      {showGitControls || showEnvironmentIndicator ? (
        <div
          className={cn(
            "min-h-7 min-w-10 items-center gap-1 sm:min-h-6",
            showGitControls ? "hidden @3xl/composer-surface:flex" : "flex",
            composerControlsHostRef ? "shrink" : "flex-1",
          )}
        >
          {showEnvironmentIndicator && availableEnvironments && (
            <>
              <BranchToolbarEnvironmentSelector
                autoEnvironmentLabel={autoEnvironmentLabel}
                onAutoEnvironment={onAutoEnvironment}
                envLocked={envLocked}
                environmentId={environmentId}
                availableEnvironments={availableEnvironments}
                {...(showEnvironmentPicker ? { onEnvironmentChange } : {})}
              />
              {showGitControls ? (
                <Separator
                  orientation="vertical"
                  className="mx-0.5 h-3.5!"
                  data-composer-context-control
                />
              ) : null}
            </>
          )}
          {showGitControls ? (
            <BranchToolbarEnvModeSelector
              forceNewWorktree={forceNewWorktree}
              envLocked={envModeLocked}
              effectiveEnvMode={effectiveEnvMode}
              activeWorktreePath={activeWorktreePath}
              onEnvModeChange={onEnvModeChange}
              previousWorktreeLabel={previousWorktreeLabel}
              previousWorktreeBranch={previousWorktreeSeed?.branch ?? null}
              onUsePreviousWorktree={onUsePreviousWorktree}
            />
          ) : null}
        </div>
      ) : null}

      {composerControlsHostRef ? (
        <div
          ref={composerControlsHostRef}
          data-composer-context-control
          data-chat-resting-composer-controls-host="true"
          className="flex min-w-0 flex-1 items-center justify-start overflow-x-clip overflow-y-visible"
        />
      ) : null}

      {showGitControls ? (
        <BranchToolbarBranchSelector
          forceNewWorktree={forceNewWorktree}
          ref={branchSelectorRef}
          className="min-w-0 flex-initial justify-end @3xl/composer-surface:ml-auto"
          environmentId={environmentId}
          threadId={threadId}
          {...(draftId ? { draftId } : {})}
          envLocked={envLocked}
          effectiveEnvModeOverride={effectiveEnvMode}
          {...(activeThreadBranchOverride !== undefined ? { activeThreadBranchOverride } : {})}
          {...(onActiveThreadBranchOverrideChange ? { onActiveThreadBranchOverrideChange } : {})}
          startFromOrigin={startFromOrigin}
          onStartFromOriginChange={onStartFromOriginChange}
          {...(onCheckoutPullRequestRequest ? { onCheckoutPullRequestRequest } : {})}
          {...(onComposerFocusRequest ? { onComposerFocusRequest } : {})}
        />
      ) : null}
    </ComposerSurface.ContextStrip>
  );
});
