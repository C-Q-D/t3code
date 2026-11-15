import * as Schema from "effect/Schema";
import {
  EnvironmentId,
  MessageId,
  NonNegativeInt,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";

export const ASSISTANT_CITATION_MAX_TEXT_LENGTH = 8_000;
export const ASSISTANT_CITATION_MAX_COMMENT_LENGTH = 8_000;
export const ASSISTANT_CITATION_CONTEXT_LENGTH = 32;

const AssistantCitationFields = {
  environmentId: EnvironmentId.check(Schema.isMaxLength(512)),
  threadId: ThreadId.check(Schema.isMaxLength(512)),
  messageId: MessageId.check(Schema.isMaxLength(512)),
  text: Schema.String.check(
    Schema.isNonEmpty(),
    Schema.isMaxLength(ASSISTANT_CITATION_MAX_TEXT_LENGTH),
  ),
  comment: Schema.optional(
    Schema.String.check(Schema.isMaxLength(ASSISTANT_CITATION_MAX_COMMENT_LENGTH)),
  ),
  start: NonNegativeInt.check(Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER)),
  end: NonNegativeInt.check(Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER)),
  prefix: Schema.String.check(Schema.isMaxLength(ASSISTANT_CITATION_CONTEXT_LENGTH)),
  suffix: Schema.String.check(Schema.isMaxLength(ASSISTANT_CITATION_CONTEXT_LENGTH)),
};

export const AssistantCitationV1 = Schema.Struct({
  version: Schema.Literal(1),
  ...AssistantCitationFields,
});
export type AssistantCitationV1 = typeof AssistantCitationV1.Type;

/** A rewrite selector identifies the successful request, even after its body is replaced. */
export const AssistantCitationV2 = Schema.Union([
  Schema.Struct({
    version: Schema.Literal(2),
    ...AssistantCitationFields,
    source: Schema.Literal("original"),
  }),
  Schema.Struct({
    version: Schema.Literal(2),
    ...AssistantCitationFields,
    source: Schema.Literal("rewrite"),
    rewriteRequestId: TrimmedNonEmptyString.check(Schema.isMaxLength(512)),
  }),
]);
export type AssistantCitationV2 = typeof AssistantCitationV2.Type;

/** Positions are UTF-16 offsets into the selected source; text remains usable without that source. */
export const AssistantCitation = Schema.Union([AssistantCitationV1, AssistantCitationV2]).check(
  Schema.makeFilter((citation) => citation.end > citation.start && citation.text.trim().length > 0),
);
export type AssistantCitation = typeof AssistantCitation.Type;
