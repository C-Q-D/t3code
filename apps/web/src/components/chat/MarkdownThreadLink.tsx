/** Renders internal thread links using live titles without translating user content. */
import { t } from "~/i18n";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import {
  formatThreadLink,
  percentDecodedThreadLinkId,
  resolveThreadLinkRef,
} from "@t3tools/shared/threadLinks";

import { useThreadRefs, useThreadShell } from "../../state/entities";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ThreadContextChip } from "../ThreadContextChip";

/** Keeps archived or cross-environment thread references navigable even when live metadata is absent.
 * @param props environmentId and threadId identify the written target; label is the fallback title.
 * @returns A navigable thread chip with resolved copy text and localized unavailable guidance. */
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
  const title = thread?.title.trim() || props.label;
  const chip = (
    <ThreadContextChip
      record={{ environmentId, threadId, title: props.label }}
      copyMarkdown={formatThreadLink(threadId, title)}
    />
  );
  if (thread !== null) return chip;
  // Archived threads can still open; missing index metadata is guidance, not a disabled link.
  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>{chip}</TooltipTrigger>
      <TooltipPopup side="top">{t.chat.newComponents.threadUnavailable}</TooltipPopup>
    </Tooltip>
  );
}
