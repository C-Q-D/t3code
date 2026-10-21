/** Persists usage filters and migrates the removed limits metric at the read boundary. */
import { UsageProviderKind } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { getLocalStorageItem, setLocalStorageItem } from "../../hooks/useLocalStorage";

const STORAGE_KEY = "t3code:usage-page-preferences:v1";
const UsagePagePreferencesSchema = Schema.Struct({
  metric: Schema.Literals(["cost", "tokens", "limits"]),
  windowDays: Schema.Literals([1, 7, 30, 90]),
  hiddenProviders: Schema.optional(Schema.Array(UsageProviderKind)),
});
/** Current writable preferences exclude the retired metric; stored filters remain compatible. */
export type UsagePagePreferences = Omit<typeof UsagePagePreferencesSchema.Type, "metric"> & {
  readonly metric: "cost" | "tokens";
};

const DEFAULT_PREFERENCES: UsagePagePreferences = { metric: "cost", windowDays: 30 };

/** Reads saved filters, migrating limits to cost; unavailable or invalid storage uses defaults. */
export function readUsagePagePreferences(): UsagePagePreferences {
  try {
    const stored = getLocalStorageItem(STORAGE_KEY, UsagePagePreferencesSchema);
    return stored
      ? { ...stored, metric: stored.metric === "limits" ? "cost" : stored.metric }
      : DEFAULT_PREFERENCES;
  } catch (error) {
    console.error("Could not read Usage page preferences.", error);
    return DEFAULT_PREFERENCES;
  }
}

/** Saves current filters; storage failures are reported without breaking page interaction. */
export function saveUsagePagePreferences(preferences: UsagePagePreferences): void {
  try {
    setLocalStorageItem(STORAGE_KEY, preferences, UsagePagePreferencesSchema);
  } catch (error) {
    console.error("Could not save Usage page preferences.", error);
  }
}
