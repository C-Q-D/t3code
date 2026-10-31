/**
 * A review being written, held until it is sent.
 *
 * Nothing here reaches the host: a review is one request carrying every line comment and the
 * verdict together, so a half-written one is invisible to everyone else — including on the
 * hosts that have no pending review of their own. That also means a draft lives only as long
 * as the tab does, which is why this is deliberately not persisted.
 */
import type {
  PullRequestRef,
  PullRequestReviewCommentDraft,
  PullRequestReviewVerdict,
} from "@t3tools/contracts";
import { create } from "zustand";

export type PendingReviewComment = PullRequestReviewCommentDraft & { readonly id: string };

// Content-derived ids can collide across comments; use a counter.
let pendingCommentSequence = 0;

export function nextPendingReviewCommentId(): string {
  pendingCommentSequence += 1;
  return `pending-review-comment-${pendingCommentSequence}`;
}

export function pullRequestReviewKey(reference: PullRequestRef): string {
  return JSON.stringify([
    reference.projectId,
    reference.host?.toLowerCase() ?? null,
    reference.repository.toLowerCase(),
    reference.number,
  ]);
}

/** PR-keyed draft and submission state shared by the summary and floating review surfaces. */
interface PullRequestReviewStoreState {
  readonly drafts: Readonly<Record<string, ReadonlyArray<PendingReviewComment>>>;
  readonly summaries: Readonly<Record<string, string>>;
  readonly verdicts: Readonly<Record<string, PullRequestReviewVerdict>>;
  readonly submitting: Readonly<Record<string, boolean>>;
  readonly addComment: (key: string, comment: PendingReviewComment) => void;
  readonly removeComment: (key: string, commentId: string) => void;
  readonly removeComments: (key: string, commentIds: ReadonlyArray<string>) => void;
  readonly clear: (key: string) => void;
  readonly setSummary: (key: string, body: string) => void;
  readonly clearSummary: (key: string, submittedBody: string) => void;
  /** Set this PR's verdict; absent entries use the existing comment default. */
  readonly setVerdict: (key: string, verdict: PullRequestReviewVerdict) => void;
  /** Clear only the submitted verdict, preserving any later selection for this PR. */
  readonly clearVerdict: (key: string, submittedVerdict: PullRequestReviewVerdict) => void;
  /** Claim this PR synchronously; false means another surface already has a request in flight. */
  readonly beginSubmission: (key: string) => boolean;
  /** Release the PR's claim after the host accepts or rejects its request. */
  readonly endSubmission: (key: string) => void;
}

const EMPTY: ReadonlyArray<PendingReviewComment> = [];

export const usePullRequestReviewStore = create<PullRequestReviewStoreState>()((set) => ({
  drafts: {},
  summaries: {},
  verdicts: {},
  submitting: {},
  setVerdict: (key, verdict) =>
    set((state) => ({ verdicts: { ...state.verdicts, [key]: verdict } })),
  clearVerdict: (key, submittedVerdict) =>
    set((state) => {
      if (state.verdicts[key] !== submittedVerdict) return state;
      const { [key]: _removed, ...rest } = state.verdicts;
      return { verdicts: rest };
    }),
  beginSubmission: (key) => {
    let claimed = false;
    set((state) => {
      if (state.submitting[key]) return state;
      claimed = true;
      return { submitting: { ...state.submitting, [key]: true } };
    });
    return claimed;
  },
  endSubmission: (key) =>
    set((state) => {
      const { [key]: _removed, ...rest } = state.submitting;
      return { submitting: rest };
    }),
  addComment: (key, comment) =>
    set((state) => ({
      drafts: { ...state.drafts, [key]: [...(state.drafts[key] ?? EMPTY), comment] },
    })),
  removeComment: (key, commentId) =>
    set((state) => {
      const remaining = (state.drafts[key] ?? EMPTY).filter((entry) => entry.id !== commentId);
      if (remaining.length > 0) return { drafts: { ...state.drafts, [key]: remaining } };
      const { [key]: _removed, ...rest } = state.drafts;
      return { drafts: rest };
    }),
  removeComments: (key, commentIds) =>
    set((state) => {
      const submitted = new Set(commentIds);
      const remaining = (state.drafts[key] ?? EMPTY).filter((entry) => !submitted.has(entry.id));
      if (remaining.length > 0) return { drafts: { ...state.drafts, [key]: remaining } };
      const { [key]: _removed, ...rest } = state.drafts;
      return { drafts: rest };
    }),
  clear: (key) =>
    set((state) => {
      const { [key]: _removed, ...rest } = state.drafts;
      return { drafts: rest };
    }),
  setSummary: (key, body) => set((state) => ({ summaries: { ...state.summaries, [key]: body } })),
  clearSummary: (key, submittedBody) =>
    set((state) => {
      // Keep summary edits made during submission; the textarea stays editable.
      if (state.summaries[key] !== submittedBody) return state;
      const { [key]: _removed, ...rest } = state.summaries;
      return { summaries: rest };
    }),
}));

export function usePendingReviewComments(
  reference: PullRequestRef,
): ReadonlyArray<PendingReviewComment> {
  return usePullRequestReviewStore(
    (store) => store.drafts[pullRequestReviewKey(reference)] ?? EMPTY,
  );
}
