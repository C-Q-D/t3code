/** Protects speaking order, independent seat edits and capability rejection without UI mocks. */
import { DiscussionPromptId, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  addDiscussionSeat,
  removeDiscussionSeat,
  moveDiscussionSeat,
  changeDiscussionSeatPersona,
  changeDiscussionSeatModel,
  canSelectDiscussionModel,
  type DiscussionDraftSeat,
} from "./discussionSeats.logic";

const a: DiscussionDraftSeat = Object.freeze({
  personaPromptId: DiscussionPromptId.make("architect"),
  modelSelection: Object.freeze({ instanceId: ProviderInstanceId.make("claude"), model: "opus" }),
});
const b: DiscussionDraftSeat = Object.freeze({
  personaPromptId: DiscussionPromptId.make("opponent"),
  modelSelection: Object.freeze({ instanceId: ProviderInstanceId.make("codex"), model: "gpt" }),
});
const c: DiscussionDraftSeat = Object.freeze({
  personaPromptId: DiscussionPromptId.make("implementer"),
  modelSelection: Object.freeze({
    instanceId: ProviderInstanceId.make("codex-personal"),
    model: "gpt-personal",
  }),
});
const seats = Object.freeze([a, b, c]);

describe("discussion seat editing", () => {
  it("appends the supplied persona and default model after existing seats", () => {
    expect(addDiscussionSeat(Object.freeze([a, b]), c)).toEqual([a, b, c]);
  });
  it("removes the middle seat without removing a duplicate persona", () => {
    const duplicate = { ...c, personaPromptId: b.personaPromptId };
    expect(removeDiscussionSeat(Object.freeze([a, b, duplicate]), 1)).toEqual([a, duplicate]);
  });
  it.each([
    { from: 0, to: 2, expected: [b, c, a] },
    { from: 2, to: 0, expected: [c, a, b] },
  ])(
    "moves $from to final position $to and retains model/persona pairs",
    ({ from, to, expected }) => {
      expect(moveDiscussionSeat(seats, from, to)).toEqual(expected);
    },
  );
  it.each([
    { from: -1, to: 0 },
    { from: 0, to: 3 },
    { from: 0.5, to: 1 },
  ])("ignores invalid movement $from -> $to", ({ from, to }) => {
    expect(moveDiscussionSeat(seats, from, to)).toEqual([a, b, c]);
  });
  it("changes one persona and retains that seat's model and surrounding seats", () => {
    expect(changeDiscussionSeatPersona(seats, 1, DiscussionPromptId.make("reviewer"))).toEqual([
      a,
      { personaPromptId: "reviewer", modelSelection: { instanceId: "codex", model: "gpt" } },
      c,
    ]);
  });
  it("changes one complete model selection and retains persona and surrounding seats", () => {
    expect(changeDiscussionSeatModel(seats, 1, a.modelSelection)).toEqual([
      a,
      { personaPromptId: "opponent", modelSelection: { instanceId: "claude", model: "opus" } },
      c,
    ]);
  });
  it.each([
    {
      name: "supported exact instance",
      instance: "codex",
      support: { instances: [{ instanceId: ProviderInstanceId.make("codex"), supported: true }] },
      available: true,
      expected: true,
    },
    {
      name: "unsupported instance",
      instance: "codex",
      support: { instances: [{ instanceId: ProviderInstanceId.make("codex"), supported: false }] },
      available: true,
      expected: false,
    },
    {
      name: "another instance of the same driver",
      instance: "codex-personal",
      support: { instances: [{ instanceId: ProviderInstanceId.make("codex"), supported: true }] },
      available: true,
      expected: false,
    },
    { name: "support pending", instance: "codex", support: null, available: true, expected: false },
    {
      name: "unavailable option",
      instance: "codex",
      support: { instances: [{ instanceId: ProviderInstanceId.make("codex"), supported: true }] },
      available: false,
      expected: false,
    },
  ])("selectability: $name", ({ instance, support, available, expected }) => {
    expect(canSelectDiscussionModel(ProviderInstanceId.make(instance), support, available)).toBe(
      expected,
    );
  });
});
