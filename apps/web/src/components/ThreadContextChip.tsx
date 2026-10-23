/** Renders a linked conversation context chip with localized accessibility text. */
import { t } from "~/i18n";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { ThreadContextRecord } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { MessagesSquareIcon } from "lucide-react";

import { useProject, useThreadShell } from "~/state/entities";
import { ContextChip, ContextChipLabel } from "./ContextChip";
import { ProjectFavicon } from "./ProjectFavicon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

/**
 * Preserves a stored thread title when the live shell is unavailable and marks cross-machine input as unreadable.
 * @param props Stored thread reference/title, optional Markdown copy payload and unreadable state.
 * @returns A navigable context chip with a tooltip explaining whether its thread can be read.
 */
export function ThreadContextChip(props: {
  record: Pick<ThreadContextRecord, "environmentId" | "threadId" | "title">;
  copyMarkdown?: string;
  unreadable?: boolean;
}) {
  const { environmentId, threadId } = props.record;
  const shell = useThreadShell({ environmentId, threadId });
  const project = useProject(shell ? scopeProjectRef(environmentId, shell.projectId) : null);
  const title = shell?.title?.trim() || props.record.title;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <ContextChip
            kind="thread"
            {...(props.unreadable ? { state: "invalid" as const } : {})}
            render={<Link to="/$environmentId/$threadId" params={{ environmentId, threadId }} />}
            aria-label={t.app.thread.accessibleLabel(title)}
            data-markdown-copy={props.copyMarkdown}
            data-markdown-thread-chip="true"
            className="no-underline"
          >
            {project ? (
              <ProjectFavicon project={project} className="size-[1.17em] self-center" />
            ) : (
              <MessagesSquareIcon />
            )}
            <ContextChipLabel>{title}</ContextChipLabel>
          </ContextChip>
        }
      />
      <TooltipPopup side="top">
        {props.unreadable
          ? t.app.thread.unreadable
          : shell
            ? t.app.thread.open
            : t.app.thread.unavailable}
      </TooltipPopup>
    </Tooltip>
  );
}
