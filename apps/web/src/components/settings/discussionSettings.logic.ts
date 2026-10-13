/** Derives discussion settings presentation and validates prompt drafts independently of transport. */
import type {
  DiscussionPromptWithModified,
  DiscussionTemplate,
  DiscussionProviderSupportResult,
} from "@t3tools/contracts";
import {
  canSelectDiscussionModel,
  type DiscussionDraftSeat,
} from "../discussions/discussionSeats.logic";

/**
 * Selects the error for a template group whose seat summaries also depend on the prompt subscription.
 * @param templatesError Template subscription failure message, or null when it has no failure.
 * @param promptsError Prompt subscription failure message, or null when it has no failure.
 * @returns The template failure first, otherwise the prompt failure; null allows loading or rendering.
 */
export function discussionTemplatesLoadError(
  templatesError: string | null,
  promptsError: string | null,
) {
  return templatesError ?? promptsError;
}

/**
 * Projects visible labels and ordered operations; builtins cannot be deleted.
 * @param prompt Ownership and server-computed modification state.
 * @returns Labels in display order and operations in left-to-right order, before permission gating.
 */
export function discussionPromptRow(
  prompt: Pick<DiscussionPromptWithModified, "builtin" | "modified">,
) {
  const labels: ("builtin" | "modified")[] = [];
  const actions: ("restore" | "edit" | "delete")[] = [];
  if (prompt.builtin) labels.push("builtin");
  if (prompt.builtin && prompt.modified) {
    labels.push("modified");
    actions.push("restore");
  }
  actions.push("edit");
  if (!prompt.builtin) actions.push("delete");
  return { labels, actions };
}

/**
 * Formats identities and configured provider names without exposing model identifiers.
 * @param seats Seats in speaking order.
 * @param prompts Current personas in the selected environment.
 * @param providers Instance-specific display names from that same environment.
 * @param deletedPersona Localized fallback for a missing persona reference.
 * @returns Ordered seat descriptions; missing providers use their routing identity.
 */
export function discussionSeatSummary(
  seats: DiscussionTemplate["seats"],
  prompts: readonly Pick<DiscussionPromptWithModified, "id" | "name">[],
  providers: readonly { readonly instanceId: string; readonly displayName: string }[],
  deletedPersona: string,
) {
  return seats
    .map((seat) => {
      const persona = prompts.find((prompt) => prompt.id === seat.personaPromptId);
      const provider = providers.find(
        (entry) => entry.instanceId === seat.modelSelection.instanceId,
      );
      return `${persona?.name ?? deletedPersona} · ${provider?.displayName ?? seat.modelSelection.instanceId}`;
    })
    .join("、");
}

/**
 * Gates saving before RPC validation; descriptions may remain empty.
 * @param draft Untrimmed required form fields.
 * @param writable Whether the destination command currently grants write access.
 * @param busy Whether a save is already in flight.
 * @returns True only for nonblank required fields in a writable, idle form.
 */
export function canSaveDiscussionPrompt(
  draft: { readonly name: string; readonly prompt: string },
  writable: boolean,
  busy: boolean,
) {
  return writable && !busy && draft.name.trim().length > 0 && draft.prompt.trim().length > 0;
}

/**
 * Initializes an editor from a saved template or externally supplied speaking order.
 * @param template Existing snapshot, or null/omitted for creation.
 * @param initialSeats External prefill used only for creation.
 * @returns Editable name and seats with the summary reference retained for saved templates.
 */
export function initialDiscussionTemplateDraft(
  template: DiscussionTemplate | null = null,
  initialSeats: readonly DiscussionDraftSeat[] = [],
) {
  return {
    name: template?.name ?? "",
    seats: [...(template?.seats ?? initialSeats)],
    summaryPromptId: template?.summaryPromptId ?? null,
  };
}

/**
 * Gates template writes against content, provider support, permission and in-flight submission.
 * @param draft Untrimmed name and ordered seats.
 * @param support Destination provider capabilities; null means not yet known.
 * @param writable Destination command permission.
 * @param busy Whether this editor already submitted a write.
 * @returns True only for a named, nonempty, supported configuration in an idle writable editor.
 */
export function canSaveDiscussionTemplate(
  draft: { readonly name: string; readonly seats: readonly DiscussionDraftSeat[] },
  support: DiscussionProviderSupportResult | null,
  writable: boolean,
  busy: boolean,
) {
  return (
    writable &&
    !busy &&
    draft.name.trim().length > 0 &&
    draft.seats.length > 0 &&
    draft.seats.every((seat) =>
      canSelectDiscussionModel(seat.modelSelection.instanceId, support, true),
    )
  );
}
