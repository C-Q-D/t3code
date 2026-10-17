/** Protects settings presentation and recognizes empty drafts without rendering or mocking UI. */
import { expect, it } from "vite-plus/test";
import { isDiscussionDraftTemplate } from "./DiscussionTemplateEditor.logic";

it("uses the new-discussion presentation for an explicitly empty seat snapshot", () => {
  expect(isDiscussionDraftTemplate(undefined, [])).toBe(true);
});

it("keeps settings creation unchanged when no snapshot was supplied", () => {
  expect(isDiscussionDraftTemplate(undefined, undefined)).toBe(false);
});

it("keeps saved-template editing unchanged even when a snapshot is supplied", () => {
  expect(isDiscussionDraftTemplate("saved-template", [])).toBe(false);
});
