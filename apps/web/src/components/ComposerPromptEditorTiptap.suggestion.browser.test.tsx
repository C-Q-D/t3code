/** Verifies prediction insertion and keyboard priority in the real Tiptap document. */
import { createRef, useState } from "react";
import { expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { act, render } from "../../test/render";
import {
  ComposerPromptEditorTiptap as ComposerPromptEditor,
  type ComposerPromptEditorHandle,
} from "./ComposerPromptEditorTiptap";

/** Controlled editor owner; menu selection and send are external editor commands. */
function Composer({
  handle,
  initialValue = "",
  prediction = "跑一下测试",
  menu = false,
}: {
  handle: ReturnType<typeof createRef<ComposerPromptEditorHandle>>;
  initialValue?: string;
  prediction?: string | null;
  menu?: boolean;
}) {
  const [draft, setDraft] = useState(initialValue);
  const [accepted, setAccepted] = useState(false);
  const [sent, setSent] = useState(0);
  const [plan, setPlan] = useState(false);
  return (
    <>
      <ComposerPromptEditor
        editorRef={handle}
        value={draft}
        cursor={draft.length}
        richTextEnabled
        contextRecords={new Map()}
        skills={[]}
        disabled={false}
        placeholder="Write a message"
        suggestion={
          !accepted && prediction !== null
            ? { text: prediction, onAccept: () => setAccepted(true) }
            : undefined
        }
        isCommandMenuActive={() => menu}
        onChange={setDraft}
        onPaste={() => {}}
        onCommandKeyDown={(key, event) => {
          if (event.isComposing || event.keyCode === 229) return false;
          if (key === "Tab" && event.shiftKey) {
            setPlan(!plan);
            return true;
          }
          if (menu && (key === "Tab" || key === "Enter")) {
            setDraft("selected menu item");
            return true;
          }
          if (key === "Enter") {
            setSent(sent + 1);
            return true;
          }
          return false;
        }}
      />
      <output aria-label="sent">{sent}</output>
      <output aria-label="plan">{String(plan)}</output>
    </>
  );
}

it.each(["Tab", "ArrowRight"])(
  "inserts the exact suggestion with %s at the end without sending",
  async (key) => {
    const handle = createRef<ComposerPromptEditorHandle>();
    await using screen = await render(<Composer handle={handle} />);
    await userEvent.click(screen.getByRole("textbox"));
    await userEvent.keyboard(`{${key}}`);
    await expect.element(screen.getByRole("textbox")).toHaveTextContent("跑一下测试");
    expect(handle.current?.readSnapshot()).toMatchObject({
      value: "跑一下测试",
      expandedCursor: 5,
    });
    await userEvent.keyboard("!");
    expect(handle.current?.readSnapshot().value).toBe("跑一下测试!");
    await expect.element(screen.getByLabelText("sent")).toHaveTextContent("0");
  },
);

it.each(["Tab", "Enter"])("lets an open completion menu consume %s", async (key) => {
  const handle = createRef<ComposerPromptEditorHandle>();
  await using screen = await render(<Composer handle={handle} menu />);
  await userEvent.click(screen.getByRole("textbox"));
  await userEvent.keyboard(`{${key}}`);
  await expect.element(screen.getByRole("textbox")).toHaveTextContent("selected menu item");
  await expect.element(screen.getByLabelText("sent")).toHaveTextContent("0");
});

it("keeps Shift+Tab available to the plan-mode command", async () => {
  const handle = createRef<ComposerPromptEditorHandle>();
  await using screen = await render(<Composer handle={handle} />);
  await userEvent.click(screen.getByRole("textbox"));
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  await expect.element(screen.getByLabelText("plan")).toHaveTextContent("true");
  expect(handle.current?.readSnapshot().value).toBe("");
});

it.each([
  { key: "Tab", isComposing: true },
  { key: "ArrowRight", isComposing: true },
  { key: "Tab", keyCode: 229 },
  { key: "ArrowRight", keyCode: 229 },
  { key: "Tab", ctrlKey: true },
  { key: "ArrowRight", altKey: true },
  { key: "Tab", metaKey: true },
  { key: "ArrowRight", shiftKey: true },
])(
  "does not accept during IME or modified key $key ($isComposing $keyCode $ctrlKey $altKey $metaKey $shiftKey)",
  async (init) => {
    const handle = createRef<ComposerPromptEditorHandle>();
    await using screen = await render(<Composer handle={handle} />);
    await userEvent.click(screen.getByRole("textbox"));
    await act(() => {
      screen
        .getByRole("textbox")
        .element()
        .dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
    });
    expect(handle.current?.readSnapshot().value).toBe("");
    await expect.element(screen.getByLabelText("sent")).toHaveTextContent("0");
  },
);

it.each(["Tab", "ArrowRight"])("leaves %s unchanged without a suggestion", async (key) => {
  const handle = createRef<ComposerPromptEditorHandle>();
  await using screen = await render(<Composer handle={handle} prediction={null} />);
  await userEvent.click(screen.getByRole("textbox"));
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  await act(() => {
    screen.getByRole("textbox").element().dispatchEvent(event);
  });
  expect(event.defaultPrevented).toBe(false);
  expect(handle.current?.readSnapshot().value).toBe("");
});

it("keeps Tab indentation inside a code block", async () => {
  const handle = createRef<ComposerPromptEditorHandle>();
  await using screen = await render(<Composer handle={handle} initialValue={"```\nx\n```"} />);
  await act(() => {
    handle.current?.focusAt(4);
  });
  await userEvent.keyboard("{Tab}");
  expect(handle.current?.readSnapshot().value).toBe("```\n  x\n```");
  await expect.element(screen.getByLabelText("sent")).toHaveTextContent("0");
});
