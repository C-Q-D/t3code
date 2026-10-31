/** Checks work-log grouping and display contracts across default and injected messages. */
import { englishWorkLogMessages } from "./messages.ts";
import { describe, expect, it } from "vite-plus/test";

import { ThreadId, TurnItemId, type OrchestrationV2TurnItem } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import {
  contextCompactionLabel,
  contextCompactionTokenCounts,
  workEntryViewedImagePath,
  toolGroupAction,
  resolveViewedImageAsset,
  summarizeToolGroup,
  toolGroupSummaryKind,
  liveThoughtLine,
  resolveWorkEntryToolPresentation,
  toolItemForDisplay,
  type WorkLogPresentationEntry,
  workEntryIndicatesToolFailure,
  workEntryDisplayIndicatesToolFailure,
} from "./presentation.js";

/** Creates a valid command item with explicit overrides for failure-presentation assertions. */
function commandItem(
  fields: Partial<Extract<OrchestrationV2TurnItem, { type: "command_execution" }>> = {},
): OrchestrationV2TurnItem {
  return {
    id: TurnItemId.make("command"),
    threadId: ThreadId.make("thread"),
    runId: null,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: 1,
    status: "completed",
    title: null,
    startedAt: null,
    completedAt: null,
    updatedAt: DateTime.makeUnsafe("2026-09-08T00:00:00.000Z"),
    type: "command_execution",
    input: 'rg "command not found"',
    ...fields,
  };
}

describe("workEntryIndicatesToolFailure", () => {
  const base = {
    id: "w1",
    createdAt: "2026-01-01T00:00:00.000Z",
    label: "Read",
  };

  it.each([
    [{ exitCode: 2 }, true],
    [{ output: "sh: missing-command: command not found" }, true],
    [{ output: `${"x".repeat(32_768)} command not found` }, false],
  ] as const)(
    "preserves command failure state after removing displayed output: %j",
    (fields, failed) => {
      const structuredPayload = commandItem(fields);
      const entry: WorkLogPresentationEntry = {
        ...base,
        tone: "tool",
        itemType: "command_execution",
        toolLifecycleStatus: "completed",
        structuredPayload,
      };
      expect(workEntryDisplayIndicatesToolFailure(entry)).toBe(failed);
      expect(JSON.stringify(toolItemForDisplay(structuredPayload))).not.toContain('"output":');
    },
  );

  it.each([
    "logs/app.log:12: Error: ENOENT: no such file or directory",
    "fixtures/ci.txt:3: Process exited with exit code 2",
  ])("trusts a zero exit code over failure text in the output and command: %s", (output) => {
    const entry: WorkLogPresentationEntry = {
      ...base,
      tone: "tool",
      itemType: "command_execution",
      toolLifecycleStatus: "completed",
      command: 'rg -n "ENOENT|exit code" logs fixtures',
      structuredPayload: commandItem({ output, exitCode: 0, outputIndicatesFailure: true }),
    };
    expect(workEntryIndicatesToolFailure(entry)).toBe(false);
    expect(workEntryDisplayIndicatesToolFailure(entry)).toBe(false);
  });

  it("ignores failure phrases in reasoning text", () => {
    const entry: WorkLogPresentationEntry = {
      ...base,
      label: "Thinking",
      tone: "thinking",
      itemType: "reasoning",
      toolLifecycleStatus: "completed",
      detail: "That exit code 2 is just from listing the deleted directory, which is expected.",
    };
    expect(workEntryIndicatesToolFailure(entry)).toBe(false);
    expect(workEntryDisplayIndicatesToolFailure(entry)).toBe(false);
  });

  it("does not treat error text in a command as rendered failure", () => {
    const entry = {
      ...base,
      label: "Ran command",
      tone: "tool",
      toolLifecycleStatus: "completed",
      command: 'rg "file not found"',
      detail: "Found 3 matches",
    } satisfies WorkLogPresentationEntry;

    expect(workEntryDisplayIndicatesToolFailure(entry)).toBe(false);

    expect(workEntryIndicatesToolFailure(entry)).toBe(true);
    expect(workEntryDisplayIndicatesToolFailure({ ...entry, detail: "File not found" })).toBe(true);
  });
});

describe("resolveWorkEntryToolPresentation", () => {
  it.each([
    ["t3_queue", "cancel", "Requested cancellation of a queued run"],
    ["preview_act", "click", "Clicked in the preview browser"],
    ["t3_pending_request", "respond", "Answered pending questions"],
    ["t3_thread_transfer", "merge_back", "Requested a merge of thread context"],
  ])("keeps the resolved action with default messages: %s/%s", (label, action, expected) => {
    expect(
      resolveWorkEntryToolPresentation({
        label,
        toolLifecycleStatus: "completed",
        toolData: { arguments: { action } },
      })?.displayName,
    ).toBe(expected);
  });

  it.each([
    ["t3_queue", "cancel", "t3_queue_cancel"],
    ["preview_act", "click", "preview_click"],
    ["t3_pending_request", "respond", "t3_pending_request_respond"],
    ["t3_thread_transfer", "merge_back", "t3_thread_merge_back"],
  ] as const)("localizes the resolved action: %s/%s", (label, action, translatedId) => {
    const messages = {
      ...englishWorkLogMessages.t3Tools,
      labels: {
        ...englishWorkLogMessages.t3Tools.labels,
        [translatedId]: ["执行", "正在执行", "已执行", "具体动作"] as const,
        [label]: ["管理", "正在管理", "已管理", "通用工具"] as const,
      },
    };
    expect(
      resolveWorkEntryToolPresentation(
        {
          label,
          toolLifecycleStatus: "completed",
          toolData: { arguments: { action } },
        },
        undefined,
        messages,
      )?.displayName,
    ).toBe("已执行 具体动作");
  });

  it("keeps the resolved label when a locale has no action translation", () => {
    const labels = { ...englishWorkLogMessages.t3Tools.labels };
    Reflect.deleteProperty(labels, "preview_click");
    expect(
      resolveWorkEntryToolPresentation(
        {
          label: "preview_act",
          toolLifecycleStatus: "completed",
          toolData: { arguments: { action: "click" } },
        },
        undefined,
        { ...englishWorkLogMessages.t3Tools, labels },
      )?.displayName,
    ).toBe("Clicked in the preview browser");
  });

  it("shows returned MCP errors as failures even in the live activity row", () => {
    const entry: WorkLogPresentationEntry = {
      id: "clone",
      createdAt: "2026-09-19T00:00:00.000Z",
      tone: "tool",
      label: "T3-code.t3_project_clone",
      toolLifecycleStatus: "inProgress",
      itemType: "dynamic_tool",
      toolData: { output: { isError: true } },
    };
    expect(resolveWorkEntryToolPresentation(entry)?.displayName).toBe(
      "Failed to clone a repository",
    );
    expect(workEntryDisplayIndicatesToolFailure(entry)).toBe(true);
    const childFailure = {
      ...entry,
      label: "T3-code.task_status",
      toolLifecycleStatus: "completed" as const,
      toolData: { output: { taskId: "child", status: "failed", summary: "command not found" } },
    };
    expect(workEntryDisplayIndicatesToolFailure(childFailure)).toBe(false);
  });
  it.each([
    "mcp__t3-code__preview_click",
    "mcp__t3_code__preview_click",
    "mcp__t3code__preview_click",
    "T3-code.preview_click",
    "t3-code · preview_click completed",
    "t3_code/preview_click",
    "preview_click",
  ])("recognizes browser tool names across providers: %s", (label) => {
    expect(resolveWorkEntryToolPresentation({ label })).toEqual({
      displayName: "Clicking in the preview browser",
      icon: "browser",
    });
  });

  it("uses structured MCP identity when the provider supplies a custom title", () => {
    expect(
      resolveWorkEntryToolPresentation({
        label: "Tool call complete",
        toolTitle: "Inspect the current page",
        toolData: { server: "t3-code", tool: "preview_snapshot", result: { title: "Example" } },
      }),
    ).toEqual({ displayName: "Taking a snapshot of the preview page", icon: "browser" });
  });

  it("uses the summary's state only when the provider omitted a lifecycle status", () => {
    const entry = { label: "T3-code.preview_click" };
    expect(resolveWorkEntryToolPresentation(entry, "inProgress")?.displayName).toBe(
      "Clicking in the preview browser",
    );
    expect(resolveWorkEntryToolPresentation(entry, "completed")?.displayName).toBe(
      "Clicked in the preview browser",
    );
    expect(
      resolveWorkEntryToolPresentation({ ...entry, toolLifecycleStatus: "completed" }, "inProgress")
        ?.displayName,
    ).toBe("Clicked in the preview browser");
    expect(
      resolveWorkEntryToolPresentation({ ...entry, toolLifecycleStatus: "failed" }, "completed")
        ?.displayName,
    ).toBe("Failed to click in the preview browser");
  });

  it.each([
    ["https://github.com/acme/web/pull/7", "PR #7"],
    ["https://gitlab.com/acme/web/-/merge_requests/7", "MR #7"],
  ])("names a linked change request with its host's term (%s)", (url, target) => {
    expect(
      resolveWorkEntryToolPresentation({
        label: "T3-code.link_pull_request",
        toolLifecycleStatus: "completed",
        toolData: { arguments: { url } },
      })?.displayName,
    ).toMatch(new RegExp(` ${target}$`));
  });

  it("does not brand unknown tools or another server's matching tool name", () => {
    for (const label of [
      "mcp__github__preview_click",
      "t3-code.unknown_tool",
      "t3-code.toString",
      "Search files",
    ]) {
      expect(resolveWorkEntryToolPresentation({ label })).toBeNull();
    }
    expect(
      resolveWorkEntryToolPresentation({
        label: "preview_click",
        toolData: { server: "another-server", tool: "preview_click" },
      }),
    ).toBeNull();
  });
});

describe("workEntryViewedImagePath", () => {
  const entry = {
    id: "entry-1",
    createdAt: "2026-01-01T00:00:00Z",
    label: "Read",
    tone: "tool",
  } as const;

  it("returns a single image path from supported read entries", () => {
    expect(
      workEntryViewedImagePath({ ...entry, requestKind: "file-read", detail: " assets/a.png " }),
    ).toBe("assets/a.png");
    expect(
      workEntryViewedImagePath({
        ...entry,
        itemType: "dynamic_tool",
        toolTitle: "Read file",
        detail: "C:\\workspace\\a.webp",
      }),
    ).toBe("C:\\workspace\\a.webp");
    expect(
      workEntryViewedImagePath({
        ...entry,
        itemType: "dynamic_tool",
        detail: 'Read: {"file_path":"truncated..."}',
        viewedImagePath: " /workspace/reference image.webp ",
      }),
    ).toBe("/workspace/reference image.webp");
  });

  it("rejects non-image, multi-line, and non-read details", () => {
    expect(
      workEntryViewedImagePath({ ...entry, requestKind: "file-read", detail: "a.txt" }),
    ).toBeNull();
    expect(
      workEntryViewedImagePath({ ...entry, requestKind: "file-read", detail: "a.png\nb.png" }),
    ).toBeNull();
    expect(workEntryViewedImagePath({ ...entry, detail: "a.png" })).toBeNull();
  });
});

describe("toolGroupAction", () => {
  it("groups legacy Claude image reads with other reads", () => {
    expect(
      toolGroupAction({
        id: "legacy-read",
        createdAt: "2026-09-01T00:00:00Z",
        label: "Tool call",
        tone: "tool",
        itemType: "dynamic_tool",
        viewedImagePath: "/workspace/reference.png",
      }),
    ).toBe("read");
  });

  it("groups Claude Read and Grep from toolName, not file contents", () => {
    expect(
      toolGroupAction({
        id: "read",
        createdAt: "2026-09-01T00:00:00Z",
        label: "Read",
        tone: "tool",
        itemType: "dynamic_tool",
        toolTitle: "Read",
        toolData: { input: { file_path: "src/env.ts" } },
        structuredPayload: {
          type: "dynamic_tool",
          toolName: "Read",
          input: { file_path: "src/env.ts" },
        } as NonNullable<WorkLogPresentationEntry["structuredPayload"]>,
      }),
    ).toBe("read");
    expect(
      toolGroupAction({
        id: "grep",
        createdAt: "2026-09-01T00:00:00Z",
        label: "Grep",
        tone: "tool",
        itemType: "dynamic_tool",
        toolTitle: "Grep",
        toolData: { input: { pattern: "TODO", path: "apps/web" } },
        structuredPayload: {
          type: "dynamic_tool",
          toolName: "Grep",
          input: { pattern: "TODO", path: "apps/web" },
        } as NonNullable<WorkLogPresentationEntry["structuredPayload"]>,
      }),
    ).toBe("code-search");
  });
});

describe("resolveViewedImageAsset", () => {
  const threadId = ThreadId.make("thread-1");

  it("serves t3 attachment paths in place like any other host path", () => {
    const path = "/Users/demo/.t3/dev/attachments/11111111-1111-4111-8111-111111111111.png";
    expect(resolveViewedImageAsset(path, { threadId, workspaceRoot: "/workspace" })).toEqual({
      resource: { _tag: "media-file", threadId, path },
      alt: "11111111-1111-4111-8111-111111111111.png",
      srcFragment: "",
    });
  });

  it("normalizes workspace image sources", () => {
    expect(
      resolveViewedImageAsset("screens/logo.svg?v=2#mark", {
        threadId,
        workspaceRoot: "/workspace",
      }),
    ).toEqual({
      resource: {
        _tag: "media-file",
        threadId,
        path: "/workspace/screens/logo.svg",
      },
      alt: "logo.svg",
      srcFragment: "#mark",
    });
    expect(resolveViewedImageAsset("https://example.com/logo.png", { threadId })).toBeNull();
  });
});

describe("pull request tool presentation", () => {
  it.each([
    "mcp__t3-code__link_pull_request",
    "mcp__t3_code__link_pull_request",
    "T3-code · link_pull_request",
    "t3code/link_pull_request",
    "link_pull_request",
  ])("recognizes the native linking tool: %s", (label) => {
    const entry: WorkLogPresentationEntry = {
      id: "link",
      createdAt: "2026-09-10T00:00:00.000Z",
      label,
      tone: "tool",
      toolLifecycleStatus: "completed",
    };
    expect(resolveWorkEntryToolPresentation(entry)).toMatchObject({
      displayName: "Linked a pull request",
      icon: "pull-request",
    });
    expect(toolGroupAction(entry)).toBe("link-pr");
  });

  it.each([
    ["inProgress", "Linking PR #42"],
    ["completed", "Linked PR #42"],
    ["failed", "Failed to link PR #42"],
    ["declined", "Declined to link PR #42"],
    ["stopped", "Stopped linking PR #42"],
  ] as const)("describes the target and %s status", (toolLifecycleStatus, displayName) => {
    expect(
      resolveWorkEntryToolPresentation({
        label: "MCP tool call",
        toolTitle: "Custom title",
        toolLifecycleStatus,
        toolData: {
          server: "t3-code",
          tool: "link_pull_request",
          arguments: { url: "https://github.com/acme/web/pull/42" },
        },
      })?.displayName,
    ).toBe(displayName);
  });

  it("recognizes unlink targets supplied as repository and number", () => {
    expect(
      resolveWorkEntryToolPresentation({
        label: "MCP tool call",
        toolLifecycleStatus: "completed",
        toolData: {
          toolName: "mcp__t3-code__unlink_pull_request",
          rawInput: { repository: "acme/web", number: 42 },
        },
      }),
    ).toMatchObject({ displayName: "Unlinked PR #42", icon: "pull-request", action: "unlink-pr" });
  });

  it("summarizes native PR work separately from ordinary tools and integration metadata", () => {
    const link: WorkLogPresentationEntry = {
      id: "link",
      createdAt: "2026-09-10T00:00:00.000Z",
      label: "T3-code · link_pull_request",
      tone: "tool",
      itemType: "dynamic_tool",
      toolLifecycleStatus: "completed",
      toolSource: { key: "t3-code", name: "T3 Code", kind: "integration" },
    };
    const list: WorkLogPresentationEntry = {
      ...link,
      label: "T3-code · list_thread_pull_requests",
    };
    expect(summarizeToolGroup([link, link, list]).summary).toBe(
      "Linked 2 pull requests and checked linked pull requests",
    );
    expect(summarizeToolGroup([{ ...link, label: "T3-code · unlink_pull_request" }]).summary).toBe(
      "Unlinked 1 pull request",
    );
    expect(toolGroupSummaryKind([link, link, list])).toBe("pull-request");
    expect(summarizeToolGroup([list, list]).summary).toBe("Checked linked pull requests 2 times");
    expect(
      resolveWorkEntryToolPresentation({ label: "mcp__another-server__link_pull_request" }),
    ).toBeNull();
  });
});

describe("device group summaries", () => {
  const deviceEntry = (tool: string): WorkLogPresentationEntry => ({
    id: tool,
    createdAt: "2026-09-10T00:00:00.000Z",
    label: "MCP tool call",
    toolData: { server: "t3-code", tool },
    itemType: "dynamic_tool",
    toolLifecycleStatus: "completed",
    tone: "tool",
  });

  it.each(["device_list", "device_open", "device_screenshot", "device_close"])(
    "recognizes %s as device controls",
    (tool) => {
      const entry = deviceEntry(tool);
      expect(summarizeToolGroup([entry]).summary).toBe("Used device controls 1 time");
      expect(toolGroupSummaryKind([entry])).toBe("device");
    },
  );

  it("summarizes device calls alongside shell commands", () => {
    expect(
      summarizeToolGroup([
        {
          id: "command",
          createdAt: "2026-09-10T00:00:00.000Z",
          label: "Ran command",
          itemType: "command_execution",
          command: "pwd",
          tone: "tool",
        },
        deviceEntry("device_list"),
        deviceEntry("device_open"),
      ]).summary,
    ).toBe("Ran 1 command and used device controls 2 times");
  });

  it("recognizes Claude tool names and preserves screenshot previews", () => {
    const entry = {
      ...deviceEntry("device_screenshot"),
      toolData: { toolName: "mcp__t3_code__device_screenshot" },
      viewedImagePath: "/workspace/device.png",
    };
    expect(summarizeToolGroup([entry]).summary).toBe("Used device controls 1 time");
    expect(workEntryViewedImagePath(entry)).toBe("/workspace/device.png");
  });

  it("does not classify another server's tools as T3 device controls", () => {
    expect(
      summarizeToolGroup([
        {
          ...deviceEntry("device_open"),
          toolData: { server: "another-server", tool: "device_open" },
        },
      ]).summary,
    ).toBe("Used 1 tool");
  });
});

describe("English work-log compatibility", () => {
  const entry = (fields: Partial<WorkLogPresentationEntry>): WorkLogPresentationEntry => ({
    id: "compat",
    createdAt: "2026-09-01T00:00:00Z",
    label: "Unknown",
    tone: "tool",
    ...fields,
  });
  it.each([
    [
      { label: "t3-code.link_pull_request", toolLifecycleStatus: "completed" },
      "Linked 1 pull request",
      "Linked 2 pull requests",
    ],
    [
      { label: "t3-code.unlink_pull_request", toolLifecycleStatus: "completed" },
      "Unlinked 1 pull request",
      "Unlinked 2 pull requests",
    ],
    [
      { label: "t3-code.watch_pull_request", toolLifecycleStatus: "completed" },
      "Watching 1 pull request",
      "Watching 2 pull requests",
    ],
    [
      { label: "t3-code.unwatch_pull_request", toolLifecycleStatus: "completed" },
      "Stopped watching 1 pull request",
      "Stopped watching 2 pull requests",
    ],
    [
      { label: "t3-code.list_thread_pull_requests", toolLifecycleStatus: "completed" },
      "Checked linked pull requests",
      "Checked linked pull requests 2 times",
    ],
    [
      { label: "t3-code.preview_click", toolLifecycleStatus: "completed" },
      "Used browser 1 time",
      "Used browser 2 times",
    ],
    [
      { label: "t3-code.device_open", toolLifecycleStatus: "completed" },
      "Used device controls 1 time",
      "Used device controls 2 times",
    ],
    [{ requestKind: "file-read" }, "Read 1 file", "Read 2 files"],
    [{ itemType: "file_change" }, "Changed 1 file", "Changed 2 files"],
    [{ itemType: "command_execution" }, "Ran 1 command", "Ran 2 commands"],
    [{ itemType: "thread_created" }, "Created 1 thread", "Created 2 threads"],
    [{ itemType: "web_search" }, "Searched the web 1 time", "Searched the web 2 times"],
    [{ itemType: "file_search" }, "Searched code 1 time", "Searched code 2 times"],
    [{ itemType: "dynamic_tool" }, "Used 1 tool", "Used 2 tools"],
    [{ tone: "info" }, "Received 1 update", "Received 2 updates"],
  ] as const)("preserves whole sentences for %j", (fields, one, two) => {
    expect(summarizeToolGroup([entry(fields)]).summary).toBe(one);
    expect(summarizeToolGroup([entry(fields), entry(fields)]).summary).toBe(two);
  });
  it.each([
    [["Alpha"], "Used Alpha", "Used Alpha integration"],
    [["Alpha", "Beta"], "Used Alpha and Beta", "Used Alpha and Beta integrations"],
    [
      ["Alpha", "Beta", "Gamma"],
      "Used Alpha, Beta, and Gamma",
      "Used Alpha, Beta, and Gamma integrations",
    ],
  ] as const)("preserves named-source punctuation for %j", (names, plain, integrations) => {
    expect(
      summarizeToolGroup(
        names.map((name) => entry({ toolSource: { key: name, name, kind: "browser" } })),
      ).summary,
    ).toBe(plain);
    expect(
      summarizeToolGroup(
        names.map((name) => entry({ toolSource: { key: name, name, kind: "integration" } })),
      ).summary,
    ).toBe(integrations);
  });
  it.each([1, 2])("counts omitted categories: %s", (count) => {
    expect(
      summarizeToolGroup([
        entry({ itemType: "command_execution" }),
        entry({ itemType: "file_change" }),
        ...Array.from({ length: count }, () => entry({ requestKind: "file-read" })),
      ]).summary,
    ).toBe(
      count === 1
        ? "Ran 1 command, changed 1 file, and performed 1 other action"
        : "Ran 1 command, changed 1 file, and performed 2 other actions",
    );
  });
  it.each([
    ["failed", "Context compaction failed"],
    ["cancelled", "Context compaction stopped"],
    ["interrupted", "Context compaction stopped"],
    ["pending", "Compacting context"],
    ["running", "Compacting context"],
    ["waiting", "Compacting context"],
  ] as const)("shows compaction status %s ahead of retained token counts", (status, expected) => {
    expect(contextCompactionLabel({ status, beforeTokenCount: 2000, afterTokenCount: 1000 })).toBe(
      expected,
    );
  });

  it("withholds compaction token counts while running", () => {
    expect(
      contextCompactionTokenCounts({
        status: "running",
        beforeTokenCount: 2000,
        afterTokenCount: 1000,
      }),
    ).toBeNull();
  });

  it("preserves compaction states and token formatting", () => {
    expect(contextCompactionLabel({ status: "running" })).toBe("Compacting context");
    expect(contextCompactionLabel({ status: "completed" })).toBe("Context compacted");
    expect(
      contextCompactionLabel({
        status: "completed",
        beforeTokenCount: 2000,
        afterTokenCount: 1000,
      }),
    ).toBe("Context compacted 2K → 1K tokens");
  });
});

it("passes localized T3 sentences into mixed summaries while preserving failure state", () => {
  const messages = {
    ...englishWorkLogMessages,
    groupAction: { ...englishWorkLogMessages.groupAction, read: (count: number) => `读 ${count}` },
    joinSummary: (parts: readonly string[]) => parts.join("；"),
    t3Tools: {
      ...englishWorkLogMessages.t3Tools,
      summary: {
        ...englishWorkLogMessages.t3Tools.summary,
        "project-list": (count: number, succeeded: boolean) =>
          `${succeeded ? "已列出" : "尝试列出"}项目 ${count}`,
      },
    },
  };
  expect(
    summarizeToolGroup(
      [
        {
          id: "read",
          createdAt: "2026-01-01T00:00:00Z",
          tone: "tool",
          label: "Read",
          requestKind: "file-read",
        },
        {
          id: "t3",
          createdAt: "2026-01-01T00:00:01Z",
          tone: "tool",
          label: "T3-code.t3_project_list",
          toolLifecycleStatus: "failed",
        },
      ],
      messages,
    ),
  ).toEqual({ summary: "读 1；尝试列出项目 1", hasFailure: true });
});
describe("liveThoughtLine", () => {
  it("keeps the first sentence, including a closing quote", () => {
    expect(
      liveThoughtLine(
        'Found the cause: the repo has no commits, so `git worktree add` fails with "invalid reference: main." Now checking the UI.',
      ),
    ).toBe(
      'Found the cause: the repo has no commits, so git worktree add fails with "invalid reference: main."',
    );
  });

  it("does not cut at dots inside file names or long dashes", () => {
    expect(
      liveThoughtLine("I read ThreadLaunchService.ts \u2014 it skips the fetch. Next step."),
    ).toBe("I read ThreadLaunchService.ts \u2014 it skips the fetch.");
  });

  it("uses a bold-only opening line as the whole line", () => {
    expect(
      liveThoughtLine("**Narrowing dispatch files**\n\nI should check the adapter. Then more."),
    ).toBe("Narrowing dispatch files");
    expect(liveThoughtLine("**Narrowing dispatch files**\r\n\r\nI should check the adapter.")).toBe(
      "Narrowing dispatch files",
    );
  });

  it("returns unpunctuated text whole and flattens markdown", () => {
    expect(liveThoughtLine("- Checking [the docs](https://x.dev) for **limits**")).toBe(
      "Checking the docs for limits",
    );
    expect(liveThoughtLine("This is *really* ~~not~~ _fine_ in snake_case_names.")).toBe(
      "This is really not fine in snake_case_names.",
    );
    expect(liveThoughtLine("   ")).toBe("");
  });
});
