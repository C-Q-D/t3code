import { replyRewriteBodyFailure } from "@t3tools/shared/replyRewriteBody";

/** Literal checks produce review evidence, never a semantic-fidelity pass. */
export function gradeReplyRewrite(
  source: string,
  text: string,
  protectedPhrases: readonly string[],
) {
  const bodyFailure = replyRewriteBodyFailure(source, text);
  const missing = protectedPhrases.filter((phrase) => !text.includes(phrase));
  return {
    literalChecksPassed: bodyFailure === null && missing.length === 0,
    bodyFailure,
    missing,
    semanticReview: "required" as const,
  };
}
