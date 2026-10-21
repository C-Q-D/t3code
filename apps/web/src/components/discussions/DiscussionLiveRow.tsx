/** Owns only the current seat thread subscription so stream deltas cannot rerender persisted rows. */
import type {
  DiscussionPersonaAvatar,
  EnvironmentId,
  ThreadId,
  RunId,
  Discussion,
} from "@t3tools/contracts";
import { shouldPreserveAssistantLineBreaks } from "@t3tools/shared/markdownPipeline";
import { Link } from "@tanstack/react-router";
import { TerminalIcon } from "lucide-react";
import { type CSSProperties } from "react";
import { t } from "~/i18n";
import { useThreadVisibleTurnItems } from "~/state/entities";
import ChatMarkdown from "../ChatMarkdown";
import { Badge } from "../ui/badge";
import { PixelSeat } from "./PixelSeat";
import { DiscussionFiles } from "./DiscussionFiles";
import { discussionLiveContent, discussionLiveStage } from "./discussionLive.logic";
import { discussionSeatColor } from "./discussionSeatColors";
import { PxWave } from "./PxWave";
/** A single dispatch identity with stable heading fields; the component unmounts once it is recorded. */
type DiscussionLiveRowProps = {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  runId: RunId;
  cwd: string | undefined;
  seatNumber: number;
  avatar: DiscussionPersonaAvatar;
  personaName: string;
  modelLabel: string;
  round: number;
  phase: Discussion["cursor"]["phase"];
  showWave: boolean;
};
/**
 * Reads this seat's visible projection and presents only the bound run in opening position.
 * @param props Frozen seat and dispatch identity, Markdown directory and shared catalog label.
 * @returns Streamed Markdown, a static end cursor, current file totals and optional running command.
 */
function DiscussionLiveRow(props: DiscussionLiveRowProps) {
  const items = useThreadVisibleTurnItems({
    environmentId: props.environmentId,
    threadId: props.threadId,
  });
  const output = discussionLiveContent(items, props.runId);
  const stage = discussionLiveStage(props.phase, props.round, t.discussions);
  const color = discussionSeatColor(props.seatNumber).color;
  return (
    <div
      className="flex items-start gap-3"
      style={{ "--discussion-seat-color": color } as CSSProperties}
    >
      <PixelSeat
        role={props.avatar}
        seatIndex={props.seatNumber - 1}
        size={32}
        state="speaking"
        label={props.personaName}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 items-center gap-2 text-secondary-copy text-secondary-label">
          <span
            className={`max-w-32 shrink-0 truncate text-body font-bold ${discussionSeatColor(props.seatNumber).textClassName}`}
          >
            {props.personaName}
          </span>
          {props.showWave ? <PxWave seatIndex={props.seatNumber - 1} /> : null}
          <span className="min-w-0 truncate">{props.modelLabel}</span>
          {stage.roundLabel ? (
            <span className="shrink-0 whitespace-nowrap">{stage.roundLabel}</span>
          ) : null}
          {stage.turnBadge ? <Badge variant="secondary">{stage.turnBadge}</Badge> : null}
          <Link
            to="/$environmentId/$threadId"
            params={{ environmentId: props.environmentId, threadId: props.threadId }}
            className="ml-auto shrink-0 rounded-sm underline underline-offset-3 outline-none hover:text-foreground focus-visible:inset-shadow-focus"
          >
            {t.discussions.page.viewProcess}
          </Link>
        </div>
        <div
          data-discussion-live=""
          className="flex min-w-0 -translate-y-0.5 flex-col gap-2 rounded-discussion-bubble bg-discussion-live px-3.5 py-3 shadow-discussion-live"
        >
          <ChatMarkdown
            className="text-body leading-discussion-record text-foreground"
            text={output.text}
            isStreaming={output.isStreaming}
            lineBreaks={shouldPreserveAssistantLineBreaks(output.text)}
            cwd={props.cwd}
            environmentId={props.environmentId}
            threadRef={{ environmentId: props.environmentId, threadId: props.threadId }}
          />
          <DiscussionFiles files={output.files} hideEmpty />
          {output.command ? (
            <div className="flex h-6 min-w-0 items-center gap-2 rounded-discussion-command bg-discussion-command px-2.5 text-secondary-copy text-secondary-label shadow-discussion-command">
              <TerminalIcon aria-hidden="true" className="size-3.25 shrink-0" />
              <span className="shrink-0">{t.discussions.page.runningCommand}</span>
              <span className="min-w-0 truncate font-mono text-foreground">{output.command}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
export const MemoizedDiscussionLiveRow = DiscussionLiveRow;
