/** Verifies lossless Markdown export against all current timeline item variants. */
import {
  OrchestrationV2TurnItemJson,
  ThreadId,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import { transcriptFileName, renderTranscriptItems } from "./transcriptMarkdown.ts";

const threadId = ThreadId.make("thread-export");
const decodeItem = Schema.decodeUnknownSync(OrchestrationV2TurnItemJson);
const base = {
  id: "item-export",
  threadId,
  runId: "run-export",
  nodeId: "node-export",
  providerThreadId: "provider-thread-export",
  providerTurnId: "provider-turn-export",
  nativeItemRef: {
    driver: "codex",
    nativeId: "native-export",
    strength: "strong",
    fingerprint: "fingerprint-export",
    ordinal: 17,
  },
  parentItemId: "parent-export",
  ordinal: 29,
  status: "completed",
  title: "Export title",
  startedAt: "2026-01-02T03:04:05.000Z",
  completedAt: "2026-01-02T03:05:05.000Z",
  updatedAt: "2026-01-02T03:06:05.000Z",
  toolNonExecutionKind: "inspection",
  toolSurface: "browser",
  toolIcon: {
    _tag: "website",
    pageUrl: "https://example.test",
    faviconUrl: "https://example.test/icon",
    faviconUrlDark: "https://example.test/dark",
  },
  toolSource: {
    key: "source-export",
    name: "Export source",
    kind: "integration",
    icon: {
      _tag: "themed-logo",
      logoUrl: "https://example.test/logo",
      logoUrlDark: "https://example.test/logo-dark",
    },
  },
} as const;
const attachment = {
  type: "file",
  id: "attachment-export",
  name: "export.txt",
  mimeType: "text/plain",
  sizeBytes: 31,
  source: { _tag: "pasted-text" },
} as const;
const variants = {
  notification: {
    source: {
      kind: "delegated_task",
      taskIds: ["task-export"],
      childThreadId: "notification-child",
    },
    outcome: "updated",
    summary: "Notification summary",
    detail: "Notification detail",
  },
  user_message: {
    createdBy: "user",
    creationSource: "web",
    messageId: "user-export",
    scheduledTaskId: "scheduled-export",
    senderThreadId: "sender-export",
    inputIntent: "turn_start",
    text: "User export text",
    attachments: [attachment],
    context: {
      version: 1,
      records: [
        {
          version: 1,
          kind: "file",
          contextId: "context-export",
          label: "Context export",
          attachmentId: "attachment-export",
          name: "context.txt",
          mimeType: "text/plain",
          sizeBytes: 37,
        },
      ],
    },
  },
  assistant_message: {
    messageId: "assistant-export",
    text: "Assistant export text",
    attachments: [attachment],
    streaming: true,
  },
  reasoning: { text: "Reasoning export", streaming: true },
  proposed_plan: { planId: "plan-export", markdown: "Plan export", streaming: true },
  todo_list: {
    planId: "todo-export",
    explanation: "Todo explanation",
    steps: [
      {
        id: "step-export",
        text: "Step export",
        status: "completed",
        durationAnchorAt: "2026-01-02T03:04:01.000Z",
        durationMs: 47,
      },
    ],
  },
  user_input_request: {
    requestId: "question-export",
    questions: [
      {
        id: "question-one",
        header: "Question header",
        question: "Question export",
        options: [
          { label: "Option export", description: "Option description", value: "option-value" },
        ],
        multiSelect: true,
        allowCustomAnswer: true,
        initialAnswer: "Initial answer",
        required: true,
      },
    ],
    questionAnswer: {
      requestId: "answer-export",
      questionTextById: { question: "Answer question" },
      answers: { question: "Answer text" },
      attachmentsByQuestionId: { question: [attachment] },
    },
    responseMode: "message",
  },
  file_change: {
    fileName: "changed-export.ts",
    additions: 53,
    deletions: 59,
    diffStr: "Diff export",
    oldStr: "Old export",
    newStr: "New export",
    changes: [
      {
        operation: "rename",
        path: "new-export.ts",
        oldPath: "old-export.ts",
        fileType: "source",
        mimeType: "text/typescript",
      },
    ],
  },
  command_execution: {
    input: "Command export",
    output: "Output export",
    outputOmitted: false,
    outputIndicatesFailure: true,
    exitCode: 61,
  },
  file_search: {
    pattern: "file-pattern-export",
    results: [{ fileName: "found-export.ts", line: 67, column: 71, preview: "File preview" }],
  },
  web_search: {
    patterns: ["web-pattern-export"],
    results: [{ title: "Web title", url: "https://example.test/search", snippet: "Web snippet" }],
  },
  approval_request: {
    requestId: "approval-export",
    requestKind: "command",
    prompt: "Approval prompt",
    appName: "Approval app",
    options: [{ decision: "accept", label: "Approval label", warning: "Approval warning" }],
  },
  checkpoint: {
    checkpointId: "checkpoint-export",
    scopeId: "scope-export",
    files: [{ path: "checkpoint-export.ts", kind: "modified", additions: 73, deletions: 79 }],
  },
  run_interrupt_request: { message: "Interrupt request" },
  run_interrupt_result: { message: "Interrupt result" },
  system_notice: { message: "System notice" },
  error: {
    failure: {
      class: "provider_error",
      message: "Provider failure",
      code: "failure-code",
      retryable: true,
      resetAt: "2026-01-03T01:02:03.000Z",
    },
    retry: { attempt: 83, maxAttempts: 89, retryDelayMs: 97 },
  },
  compaction: {
    driver: "codex",
    summary: "Compaction summary",
    beforeTokenCount: 101,
    afterTokenCount: 103,
  },
  handoff: {
    contextHandoffId: "handoff-export",
    fromProviderThreadIds: ["handoff-source-thread"],
    toProviderThreadId: "handoff-target-thread",
    fromProviderInstanceIds: ["claude"],
    toProviderInstanceId: "codex",
    fromModelSelections: [
      {
        instanceId: "claude",
        model: "source-model",
        options: [{ id: "option-export", value: "option-selection" }],
      },
    ],
    toModel: "target-model",
    strategy: "manual_context",
    summary: "Handoff summary",
  },
  fork: {
    source: { type: "run", threadId: "fork-source-thread", runId: "fork-source-run" },
    targetThreadId: "fork-target-thread",
    providerThreadId: "fork-provider-thread",
  },
  thread_created: {
    targetThreadId: "created-thread",
    targetRunId: "created-run",
    targetProviderInstanceId: "codex",
    targetModel: "created-model",
  },
  secret_request: {
    label: "Secret label",
    reason: "Secret reason",
    placeholder: "Secret placeholder",
    secretStatus: "saved",
  },
  subagent: {
    subagentId: "subagent-export",
    origin: "app_owned",
    driver: "codex",
    providerInstanceId: "codex",
    childThreadId: "child-export",
    prompt: "Subagent prompt",
    progress: "Subagent progress",
    result: "Subagent result",
  },
  dynamic_tool: {
    toolName: "tool-export",
    viewedImagePath: "/image-export.png",
    input: { key: "Tool input" },
    output: { key: "Tool output" },
    outputOmitted: false,
  },
} satisfies Record<OrchestrationV2TurnItem["type"], Record<string, unknown>>;

/** Lists every leaf of value as text or JSON scalar, including null; expectations come only from fixtures. */
function leaves(value: unknown): ReadonlyArray<string> {
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(leaves);
  return [typeof value === "string" ? value : JSON.stringify(value)];
}

/**
 * Decodes type's wire fixture with optional field overrides, empty by default.
 * Returns a local domain row to exercise DateTime encoding; invalid fixtures throw schema errors.
 */
function row(type: OrchestrationV2TurnItem["type"], extra: Record<string, unknown> = {}) {
  const item = decodeItem({ ...base, type, ...variants[type], ...extra });
  return {
    position: 0,
    sourceThreadId: threadId,
    sourceItemId: item.id,
    visibility: "local" as const,
    item,
  };
}

describe("transcript Markdown", () => {
  it.each(Object.keys(variants) as Array<OrchestrationV2TurnItem["type"]>)(
    "preserves every leaf of %s",
    (type) => {
      const fixture = { ...base, type, ...variants[type] };
      const output = renderTranscriptItems(threadId, [row(type)]);
      for (const leaf of leaves(fixture))
        expect(output, `${type}: missing ${leaf}`).toContain(leaf);
      expect(output).toContain(
        `## 1 · ${type} · completed · Export title · 2026-01-02T03:06:05.000Z · run=run-export · item=item-export`,
      );
      expect(output).toContain('"startedAt": "2026-01-02T03:04:05.000Z"');
      expect(output).toContain('"completedAt": "2026-01-02T03:05:05.000Z"');
      expect(output).not.toContain('"updatedAt":');
    },
  );
  it.each([
    { type: "node", nodeId: "fork-node" },
    { type: "provider_thread", providerThreadId: "fork-native", providerTurnId: "fork-turn" },
  ])("preserves fork source $type", (source) => {
    const output = renderTranscriptItems(threadId, [row("fork", { source })]);
    for (const leaf of leaves(source)) expect(output).toContain(leaf);
  });
  it("keeps ordering, ancestry and raw message fences longer than all embedded backticks", () => {
    const first = row("user_message", { text: "First ``` and ````` end" });
    const second = {
      ...row("dynamic_tool", { input: "JSON ``````` end" }),
      sourceThreadId: ThreadId.make("ancestor-export"),
    };
    const output = renderTranscriptItems(threadId, [first, second]);
    expect(output).toContain("``````\nFirst ``` and ````` end\n``````");
    expect(output).toContain("````````json\n");
    expect(output).toContain("## 2 · dynamic_tool");
    expect(output).toContain("· from=ancestor-export");
    expect(output.indexOf("User export")).toBe(-1);
    expect(output.indexOf("## 1")).toBeLessThan(output.indexOf("## 2"));
  });
});

describe("transcript filename", () => {
  it("preserves UUIDs", () =>
    expect(transcriptFileName("123e4567-e89b-12d3-a456-426614174000")).toBe(
      "123e4567-e89b-12d3-a456-426614174000.md",
    ));
  it("hashes changed identifiers and avoids cleaned-name collisions", () => {
    expect(transcriptFileName("a:b")).toMatch(/^a_b-[a-f0-9]{8}\.md$/);
    expect(transcriptFileName("a:b")).not.toBe(transcriptFileName("a_b"));
    expect(transcriptFileName("a_b")).toBe("a_b.md");
  });
  it("removes trailing dots and bounds the stem while retaining a hash", () => {
    expect(transcriptFileName("thread.")).toMatch(/^thread-[a-f0-9]{8}\.md$/);
    expect(transcriptFileName("x".repeat(140))).toMatch(/^x{91}-[a-f0-9]{8}\.md$/);
  });
});
