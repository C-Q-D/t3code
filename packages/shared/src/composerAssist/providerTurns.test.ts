/** Guards provider ownership and stable completion ordering for composer cache metadata. */
import { expect, it } from "vite-plus/test";
import * as DateTime from "effect/DateTime";
import { latestCompletedComposerProviderTurn } from "./providerTurns.ts";

const current = { providerThreadId: "current", completedAt: DateTime.makeUnsafe(0), id: "first" };
const other = { providerThreadId: "other", completedAt: DateTime.makeUnsafe(540_000), id: "other" };

it("ignores newer turns from other provider threads and unfinished current turns", () => {
  const latest = { ...current, completedAt: DateTime.makeUnsafe(60_000), id: "latest" };
  expect(
    latestCompletedComposerProviderTurn(
      [latest, other, current, { ...current, completedAt: null, id: "unfinished" }],
      "current",
    ),
  ).toBe(latest);
});

it.each(["current", null])("returns no turn without a completed active match for %s", (active) => {
  expect(
    latestCompletedComposerProviderTurn([other, { ...current, completedAt: null }], active),
  ).toBeUndefined();
});

it("keeps the first current turn when completion timestamps tie", () => {
  expect(
    latestCompletedComposerProviderTurn([other, current, { ...current, id: "second" }], "current"),
  ).toBe(current);
});
