/** Renders workspace Markdown with relative assets and existing task-list editing. */
import type { ScopedThreadRef } from "@t3tools/contracts";

import ChatMarkdown from "~/components/ChatMarkdown";
import { resolvePathLinkTarget } from "@t3tools/shared/fileLinks";

/** Resolves image paths relative to the file, then delegates links and task actions to ChatMarkdown. */
export function FileMarkdownPreview(props: {
  readonly cwd: string;
  readonly relativePath: string;
  readonly text: string;
  readonly threadRef: ScopedThreadRef;
  readonly workspaceMutationId: string | null;
  readonly onTaskListChange?:
    | ((input: { readonly markerOffset: number; readonly checked: boolean }) => void)
    | undefined;
}) {
  const lastSeparator = Math.max(
    props.relativePath.lastIndexOf("/"),
    props.relativePath.lastIndexOf("\\"),
  );
  const imageBaseDir =
    lastSeparator >= 0
      ? resolvePathLinkTarget(props.relativePath.slice(0, lastSeparator), props.cwd)
      : props.cwd;

  return (
    <ChatMarkdown
      text={props.text}
      cwd={props.cwd}
      imageBaseDir={imageBaseDir}
      threadRef={props.threadRef}
      workspaceMutationId={props.workspaceMutationId}
      className="files-markdown mx-auto w-full max-w-4xl px-4.5 py-4"
      onTaskListChange={props.onTaskListChange}
    />
  );
}
