/** Protects discussion creation inputs and gating without starting real provider sessions. */
import {
  DiscussionId,
  EnvironmentId,
  ProjectId,
  DiscussionPromptId,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  canStartDiscussion,
  buildDiscussionCreateInput,
  discussionCreatedRoute,
} from "./discussionCreate.logic";

const projectId = ProjectId.make("project");
const seats = Object.freeze([
  {
    personaPromptId: DiscussionPromptId.make("opponent"),
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt" },
  },
  {
    personaPromptId: DiscussionPromptId.make("architect"),
    modelSelection: { instanceId: ProviderInstanceId.make("claudeAgent"), model: "opus" },
  },
]);
const support = {
  instances: [
    { instanceId: ProviderInstanceId.make("codex"), supported: true },
    { instanceId: ProviderInstanceId.make("claudeAgent"), supported: true },
  ],
};
describe("discussion creation", () => {
  it.each([
    {
      case: "valid",
      topic: "  问题\n细节  ",
      seats,
      projectId,
      writable: true,
      busy: false,
      support,
      expected: true,
    },
    {
      case: "blank topic",
      topic: " \n\t ",
      seats,
      projectId,
      writable: true,
      busy: false,
      support,
      expected: false,
    },
    {
      case: "no seats",
      topic: "问题",
      seats: [],
      projectId,
      writable: true,
      busy: false,
      support,
      expected: false,
    },
    {
      case: "unsupported second seat",
      topic: "问题",
      seats,
      projectId,
      writable: true,
      busy: false,
      support: {
        instances: [support.instances[0]!, { ...support.instances[1]!, supported: false }],
      },
      expected: false,
    },
    {
      case: "support pending",
      topic: "问题",
      seats,
      projectId,
      writable: true,
      busy: false,
      support: null,
      expected: false,
    },
    {
      case: "permission denied",
      topic: "问题",
      seats,
      projectId,
      writable: false,
      busy: false,
      support,
      expected: false,
    },
    {
      case: "submission pending",
      topic: "问题",
      seats,
      projectId,
      writable: true,
      busy: true,
      support,
      expected: false,
    },
    {
      case: "no project",
      topic: "问题",
      seats,
      projectId: null,
      writable: true,
      busy: false,
      support,
      expected: false,
    },
  ])("gates start for $case", ({ topic, seats, projectId, writable, busy, support, expected }) => {
    expect(canStartDiscussion({ projectId, topic, seats }, support, writable, busy)).toBe(expected);
  });
  it("retains the complete topic and speaking order in the create input", () => {
    expect(buildDiscussionCreateInput(projectId, "  第一行\n第二行\n  ", seats)).toEqual({
      projectId: "project",
      topic: "  第一行\n第二行\n  ",
      seats: [
        { personaPromptId: "opponent", modelSelection: { instanceId: "codex", model: "gpt" } },
        {
          personaPromptId: "architect",
          modelSelection: { instanceId: "claudeAgent", model: "opus" },
        },
      ],
    });
  });
  it("replaces the creation route with the returned discussion in its destination environment", () => {
    expect(
      discussionCreatedRoute(EnvironmentId.make("remote"), DiscussionId.make("created")),
    ).toEqual({
      to: "/discussions/$environmentId/$discussionId",
      params: { environmentId: "remote", discussionId: "created" },
      replace: true,
    });
  });
});
