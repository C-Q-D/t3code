/** Verify the retained floating entry shares real review state with the summary's form. */
import {
  EnvironmentId,
  ProjectId,
  SourceControlProviderKind,
  type PullRequestDetailView,
} from "@t3tools/contracts";
import { act, type ReactNode, type ReactElement, type ComponentProps } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const { submitReview } = vi.hoisted(() => ({ submitReview: vi.fn() }));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => submitReview }));
vi.mock("~/state/pullRequests", () => ({ pullRequestEnvironment: { submitReview: {} } }));
vi.mock("../ui/toast", () => ({ toastManager: { add: vi.fn() } }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/toggle-group", () => ({ ToggleGroup: "div", Toggle: "button" }));
vi.mock("./PullRequestCommentForm", () => ({ PullRequestCommentForm: () => null }));
vi.mock("../ui/popover", async () => {
  const { createContext, useContext, cloneElement } = await import("react");
  const context = createContext({ open: false, onOpenChange: (_open: boolean) => {} });
  return {
    Popover: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      children: ReactNode;
    }) => {
      const state = { open, onOpenChange };
      return <context.Provider value={state}>{children}</context.Provider>;
    },
    PopoverTrigger: ({
      render,
      children,
      ...props
    }: {
      render: ReactElement<ComponentProps<"button">>;
      children: ReactNode;
    }) => {
      const state = useContext(context);
      return cloneElement(render, { ...props, onClick: () => state.onOpenChange(true) }, children);
    },
    PopoverPopup: ({ children }: { children: ReactNode }) => {
      const state = useContext(context);
      return (
        <aside role="dialog" hidden={!state.open}>
          {children}
        </aside>
      );
    },
    PopoverTitle: "h2",
    PopoverClose: () => null,
  };
});

import { PullRequestComposer } from "./PullRequestComposer";
import { PullRequestReviewForm } from "./PullRequestReviewForm";
import { pullRequestReviewKey, usePullRequestReviewStore } from "./pullRequestReviewStore";

const environmentId = EnvironmentId.make("environment");
const detail: PullRequestDetailView = {
  provider: SourceControlProviderKind.make("github"),
  projectId: ProjectId.make("project"),
  projectTitle: "Project",
  workspaceRoot: "/repo",
  repository: "owner/repo",
  number: 7,
  title: "Change",
  body: "Description",
  url: "https://github.com/owner/repo/pull/7",
  author: null,
  viewer: "reviewer",
  state: "open",
  isDraft: false,
  mergeability: "mergeable",
  additions: 1,
  deletions: 0,
  changedFiles: 1,
  headBranch: "feature",
  baseBranch: "main",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  mergedAt: null,
  closedAt: null,
  reviewers: [],
  labels: [],
  checks: [],
  comments: [],
  commentCount: 0,
  commentsTruncated: false,
  reviewThreads: [],
  commits: [],
  mergeCapabilities: { merge: false, squash: false, rebase: false },
  capabilities: {
    diff: true,
    comment: true,
    search: true,
    actions: [],
    mergeMethods: [],
    review: {
      inlineComment: true,
      reply: false,
      resolve: false,
      verdicts: ["comment", "approve", "request-changes"],
    },
    reviewers: { request: false, listCandidates: false },
    edit: { changeRequest: false, comment: false },
  },
  viewerPermissions: {
    actions: [],
    comment: true,
    resolve: false,
    verdicts: ["comment", "approve", "request-changes"],
    requestReviewers: false,
  },
};
let renderer: ReactTestRenderer;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  usePullRequestReviewStore.setState(usePullRequestReviewStore.getInitialState(), true);
  submitReview.mockReset().mockResolvedValue({ _tag: "Success" });
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  vi.unstubAllGlobals();
});

/** Keep both real forms mounted while changing Guide requests; popover chrome is the only UI fake. */
function surfaces(openReviewRequest = 0) {
  return (
    <>
      <section aria-label="inline">
        <PullRequestReviewForm
          environmentId={environmentId}
          reference={detail}
          verdicts={detail.viewerPermissions.verdicts}
          requestChangesSummaryRequired={false}
          textareaRef={{ current: null }}
          onSubmitted={() => {}}
        />
      </section>
      <PullRequestComposer
        environmentId={environmentId}
        reference={detail}
        detail={detail}
        actionPending={false}
        onCommentAction={async () => ({ commentPosted: false })}
        onCommented={() => {}}
        onReviewSubmitted={() => {}}
        openReviewRequest={openReviewRequest}
      />
    </>
  );
}

it("opens a code draft in review mode and shares later edits with the inline form", async () => {
  await act(() => {
    renderer = create(surfaces());
  });
  await act(() => {
    usePullRequestReviewStore.getState().addComment(pullRequestReviewKey(detail), {
      id: "line",
      body: "Code finding",
      path: "app.ts",
      position: { kind: "added", newLine: 1 },
    });
  });
  const trigger = renderer.root
    .findAllByType("button")
    .find((button) => button.props["aria-label"]?.includes("pending"))!;
  await act(() => trigger.props.onClick());
  const popup = renderer.root.findByType("aside");
  expect(popup.props.hidden).toBe(false);
  expect(popup.findByType(PullRequestReviewForm).parent!.props.hidden).toBe(false);
  await act(() =>
    popup.findByType("textarea").props.onChange({ target: { value: "From the code review" } }),
  );
  expect(
    renderer.root.findByProps({ "aria-label": "inline" }).findByType("textarea").props.value,
  ).toBe("From the code review");
});

it("opens the Guide request on the shared verdict and clears the inline draft after floating submission", async () => {
  await act(() => {
    renderer = create(surfaces());
  });
  const inline = renderer.root.findByProps({ "aria-label": "inline" });
  await act(() =>
    inline.findByType("textarea").props.onChange({ target: { value: "Summary review" } }),
  );
  await act(() =>
    inline.findByProps({ "aria-label": "Review verdict" }).props.onValueChange(["approve"]),
  );
  await act(() => renderer.update(surfaces(1)));
  const popup = renderer.root.findByType("aside");
  expect(popup.props.hidden).toBe(false);
  expect(popup.findByType("textarea").props.value).toBe("Summary review");
  const submit = popup
    .findAllByType("button")
    .find((button) => button.props.value === undefined && button.children.includes("Approve"))!;
  await act(async () => submit.props.onClick());
  expect(submitReview).toHaveBeenCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({ verdict: "approve", body: "Summary review" }),
    }),
  );
  expect(inline.findByType("textarea").props.value).toBe("");
  expect(popup.props.hidden).toBe(true);
});

it("recognizes an inline approval without text as review work when opening the floating entry", async () => {
  await act(() => {
    renderer = create(surfaces());
  });
  const inline = renderer.root.findByProps({ "aria-label": "inline" });
  await act(() =>
    inline.findByProps({ "aria-label": "Review verdict" }).props.onValueChange(["approve"]),
  );
  const trigger = renderer.root
    .findAllByType("button")
    .find((button) => button.props["aria-label"] === "Review pull request")!;
  expect(trigger).toBeDefined();
  await act(() => trigger.props.onClick());
  const popup = renderer.root.findByType("aside");
  expect(popup.findByType(PullRequestReviewForm).parent!.props.hidden).toBe(false);
  expect(
    popup
      .findAllByType("button")
      .some((button) => button.props.value === undefined && button.children.includes("Approve")),
  ).toBe(true);
});
