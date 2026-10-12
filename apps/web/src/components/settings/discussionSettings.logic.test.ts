/** Protects discussion settings rules against the delegated UI requirements, without rendering markup. */
import {
  DiscussionPromptId,
  ProviderInstanceId,
  type DiscussionPromptWithModified,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  canSaveDiscussionPrompt,
  discussionPromptRow,
  discussionSeatSummary,
  discussionTemplatesLoadError,
} from "./discussionSettings.logic";
import { getSettingsSearchTargetScope, searchSettings } from "./settingsSearch";

const personaId = DiscussionPromptId.make("architect");
const customId = DiscussionPromptId.make("custom");
const persona: DiscussionPromptWithModified = {
  id: personaId,
  kind: "persona",
  name: "架构师",
  prompt: "审查结构",
  avatar: "architect",
  description: "从结构出发",
  builtin: true,
  modified: false,
  createdAt: "2026-10-12T00:00:00.000Z",
  updatedAt: "2026-10-12T00:00:00.000Z",
};

describe("discussion settings", () => {
  it("shows the prompt failure for templates when the template subscription has succeeded", () => {
    expect(discussionTemplatesLoadError(null, "Prompt subscription failed")).toBe(
      "Prompt subscription failed",
    );
  });
  it("finds the discussions page by both languages and keeps its scope available", () => {
    expect(searchSettings("discussions").some((item) => item.to === "/settings/discussions")).toBe(
      true,
    );
    expect(searchSettings("讨论").some((item) => item.to === "/settings/discussions")).toBe(true);
    expect(getSettingsSearchTargetScope("discussion-personas")?.scope).toBe(null);
  });
  it.each([
    { builtin: true, modified: false, labels: ["builtin"], actions: ["edit"] },
    {
      builtin: true,
      modified: true,
      labels: ["builtin", "modified"],
      actions: ["restore", "edit"],
    },
    { builtin: false, modified: false, labels: [], actions: ["edit", "delete"] },
  ])(
    "shows the required labels and ordered actions for $builtin/$modified",
    ({ builtin, modified, labels, actions }) => {
      expect(discussionPromptRow({ builtin, modified })).toEqual({ labels, actions });
    },
  );

  it("summarizes ordered seats using persona names and configured provider instance names", () => {
    expect(
      discussionSeatSummary(
        [
          {
            personaPromptId: customId,
            modelSelection: { instanceId: ProviderInstanceId.make("personal_codex"), model: "gpt" },
          },
          {
            personaPromptId: personaId,
            modelSelection: { instanceId: ProviderInstanceId.make("claude"), model: "sonnet" },
          },
        ],
        [persona, { ...persona, id: customId, name: "反方", builtin: false }],
        [
          { instanceId: ProviderInstanceId.make("claude"), displayName: "Claude" },
          { instanceId: ProviderInstanceId.make("personal_codex"), displayName: "我的 Codex" },
        ],
        "已删除的身份",
      ),
    ).toBe("反方 · 我的 Codex、架构师 · Claude");
  });

  it("keeps missing persona and provider references visible", () => {
    expect(
      discussionSeatSummary(
        [
          {
            personaPromptId: customId,
            modelSelection: {
              instanceId: ProviderInstanceId.make("removed_instance"),
              model: "gpt",
            },
          },
        ],
        [],
        [],
        "已删除的身份",
      ),
    ).toBe("已删除的身份 · removed_instance");
  });

  it.each([
    { name: "讨论", prompt: "认真讨论", writable: true, busy: false, expected: true },
    { name: " \n ", prompt: "认真讨论", writable: true, busy: false, expected: false },
    { name: "讨论", prompt: "\t ", writable: true, busy: false, expected: false },
    { name: "讨论", prompt: "认真讨论", writable: false, busy: false, expected: false },
    { name: "讨论", prompt: "认真讨论", writable: true, busy: true, expected: false },
  ])(
    "allows saving only valid, writable, idle drafts: $name/$prompt/$writable/$busy",
    ({ name, prompt, writable, busy, expected }) => {
      expect(canSaveDiscussionPrompt({ name, prompt }, writable, busy)).toBe(expected);
    },
  );
});
