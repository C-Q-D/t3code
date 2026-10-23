/** Exercises improvement through a real editor with a controlled RPC boundary, without a provider. */
import { useRef, useState } from "react";
import { EnvironmentId, ThreadId, type ComposerOptimizeResult } from "@t3tools/contracts";
import { Atom, AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { act, render } from "../../../test/render";
import { ComposerPromptEditor, type ComposerPromptEditorHandle } from "../ComposerPromptEditor";
import { useComposerPromptOptimizer } from "./useComposerPromptOptimizer";

/** Lets each test release one RPC response at an explicit milestone. */
function deferredResult() {
  let resolve!: (value: ReturnType<typeof AsyncResult.success<ComposerOptimizeResult>>) => void;
  const promise = new Promise<ReturnType<typeof AsyncResult.success<ComposerOptimizeResult>>>(
    (settle) => {
      resolve = settle;
    },
  );
  return { promise, resolve };
}

const fake = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => fake.run }));
vi.mock("~/state/composerAssist", () => ({
  composerAssistEnvironment: { optimizePrompt: { permissionAtom: () => Atom.make(true) } },
}));

/** Mounts the same editor contract used by ChatComposer; buttons invoke the hook's public operations. */
function Harness({ thread = "thread" }: { thread?: string }) {
  const [prompt, setPrompt] = useState("  fix the bug  ");
  const [cursor, setCursor] = useState(15);
  const editorRef = useRef<ComposerPromptEditorHandle | null>(null);
  const optimizer = useComposerPromptOptimizer({
    environmentId: EnvironmentId.make("env"),
    threadId: ThreadId.make(thread),
    draftKey: thread,
    prompt,
    driver: "codex",
    enabled: true,
    running: false,
    editorRef,
  });
  return (
    <>
      <ComposerPromptEditor
        editorRef={editorRef}
        value={prompt}
        cursor={cursor}
        contextRecords={new Map()}
        skills={[]}
        disabled={false}
        placeholder="Draft"
        onChange={(text, nextCursor) => {
          setPrompt(text);
          setCursor(nextCursor);
        }}
        onPaste={() => {}}
      />
      <button onClick={() => void optimizer.trigger()}>Improve</button>
      <button onClick={optimizer.undo}>Undo improvement</button>
      <pre data-draft>{prompt}</pre>
      <span role="status">{optimizer.label}</span>
    </>
  );
}

it("replaces the original untrimmed draft and restores it with one editor undo", async () => {
  fake.run.mockReset().mockResolvedValue(
    AsyncResult.success({
      _tag: "Optimized",
      requestId: "one",
      text: "Fix the bug and run its regression test.",
      cacheMaybeExpired: false,
    } satisfies ComposerOptimizeResult),
  );
  await using screen = await render(<Harness />);
  await screen.getByRole("button", { name: "Improve", exact: true }).click();
  expect(fake.run).toHaveBeenCalledExactlyOnceWith({
    environmentId: "env",
    input: { threadId: "thread", draft: "  fix the bug  ", style: "default" },
  });
  await expect.element(screen.getByRole("status")).toHaveTextContent("Improved");
  await expect
    .element(screen.getByRole("textbox"))
    .toHaveTextContent("Fix the bug and run its regression test.");
  await screen.getByRole("textbox").click();
  await userEvent.keyboard("{Control>}z{/Control}");
  await expect.element(screen.getByRole("textbox")).toHaveTextContent("fix the bug");
  expect(screen.container.querySelector("[data-draft]")?.textContent).toBe("  fix the bug  ");
});

it.each(["edited draft", ""])(
  "discards a late result after the draft becomes %j",
  async (nextDraft) => {
    const pending = deferredResult();
    fake.run.mockReset().mockReturnValue(pending.promise);
    await using screen = await render(<Harness />);
    await screen.getByRole("button", { name: "Improve", exact: true }).click();
    await expect.element(screen.getByRole("status")).toHaveTextContent("Improving…");
    await screen.getByRole("textbox").fill(nextDraft);
    await act(async () =>
      pending.resolve(
        AsyncResult.success({
          _tag: "Optimized",
          requestId: "late",
          text: "Stale rewrite",
          cacheMaybeExpired: false,
        }),
      ),
    );
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Draft changed; result discarded");
    expect(screen.container.querySelector("[data-draft]")?.textContent).toBe(nextDraft);
  },
);

it("silently drops a response after changing threads", async () => {
  const pending = deferredResult();
  fake.run.mockReset().mockReturnValue(pending.promise);
  await using screen = await render(<Harness />);
  await screen.getByRole("button", { name: "Improve", exact: true }).click();
  await screen.rerender(<Harness thread="other" />);
  await act(async () =>
    pending.resolve(
      AsyncResult.success({
        _tag: "Optimized",
        requestId: "late",
        text: "Stale rewrite",
        cacheMaybeExpired: false,
      }),
    ),
  );
  await expect.element(screen.getByRole("status")).toBeEmptyDOMElement();
  expect(screen.container.querySelector("[data-draft]")?.textContent).toBe("  fix the bug  ");
});

it("does not dispatch a second request while the first is pending", async () => {
  const pending = deferredResult();
  fake.run.mockReset().mockReturnValue(pending.promise);
  await using screen = await render(<Harness />);
  await screen.getByRole("button", { name: "Improve", exact: true }).click();
  await screen.getByRole("button", { name: "Improve", exact: true }).click();
  expect(fake.run).toHaveBeenCalledTimes(1);
  await act(async () =>
    pending.resolve(
      AsyncResult.success({ _tag: "Filtered", requestId: "one", reason: "unchanged" }),
    ),
  );
});

it("restores the original draft using the explicit undo action", async () => {
  fake.run.mockReset().mockResolvedValue(
    AsyncResult.success({
      _tag: "Optimized",
      requestId: "two",
      text: "Find the root cause first.",
      cacheMaybeExpired: false,
    } satisfies ComposerOptimizeResult),
  );
  await using screen = await render(<Harness />);
  await screen.getByRole("button", { name: "Improve", exact: true }).click();
  await expect.element(screen.getByRole("textbox")).toHaveTextContent("Find the root cause first.");
  expect(window.getSelection()?.anchorOffset).toBe(26);
  await screen.getByRole("button", { name: "Undo improvement" }).click();
  expect(screen.container.querySelector("[data-draft]")?.textContent).toBe("  fix the bug  ");
});

it.each([
  [{ _tag: "Filtered", reason: "unchanged" }, "The draft is already clear"],
  [{ _tag: "Filtered", reason: "empty" }, "Could not improve: the model returned nothing"],
  [{ _tag: "Filtered", reason: "too_long" }, "Could not improve: the result was too long"],
  [
    { _tag: "Filtered", reason: "references_dropped" },
    "Could not improve: the result dropped a reference or path",
  ],
  [{ _tag: "Failed", reason: "timeout" }, "Could not improve: timed out"],
  [
    { _tag: "Failed", reason: "session_resume_failed" },
    "Could not improve: could not resume the session",
  ],
  [{ _tag: "Failed", reason: "provider_error" }, "Could not improve: provider error"],
  [{ _tag: "Failed", reason: "interrupted" }, "Could not improve: provider error"],
  [{ _tag: "Failed", reason: "usage_limit" }, "Could not improve: usage limit reached"],
  [{ _tag: "Failed", reason: "transport_error" }, "Could not improve: connection lost"],
  [{ _tag: "Suppressed", reason: "disabled" }, "Could not improve: not available right now"],
] as const)("keeps the draft and explains %j", async (result, label) => {
  fake.run.mockReset().mockResolvedValue(AsyncResult.success({ ...result, requestId: "refused" }));
  await using screen = await render(<Harness />);
  await screen.getByRole("button", { name: "Improve", exact: true }).click();
  await expect.element(screen.getByRole("status")).toHaveTextContent(label);
  expect(screen.container.querySelector("[data-draft]")?.textContent).toBe("  fix the bug  ");
});
