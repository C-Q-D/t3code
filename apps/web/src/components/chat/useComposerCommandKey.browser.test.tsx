/** Drives the real editor and command hook so keyboard ownership is not reimplemented by the fixture. */
import { useRef, useState } from "react";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { act, render } from "../../../test/render";
import {
  ComposerPromptEditorTiptap as ComposerPromptEditor,
  type ComposerPromptEditorHandle,
} from "../ComposerPromptEditorTiptap";
import { composerCommandKeyHandler } from "./composerCommandKey";
import type { ComposerCommandItem } from "./ComposerCommandMenu";

/** Owns draft and plan state; all decisions about keyboard priority come from the production hook. */
function Composer({ menu = false }: { menu?: boolean }) {
  const [draft, setDraft] = useState("");
  const [cursor, setCursor] = useState(0);
  const [plan, setPlan] = useState(false);
  const [sent, setSent] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const promptRef = useRef("");
  const editorRef = useRef<ComposerPromptEditorHandle>(null);
  const target = {
    environmentId: EnvironmentId.make("commands"),
    threadId: ThreadId.make("thread"),
  };
  const item: ComposerCommandItem = {
    id: "thread",
    type: "thread",
    thread: target,
    label: "Thread choice",
    description: "",
  };
  const updateDraft = (value: string) => {
    promptRef.current = value;
    setDraft(value);
    setCursor(value.length);
  };
  const promptHistoryPositionRef = useRef(null);
  const composerImagesRef = useRef([]);
  const composerFilesRef = useRef([]);
  const composerTerminalContextsRef = useRef([]);
  const composerMenuOpenRef = useRef(menu);
  const composerMenuItemsRef = useRef([item]);
  const activeComposerMenuItemRef = useRef(item);
  const onComposerCommandKey: ReturnType<typeof composerCommandKeyHandler> = (...args) =>
    composerCommandKeyHandler({
      keybindings: DEFAULT_RESOLVED_KEYBINDINGS,
      sendShortcut: "enter",
      routeKind: "server",
      phase: "ready",
      isCompacting: false,
      followUpBehavior: "queue",
      isSoftwareKeyboardOpen: false,
      planModeUiEnabled: true,
      isLiteralPendingAnswer: false,
      pendingUserInputs: [],
      promptHistoryMessages: [],
      promptHistoryPositionRef,
      composerDraftTarget: target,
      promptRef,
      composerImagesRef,
      composerFilesRef,
      composerTerminalContextsRef,
      composerPreviewAnnotations: [],
      composerReviewComments: [],
      composerEditorRef: editorRef,
      composerMenuOpenRef,
      composerMenuItemsRef,
      activeComposerMenuItemRef,
      setComposerDraftPrompt: (_target, value) => updateDraft(value),
      setComposerCursor: setCursor,
      setComposerTrigger: () => {},
      setComposerHighlightedItemId: () => {},
      dismissComposerTrigger: () => {},
      toggleInteractionMode: () => setPlan((value) => !value),
      nudgeComposerMenuHighlight: () => {},
      onSelectComposerItem: (selected) => updateDraft(selected.label),
      resolveActiveComposerTrigger: () => ({ trigger: null }),
      readComposerSnapshot: () => ({ value: promptRef.current }),
      applyPromptReplacement: () => false,
      submitComposer: () => setSent(true),
    })(...args);
  return (
    <>
      <ComposerPromptEditor
        editorRef={editorRef}
        value={draft}
        cursor={cursor}
        contextRecords={new Map()}
        skills={[]}
        disabled={false}
        placeholder="Message"
        onChange={updateDraft}
        onPaste={() => {}}
        onCommandKeyDown={onComposerCommandKey}
        isCommandMenuActive={() => menu}
        suggestion={
          accepted ? undefined : { text: "跑一下测试", onAccept: () => setAccepted(true) }
        }
      />
      <output aria-label="plan">{String(plan)}</output>
      <output aria-label="sent">{String(sent)}</output>
    </>
  );
}

it.each([
  { isComposing: true, shiftKey: false },
  { keyCode: 229, shiftKey: false },
  { isComposing: true, shiftKey: true },
  { keyCode: 229, shiftKey: true },
])(
  "keeps IME Tab unconsumed (shift=$shiftKey composing=$isComposing code=$keyCode)",
  async (init) => {
    await using screen = await render(<Composer menu={!init.shiftKey} />);
    await userEvent.click(screen.getByRole("textbox"));
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
      ...init,
    });
    await act(() => {
      screen.getByRole("textbox").element().dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    await expect.element(screen.getByRole("textbox")).toHaveTextContent("");
    await expect.element(screen.getByLabelText("plan")).toHaveTextContent("false");
    await expect.element(screen.getByLabelText("sent")).toHaveTextContent("false");
  },
);

it("toggles plan mode with non-composing Shift+Tab", async () => {
  await using screen = await render(<Composer />);
  await userEvent.click(screen.getByRole("textbox"));
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  await expect.element(screen.getByLabelText("plan")).toHaveTextContent("true");
  await expect.element(screen.getByRole("textbox")).toHaveTextContent("");
});

it.each(["Tab", "Enter"])(
  "gives %s to the open menu instead of accepting or sending",
  async (key) => {
    await using screen = await render(<Composer menu />);
    await userEvent.click(screen.getByRole("textbox"));
    await userEvent.keyboard(`{${key}}`);
    await expect.element(screen.getByRole("textbox")).toHaveTextContent("Thread choice");
    await expect.element(screen.getByLabelText("sent")).toHaveTextContent("false");
  },
);
