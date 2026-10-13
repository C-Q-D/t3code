/** Shares seat-card model naming with the discussion transcript; catalog lookup stays with callers. */
import type { ModelSelection } from "@t3tools/contracts";
import type { ProviderInstanceEntry } from "~/providerInstances";
import { getTriggerDisplayModelName, type ModelEsque } from "../chat/providerIconUtils";

/**
 * Preserves the existing instance label, short model name and Claude qualifier handling.
 * @param selection Stored instance and model identities; used when catalog entries are absent.
 * @param instance Matching configured instance, undefined while unavailable or removed.
 * @param model Matching catalog option, undefined when the stored model is not listed.
 * @returns Instance display name or ID, separator, and formatted model name or raw slug.
 */
export function discussionModelLabel(
  selection: ModelSelection,
  instance: Pick<ProviderInstanceEntry, "displayName" | "driverKind"> | undefined,
  model: ModelEsque | undefined,
): string {
  return `${instance?.displayName ?? selection.instanceId} · ${model ? getTriggerDisplayModelName({ ...model, subProvider: instance?.driverKind === "claudeAgent" ? "Claude" : model.subProvider }) : selection.model}`;
}
