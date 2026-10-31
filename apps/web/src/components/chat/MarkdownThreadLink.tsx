/** Renders internal thread links using live titles without translating user content. */
import { t } from "~/i18n";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId } from "@t3tools/contracts";
import {
  formatThreadLink,
  guessThreadLinkRef,
  percentDecodedThreadLinkId,
  type ThreadLink,
  unknownThreadLinkLabel,
} from "@t3tools/shared/threadLinks";

import { useThreadRefs, useThreadShell } from "../../state/entities";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ThreadContextChip } from "../ThreadContextChip";

/** Keeps archived or cross-environment thread references navigable even when live metadata is absent.
 * @param props environmentId and threadId identify the written target; label is the fallback title.
 * @returns A navigable thread chip with resolved copy text and localized unavailable guidance. */
export function MarkdownThreadLink(props: {
  readonly environmentId: EnvironmentId;
  readonly link: ThreadLink;
  readonly label: string | null;
}) {
  const environmentId = props.link.environmentId ?? props.environmentId;
  const decodedId = percentDecodedThreadLinkId(props.link.threadId);
  const written = useThreadShell(scopeThreadRef(environmentId, props.link.threadId));
  const decoded = useThreadShell(
    written === null && decodedId !== null ? scopeThreadRef(environmentId, decodedId) : null,
  );
  const local = written ?? decoded;
  const guess = local === null && props.link.environmentId === null;
  const refs = useThreadRefs(guess);
  const remote = useThreadShell(guess ? guessThreadLinkRef(props.link, refs) : null);
  const thread = local ?? remote;
  const ref = {
    environmentId: thread?.environmentId ?? environmentId,
    threadId: thread?.id ?? props.link.threadId,
  };
  const title =
    thread?.title.trim() || props.label || unknownThreadLinkLabel(props.link, props.environmentId);
  const chip = (
    <ThreadContextChip record={{ ...ref, title }} copyMarkdown={formatThreadLink(ref, title)} />
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
