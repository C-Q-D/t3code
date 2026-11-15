import type { Root, RootContent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

const parser = unified().use(remarkParse).use(remarkGfm);
const MAX_BODY_LENGTH = 512_000;

function protectedValues(text: string): string[] {
  const values: string[] = [];
  const tree = parser.parse(text);
  const definitions = new Map<string, string>();
  const collectDefinitions = (node: Root | RootContent): void => {
    if (node.type === "definition" && !definitions.has(node.identifier))
      definitions.set(node.identifier, node.url);
    if ("children" in node) node.children.forEach(collectDefinitions);
  };
  collectDefinitions(tree);
  const visit = (node: Root | RootContent): void => {
    if (node.type === "code")
      values.push(JSON.stringify(["code", node.lang, node.meta, node.value]));
    if (node.type === "inlineCode") values.push(JSON.stringify(["inlineCode", node.value]));
    if (node.type === "link" || node.type === "image") {
      values.push(JSON.stringify(["destination", node.url]));
    }
    if (node.type === "linkReference" || node.type === "imageReference") {
      const destination = definitions.get(node.identifier);
      if (destination !== undefined) values.push(JSON.stringify(["destination", destination]));
    }
    if ("children" in node) node.children.forEach(visit);
  };
  visit(tree);
  return values.sort();
}

/** Checks literal Markdown invariants only. A passing result does not establish semantic fidelity. */
export function replyRewriteBodyFailure(
  source: string,
  output: string,
): {
  readonly code: "empty_output" | "truncated" | "protocol";
  readonly message: string;
} | null {
  if (output.trim().length === 0) return { code: "empty_output", message: "The rewrite is empty." };
  if (output.length > MAX_BODY_LENGTH)
    return { code: "truncated", message: "The rewrite exceeds the body limit." };
  if (JSON.stringify(protectedValues(source)) !== JSON.stringify(protectedValues(output))) {
    return {
      code: "protocol",
      message: "The rewrite changed protected code or link destinations.",
    };
  }
  return null;
}
