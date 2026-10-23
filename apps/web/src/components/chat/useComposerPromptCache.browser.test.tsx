/** Checks that cache consumers ignore unrelated streamed thread changes. */
import { useAtomValue, RegistryContext } from "@effect/atom-react";
import { Atom, AtomRegistry } from "effect/reactivity";
import * as Option from "effect/Option";
import * as DateTime from "effect/DateTime";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { it, expect, vi } from "vite-plus/test";
import { act, render } from "../../../test/render";
import { useComposerPromptCache } from "./useComposerPromptCache";

const fake = vi.hoisted(() => ({ source: null as unknown }));
vi.mock("~/state/threads", () => ({
  useEnvironmentThread: () => ({
    data: Option.some(useAtomValue(fake.source as Atom.Atom<{ projection: unknown }>).projection),
  }),
  environmentThreadDetails: { threadAtom: () => fake.source },
}));

/** Counts actual consumer renders, rather than projector invocations. */
function Consumer({ onRender, enabled = true }: { onRender: () => void; enabled?: boolean }) {
  const value = useComposerPromptCache(
    EnvironmentId.make("env"),
    ThreadId.make("cache-thread"),
    enabled,
  );
  onRender();
  return <output>{value.lastTurnCompletedAt ?? "none"}</output>;
}

it("ignores assistant deltas, tool updates and new items but renders completed cache metadata", async () => {
  const source = Atom.make({
    projection: {
      providerTurns: [] as { completedAt: DateTime.Utc; tokenUsage: null }[],
      visibleTurnItems: [] as { text: string }[],
    },
  });
  fake.source = source;
  using stack = new DisposableStack();
  const registry = stack.adopt(AtomRegistry.make(), (value) => value.dispose());
  const count = vi.fn();
  await using screen = await render(
    <RegistryContext.Provider value={registry}>
      <Consumer onRender={count} />
    </RegistryContext.Provider>,
  );
  count.mockClear();
  for (const text of ["assistant delta", "tool output", "new item"]) {
    await act(() =>
      registry.set(source, { projection: { providerTurns: [], visibleTurnItems: [{ text }] } }),
    );
    expect(count).not.toHaveBeenCalled();
  }
  await act(() =>
    registry.set(source, {
      projection: {
        providerTurns: [
          { completedAt: DateTime.makeUnsafe("2026-01-01T00:00:00Z"), tokenUsage: null },
        ],
        visibleTurnItems: [],
      },
    }),
  );
  await expect.element(screen.getByText("2026-01-01T00:00:00.000Z")).toBeVisible();
  expect(count).toHaveBeenCalledTimes(1);
});
