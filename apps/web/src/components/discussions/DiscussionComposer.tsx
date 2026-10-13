/** Owns the interjection draft independently of the discussion header's lifecycle commands. */
import { useAtomValue } from "@effect/atom-react";
import type { Discussion, EnvironmentId } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { ArrowUpIcon } from "lucide-react";
import { useRef, useState } from "react";
import { t } from "~/i18n";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import {
  discussionComposerView,
  discussionEnterSends,
  discussionInterjectionText,
} from "./discussionComposer.logic";

/**
 * Submits user material without starting or interrupting a seat's provider turn.
 * @param props.discussion Live snapshot determines the next reader and closing availability.
 * @param props.environmentId Destination for guarded, discussion-scoped commands.
 * @returns Aligned, growing input; ended discussions have no composer.
 */
export function DiscussionComposer({
  discussion,
  environmentId,
}: {
  discussion: Discussion;
  environmentId: EnvironmentId;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const submissionPending = useRef(false);
  const interject = useAtomCommand(serverEnvironment.interjectDiscussion);
  const permitted = useAtomValue(
    serverEnvironment.interjectDiscussion.permissionAtom(environmentId),
  );
  const view = discussionComposerView(discussion, t.discussions);
  const sendable = discussionInterjectionText(text, view, pending, permitted);
  const send = async () => {
    const submitted = discussionInterjectionText(text, view, submissionPending.current, permitted);
    if (submitted === null) return;
    // Lock before React renders so rapid Enter/click events cannot enqueue duplicate material.
    submissionPending.current = true;
    setPending(true);
    const result = await interject({
      environmentId,
      input: { discussionId: discussion.id, text: submitted },
    });
    if (result._tag === "Success") setText("");
    else if (!isAtomCommandInterrupted(result))
      toastManager.add({
        type: "error",
        title: t.discussions.page.interjectFailed,
        description: String(squashAtomCommandFailure(result)),
      });
    submissionPending.current = false;
    setPending(false);
  };
  if (!view) return null;
  return (
    <div className="shrink-0 px-6 pb-4">
      <div className="mx-auto flex w-full max-w-192 flex-col gap-2 pl-10.5">
        <div
          className={`rounded-3xl border shadow-sm focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring dark:shadow-none ${view.disabled ? "bg-muted/30" : "bg-card"}`}
        >
          <div className="px-5 pt-3.5 pb-1">
            <textarea
              aria-label={t.discussions.page.interjection}
              placeholder={view.placeholder}
              value={text}
              disabled={view.disabled}
              readOnly={pending}
              rows={1}
              className="field-sizing-content block max-h-52 min-h-5.5 w-full resize-none overflow-y-auto bg-transparent text-sm leading-5.5 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (
                  !discussionEnterSends({
                    key: event.key,
                    shiftKey: event.shiftKey,
                    isComposing: event.nativeEvent.isComposing,
                    keyCode: event.nativeEvent.keyCode,
                  })
                )
                  return;
                event.preventDefault();
                void send();
              }}
            />
          </div>
          <div className="flex justify-end px-2.5 pt-1 pb-2.5">
            <Button
              variant={view.disabled ? "secondary" : "default"}
              size="icon"
              disabled={sendable === null}
              aria-label={t.discussions.page.sendInterjection}
              onClick={() => void send()}
            >
              <ArrowUpIcon />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
