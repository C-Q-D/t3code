/** Edits saved discussion seats in a fixed environment without starting provider sessions. */
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useAtomValue } from "@effect/atom-react";
import type { DiscussionTemplate, EnvironmentId } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useId, useRef, useState } from "react";
import { t } from "~/i18n";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import {
  canSaveDiscussionTemplate,
  initialDiscussionTemplateDraft,
} from "../settings/discussionSettings.logic";
import { Button } from "../ui/button";
import { Dialog, DialogBackdrop, DialogClose, DialogPortal, DialogViewport } from "../ui/dialog";
import { Input } from "../ui/input";
import { toastManager } from "../ui/toast";
import { DiscussionSeats } from "./DiscussionSeats";
import type { DiscussionDraftSeat } from "./discussionSeats.logic";

/**
 * Mounts an open editor; the owner unmounts it on close and remounts for a different draft.
 * @param props.environmentId Fixed destination for catalogs, permission and the write.
 * @param props.template Saved snapshot for editing; omitted/null creates a template.
 * @param props.initialSeats Optional creation prefill; ignored when editing a saved template. All entries share L3.
 * @param props.onClose Called after cancellation or a successful write; remove the component here.
 * @returns A 760px template form. Failed writes retain the draft and are never automatically retried.
 */
export function DiscussionTemplateEditor({
  environmentId,
  template = null,
  initialSeats,
  onClose,
}: {
  readonly environmentId: EnvironmentId;
  readonly template?: DiscussionTemplate | null;
  readonly initialSeats?: readonly DiscussionDraftSeat[];
  readonly onClose: () => void;
}) {
  const fieldId = useId();
  const [draft, setDraft] = useState<{
    name: string;
    seats: readonly DiscussionDraftSeat[];
    summaryPromptId: DiscussionTemplate["summaryPromptId"];
  }>(() => initialDiscussionTemplateDraft(template, initialSeats));
  const [saving, setSaving] = useState(false);
  const submissionPending = useRef(false);
  const support = useEnvironmentQuery(
    serverEnvironment.discussionProviderSupport({ environmentId, input: {} }),
  );
  const canWrite = useAtomValue(
    serverEnvironment.upsertDiscussionTemplate.permissionAtom(environmentId),
  );
  const upsert = useAtomCommand(serverEnvironment.upsertDiscussionTemplate);
  const saveEnabled = canSaveDiscussionTemplate(draft, support.data ?? null, canWrite, saving);
  const save = async () => {
    if (!saveEnabled || submissionPending.current) return;
    // Lock before React renders; a successful create stays locked until unmount.
    // No editor-local timeout: writes follow the command/connection lifecycle.
    // Unknown write outcomes are not automatically retried here.
    submissionPending.current = true;
    setSaving(true);
    const result = await upsert({
      environmentId,
      input: {
        ...(template ? { id: template.id } : {}),
        name: draft.name.trim(),
        seats: draft.seats,
        summaryPromptId: draft.summaryPromptId,
      },
    });
    setSaving(false);
    if (result._tag === "Failure") {
      submissionPending.current = false;
      if (!isAtomCommandInterrupted(result))
        toastManager.add({
          type: "error",
          data: { appearance: "error-stripe" },
          title: t.settings.discussions.saveError,
          description: String(squashAtomCommandFailure(result)),
        });
      return;
    }
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submissionPending.current) onClose();
      }}
    >
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport>
          {/* L3's 760px seat row needs its feature shell; all entry points share it. */}
          <DialogPrimitive.Popup
            aria-describedby={`${fieldId}-hint`}
            className="discussion-template-draft dialog-glass relative row-start-2 flex max-h-full w-full max-w-190 flex-col overflow-hidden rounded-dialog text-foreground outline-none"
            render={
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
              />
            }
          >
            <div className="overflow-y-auto p-6 pb-4">
              <fieldset disabled={saving} className="flex min-w-0 flex-col gap-4">
                <DialogPrimitive.Title className="font-serif text-discussion-template-heading font-bold">
                  {template
                    ? t.settings.discussions.editTemplate
                    : t.settings.discussions.newTemplate}
                </DialogPrimitive.Title>
                <div className="space-y-1.5">
                  <label
                    htmlFor={`${fieldId}-name`}
                    className="block text-secondary-copy-large font-semibold text-code-foreground"
                  >
                    {t.settings.discussions.name}
                  </label>
                  <Input
                    id={`${fieldId}-name`}
                    size="default"
                    value={draft.name}
                    autoFocus
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </div>
                <DiscussionSeats
                  projectId={null}
                  environmentId={environmentId}
                  seats={draft.seats}
                  onChange={(seats) => setDraft((current) => ({ ...current, seats }))}
                />
              </fieldset>
            </div>
            <div className="flex shrink-0 items-center gap-2 px-6 pt-0.5 pb-6">
              <p
                id={`${fieldId}-hint`}
                className="min-w-0 flex-1 text-secondary-copy text-secondary-label"
              >
                {t.settings.discussions.futureOnly}
              </p>
              <DialogClose
                disabled={saving}
                render={<Button type="button" variant="dialog-secondary" size="dialog-action" />}
              >
                {t.common.confirm.cancel}
              </DialogClose>
              <Button type="submit" size="dialog-action-wide" disabled={!saveEnabled}>
                {t.settings.discussions.save}
              </Button>
            </div>
          </DialogPrimitive.Popup>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}
