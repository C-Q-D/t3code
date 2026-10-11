/** Localized usage presentation and existing interaction behavior. */
import { t } from "~/i18n";
import {
  parseUsagePriceForm,
  usagePriceForm,
  USAGE_PRICE_FIELDS,
  type UsagePriceForm,
} from "./usagePriceForm";
import type { UsagePriceChange, UsagePriceTarget } from "./usagePriceTargets";

export type UsagePriceField = (typeof USAGE_PRICE_FIELDS)[number]["key"];

export interface UsagePriceDraft {
  readonly id: string;
  readonly model: string;
  readonly isNew: boolean;
  readonly values: Partial<Pick<UsagePriceForm, UsagePriceField>>;
  /** Edited "Map to" model. Absent keeps each environment's mapping; blank removes it. */
  readonly alias?: string;
  readonly removed?: boolean;
}

export function isEmptyUsagePriceDraft(draft: UsagePriceDraft) {
  return (
    draft.isNew &&
    draft.model.trim() === "" &&
    (draft.alias ?? "").trim() === "" &&
    Object.values(draft.values).every((value) => value.trim() === "")
  );
}

function modelPrice(target: UsagePriceTarget, model: string) {
  return target.prices && Object.hasOwn(target.prices, model) ? target.prices[model] : undefined;
}

function modelAlias(target: UsagePriceTarget, model: string) {
  return target.aliases && Object.hasOwn(target.aliases, model) ? target.aliases[model] : undefined;
}

/** The "Map to" cell across the selected environments, read like a price cell. */
export function usageAliasCell(targets: readonly UsagePriceTarget[], model: string) {
  if (targets.some((target) => target.aliases === null))
    return { value: "", placeholder: t.tools.usage.unavailable };
  const values = targets.map((target) => modelAlias(target, model) ?? "");
  if (values.some((value) => value !== values[0]))
    return { value: "", placeholder: t.tools.usage.mixed };
  return { value: values[0] ?? "", placeholder: t.tools.usage.none };
}

/** Returns the displayed price and placeholder for model/field across targets; unavailable or differing prices yield empty values with distinct localized placeholders. */
export function usagePriceCell(
  targets: readonly UsagePriceTarget[],
  model: string,
  field: UsagePriceField,
) {
  const optional = USAGE_PRICE_FIELDS.find((entry) => entry.key === field)!.optional;
  const values = targets.map((target) =>
    modelPrice(target, model) ? usagePriceForm(model, modelPrice(target, model))[field] : null,
  );
  if (targets.some((target) => target.prices === null))
    return { value: "", placeholder: t.tools.usage.unavailable };
  if (values.some((value) => value !== values[0]))
    return { value: "", placeholder: t.tools.usage.mixed };
  return {
    value: values[0] ?? "",
    placeholder:
      values[0] === null ? t.tools.usage.automatic : optional ? t.tools.usage.inputRate : "0.00",
  };
}

/** Only edited cells replace rates; untouched cells retain each environment's own values. */
export function usagePriceTableChanges(
  target: UsagePriceTarget,
  drafts: readonly UsagePriceDraft[],
) {
  const changes: UsagePriceChange[] = [];
  const errors = new Map<string, string>();
  for (const draft of drafts) {
    if (isEmptyUsagePriceDraft(draft)) continue;
    const model = draft.model.trim();
    const currentAlias = modelAlias(target, model);
    if (draft.removed) {
      if (modelPrice(target, model)) changes.push({ model, price: null });
      if (currentAlias !== undefined) changes.push({ model, alias: null });
      continue;
    }
    // A mapped model is priced as its target, so mapping it drops its own price.
    const alias = (draft.alias ?? currentAlias ?? "").trim();
    if (alias !== "") {
      if (model === "") errors.set(draft.id, t.tools.usage.enterModelId);
      else if (alias === model) errors.set(draft.id, t.tools.usage.differentModel);
      else {
        if (alias !== currentAlias) changes.push({ model, alias });
        if (modelPrice(target, model)) changes.push({ model, price: null });
      }
      continue;
    }
    if (currentAlias !== undefined) {
      changes.push({ model, alias: null });
      // Clearing a mapping without entering prices returns to automatic pricing.
      if (
        !modelPrice(target, model) &&
        Object.values(draft.values).every((value) => value.trim() === "")
      )
        continue;
    }
    const original = usagePriceForm(model, modelPrice(target, model));
    const form = { ...original, ...draft.values };
    const parsed = parseUsagePriceForm(form);
    if (parsed === null) {
      const missing = USAGE_PRICE_FIELDS.find(
        (field) => !field.optional && form[field.key].trim() === "",
      );
      errors.set(
        draft.id,
        model === ""
          ? t.tools.usage.enterModelId
          : missing
            ? t.tools.usage.requiredPrice(missing.label, target.label)
            : t.tools.usage.nonNegativePrices,
      );
      continue;
    }
    const next = usagePriceForm(model, parsed.price);
    if (USAGE_PRICE_FIELDS.some((field) => original[field.key] !== next[field.key]))
      changes.push(parsed);
  }
  return { changes, errors };
}

/** Unavailable destinations report a save failure without blocking writable environments. */
export function usagePriceTableErrors(
  targets: readonly UsagePriceTarget[],
  drafts: readonly UsagePriceDraft[],
) {
  return new Map(
    targets
      .filter((target) => target.unavailable === null && target.prices !== null)
      .flatMap((target) => [...usagePriceTableChanges(target, drafts).errors]),
  );
}
