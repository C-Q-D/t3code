/** Shared inline and floating review form; PR-keyed drafts and submission claims live in the review store. */
import { t } from "~/i18n";
import { useAtomCommand } from "~/state/use-atom-command";
import type { EnvironmentId, PullRequestRef, PullRequestReviewVerdict } from "@t3tools/contracts";
import { CheckIcon, MessageSquareIcon, XCircleIcon } from "lucide-react";
import type { ReactNode, RefObject } from "react";

import { pullRequestEnvironment } from "~/state/pullRequests";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

import { Button } from "../ui/button";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { toastManager } from "../ui/toast";
import { readableFailure } from "./pullRequestDetail.logic";
import {
  pullRequestReviewKey,
  usePendingReviewComments,
  usePullRequestReviewStore,
} from "./pullRequestReviewStore";

const VERDICTS: ReadonlyArray<{
  readonly value: PullRequestReviewVerdict;
  readonly label: string;
  readonly sent: string;
  readonly icon: ReactNode;
}> = [
  {
    value: "approve",
    label: t.git.pullRequest.approve,
    sent: t.git.pullRequest.pullRequestApproved,
    icon: <CheckIcon className="size-3" />,
  },
  {
    value: "request-changes",
    label: t.git.pullRequest.requestChanges,
    sent: t.git.pullRequest.changesRequested,
    icon: <XCircleIcon className="size-3" />,
  },
  {
    value: "comment",
    label: t.git.diff.comment,
    sent: t.git.pullRequest.reviewSubmitted,
    icon: <MessageSquareIcon className="size-3" />,
  },
];

/**
 * Render the same review editor in a summary card or the existing composer popover.
 * @param props PR/environment identity, permitted verdicts, host summary requirement, focus ref,
 * and a success callback. Host failures retain the draft and report through the existing toast.
 * @returns A review card subscribed to the PR's shared body, verdict, line drafts, and request lock.
 */
export function PullRequestReviewForm({
  environmentId,
  reference,
  verdicts,
  requestChangesSummaryRequired,
  textareaRef,
  onSubmitted,
}: {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  verdicts: ReadonlyArray<PullRequestReviewVerdict>;
  requestChangesSummaryRequired: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onSubmitted: () => void;
}) {
  const comments = usePendingReviewComments(reference);
  const reviewKey = pullRequestReviewKey(reference);
  const body = usePullRequestReviewStore((store) => store.summaries[reviewKey] ?? "");
  const requestedVerdict = usePullRequestReviewStore(
    (store) => store.verdicts[reviewKey] ?? "comment",
  );
  const pending = usePullRequestReviewStore((store) => store.submitting[reviewKey] === true);
  const setVerdict = usePullRequestReviewStore((store) => store.setVerdict);
  const clearVerdict = usePullRequestReviewStore((store) => store.clearVerdict);
  const removeComments = usePullRequestReviewStore((store) => store.removeComments);
  const setSummary = usePullRequestReviewStore((store) => store.setSummary);
  const clearSummary = usePullRequestReviewStore((store) => store.clearSummary);
  const submitReview = useAtomCommand(pullRequestEnvironment.submitReview, {
    reportFailure: false,
  });

  const offered = VERDICTS.filter((verdict) => verdicts.includes(verdict.value));
  const selectedVerdict =
    offered.find((verdict) => verdict.value === requestedVerdict) ?? offered[0];

  /**
   * Submit one snapshot under the shared PR claim; the atom command retains its host I/O policy.
   * @param verdict Permitted selection and existing success message for the snapshot being sent.
   * @returns Completion after host settlement and feedback; failures leave the shared draft intact.
   */
  const submit = async (verdict: (typeof VERDICTS)[number]) => {
    // Both surfaces can retain a click callback from the same render; claim before any await.
    if (!usePullRequestReviewStore.getState().beginSubmission(reviewKey)) return;
    const submittedBody = body;
    const submittedComments = comments;
    const result = await submitReview({
      environmentId,
      input: {
        ...reference,
        verdict: verdict.value,
        body: submittedBody,
        comments: submittedComments,
      },
    });
    usePullRequestReviewStore.getState().endSubmission(reviewKey);
    if (result._tag === "Failure") {
      // The draft is kept: whatever went wrong, retyping the review is not the answer.
      toastManager.add({
        type: "error",
        title: t.git.pullRequest.theReviewCouldNotBeSubmitted,
        description: readableFailure(
          squashAtomCommandFailure(result),
          "The host refused the review. Your draft is still here to try again.",
        ),
      });
      return;
    }
    // Preserve comments and summary edits made during submission.
    removeComments(
      reviewKey,
      submittedComments.map((comment) => comment.id),
    );
    clearSummary(reviewKey, submittedBody);
    clearVerdict(reviewKey, verdict.value);
    toastManager.add({ type: "success", title: verdict.sent });
    onSubmitted();
  };

  /**
   * Keep host-specific empty-body rules: Forgejo requires a change-request summary even with lines.
   * @param verdict Permitted review type being considered.
   * @param summary Candidate text; an empty value determines whether the placeholder may say optional.
   * @returns Whether the current shared body and line comments meet the existing submission rule.
   */
  const canSubmit = (verdict: PullRequestReviewVerdict, summary: string) =>
    verdict === "request-changes" && requestChangesSummaryRequired
      ? summary.trim().length > 0
      : verdict === "approve" || summary.trim().length > 0 || comments.length > 0;
  const placeholder =
    selectedVerdict === undefined || canSubmit(selectedVerdict.value, "")
      ? t.git.pullRequest.summarizeReviewOptional
      : selectedVerdict.value === "request-changes" && requestChangesSummaryRequired
        ? t.git.pullRequest.summarizeYourReviewRequiredToRequestChanges
        : t.git.pullRequest.summarizeReviewOrAddLines;

  return (
    <div className="surface-glass flex min-w-0 flex-col gap-2.5 rounded-card-row p-3 shadow-pr-review-card">
      <div className="min-w-0 overflow-x-auto">
        <ToggleGroup
          aria-label={t.git.pullRequest.reviewVerdict}
          value={[selectedVerdict?.value ?? ""]}
          disabled={pending}
          onValueChange={(next) => {
            const verdict = offered.find((item) => item.value === next[0]);
            if (verdict) setVerdict(reviewKey, verdict.value);
          }}
        >
          {offered.map((verdict) => (
            <Toggle key={verdict.value} value={verdict.value}>
              {selectedVerdict?.value === verdict.value ? verdict.icon : null}
              {verdict.label}
            </Toggle>
          ))}
        </ToggleGroup>
      </div>
      {/* This editor surface owns the board's 56px minimum; shared Textarea has a taller shell. */}
      <textarea
        className="field-sizing-content min-h-14 max-h-64 w-full resize-y rounded-menu-row bg-input px-3 py-2 text-secondary-copy-large text-fg-detail shadow-well-pressed outline-none placeholder:text-placeholder focus-visible:inset-shadow-focus"
        ref={textareaRef}
        rows={2}
        value={body}
        placeholder={placeholder}
        aria-label={t.git.pullRequest.reviewSummary}
        onChange={(event) => setSummary(reviewKey, event.target.value)}
      />
      <div className="flex justify-end">
        <Button
          size="default"
          disabled={
            pending || selectedVerdict === undefined || !canSubmit(selectedVerdict.value, body)
          }
          onClick={() => {
            if (selectedVerdict !== undefined) void submit(selectedVerdict);
          }}
        >
          {pending
            ? t.git.pullRequest.submitting
            : (selectedVerdict?.label ?? t.git.pullRequest.submitReview)}
        </Button>
      </div>
    </div>
  );
}
