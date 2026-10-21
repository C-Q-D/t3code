/**
 * Exercises diagram availability across lazy loading, mounting, errors, and teardown.
 * @vitest-environment jsdom
 */
import { act, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { MermaidDiagram } from "./MermaidDiagram";

const pele = vi.hoisted(() => ({ detectType: vi.fn(), load: vi.fn(), mount: vi.fn() }));
vi.mock("pele/lazy", () => pele);

/** Releases the external renderer's load without depending on timers or animation frames. */
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

it("reports availability only while a successful diagram is committed", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const loading = deferred<void>();
  const started = deferred<void>();
  const mounts: Array<{ render: () => void; fail: () => void; destroy: ReturnType<typeof vi.fn> }> =
    [];
  pele.detectType.mockReturnValue("flowchart");
  pele.load.mockImplementation(() => {
    started.resolve();
    return loading.promise;
  });
  pele.mount.mockImplementation(
    (
      host: HTMLElement,
      _source: string,
      options: {
        sanitize: (source: string) => Node;
        onRender: () => void;
        onError: (error: Error) => void;
      },
    ) => {
      const mounted = {
        render: () => {
          host.replaceChildren(
            options.sanitize(
              '<svg xmlns="http://www.w3.org/2000/svg"><text fill="var(--pele-fg)">Ready</text></svg>',
            ),
          );
          options.onRender();
        },
        fail: () => options.onError(new Error("Invalid diagram syntax")),
        destroy: vi.fn(() => host.replaceChildren()),
      };
      mounts.push(mounted);
      return mounted;
    },
  );
  const report = vi.fn();
  const content = (source: string, showSource = false) => (
    <Suspense fallback={<p>Loading diagram</p>}>
      {showSource ? (
        <pre>{source}</pre>
      ) : (
        <MermaidDiagram source={source} onExpand={() => {}} onRenderStateChange={report} />
      )}
    </Suspense>
  );
  try {
    await act(async () => root.render(content("graph TD; first-->second")));
    await started.promise;
    expect(container.textContent).toContain("Loading diagram");
    expect(report).not.toHaveBeenCalledWith(true);
    await act(async () => {
      loading.resolve();
      await loading.promise;
    });
    expect(container.querySelector("svg")).toBeNull();
    await act(async () => mounts.at(-1)!.render());
    expect(container.querySelector("svg")?.textContent).toBe("Ready");
    expect(container.querySelector("text")?.getAttribute("fill")).toBe("var(--pele-fg)");
    expect(report).toHaveBeenLastCalledWith(true);

    await act(async () => root.render(content("graph TD; first-->second", true)));
    expect(container.querySelector("svg")).toBeNull();
    expect(mounts[0]!.destroy).toHaveBeenCalledOnce();
    expect(report).toHaveBeenLastCalledWith(false);
    await act(async () => root.render(content("graph TD; first-->second")));
    await act(async () => mounts.at(-1)!.render());
    expect(report).toHaveBeenLastCalledWith(true);

    await act(async () => root.render(content("invalid second diagram")));
    expect(report).toHaveBeenLastCalledWith(false);
    await act(async () => mounts.at(-1)!.fail());
    expect(container.textContent).toContain("Invalid diagram syntax");
    expect(report).toHaveBeenLastCalledWith(false);
    expect(container.querySelector("button[data-mermaid-expand]")?.hasAttribute("hidden")).toBe(
      true,
    );

    await act(async () => root.render(content("graph TD; first-->second")));
    await act(async () => mounts.at(-1)!.render());
    expect(container.querySelector("svg")?.textContent).toBe("Ready");
    expect(report).toHaveBeenLastCalledWith(true);
    await act(async () => root.render(null));
    expect(report).toHaveBeenLastCalledWith(false);
    expect(mounts.at(-1)!.destroy).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  }
});
