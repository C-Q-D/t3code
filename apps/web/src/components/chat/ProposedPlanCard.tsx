/** Displays proposed plans with copy, download and permitted workspace saving. */
import { t } from "~/i18n";
import { proposedPlanTitle, stripDisplayedPlanMarkdown } from "@t3tools/shared/proposedPlanText";
import { memo, useState, useId } from "react";
import { findRevealRef } from "./markdownFindContext";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  AuthFilesystemWriteScope,
  type EnvironmentId,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import {
  buildCollapsedProposedPlanPreviewMarkdown,
  buildProposedPlanMarkdownFilename,
  downloadPlanAsTextFile,
  normalizePlanMarkdownForExport,
} from "../../proposedPlan";
import ChatMarkdown from "../ChatMarkdown";
import {
  CheckIcon,
  ClipboardCopyIcon,
  DownloadIcon,
  FolderDownIcon,
  ListChecksIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { projectEnvironment } from "~/state/projects";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { useAtomCommand } from "~/state/use-atom-command";
import { readEnvironmentScope, useEnvironmentScope } from "~/state/session";

/**
 * Render the retained plan with D1 header actions; short plans do not gain a new collapse behavior.
 * @param props Markdown and environment scope; missing workspaceRoot disables saving. findActive
 * keeps the full plan mounted so existing search can reveal a match beyond the preview.
 * @returns Plan content, existing export actions and the permitted workspace-save dialog.
 */
export const ProposedPlanCard = memo(function ProposedPlanCard({
  planMarkdown,
  environmentId,
  threadRef,
  cwd,
  workspaceRoot,
  findActive = false,
}: {
  planMarkdown: string;
  environmentId: EnvironmentId;
  threadRef?: ScopedThreadRef | undefined;
  cwd: string | undefined;
  workspaceRoot: string | undefined;
  findActive?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const canWriteFiles = useEnvironmentScope(environmentId, AuthFilesystemWriteScope);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  // The path last submitted, so reopening the dialog offers it again.
  const [lastSavePath, setLastSavePath] = useState("");
  const [isSavingToWorkspace, setIsSavingToWorkspace] = useState(false);
  const writeProjectFile = useAtomCommand(projectEnvironment.writeFile, {
    reportFailure: false,
  });
  const { copyToClipboard, isCopied } = useCopyToClipboard({
    target: "plan",
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t.chat.plan.couldNotCopyPlan,
          description:
            error instanceof Error ? error.message : t.chat.plan.anErrorOccurredWhileCopying,
        }),
      );
    },
  });
  const title = proposedPlanTitle(planMarkdown) ?? t.chat.plan.proposedPlan;
  const lineCount = planMarkdown.split("\n").length;
  const canCollapse = planMarkdown.length > 900 || lineCount > 20;
  const displayedPlanMarkdown = stripDisplayedPlanMarkdown(planMarkdown);
  const collapsedPreview = canCollapse
    ? buildCollapsedProposedPlanPreviewMarkdown(planMarkdown, { maxLines: 10 })
    : null;
  const isCollapsed = canCollapse && !expanded;
  // While finding, the full plan stays mounted but clipped, so a match past the
  // preview can be counted and then opened only once it is selected.
  const showPreview = isCollapsed && !findActive;
  const revealRef = findRevealRef(() => setExpanded(true));
  const downloadFilename = buildProposedPlanMarkdownFilename(planMarkdown);
  const saveContents = normalizePlanMarkdownForExport(planMarkdown);

  const handleDownload = () => {
    downloadPlanAsTextFile(downloadFilename, saveContents);
  };

  const handleCopyPlan = () => {
    copyToClipboard(saveContents);
  };

  const openSaveDialog = () => {
    if (!canWriteFiles) return;
    if (!workspaceRoot) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t.chat.plan.workspacePathIsUnavailable,
          description: t.chat.plan.thisThreadDoesNotHaveAWorkspace,
        }),
      );
      return;
    }
    setIsSaveDialogOpen(true);
  };

  const handleSaveToWorkspace = (savePath: string) => {
    const relativePath = savePath.trim();
    if (!workspaceRoot || !readEnvironmentScope(environmentId, AuthFilesystemWriteScope)) {
      return;
    }
    if (!relativePath) {
      toastManager.add({
        type: "warning",
        title: t.chat.plan.enterAWorkspacePath,
      });
      return;
    }

    setLastSavePath(savePath);
    setIsSavingToWorkspace(true);
    void (async () => {
      const result = await writeProjectFile({
        environmentId,
        input: {
          cwd: workspaceRoot,
          relativePath,
          contents: saveContents,
        },
      });
      setIsSavingToWorkspace(false);
      if (result._tag === "Success") {
        setIsSaveDialogOpen(false);
        toastManager.add({
          type: "success",
          title: t.chat.plan.planSavedToWorkspace,
          description: result.value.relativePath,
        });
        return;
      }
      if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t.chat.plan.couldNotSavePlan,
            description:
              error instanceof Error ? error.message : t.chat.plan.anErrorOccurredWhileSaving,
          }),
        );
      }
    })();
  };

  return (
    <div className="timeline-plan rounded-card-large bg-surface-raised p-1.5 pb-4 shadow-raise-l-spec">
      <div className="flex h-11.5 min-w-0 items-center gap-2.5 ps-3.5 pe-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <ListChecksIcon aria-hidden className="size-4.25 shrink-0" />
          {/* Same heading level as the message author headings in the timeline,
              so a plan's own headings nest beneath it in the outline. */}
          <h3
            data-thread-find-text="true"
            className="truncate font-serif text-plan-title font-bold text-foreground"
          >
            {title}
          </h3>
        </div>
        <div className="flex shrink-0 items-center">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-toolbar-key"
                  variant="ghost-muted"
                  onClick={handleCopyPlan}
                  aria-label={isCopied ? t.chat.plan.copied : t.chat.plan.copyToClipboard}
                />
              }
            >
              {isCopied ? (
                <CheckIcon aria-hidden className="size-3.75" />
              ) : (
                <ClipboardCopyIcon aria-hidden className="size-3.75" />
              )}
            </TooltipTrigger>
            <TooltipPopup>
              {isCopied ? t.chat.plan.copied : t.chat.plan.copyToClipboard}
            </TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-toolbar-key"
                  variant="ghost-muted"
                  onClick={handleDownload}
                  aria-label={t.chat.plan.downloadAsMarkdown}
                />
              }
            >
              <DownloadIcon aria-hidden className="size-3.75" />
            </TooltipTrigger>
            <TooltipPopup>{t.chat.plan.downloadAsMarkdown}</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-toolbar-key"
                  variant="ghost-muted"
                  onClick={openSaveDialog}
                  disabled={!canWriteFiles || !workspaceRoot || isSavingToWorkspace}
                  aria-label={t.chat.plan.saveToWorkspace}
                />
              }
            >
              <FolderDownIcon aria-hidden className="size-3.75" />
            </TooltipTrigger>
            <TooltipPopup>{t.chat.plan.saveToWorkspace}</TooltipPopup>
          </Tooltip>
          {canCollapse ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-toolbar-key"
                    variant="secondary"
                    data-scroll-anchor-ignore
                    aria-expanded={expanded}
                    aria-label={expanded ? t.chat.plan.collapsePlan : t.chat.plan.expandPlan}
                    onClick={() => setExpanded((value) => !value)}
                  />
                }
              >
                {expanded ? (
                  <ChevronUpIcon aria-hidden className="size-4" />
                ) : (
                  <ChevronDownIcon aria-hidden className="size-4" />
                )}
              </TooltipTrigger>
              <TooltipPopup>
                {expanded ? t.chat.plan.collapsePlan : t.chat.plan.expandPlan}
              </TooltipPopup>
            </Tooltip>
          ) : null}
        </div>
      </div>
      <div className="mx-4.5 mt-1">
        <div
          ref={revealRef}
          className={cn("relative", isCollapsed && "max-h-104 overflow-hidden")}
          data-thread-find-text="true"
          data-thread-find-fold={isCollapsed ? "" : undefined}
        >
          {showPreview ? (
            <ChatMarkdown
              presentation="timeline"
              className="timeline-plan-markdown"
              text={collapsedPreview ?? ""}
              cwd={cwd}
              environmentId={environmentId}
              threadRef={threadRef}
              isStreaming={false}
              headingLevelOffset={3}
            />
          ) : (
            <ChatMarkdown
              presentation="timeline"
              className="timeline-plan-markdown"
              text={displayedPlanMarkdown}
              cwd={cwd}
              environmentId={environmentId}
              threadRef={threadRef}
              isStreaming={false}
              headingLevelOffset={3}
            />
          )}
          {isCollapsed ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-card/95 via-card/80 to-transparent" />
          ) : null}
        </div>
      </div>

      <Dialog
        open={isSaveDialogOpen}
        onOpenChange={(open) => {
          if (!isSavingToWorkspace) {
            setIsSaveDialogOpen(open);
          }
        }}
      >
        {/* The form owns the path so a keystroke re-renders it, not the dialog chrome. */}
        <DialogPopup className="max-w-xl">
          <SavePlanToWorkspaceForm
            initialPath={lastSavePath || downloadFilename}
            placeholder={downloadFilename}
            workspaceRoot={workspaceRoot}
            canWriteFiles={canWriteFiles}
            saving={isSavingToWorkspace}
            onCancel={() => setIsSaveDialogOpen(false)}
            onSave={handleSaveToWorkspace}
          />
        </DialogPopup>
      </Dialog>
    </div>
  );
});

/** Keeps path editing local so each keystroke does not rerender the plan Markdown.
 * @param initialPath Initial workspace-relative save path, read when mounted.
 * @param placeholder Suggested filename shown for an empty input.
 * @param workspaceRoot Optional display-only workspace path.
 * @param canWriteFiles Gates saving for the current permission scope.
 * @param saving Disables edits and actions while the owner persists the file.
 * @param onCancel Closes the form without saving.
 * @param onSave Receives the entered path; validation, persistence and error reporting belong to the caller.
 * @returns Localized form; no file is written by this component. */
function SavePlanToWorkspaceForm({
  initialPath,
  placeholder,
  workspaceRoot,
  canWriteFiles,
  saving,
  onCancel,
  onSave,
}: {
  initialPath: string;
  placeholder: string;
  workspaceRoot: string | undefined;
  canWriteFiles: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: (path: string) => void;
}) {
  const [savePath, setSavePath] = useState(initialPath);
  const savePathInputId = useId();
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.chat.plan.savePlanToWorkspace}</DialogTitle>
        <DialogDescription>
          {t.chat.plan.pathPrefix}
          <code>{workspaceRoot ?? t.chat.plan.theWorkspace}</code>
          {t.chat.plan.pathSuffix}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <label htmlFor={savePathInputId} className="grid gap-1.5">
          <span className="text-xs font-medium text-foreground">{t.chat.plan.workspacePath}</span>
          <Input
            id={savePathInputId}
            value={savePath}
            onChange={(event) => setSavePath(event.target.value)}
            placeholder={placeholder}
            spellCheck={false}
            disabled={saving}
          />
        </label>
      </DialogPanel>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          {t.chat.plan.cancel}
        </Button>
        <Button size="sm" onClick={() => onSave(savePath)} disabled={!canWriteFiles || saving}>
          {saving ? t.chat.plan.saving : t.chat.plan.save}
        </Button>
      </DialogFooter>
    </>
  );
}
