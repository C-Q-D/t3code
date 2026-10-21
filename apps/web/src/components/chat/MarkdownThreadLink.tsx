/** Renders internal thread links using live titles without translating user content. */
import { t } from "~/i18n";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import {
  formatThreadLink,
  percentDecodedThreadLinkId,
  resolveThreadLinkRef,
} from "@t3tools/shared/threadLinks";
import { Link } from "@tanstack/react-router";
import { MessageSquareTextIcon } from "lucide-react";

import { useProject, useThreadRefs, useThreadShell } from "../../state/entities";
import { ProjectFavicon } from "../ProjectFavicon";

/** Keeps archived or cross-environment thread references navigable even when live metadata is absent.
 * @param props environmentId and threadId identify the written target; label is the fallback title.
 * @returns A thread route link using resolved metadata when available and localized unavailable guidance otherwise. */
export function MarkdownThreadLink(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly label: string;
}) {
  const decodedId = percentDecodedThreadLinkId(props.threadId);
  const written = useThreadShell(scopeThreadRef(props.environmentId, props.threadId));
  const decoded = useThreadShell(
    written === null && decodedId !== null ? scopeThreadRef(props.environmentId, decodedId) : null,
  );
  const local = written ?? decoded;
  const refs = useThreadRefs(local === null);
  const remote = useThreadShell(
    local === null
      ? resolveThreadLinkRef(scopeThreadRef(props.environmentId, props.threadId), refs)
      : null,
  );
  const thread = local ?? remote;
  const environmentId = thread?.environmentId ?? props.environmentId;
  const threadId = thread?.id ?? props.threadId;
  const project = useProject(
    thread === null ? null : scopeProjectRef(environmentId, thread.projectId),
  );
  const title = thread?.title.trim() || props.label;
  return (
    <Link
      to="/$environmentId/$threadId"
      params={{ environmentId, threadId }}
      // Like an attached thread chip: archived threads are not in the index but still open.
      title={thread === null ? t.chat.newComponents.threadUnavailable : project?.title}
      data-markdown-copy={formatThreadLink(threadId, title)}
    >
      <span
        className="ms-[0.25em] me-[0.2em] inline-flex size-[14px] [vertical-align:-0.125em]"
        aria-hidden
      >
        {project === null ? (
          <MessageSquareTextIcon className="block size-full shrink-0" />
        ) : (
          <ProjectFavicon project={project} className="size-full" />
        )}
      </span>
      {title}
    </Link>
  );
}
