/** Renders full domain timeline items and stable filenames; performs no reads or writes. */
// @effect-diagnostics-next-line nodeBuiltinImport:off - filename hashing is synchronous and has no service lifecycle.
import * as NodeCrypto from "node:crypto";
import {
  OrchestrationV2TurnItemJson,
  type OrchestrationV2ProjectedTurnItem,
  type ThreadId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const encodeItem = Schema.encodeSync(OrchestrationV2TurnItemJson);

/**
 * Creates a safe Markdown basename from the complete thread identifier.
 * @param threadId Original nonempty identifier; changed or shortened names receive an eight-digit SHA-256 suffix.
 * @returns A basename with a stem of at most 100 characters and a .md extension. No filesystem access occurs.
 */
export function transcriptFileName(threadId: string) {
  const cleaned = threadId.replace(/[^A-Za-z0-9._-]/g, "_").replace(/[. ]+$/, "");
  const needsHash = cleaned !== threadId || cleaned.length > 100;
  const hash = NodeCrypto.createHash("sha256").update(threadId).digest("hex").slice(0, 8);
  const stem = needsHash ? `${cleaned.slice(0, 91).replace(/[. ]+$/, "")}-${hash}` : cleaned;
  return `${stem}.md`;
}

/**
 * Wraps content without escaping it; the fence exceeds every embedded backtick run.
 * @param content Complete raw text or serialized JSON; empty strings are allowed.
 * @param language Optional fence language, empty for messages and json for metadata.
 * @returns A closed fenced block that cannot be closed by embedded backticks.
 */
function fence(content: string, language = "") {
  const longest = Array.from(content.matchAll(/`+/g), (match) => match[0].length).reduce(
    (max, length) => Math.max(max, length),
    0,
  );
  const delimiter = "`".repeat(Math.max(3, longest + 1));
  return `${delimiter}${language}\n${content}\n${delimiter}`;
}

/**
 * Renders every supplied row in its input order without truncation or type filtering.
 * @param threadId Thread whose timeline is being rendered; inherited rows receive a from= label.
 * @param items Complete domain rows, already ordered by getTimelinePage. Empty input yields an empty string.
 * @returns Markdown sections numbered from one. updatedAt labels each section; other timestamps stay in JSON.
 * @throws Schema encoding errors for invalid domain items; callers must fail export instead of dropping a row.
 */
export function renderTranscriptItems(
  threadId: ThreadId,
  items: ReadonlyArray<OrchestrationV2ProjectedTurnItem>,
) {
  return items
    .map(({ sourceThreadId, item }, index) => {
      const { id, type, status, title, runId, updatedAt, ...fields } = encodeItem(item);
      const header = `## ${index + 1} · ${type} · ${status} · ${title ?? ""} · ${updatedAt} · run=${runId ?? ""} · item=${id}${sourceThreadId === threadId ? "" : ` · from=${sourceThreadId}`}`;
      if (
        (type === "user_message" || type === "assistant_message") &&
        "text" in fields &&
        typeof fields.text === "string"
      ) {
        const { text, ...metadata } = fields;
        return `${header}\n\n${fence(text)}\n\n${fence(JSON.stringify(metadata, null, 2), "json")}`;
      }
      return `${header}\n\n${fence(JSON.stringify(fields, null, 2), "json")}`;
    })
    .join("\n\n");
}
