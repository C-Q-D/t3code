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
import { memo, useMemo, type CSSProperties } from "react";
import { t } from "~/i18n";
import { useThreadVisibleTurnItems } from "~/state/entities";
import ChatMarkdown from "../ChatMarkdown";
import { Badge } from "../ui/badge";
import { PixelAvatar } from "./PixelAvatar";
import { DiscussionFiles } from "./DiscussionFiles";
import { discussionLiveContent, discussionLiveStage } from "./discussionLive.logic";
import { discussionSeatColor } from "./discussionSeatColors";
import "./DiscussionLiveRow.css";
import { DiscussionWave } from "./DiscussionWave";
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
  const output = useMemo(() => discussionLiveContent(items, props.runId), [items, props.runId]);
  const stage = discussionLiveStage(props.phase, props.round, t.discussions);
  const color = discussionSeatColor(props.seatNumber).color;
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3.5">
      <div className="pt-3">
        <PixelAvatar role={props.avatar} seat={props.seatNumber} size={28} state="speaking" />
      </div>
      <div
        data-discussion-live=""
        className="flex min-w-0 flex-col gap-2.5 rounded-xl border px-3.5 pt-3 pb-3.5"
        style={
          {
            "--discussion-seat-color": color,
            "--discussion-seat-fg-light": color.replace("-500", "-600"),
            "--discussion-seat-fg-dark": color.replace("-500", "-400"),
          } as CSSProperties
        }
      >
        <div className="flex min-h-7 items-center gap-2 text-sm">
          <span className="max-w-32 shrink-0 truncate font-medium">{props.personaName}</span>
          {props.showWave ? <DiscussionWave seat={props.seatNumber} /> : null}
          <span className="min-w-0 truncate text-xs text-muted-foreground">{props.modelLabel}</span>
          {stage.roundLabel ? (
            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
              {stage.roundLabel}
            </span>
          ) : null}
          {stage.turnBadge ? <Badge variant="secondary">{stage.turnBadge}</Badge> : null}
          <Link
            to="/$environmentId/$threadId"
            params={{ environmentId: props.environmentId, threadId: props.threadId }}
            className="ml-auto shrink-0 rounded-sm text-xs text-muted-foreground underline decoration-muted-foreground/50 underline-offset-3 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            {t.discussions.page.viewProcess}
          </Link>
        </div>
        <ChatMarkdown
          text={output.text}
          isStreaming={output.isStreaming}
          lineBreaks={shouldPreserveAssistantLineBreaks(output.text)}
          cwd={props.cwd}
          environmentId={props.environmentId}
          threadRef={{ environmentId: props.environmentId, threadId: props.threadId }}
        />
        <DiscussionFiles files={output.files} hideEmpty />
        {output.command ? (
          <div className="flex min-w-0">
            <span className="inline-flex h-6 min-w-0 max-w-full items-center gap-1.5 rounded-md bg-foreground/5 px-2 text-xs text-muted-foreground">
              <TerminalIcon aria-hidden="true" className="size-3 shrink-0" />
              <span className="min-w-0 truncate">
                {t.discussions.page.runningCommand}{" "}
                <span className="font-mono text-foreground">{output.command}</span>
              </span>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
export const MemoizedDiscussionLiveRow = memo(DiscussionLiveRow);
