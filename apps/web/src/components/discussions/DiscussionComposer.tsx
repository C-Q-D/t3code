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
import { cn } from "~/lib/utils";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { toastManager } from "../ui/toast";
import { Button } from "../ui/button";
import { DiscussionAlert } from "./DiscussionAlert";
import {
  discussionComposerView,
  discussionEnterSends,
  discussionInterjectionText,
} from "./discussionComposer.logic";

/**
 * Submits user material without starting or interrupting a seat's provider turn.
 * @param props.discussion Live snapshot determines the next reader and closing availability.
 * @param props.environmentId Destination for guarded, discussion-scoped commands.
 * @returns One growing table-side draft; responsive layout moves it without remounting, and ended discussions hide it.
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
    <div className="mx-auto w-full max-w-170 shrink-0">
      <div className="flex flex-col gap-2.5">
        <DiscussionAlert discussion={discussion} environmentId={environmentId} />
        <div
          className={cn(
            "surface-glass rounded-card-large pt-3 pr-2.5 pb-2.5 pl-4 shadow-raise-l focus-within:inset-shadow-focus",
            view.disabled && "discussion-composer-disabled",
          )}
        >
          <div className="mb-1.5">
            <textarea
              aria-label={t.discussions.page.interjection}
              placeholder={view.placeholder}
              value={text}
              disabled={view.disabled}
              readOnly={pending}
              rows={1}
              className="field-sizing-content block max-h-52 min-h-11 w-full resize-none overflow-y-auto bg-transparent text-body leading-discussion-composer text-foreground text-shadow-none outline-none placeholder:text-placeholder disabled:cursor-not-allowed disabled:placeholder:text-fg-disabled"
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
          <div className="flex justify-end">
            <Button
              variant="default"
              size="icon-toolbar"
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
