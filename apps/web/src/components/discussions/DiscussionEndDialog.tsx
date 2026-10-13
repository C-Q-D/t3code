/** Owns per-opening summary choices; the page owns commands and the shared header submission lock. */
import { useAtomValue } from "@effect/atom-react";
import type { Discussion, EnvironmentId, DiscussionEndInput } from "@t3tools/contracts";
import { useEffect, useState } from "react";
import { t } from "~/i18n";
import { serverEnvironment } from "~/state/server";
import { useEnvironmentQuery } from "~/state/query";
import { useEnvironmentSettings } from "~/hooks/useSettings";
import { applyProviderInstanceSettings, deriveProviderInstanceEntries } from "~/providerInstances";
import { getCustomModelOptionsByInstance } from "~/modelSelection";
import { Dialog, DialogPopup, DialogTitle, DialogFooter } from "../ui/dialog";
import { RadioGroup, Radio } from "../ui/radio-group";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { Button } from "../ui/button";
import { PixelAvatar } from "./PixelAvatar";
import { discussionModelLabel } from "./discussionModelLabel";
import {
  DEFAULT_SUMMARY_PROMPT,
  discussionSummarizers,
  discussionSummaryChoices,
  discussionEndNotice,
  discussionEndInput,
  discussionEndShouldClose,
} from "./discussionEnd.logic";

/** Renders controlled end choices, preserving them after failed submission and resetting on each mount/open. */
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
      <DialogPopup className="w-110" showCloseButton={false} bottomStickOnMobile={false}>
        <div className="flex flex-col gap-4.5 p-5">
          <DialogTitle>{t.discussions.page.end}</DialogTitle>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium" id="discussion-summarizer-label">
              {t.discussions.page.summarizerLabel}
            </span>
            <div className="overflow-hidden rounded-lg border">
              <RadioGroup
                value={seatId}
                onValueChange={(value) => setSeatId(typeof value === "string" ? value : null)}
                disabled={pending}
                aria-labelledby="discussion-summarizer-label"
              >
                <div>
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
                        className={`flex cursor-pointer items-center gap-2.5 border-b px-3 py-2.5 text-sm last:border-b-0 hover:bg-accent ${seatId === seat.id ? "bg-accent" : ""}`}
                      >
                        <Radio value={seat.id} />
                        <PixelAvatar role={seat.avatar} seat={index + 1} size={26} />
                        <span className="font-medium">{seat.personaName}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
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
            <span className="text-sm font-medium" id="discussion-summary-label">
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
              <SelectTrigger size="lg" aria-labelledby="discussion-summary-label">
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
          {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            {t.discussions.page.cancel}
          </Button>
          <Button
            disabled={!input}
            onClick={() => {
              if (input) void onSubmit(input);
            }}
          >
            {t.discussions.page.endSubmit}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
