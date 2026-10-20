/**
 * Exercises committed diagram availability through asynchronous rendering and teardown.
 * @vitest-environment jsdom
 */
import { act, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

import { MermaidDiagram } from "./MermaidDiagram";

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: mermaid }));

/** Lets the test release a library render or await its start without timers. */
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

it("reports availability only while a successful diagram is committed", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const first = deferred<{ svg: string }>();
  const second = deferred<{ svg: string }>();
  const started = deferred<void>();
  const secondStarted = deferred<void>();
  mermaid.render
    .mockImplementationOnce(() => {
      started.resolve();
      return first.promise;
    })
    .mockImplementationOnce(() => {
      secondStarted.resolve();
      return second.promise;
    });
  let available = false;
  const report = vi.fn((rendered: boolean) => {
    available = rendered;
  });
  const content = (source: string, showSource = false) => (
    <Suspense fallback={<p>Loading diagram</p>}>
      {showSource ? (
        <pre>{source}</pre>
      ) : (
        <MermaidDiagram
          source={source}
          theme="light"
          onExpand={() => {}}
          onRenderStateChange={report}
        />
      )}
    </Suspense>
  );
  try {
    await act(async () => root.render(content("graph TD; first-->second")));
    await started.promise;
    expect(container.textContent).toContain("Loading diagram");
    expect(available).toBe(false);
    expect(report).not.toHaveBeenCalledWith(true);

    await act(async () => {
      first.resolve({ svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Ready</text></svg>' });
      await first.promise;
    });
    expect(container.querySelector("svg")?.textContent).toBe("Ready");
    expect(report).toHaveBeenLastCalledWith(true);
    expect(available).toBe(true);

    // The parent switches to source by unmounting the diagram.
    await act(async () => root.render(content("graph TD; first-->second", true)));
    expect(container.querySelector("svg")).toBeNull();
    expect(report).toHaveBeenLastCalledWith(false);
    expect(available).toBe(false);

    await act(async () => root.render(content("graph TD; first-->second")));
    expect(available).toBe(true);
    await act(async () => root.render(content("invalid second diagram")));
    await secondStarted.promise;
    expect(container.textContent).toContain("Loading diagram");
    expect(available).toBe(false);
    await act(async () => {
      second.reject(new Error("Invalid diagram syntax"));
      await second.promise.catch(() => {});
    });
    expect(container.textContent).toContain("Invalid diagram syntax");
    expect(report).toHaveBeenLastCalledWith(false);
    expect(available).toBe(false);

    await act(async () => root.render(content("graph TD; first-->second")));
    expect(available).toBe(true);
    await act(async () => root.unmount());
    expect(report).toHaveBeenLastCalledWith(false);
    expect(available).toBe(false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
