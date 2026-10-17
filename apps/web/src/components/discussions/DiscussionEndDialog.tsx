/** Owns per-opening summary choices; the page owns commands and the shared header submission lock. */
import { useAtomValue } from "@effect/atom-react";
import type { Discussion, EnvironmentId, DiscussionEndInput } from "@t3tools/contracts";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { ChevronsUpDownIcon, LoaderCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "~/i18n";
import { cn } from "~/lib/utils";
import { serverEnvironment } from "~/state/server";
import { useEnvironmentQuery } from "~/state/query";
import { useEnvironmentSettings } from "~/hooks/useSettings";
import { applyProviderInstanceSettings, deriveProviderInstanceEntries } from "~/providerInstances";
import { getCustomModelOptionsByInstance } from "~/modelSelection";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { RadioGroup } from "../ui/radio-group";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { Button } from "../ui/button";
import { PixelSeat } from "./PixelSeat";
import { PxWave } from "./PxWave";
import { discussionModelLabel } from "./discussionModelLabel";
import {
  DEFAULT_SUMMARY_PROMPT,
  discussionSummarizers,
  discussionSummaryChoices,
  discussionEndNotice,
  discussionEndInput,
  discussionEndShouldClose,
} from "./discussionEnd.logic";

/**
 * Renders H4 choices while preserving the existing submission and lifecycle gates.
 * @param props.discussion Current snapshot; seats retain their physical color positions.
 * @param props.environmentId Environment supplying provider labels and summary templates.
 * @param props.pending Locks selection, submission and dismissal during the page command.
 * @param props.ending Keeps this dialog open until its own end command settles.
 * @param props.permitted Current end-command permission, enforced by discussionEndInput.
 * @param props.onClose Page-owned dismissal, also used when the discussion ends elsewhere.
 * @param props.onSubmit Page-owned async command; it reports failures and retains choices.
 * @returns Controlled modal; no provider commands or retries are owned here.
 */
export function DiscussionEndDialog({
  discussion,
  environmentId,
  pending,
  ending,
  permitted,
  onClose,
  onSubmit,
}: {
  discussion: Discussion;
  environmentId: EnvironmentId;
  pending: boolean;
  ending: boolean;
  permitted: boolean;
  onClose: () => void;
  onSubmit: (input: DiscussionEndInput) => Promise<void>;
}) {
  const seats = discussionSummarizers(discussion);
  const [seatId, setSeatId] = useState<string | null>(seats.selected);
  const [promptId, setPromptId] = useState(DEFAULT_SUMMARY_PROMPT);
  const query = useEnvironmentQuery(
    serverEnvironment.discussionPromptsLive({ environmentId, input: {} }),
  );
  const summary = discussionSummaryChoices(
    query.data?.prompts ?? null,
    query.error !== null,
    promptId,
    t.discussions,
  );
  const notice = discussionEndNotice(discussion, t.discussions);
  const input = discussionEndInput(discussion, seatId, summary.selected, pending, permitted);
  const providers = useAtomValue(serverEnvironment.providersValueAtom(environmentId)) ?? [];
  const settings = useEnvironmentSettings(environmentId);
  const instances = applyProviderInstanceSettings(
    deriveProviderInstanceEntries(providers),
    settings,
    discussion.projectId,
  );
  useEffect(() => {
    if (discussionEndShouldClose(discussion, ending)) onClose();
  }, [discussion, ending, onClose]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogPopup size="wide" showCloseButton={false} bottomStickOnMobile={false}>
        <div className="flex flex-col min-h-0 overflow-y-auto gap-4.5 p-6">
          <DialogTitle size="lg">{t.discussions.page.end}</DialogTitle>
          <div className="flex flex-col gap-2">
            <span
              className="text-secondary-copy-large font-semibold text-code-foreground"
              id="discussion-summarizer-label"
            >
              {t.discussions.page.summarizerLabel}
            </span>
            <div className="rounded-notice bg-well-raised p-1 shadow-discussion-summary-well">
              <RadioGroup
                value={seatId}
                onValueChange={(value) => setSeatId(typeof value === "string" ? value : null)}
                disabled={pending}
                aria-labelledby="discussion-summarizer-label"
              >
                <div className="flex flex-col gap-0.5">
                  {seats.options.map((seat, index) => {
                    const instance = instances.find(
                      (p) => p.instanceId === seat.modelSelection.instanceId,
                    );
                    const model = getCustomModelOptionsByInstance(
                      settings,
                      providers,
                      seat.modelSelection.instanceId,
                      seat.modelSelection.model,
                    )
                      .get(seat.modelSelection.instanceId)
                      ?.find((p) => p.slug === seat.modelSelection.model);
                    return (
                      <label
                        key={seat.id}
                        className={cn(
                          "flex h-11.5 cursor-pointer items-center gap-2.5 rounded-toolbar-icon pr-3 pl-2.5 text-body hover:bg-popover",
                          seatId === seat.id &&
                            "bg-accent shadow-discussion-summary-row hover:bg-accent",
                        )}
                      >
                        <RadioPrimitive.Root
                          value={seat.id}
                          className="inline-flex size-4.5 shrink-0 items-center justify-center rounded-full bg-input shadow-discussion-summary-radio outline-none data-checked:bg-primary data-checked:shadow-primary-edge focus-visible:inset-shadow-focus disabled:cursor-default"
                        >
                          <RadioPrimitive.Indicator className="size-1.75 rounded-full bg-primary-foreground" />
                        </RadioPrimitive.Root>
                        <PixelSeat
                          role={seat.avatar}
                          seatIndex={index}
                          state="idle"
                          size={26}
                          label={seat.personaName}
                        />
                        <span className="min-w-0 flex-1 truncate font-semibold">
                          {seat.personaName}
                        </span>
                        <span className="max-w-40 truncate text-secondary-copy text-secondary-label">
                          {discussionModelLabel(seat.modelSelection, instance, model)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </RadioGroup>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span
              className="text-secondary-copy-large font-semibold text-code-foreground"
              id="discussion-summary-label"
            >
              {t.discussions.page.summaryTemplate}
            </span>
            <Select
              items={summary.options.map((p) => ({ value: p.id, label: p.label }))}
              value={summary.selected}
              onValueChange={(value) => {
                if (value) setPromptId(value);
              }}
              disabled={pending || summary.disabled}
            >
              <SelectTrigger
                size="dialog"
                variant="dialog"
                icon={<ChevronsUpDownIcon aria-hidden />}
                aria-labelledby="discussion-summary-label"
              >
                <SelectValue>
                  {summary.message ??
                    summary.options.find((p) => p.id === summary.selected)?.label ??
                    t.discussions.page.summaryTemplate}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {summary.options.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
          {notice ? (
            <p className="flex items-center gap-2 text-secondary-copy text-secondary-label">
              <PxWave seatIndex={discussion.cursor.seatIndex} state="idle" />
              {notice}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="dialog-secondary"
              size="dialog-cancel"
              disabled={pending}
              onClick={onClose}
            >
              {t.discussions.page.cancel}
            </Button>
            <Button
              size="dialog-action"
              variant="dialog-primary"
              disabled={!input}
              onClick={() => {
                if (input) void onSubmit(input);
              }}
            >
              {pending ? <LoaderCircleIcon aria-hidden /> : null}
              {t.discussions.page.endSubmit}
            </Button>
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
