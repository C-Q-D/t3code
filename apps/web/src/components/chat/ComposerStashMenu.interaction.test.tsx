/**
 * Characterizes existing stash navigation and deletion before changing its presentation.
 * These are current behavior snapshots, not new requirements.
 * @vitest-environment jsdom
 */
import { act, useState, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type { PromptStashEntry } from "../../promptStashStore";
import { ComposerStashMenu } from "./ComposerStashMenu";

const ENTRIES: ReadonlyArray<PromptStashEntry> = [
  {
    id: "first",
    prompt: "First draft",
    createdAt: "2026-10-17T00:00:00Z",
    attachments: [],
    droppedImageNames: [],
  },
  {
    id: "second",
    prompt: "Second draft",
    createdAt: "2026-10-17T00:00:00Z",
    attachments: [],
    droppedImageNames: [],
  },
];
let root: Root | undefined;
let container: HTMLDivElement | undefined;
const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");

/** Makes restored text and remaining entries observable without mocking stash keyboard handling. */
function StashHarness() {
  const composerFormRef = useRef<HTMLFormElement>(null);
  const [entries, setEntries] = useState(ENTRIES);
  const [prompt, setPrompt] = useState("");
  const [open, setOpen] = useState(true);
  return (
    <form ref={composerFormRef}>
      <textarea aria-label="Draft" readOnly value={prompt} />
      {open && (
        <ComposerStashMenu
          composerFormRef={composerFormRef}
          entries={entries}
          stashShortcutLabel="Ctrl+S"
          onRestore={(entry) => {
            setPrompt(entry.prompt);
            setOpen(false);
          }}
          onDelete={(entry) =>
            setEntries((previous) => previous.filter((item) => item.id !== entry.id))
          }
          onClose={() => setOpen(false)}
        />
      )}
    </form>
  );
}

/** Mounts the real menu; jsdom lacks the browser scrolling operation used by arrow navigation. */
async function mountStash() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<StashHarness />));
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.restoreAllMocks();
  if (scrollDescriptor)
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollDescriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  vi.unstubAllGlobals();
});

it("restores the draft chosen with arrows while focus stays in the composer", async () => {
  await mountStash();
  const draft = container!.querySelector("textarea")!;
  draft.focus();
  await act(async () =>
    draft.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })),
  );
  await act(async () =>
    draft.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
  );
  expect(draft.value).toBe("Second draft");
  expect(container!.querySelector("ul")).toBeNull();
});

it("deletes the highlighted draft with Ctrl+Backspace without restoring it", async () => {
  await mountStash();
  await act(async () =>
    container!
      .querySelector("textarea")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Backspace", ctrlKey: true, bubbles: true }),
      ),
  );
  expect(container!.querySelector("ul")?.textContent).not.toContain("First draft");
  expect(container!.querySelector("ul")?.textContent).toContain("Second draft");
  expect(container!.querySelector("textarea")?.value).toBe("");
});
