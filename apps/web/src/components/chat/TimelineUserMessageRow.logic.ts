/** Derives user-message labels, attachment presentation and annotation matching without rendering. */
import { isVideoAttachment, type ChatFileAttachment, type ChatImageAttachment } from "../../types";
import { isSvgAttachment } from "@t3tools/shared/image";
import type { ComposerContextRecord, KnownComposerContextRecord } from "@t3tools/contracts";
import { asKnownContextRecord } from "~/lib/composerContextRecords";

export function userMessageFileLabel(file: Pick<ChatFileAttachment, "name" | "source">) {
  return file.source?._tag === "pasted-text" ? "Pasted text" : file.name;
}

/** Selects the sent-message file surface and its display label; the filename still identifies the resource. */
export function userMessageFilePresentation(file: ChatFileAttachment) {
  const isVideo = isVideoAttachment(file);
  return { label: userMessageFileLabel(file), useFileWell: !isVideo && !isSvgAttachment(file) };
}

export function resolvePreviewAnnotationImage(input: {
  record: Extract<KnownComposerContextRecord, { kind: "preview-annotation" }>;
  recordsById: ReadonlyMap<string, ComposerContextRecord>;
  userImages: ReadonlyArray<ChatImageAttachment>;
  previewImages: ReadonlyArray<ChatImageAttachment>;
  annotationRecordIds: ReadonlyArray<string>;
}): ChatImageAttachment | null {
  const screenshotRecord = input.record.screenshotContextId
    ? asKnownContextRecord(input.recordsById.get(input.record.screenshotContextId))
    : undefined;
  return (
    (screenshotRecord?.kind === "image"
      ? input.userImages.find((image) => image.id === screenshotRecord.attachmentId)
      : undefined) ??
    input.previewImages.find(
      (image) => image.name === `preview-annotation-${input.record.annotationId}.png`,
    ) ??
    input.previewImages[input.annotationRecordIds.indexOf(input.record.contextId)] ??
    null
  );
}
