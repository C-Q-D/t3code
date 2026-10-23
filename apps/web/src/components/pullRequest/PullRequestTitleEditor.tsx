/** Edits a plain-text PR title; host writes remain in the atom command. */
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, PullRequestDetail, PullRequestRef } from "@t3tools/contracts";
import { useState } from "react";

import { pullRequestEnvironment } from "~/state/pullRequests";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { PullRequestDetailTitleRow } from "./PullRequestDetailLayout";
import { PencilIcon } from "lucide-react";
import { t } from "~/i18n";
import { readableFailure } from "./pullRequestDetail.logic";
import { canEditPullRequestChangeRequest } from "./pullRequestEditing.logic";

/** The pull request title, which the reader can rename in place when the host allows it. */
export function PullRequestTitleEditor({
  environmentId,
  reference,
  pullRequestKey,
  detail,
  canWriteSourceControl,
  onSaved,
}: {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  pullRequestKey: string;
  detail: PullRequestDetail;
  canWriteSourceControl: boolean;
  onSaved: () => void;
}) {
  const update = useAtomCommand(pullRequestEnvironment.update, { reportFailure: false });
  const [titleScope, setTitleScope] = useState<{
    readonly pullRequestKey: string;
    readonly text: string;
  } | null>(null);
  const titleDraft = titleScope?.pullRequestKey === pullRequestKey ? titleScope.text : null;
  const [titleSaving, setTitleSaving] = useState(false);

  const saveTitle = async (next: string) => {
    const title = next.trim();
    if (!canWriteSourceControl || titleSaving) return;
    if (title.length === 0 || title === detail.title) {
      setTitleScope(null);
      return;
    }
    setTitleSaving(true);
    const result = await update({ environmentId, input: { ...reference, title } });
    setTitleSaving(false);
    if (result._tag === "Failure") {
      toastManager.add({
        type: "error",
        title: t.git.pullRequest.theTitleCouldNotBeSaved,
        description: readableFailure(
          squashAtomCommandFailure(result),
          t.git.pullRequest.theHostRefusedTheNewTitle,
        ),
      });
      return;
    }
    setTitleScope(null);
    onSaved();
  };

  return titleDraft === null ? (
    <PullRequestDetailTitleRow className="group gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <h1 className="min-w-0 truncate font-serif text-pr-detail-title font-bold">
              {detail.title}
            </h1>
          }
        />
        <TooltipPopup side="top">{detail.title}</TooltipPopup>
      </Tooltip>
      {canEditPullRequestChangeRequest(detail) ? (
        <Button
          size="icon-xs"
          variant="ghost-muted"
          aria-label={t.git.pullRequest.editTitle}
          onClick={() => setTitleScope({ pullRequestKey, text: detail.title })}
        >
          <PencilIcon aria-hidden className="size-3.5" />
        </Button>
      ) : null}
    </PullRequestDetailTitleRow>
  ) : (
    // A title is one line of text, not markdown, so it takes an input rather than
    // the editor the description and the remarks share.
    <div className="space-y-2">
      <Input
        autoFocus
        size="sm"
        disabled={titleSaving}
        value={titleDraft}
        aria-label={t.git.pullRequest.pullRequestTitle}
        onChange={(event) => setTitleScope({ pullRequestKey, text: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void saveTitle(titleDraft);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setTitleScope(null);
          }
        }}
      />
      <div className="flex justify-end gap-2">
        <Button
          size="xs"
          variant="ghost"
          disabled={titleSaving}
          onClick={() => setTitleScope(null)}
        >
          {t.common.confirm.cancel}
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={!canWriteSourceControl || titleSaving || titleDraft.trim().length === 0}
          onClick={() => void saveTitle(titleDraft)}
        >
          {titleSaving ? t.git.pullRequest.saving : t.git.pullRequest.save}
        </Button>
      </div>
    </div>
  );
}
