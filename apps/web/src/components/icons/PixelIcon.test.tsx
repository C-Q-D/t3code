/** Guards sprite addressing, hidden unknown names, and accessible-name transitions. */
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { PixelIcon } from "./PixelIcon";
import { getPixelIconSymbolId } from "./pixelSprites";

let renderer: ReactTestRenderer | undefined;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

describe("pixel symbol addressing", () => {
  it.each([
    ["codex", "px-codex"],
    ["codex-think", "px-codex-think"],
    ["codex-wait", "px-codex-wait"],
    ["codex-done", "px-codex-done"],
    ["codex-error", "px-codex-error"],
    ["claude", "px-claude"],
    ["claude-think", "px-claude-think"],
    ["claude-wait", "px-claude-wait"],
    ["claude-done", "px-claude-done"],
    ["claude-error", "px-claude-error"],
    ["agent", "px-agent"],
    ["claude-sub1", "px-claude-sub1"],
    ["claude-sub2", "px-claude-sub2"],
    ["claude-sub3", "px-claude-sub3"],
    ["codex-sub1", "px-codex-sub1"],
    ["codex-sub2", "px-codex-sub2"],
    ["codex-sub3", "px-codex-sub3"],
    ["subagent", "px-subagent"],
    ["think", "px-think"],
    ["spark", "px-spark"],
  ])("resolves %s to %s", (name, expectedId) => {
    expect(getPixelIconSymbolId(name)).toBe(expectedId);
  });

  it.each(["codex-unknown", "constructor", "__proto__", ""])(
    "does not resolve unknown name %j",
    (name) => {
      expect(getPixelIconSymbolId(name)).toBeUndefined();
    },
  );
});

it("hides unknown runtime names instead of emitting a broken use reference", async () => {
  await act(async () => {
    // @ts-expect-error Deliberately simulate an untyped runtime caller.
    renderer = create(<PixelIcon name="constructor" />);
  });
  expect(renderer!.toJSON()).toBeNull();
});

it("switches between decorative and named artwork while keeping one use node", async () => {
  await act(async () => {
    renderer = create(<PixelIcon name="claude-wait" />);
  });
  expect(renderer!.root.findByType("svg").props["aria-hidden"]).toBe(true);
  expect(renderer!.root.findByType("svg").props["aria-label"]).toBeUndefined();
  expect(renderer!.root.findByType("svg").children).toHaveLength(1);
  expect(renderer!.root.findByType("use").props.href).toBe("#px-claude-wait");

  await act(async () => {
    renderer!.update(<PixelIcon name="claude-wait" title="Claude waiting for approval" />);
  });
  expect(renderer!.root.findByType("svg").props["aria-label"]).toBe("Claude waiting for approval");
  expect(renderer!.root.findByType("svg").props.role).toBe("img");
  expect(renderer!.root.findByType("svg").props["aria-hidden"]).toBeUndefined();
  expect(renderer!.root.findByType("svg").children).toHaveLength(1);

  await act(async () => {
    renderer!.update(<PixelIcon name="claude-wait" title="" />);
  });
  expect(renderer!.root.findByType("svg").props["aria-hidden"]).toBe(true);
  expect(renderer!.root.findByType("svg").props["aria-label"]).toBeUndefined();
  expect(renderer!.root.findByType("svg").props.role).toBeUndefined();
});
