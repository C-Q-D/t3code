/** Displays checkpoint and live file totals without enabling diff actions. */
import type { DiscussionEntry } from "@t3tools/contracts";
import { t } from "~/i18n";
import { discussionFilesView } from "./discussionTranscript.logic";
/** Renders supplied file statistics; summaries and live runs can hide empty/pending results. */
export function DiscussionFiles({
  files,
  hideEmpty = false,
}: {
  files: DiscussionEntry["files"];
  hideEmpty?: boolean;
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
          <li key={file.path} className="flex min-h-7 items-center gap-2 px-3 py-1 text-xs">
            <span className="min-w-0 flex-1 break-all font-mono">{file.path}</span>
            <span className="shrink-0 text-success-foreground">+{file.additions}</span>
            <span className="shrink-0 text-destructive-foreground">−{file.deletions}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
