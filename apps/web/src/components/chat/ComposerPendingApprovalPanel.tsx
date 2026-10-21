import { t } from "~/i18n";
import { memo } from "react";
import { type PendingApproval } from "../../session-logic";
import { cn } from "~/lib/utils";
import { ShieldIcon, TerminalIcon } from "lucide-react";

interface ComposerPendingApprovalPanelProps {
  approval: PendingApproval;
  pendingCount: number;
  className?: string;
}

/** Keeps the provider's full request readable in E1's recessed approval detail. */
export const ComposerPendingApprovalPanel = memo(function ComposerPendingApprovalPanel({
  approval,
  pendingCount,
  className,
}: ComposerPendingApprovalPanelProps) {
  const Detail = approval.requestKind === "mcp-elicitation" ? "span" : "code";
  const fallbackLabel =
    approval.requestKind === "mcp-elicitation"
      ? t.composer.approval.appAccessTitle
      : approval.requestKind === "command"
        ? t.composer.approval.commandTitle
        : approval.requestKind === "file-read"
          ? t.composer.approval.fileReadTitle
          : approval.requestKind === "permission"
            ? t.composer.approval.permissionTitle
            : t.composer.approval.fileChangeTitle;
  const detailAriaLabel =
    approval.requestKind === "mcp-elicitation"
      ? t.composer.approval.appAccessAriaLabel
      : approval.requestKind === "command"
        ? t.composer.approval.commandAriaLabel
        : approval.requestKind === "file-read"
          ? t.composer.approval.fileReadAriaLabel
          : approval.requestKind === "permission"
            ? t.composer.approval.permissionAriaLabel
            : t.composer.approval.fileChangeAriaLabel;

  return (
    <span
      aria-label={fallbackLabel}
      className={cn("flex w-full min-w-0 flex-1 flex-col items-start gap-3", className)}
      role="group"
    >
      <span className="flex w-full min-w-0 items-center gap-2.5 px-2 text-secondary-copy text-secondary-label">
        <span className="composer-primary-key flex size-7 shrink-0 items-center justify-center rounded-composer-queue-toggle bg-warning-surface text-status-warning-foreground text-shadow-none shadow-tag">
          {approval.requestKind === "command" ? (
            <TerminalIcon className="size-3.75" aria-hidden="true" />
          ) : (
            <ShieldIcon className="size-3.75" aria-hidden="true" />
          )}
        </span>
        <span className="font-serif text-chat-title font-bold text-foreground">
          {fallbackLabel}
        </span>
        {approval.appName ? <span className="min-w-0 truncate">{approval.appName}</span> : null}
        {pendingCount > 1 ? (
          <span className="ml-auto shrink-0 tabular-nums">1/{pendingCount}</span>
        ) : null}
      </span>
      <Detail
        aria-label={detailAriaLabel}
        className={cn(
          "block max-h-20 w-full min-w-0 overflow-auto rounded-composer-panel-row bg-code px-4 py-3 text-code-copy leading-terminal text-foreground shadow-well-control outline-none focus-visible:inset-shadow-focus",
          approval.requestKind === "mcp-elicitation"
            ? "max-h-20 whitespace-pre-wrap font-sans wrap-break-word"
            : "max-h-20 whitespace-pre-wrap font-mono wrap-anywhere",
        )}
        data-approval-detail="complete"
        tabIndex={0}
      >
        {approval.requestKind === "command" &&
        approval.responseCapability !== "not_resumable" &&
        approval.detail ? (
          <span aria-hidden="true" className="text-placeholder">
            ${" "}
          </span>
        ) : null}
        {approval.responseCapability === "not_resumable"
          ? t.composer.approval.processGoneHint
          : approval.detail || fallbackLabel}
      </Detail>
    </span>
  );
});
