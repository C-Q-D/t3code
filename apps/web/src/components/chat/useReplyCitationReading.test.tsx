/** @vitest-environment jsdom */
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";
import type { ReplyReadingPreference } from "@t3tools/client-runtime/state/reply-reading";
import { useAssistantCitationTarget } from "./useAssistantCitationTarget";
import { useReplyCitationReading } from "./useReplyCitationReading";

it("releases a completed citation's reading selection on a user version change", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const unavailable = vi.fn();
  const citation = {
    version: 2 as const,
    environmentId: EnvironmentId.make("environment"),
    threadId: ThreadId.make("thread"),
    messageId: MessageId.make("message"),
    source: "rewrite" as const,
    rewriteRequestId: "success",
    text: "Readable",
    start: 0,
    end: 8,
    prefix: "",
    suffix: "",
  };
  function Harness({ activation, revision }: { activation: string; revision: number }) {
    const [preference, select] = useState<ReplyReadingPreference>("original");
    const navigation = useAssistantCitationTarget({
      request: { key: activation, citation },
      phase: { _tag: "ready", rowId: "message" },
      viewport: host,
      onManualNavigation: () => {},
    });
    const reading = useReplyCitationReading({
      request: navigation.target,
      available: {
        source: "rewrite",
        text: `Readable ${revision}`,
        successAvailable: true,
        rewriteRequestId: "success",
      },
      preference,
      waiting: false,
      onSelect: select,
      onUnavailable: unavailable,
    });
    return (
      <>
        <output>{reading.preference}</output>
        <span data-retained={navigation.target !== null} />
        <button onClick={navigation.onListLoad}>Load</button>
        <button
          onClick={() => {
            if (!navigation.target) throw new Error("Citation target is missing");
            navigation.target.onComplete();
          }}
        >
          Complete
        </button>
        <button onClick={() => reading.select("original")}>Original</button>
      </>
    );
  }
  const click = async (text: string) => {
    const button = [...host.querySelectorAll("button")].find((node) => node.textContent === text);
    if (!button) throw new Error(`Missing ${text}`);
    await act(async () => {
      if (text === "Original") button.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      button.click();
    });
  };
  try {
    await act(async () => root.render(<Harness activation="first" revision={1} />));
    await click("Load");
    expect(host.querySelector("output")?.textContent).toBe("rewrite");
    await click("Complete");
    expect(host.querySelector("[data-retained]")?.getAttribute("data-retained")).toBe("true");
    await click("Original");
    expect(host.querySelector("output")?.textContent).toBe("original");
    await act(async () => root.render(<Harness activation="first" revision={2} />));
    expect(host.querySelector("output")?.textContent).toBe("original");
    await act(async () => root.render(<Harness activation="second" revision={2} />));
    expect(host.querySelector("output")?.textContent).toBe("rewrite");
    expect(unavailable).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
