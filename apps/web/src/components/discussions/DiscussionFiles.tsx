/** Displays checkpoint and live file totals with optional persisted-entry diff actions. */
import type { DiscussionEntry } from "@t3tools/contracts";
import { cn } from "~/lib/utils";
import { t } from "~/i18n";
import { discussionFilesView } from "./discussionTranscript.logic";
/**
 * Renders file totals; live rows remain presentational because they omit onOpenFile.
 * @param props.files Checkpoint or live statistics; null means unavailable.
 * @param props.hideEmpty Hides empty/pending statistics for summaries or live rows.
 * @param props.onOpenFile Optional persisted-entry file activation callback.
 * @param props.selectedPath File highlighted within the open statement, if any.
 * @returns Statistics or focusable whole-row buttons when activation is available.
 */
export function DiscussionFiles({
  files,
  hideEmpty = false,
  onOpenFile,
  selectedPath,
}: {
  files: DiscussionEntry["files"];
  hideEmpty?: boolean;
  onOpenFile?: ((filePath: string) => void) | undefined;
  selectedPath?: string | undefined;
}) {
  const summary = discussionFilesView(files, hideEmpty, t.discussions);
  if (!summary) return null;
  if (summary.kind !== "files")
    return <p className="text-xs text-muted-foreground">{summary.label}</p>;
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex h-7.5 items-center gap-1.5 border-b px-3 text-xs">
        <span className="font-medium">{summary.label}</span>
        <span className="text-success-foreground">+{summary.additions}</span>
        <span className="text-destructive-foreground">−{summary.deletions}</span>
      </div>
      <ul className="divide-y">
        {files?.map((file) => (
          <li key={file.path}>
            {onOpenFile ? (
              <button
                type="button"
                aria-pressed={selectedPath === file.path}
                onClick={() => onOpenFile(file.path)}
                className={cn(
                  "flex min-h-7 w-full items-center gap-2 px-3 py-1 text-left text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  selectedPath === file.path && "bg-accent",
                )}
              >
                <span className="min-w-0 flex-1 break-all font-mono">{file.path}</span>
                <span className="shrink-0 text-success-foreground">+{file.additions}</span>
                <span className="shrink-0 text-destructive-foreground">−{file.deletions}</span>
              </button>
            ) : (
              <div className="flex min-h-7 items-center gap-2 px-3 py-1 text-xs">
                <span className="min-w-0 flex-1 break-all font-mono">{file.path}</span>
                <span className="shrink-0 text-success-foreground">+{file.additions}</span>
                <span className="shrink-0 text-destructive-foreground">−{file.deletions}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
