/** Sidebar app and remote update actions; existing update services own download and installation. */
import { t } from "~/i18n";
import { useAtomValue } from "@effect/atom-react";
import type { DesktopBridge, DesktopUpdateState } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";
import { CircleArrowUpIcon, HourglassIcon, TriangleAlertIcon } from "lucide-react";
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { isElectron } from "../../env";
import { ensureLocalApi } from "../../localApi";
import { useDesktopUpdateState } from "../../state/desktopUpdate";
import { serverEnvironment } from "../../state/server";
import { stackedThreadToast, toastManager } from "../ui/toast";
import {
  canCheckForUpdate,
  getArm64IntelBuildWarningDescription,
  getDesktopUpdateActionError,
  getDesktopUpdateButtonTooltip,
  getDesktopUpdateDownloadedVersion,
  getDesktopUpdateInstallConfirmationMessage,
  isDesktopUpdateButtonDisabled,
  resolveDesktopUpdateButtonAction,
  shouldShowArm64IntelBuildWarning,
  shouldToastDesktopUpdateActionResult,
} from "../desktopUpdate.logic";
import { showDesktopUpdateDownloadedToast } from "../desktopUpdate.toast";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Popover, PopoverCreateHandle, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { SidebarMenuItem } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  DesktopUpdateStatusIcon,
  type DesktopUpdateStatusIconState,
} from "./DesktopUpdateStatusIcon";
import { SidebarUpdateReleaseNotes } from "./SidebarUpdateReleaseNotes";
import { UpdateEverythingDialog } from "./UpdateEverythingDialog";
import {
  describeUpdateRun,
  resolveUpdateRunMachineStatus,
  type UpdateEverythingRun,
} from "./updateEverything.logic";
import { useUpdateEverythingRun } from "./updateEverythingRun";
import { type ReportLocalUpdateError, useUpdateEverything } from "./useUpdateEverything";
import { sidebarNoticeRegistry } from "./SidebarChrome";

type SidebarUpdatePopoverChangeDetails = Parameters<
  NonNullable<ComponentProps<typeof Popover>["onOpenChange"]>
>[1];
type SidebarUpdatePopoverHandle = ReturnType<typeof PopoverCreateHandle>;

/** Show previews only when update details include nonempty nightly release notes. */
export function shouldUseSidebarUpdateReleaseNotesPopover(
  showUpdateDetails: boolean,
  state: DesktopUpdateState | null,
): boolean {
  return showUpdateDetails && state?.channel === "nightly" && state.releaseNotes.length > 0;
}

/** Cancel trigger presses so the same press runs the update action without toggling notes. */
export function handleSidebarUpdateReleaseNotesPopoverOpenChange(
  _open: boolean,
  details: Pick<SidebarUpdatePopoverChangeDetails, "reason" | "cancel">,
): void {
  // The trigger is the update action, so its presses must not also toggle the Popover.
  if (details.reason === "trigger-press") details.cancel();
}

/** Promote forward Tab to a focus-managed popup without preventing native navigation. */
export function openSidebarUpdateReleaseNotesPopoverOnForwardTab(
  event: { readonly key: string; readonly shiftKey: boolean },
  handle: Pick<SidebarUpdatePopoverHandle, "open">,
  triggerId: string,
): void {
  if (event.key !== "Tab" || event.shiftKey) return;
  // Hover-open popovers do not manage focus. Promote this one before native Tab runs.
  flushSync(() => handle.open(triggerId));
}

/** Resolve the icon and detail visibility from local progress and the remote update run. */
function resolveSidebarUpdatePresentation({
  action,
  showsEverything,
  run,
  isDownloading,
  showCheckIcon,
}: {
  readonly action: ReturnType<typeof resolveDesktopUpdateButtonAction>;
  /** Remote work is waiting, and this app is not downloading. */
  readonly showsEverything: boolean;
  /** The running "update everything" pass. Its state sets the icon. */
  readonly run: UpdateEverythingRun | null;
  readonly isDownloading: boolean;
  readonly showCheckIcon: boolean;
}) {
  const showUpdateDetails = action !== "none" || showsEverything || run !== null || isDownloading;
  const iconStatus: DesktopUpdateStatusIconState = showCheckIcon
    ? "checking"
    : isDownloading
      ? "downloading"
      : run !== null
        ? run.localVersion !== null && action === "install"
          ? "downloaded"
          : "everything"
        : showsEverything
          ? "everything"
          : action === "install"
            ? "downloaded"
            : action === "download"
              ? "available"
              : "idle";

  return {
    iconStatus,
    showUpdateDetails,
  } as const;
}

/** Render the architecture notice only in the local desktop app. */
export function SidebarUpdateArchitectureWarning() {
  return isElectron ? <SidebarUpdateArchitectureWarningContent /> : null;
}

/** Explain an Intel app running on an ARM host; hide when architecture matches. */
function SidebarUpdateArchitectureWarningContent() {
  const state = useDesktopUpdateState();
  const visible = shouldShowArm64IntelBuildWarning(state);
  const description = state && visible ? getArm64IntelBuildWarningDescription(state) : null;
  sidebarNoticeRegistry.useRegister("warning", visible && !!description);

  if (!visible || !description) return null;

  return (
    <Alert variant="warning">
      <TriangleAlertIcon />
      <AlertTitle>{t.sidebar.updates.architectureWarningTitle}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}

const toastUpdateError: ReportLocalUpdateError = (title, description) => {
  toastManager.add(stackedThreadToast({ type: "error", title, description }));
};

/** Downloads this app's update. Resolves true when it is ready to install;
    failures go to `reportError` (a toast by default) and resolve false. */
async function downloadLocalUpdate(
  bridge: DesktopBridge,
  {
    notifyDownloaded,
    reportError = toastUpdateError,
  }: { readonly notifyDownloaded: boolean; readonly reportError?: ReportLocalUpdateError },
): Promise<boolean> {
  try {
    const result = await bridge.downloadUpdate();
    if (result.completed && notifyDownloaded) {
      showDesktopUpdateDownloadedToast(bridge, result.state);
    }
    const actionError = shouldToastDesktopUpdateActionResult(result)
      ? getDesktopUpdateActionError(result)
      : null;
    if (actionError) reportError(t.sidebar.updates.downloadError, actionError);
    return result.completed;
  } catch (error) {
    reportError(
      t.sidebar.updates.startDownloadError,
      error instanceof Error ? error.message : t.sidebar.errors.unexpectedError,
    );
    return false;
  }
}

/** Installs this app's downloaded update, which relaunches the app. Resolves
    true when the relaunch is under way. Failures go to `reportError` (a toast
    by default). A refused install (the download is not marked ready yet)
    leaves the restart to the user. */
async function installLocalUpdate(
  bridge: DesktopBridge,
  reportError: ReportLocalUpdateError = toastUpdateError,
): Promise<boolean> {
  try {
    const result = await bridge.installUpdate();
    if (!result.accepted) {
      showDesktopUpdateDownloadedToast(bridge, result.state);
      return false;
    }
    const actionError = shouldToastDesktopUpdateActionResult(result)
      ? getDesktopUpdateActionError(result)
      : null;
    if (!actionError) return true;
    reportError(t.sidebar.updates.installError, actionError);
    return false;
  } catch (error) {
    reportError(
      t.sidebar.updates.installError,
      error instanceof Error ? error.message : t.sidebar.errors.unexpectedError,
    );
    return false;
  }
}

/** Tooltip lines for a running pass: this app first, then one per machine. */
function useUpdateRunTooltip(
  run: UpdateEverythingRun | null,
  state: DesktopUpdateState | null,
  localReady: boolean,
): string | null {
  const statusesAtom = useMemo(
    () =>
      Atom.make((get) =>
        run === null
          ? []
          : run.machines.map((machine) => ({
              label: machine.label,
              status: resolveUpdateRunMachineStatus(
                machine,
                run.phase,
                get(serverEnvironment.updateStateAtom(machine.environmentId)),
              ),
            })),
      ),
    [run],
  );
  const statuses = useAtomValue(statusesAtom);
  if (run === null) return null;
  const local =
    run.localVersion === null
      ? null
      : state?.status === "downloading"
        ? `downloading${state.downloadPercent === null ? "" : ` ${Math.floor(state.downloadPercent)}%`}`
        : run.phase === "installing"
          ? "restarting"
          : localReady
            ? "restarts last"
            : "waiting";
  return describeUpdateRun(statuses, local).join("\n");
}

/**
 * The sidebar update button. With only a local app update it downloads, then
 * installs. When other machines' servers or any providers are behind, one
 * click updates everything: providers, then servers, then this app last. On
 * web there is no local app, so the button shows only for remote updates.
 */
export function SidebarUpdatePill() {
  return <SidebarUpdateControl />;
}

/** Render update status and dispatch existing local or multi-machine update actions. */
function SidebarUpdateControl() {
  const state = useDesktopUpdateState();
  const [isActionPending, setIsActionPending] = useState(false);
  const [isConfirmingEverything, setIsConfirmingEverything] = useState(false);
  const [releaseNotesPopoverHandle] = useState(() => PopoverCreateHandle());
  const suppressReleaseNotesFocusOpen = useRef(false);
  const releaseNotesPopupRef = useRef<HTMLDivElement>(null);
  const releaseNotesTriggerId = useId();
  const action = state ? resolveDesktopUpdateButtonAction(state) : "none";
  const isDownloading = state?.status === "downloading";
  // Remote servers follow this app to the version it is about to install.
  const localUpdateVersion =
    state && action !== "none" ? getDesktopUpdateDownloadedVersion(state) : null;
  const everything = useUpdateEverything(localUpdateVersion);
  const runsEverything = everything.hasUpdates && !isDownloading;
  // Providers leave the list once queued, so the run keeps its own state.
  const run = useUpdateEverythingRun();
  const isRunningEverything = run !== null;
  const runTooltip = useUpdateRunTooltip(run, state, action === "install");
  // V1 uses a static hourglass; no trailing spin cycle should hold the action disabled.
  const showCheckIcon = state?.status === "checking";
  const { iconStatus, showUpdateDetails } = resolveSidebarUpdatePresentation({
    action,
    showsEverything: runsEverything,
    run,
    isDownloading,
    showCheckIcon,
  });
  const tooltip =
    runTooltip !== null
      ? runTooltip
      : runsEverything
        ? everything.summary
        : showUpdateDetails
          ? state
            ? getDesktopUpdateButtonTooltip(state)
            : t.sidebar.updates.available
          : showCheckIcon
            ? t.sidebar.updates.checking
            : t.sidebar.updates.check;
  const disabled = showCheckIcon
    ? true
    : runsEverything
      ? false
      : showUpdateDetails
        ? isDesktopUpdateButtonDisabled(state)
        : !canCheckForUpdate(state);
  const isInteractionDisabled = disabled || isActionPending || isRunningEverything;
  // During a run the tooltip shows its progress instead of release notes.
  const showReleaseNotesPopover =
    !isRunningEverything && shouldUseSidebarUpdateReleaseNotesPopover(showUpdateDetails, state);

  useEffect(() => {
    if (!showReleaseNotesPopover) {
      releaseNotesPopoverHandle.close();
      return;
    }

    const trigger = document.getElementById(releaseNotesTriggerId);
    if (trigger?.matches(":focus-visible")) {
      releaseNotesPopoverHandle.open(releaseNotesTriggerId);
    }
  }, [releaseNotesPopoverHandle, releaseNotesTriggerId, showReleaseNotesPopover]);

  const handleAction = useCallback(async () => {
    const bridge = window.desktopBridge;
    if (isInteractionDisabled) return;

    if (runsEverything) {
      setIsConfirmingEverything(true);
      return;
    }

    if (!bridge || !state) return;
    setIsActionPending(true);

    if (action === "download") {
      void downloadLocalUpdate(bridge, { notifyDownloaded: true }).finally(() =>
        setIsActionPending(false),
      );
      return;
    }

    if (action === "install") {
      let confirmed = false;
      try {
        confirmed = await ensureLocalApi().dialogs.confirm(
          getDesktopUpdateInstallConfirmationMessage(state),
        );
      } catch (error) {
        setIsActionPending(false);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t.sidebar.updates.confirmError,
            description:
              error instanceof Error ? error.message : t.sidebar.updates.confirmFailedHint,
          }),
        );
        return;
      }
      if (!confirmed) {
        setIsActionPending(false);
        return;
      }
      void installLocalUpdate(bridge).finally(() => setIsActionPending(false));
      return;
    }

    void bridge
      .checkForUpdate()
      .then((result) => {
        if (result.checked) return;
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t.sidebar.updates.checkError,
            description: result.state.message ?? t.sidebar.updates.unavailableHint,
          }),
        );
      })
      .catch((error) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t.sidebar.updates.checkError,
            description: error instanceof Error ? error.message : t.sidebar.updates.checkFailedHint,
          }),
        );
      })
      .finally(() => setIsActionPending(false));
  }, [action, isInteractionDisabled, runsEverything, state]);

  const runEverything = useCallback(async () => {
    const bridge = window.desktopBridge;
    setIsConfirmingEverything(false);
    setIsActionPending(true);
    try {
      await everything.run({
        ...(bridge && action === "download"
          ? {
              downloadLocal: (reportError) =>
                downloadLocalUpdate(bridge, { notifyDownloaded: false, reportError }),
            }
          : {}),
        ...(bridge && action !== "none"
          ? { installLocal: (reportError) => installLocalUpdate(bridge, reportError) }
          : {}),
      });
    } catch (error) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not update everything",
          description: error instanceof Error ? error.message : t.sidebar.errors.unexpectedError,
        }),
      );
    } finally {
      setIsActionPending(false);
    }
  }, [action, everything]);

  // Web has no local app to check, so it only shows the button for remote work.
  const visible =
    state?.status !== "disabled" && (isElectron || runsEverything || isRunningEverything);
  sidebarNoticeRegistry.useRegister("pill", visible);
  if (!visible) return null;

  const updateButton = (
    <button
      type="button"
      aria-label={tooltip}
      aria-disabled={isInteractionDisabled || undefined}
      className="sidebar-update-pill"
      data-prominent={
        showUpdateDetails && !showCheckIcon && !isDownloading && state?.status !== "error"
      }
      data-status={showCheckIcon ? "checking" : state?.status}
      onClick={handleAction}
      onBlur={() => {
        suppressReleaseNotesFocusOpen.current = false;
      }}
      onFocus={(event) => {
        if (!showReleaseNotesPopover || !event.currentTarget.matches(":focus-visible")) return;
        if (suppressReleaseNotesFocusOpen.current) {
          suppressReleaseNotesFocusOpen.current = false;
          return;
        }
        flushSync(() => releaseNotesPopoverHandle.open(releaseNotesTriggerId));
      }}
      onKeyDown={(event) => {
        if (!showReleaseNotesPopover) return;
        openSidebarUpdateReleaseNotesPopoverOnForwardTab(
          event,
          releaseNotesPopoverHandle,
          releaseNotesTriggerId,
        );
      }}
    >
      <span className="sidebar-update-pill-icon" aria-hidden="true">
        {showCheckIcon ? (
          <HourglassIcon />
        ) : iconStatus === "available" || iconStatus === "everything" ? (
          <CircleArrowUpIcon />
        ) : (
          <DesktopUpdateStatusIcon
            downloadPercent={state?.downloadPercent ?? null}
            status={iconStatus}
          />
        )}
      </span>
      <span className="sidebar-update-pill-label">
        {showCheckIcon
          ? t.sidebar.updates.checking
          : state?.status === "available" && !runsEverything && !isRunningEverything
            ? t.sidebar.updates.available
            : state?.status === "error" && !runsEverything && !isRunningEverything
              ? getDesktopUpdateButtonTooltip(state)
              : tooltip}
      </span>
    </button>
  );

  return (
    <SidebarMenuItem className="w-full shrink-0">
      <Popover
        handle={releaseNotesPopoverHandle}
        onOpenChange={(open, details) => {
          if (open && !showReleaseNotesPopover) {
            details.cancel();
            return;
          }
          handleSidebarUpdateReleaseNotesPopoverOpenChange(open, details);
        }}
      >
        <Tooltip disabled={showReleaseNotesPopover}>
          <TooltipTrigger
            id={releaseNotesTriggerId}
            render={
              <PopoverTrigger
                {...(!showReleaseNotesPopover
                  ? {
                      "aria-controls": undefined,
                      "aria-expanded": undefined,
                      "aria-haspopup": undefined,
                    }
                  : {})}
                closeDelay={150}
                handle={releaseNotesPopoverHandle}
                id={releaseNotesTriggerId}
                openOnHover={showReleaseNotesPopover}
                render={updateButton}
              />
            }
          />
          {!showReleaseNotesPopover ? (
            <TooltipPopup
              align="center"
              side="top"
              variant={showUpdateDetails ? "glass" : "default"}
            >
              <span className="whitespace-pre-line">{tooltip}</span>
            </TooltipPopup>
          ) : null}
        </Tooltip>
        {showReleaseNotesPopover && state ? (
          <PopoverPopup
            align="start"
            padding="none"
            variant="panel"
            aria-label={t.sidebar.updates.releaseNotesAriaLabel}
            initialFocus={false}
            onKeyDownCapture={(event) => {
              if (
                event.key === "Escape" &&
                releaseNotesPopupRef.current?.contains(document.activeElement)
              ) {
                suppressReleaseNotesFocusOpen.current = true;
              }
            }}
            ref={releaseNotesPopupRef}
            side="top"
          >
            <SidebarUpdateReleaseNotes
              shell={window.desktopBridge}
              state={state}
              tooltip={tooltip}
            />
          </PopoverPopup>
        ) : null}
      </Popover>
      <UpdateEverythingDialog
        open={isConfirmingEverything}
        onOpenChange={setIsConfirmingEverything}
        summary={everything.summary}
        lines={everything.lines}
        restarts={everything.restarts}
        skipped={everything.skipped}
        onConfirm={() => void runEverything()}
      />
    </SidebarMenuItem>
  );
}
