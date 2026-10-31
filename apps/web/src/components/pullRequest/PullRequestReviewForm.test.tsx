/** Exercise two real review forms against the same draft store and the host submission boundary. */
import { EnvironmentId, ProjectId, type PullRequestReviewVerdict } from "@t3tools/contracts";
import { Cause } from "effect";
import { act } from "react";
import { create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const { submitReview, notify } = vi.hoisted(() => ({ submitReview: vi.fn(), notify: vi.fn() }));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => submitReview }));
vi.mock("~/state/pullRequests", () => ({ pullRequestEnvironment: { submitReview: {} } }));
vi.mock("../ui/toast", () => ({ toastManager: { add: notify } }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/toggle-group", () => ({ ToggleGroup: "div", Toggle: "button" }));

import { PullRequestReviewForm } from "./PullRequestReviewForm";
import { pullRequestReviewKey, usePullRequestReviewStore } from "./pullRequestReviewStore";

const reference = { projectId: ProjectId.make("project"), repository: "owner/repo", number: 7 };
const environmentId = EnvironmentId.make("environment");
const key = pullRequestReviewKey(reference);
const verdicts: PullRequestReviewVerdict[] = ["comment", "approve", "request-changes"];
let renderer: ReactTestRenderer;
const submitted = vi.fn();

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  usePullRequestReviewStore.setState(usePullRequestReviewStore.getInitialState(), true);
  submitReview.mockReset().mockResolvedValue({ _tag: "Success" });
  submitted.mockReset();
  notify.mockReset();
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  vi.unstubAllGlobals();
});

/** Mount both surfaces with real store subscriptions; only host I/O and UI primitives are mocked. */
async function mount(required = false, offered = verdicts) {
  await act(() => {
    renderer = create(
      <>
        {["inline", "floating"].map((surface) => (
          <section key={surface} aria-label={surface}>
            <PullRequestReviewForm
              environmentId={environmentId}
              reference={reference}
              verdicts={offered}
              requestChangesSummaryRequired={required}
              textareaRef={{ current: null }}
              onSubmitted={submitted}
            />
          </section>
        ))}
      </>,
    );
  });
}

/** Return one named user surface so assertions cannot accidentally read only the edited form. */
function surface(name: "inline" | "floating") {
  return renderer.root.findByProps({ "aria-label": name });
}

/** Enter review text through the rendered editor, never through a store setter. */
async function write(target: ReactTestInstance, body: string) {
  await act(() => target.findByType("textarea").props.onChange({ target: { value: body } }));
}

/** Change the verdict through the segmented control's public value-change contract. */
async function choose(target: ReactTestInstance, verdict: PullRequestReviewVerdict) {
  const control = target.find(
    (node) => typeof node.type === "string" && typeof node.props.onValueChange === "function",
  );
  await act(() => control.props.onValueChange([verdict]));
}

/** Find the submit control by its user-facing text, excluding the verdict choice with the same text. */
function submitButton(target: ReactTestInstance, label: string) {
  return target
    .findAllByType("button")
    .find((button) => button.props.value === undefined && button.children.includes(label))!;
}

it("shares summary and verdict in both directions between inline and floating forms", async () => {
  await mount();
  await write(surface("inline"), "Review from summary");
  await choose(surface("inline"), "approve");
  expect(surface("floating").findByType("textarea").props.value).toBe("Review from summary");
  expect(submitButton(surface("floating"), "Approve")).toBeDefined();

  await write(surface("floating"), "Revised from code");
  await choose(surface("floating"), "request-changes");
  expect(surface("inline").findByType("textarea").props.value).toBe("Revised from code");
  expect(submitButton(surface("inline"), "Request changes")).toBeDefined();
});

it.each(["inline", "floating"] as const)(
  "clears both surfaces after submitting from %s",
  async (name) => {
    await mount();
    await write(surface("inline"), "Accepted review");
    await choose(surface("floating"), "approve");
    await act(() =>
      usePullRequestReviewStore.getState().addComment(key, {
        id: "line-1",
        body: "Line remark",
        path: "app.ts",
        position: { kind: "added", newLine: 3 },
      }),
    );
    await act(async () => submitButton(surface(name), "Approve").props.onClick());
    expect(submitReview).toHaveBeenCalledExactlyOnceWith({
      environmentId,
      input: {
        ...reference,
        verdict: "approve",
        body: "Accepted review",
        comments: [
          {
            id: "line-1",
            body: "Line remark",
            path: "app.ts",
            position: { kind: "added", newLine: 3 },
          },
        ],
      },
    });
    for (const current of [surface("inline"), surface("floating")]) {
      expect(current.findByType("textarea").props.value).toBe("");
      expect(submitButton(current, "Comment")).toBeDefined();
    }
    expect(usePullRequestReviewStore.getState().drafts[key]).toBeUndefined();
    expect(submitted).toHaveBeenCalledTimes(1);
  },
);

it("keeps the shared review after a host rejection", async () => {
  submitReview.mockResolvedValue({
    _tag: "Failure",
    cause: Cause.fail(new Error("Host rejected review")),
  });
  await mount();
  await write(surface("inline"), "Keep this review");
  await choose(surface("floating"), "approve");
  await act(async () => submitButton(surface("inline"), "Approve").props.onClick());
  expect(surface("floating").findByType("textarea").props.value).toBe("Keep this review");
  expect(submitButton(surface("inline"), "Approve")).toBeDefined();
  expect(submitted).not.toHaveBeenCalled();
  expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
});

it("claims submission across both surfaces and preserves text added during the request", async () => {
  let accept!: (value: { _tag: "Success" }) => void;
  const response = new Promise<{ _tag: "Success" }>((resolve) => {
    accept = resolve;
  });
  submitReview.mockReturnValue(response);
  await mount();
  await write(surface("inline"), "Snapshot sent to host");
  await choose(surface("inline"), "approve");
  const first = submitButton(surface("inline"), "Approve").props.onClick;
  const other = submitButton(surface("floating"), "Approve").props.onClick;
  await act(() => {
    first();
    other();
  });
  expect(submitReview).toHaveBeenCalledTimes(1);
  for (const name of ["inline", "floating"] as const) {
    expect(submitButton(surface(name), "Submitting...").props.disabled).toBe(true);
  }
  await write(surface("floating"), "New work while host accepts");
  await act(() =>
    usePullRequestReviewStore.getState().addComment(key, {
      id: "new-line",
      body: "New line draft",
      path: "app.ts",
      position: { kind: "added", newLine: 4 },
    }),
  );
  await act(() => accept({ _tag: "Success" }));
  expect(surface("inline").findByType("textarea").props.value).toBe("New work while host accepts");
  expect(surface("floating").findByType("textarea").props.value).toBe(
    "New work while host accepts",
  );
  expect(usePullRequestReviewStore.getState().drafts[key]?.map((entry) => entry.id)).toEqual([
    "new-line",
  ]);
});

it.each([
  { verdict: "comment", label: "Comment", required: false, disabled: true },
  { verdict: "approve", label: "Approve", required: false, disabled: false },
  { verdict: "request-changes", label: "Request changes", required: true, disabled: true },
] as const)(
  "keeps empty-body rules for $verdict (summary required: $required)",
  async ({ verdict, label, required, disabled }) => {
    await mount(required);
    await choose(surface("inline"), verdict);
    expect(submitButton(surface("floating"), label).props.disabled).toBe(disabled);
    await write(surface("floating"), "Review summary");
    expect(submitButton(surface("inline"), label).props.disabled).toBe(false);
  },
);

it("offers only permitted verdicts and uses a permitted fallback", async () => {
  await mount(false, ["request-changes"]);
  expect(
    surface("inline")
      .findAllByType("button")
      .filter((button) => button.props.value !== undefined)
      .map((button) => button.props.value),
  ).toEqual(["request-changes"]);
  expect(submitButton(surface("floating"), "Request changes").props.disabled).toBe(true);
  await write(surface("inline"), "Required feedback");
  await act(async () => submitButton(surface("floating"), "Request changes").props.onClick());
  expect(submitReview).toHaveBeenCalledWith(
    expect.objectContaining({ input: expect.objectContaining({ verdict: "request-changes" }) }),
  );
});
