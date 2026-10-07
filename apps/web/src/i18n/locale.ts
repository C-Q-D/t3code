/** Resolves device-local language preferences without DOM access or UI dependencies. */
export const SUPPORTED_LOCALES = ["en", "zh-CN"] as const;

/** A language with a bundled UI dictionary. */
export type Locale = (typeof SUPPORTED_LOCALES)[number];
/** A device-local choice, including the host system language. */
export type LocalePreference = Locale | "system";

export const LOCALE_STORAGE_KEY = "t3code:locale";
export const LOCALE_DISPLAY_NAMES: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文",
};

/** Narrows an untrusted stored or selected value to a supported preference. */
export function isLocalePreference(value: unknown): value is LocalePreference {
  return value === "system" || value === "en" || value === "zh-CN";
}

/**
 * Resolves a preference to a bundled language; all Chinese variants use Simplified Chinese.
 * @param preference Device choice; explicit languages take priority over system tags.
 * @param systemTags Host language tags, possibly empty; any Chinese tag selects zh-CN.
 * @returns The explicit language, zh-CN for Chinese systems, or en otherwise.
 */
export function resolveLocale(preference: LocalePreference, systemTags: readonly string[]): Locale {
  if (preference !== "system") return preference;
  return systemTags.some((tag) => tag.split(/[-_]/)[0]?.toLowerCase() === "zh") ? "zh-CN" : "en";
}

/** Returns host language tags, preferring Electron's OS locale; no window yields no tags. */
export function readSystemLocaleTags(): readonly string[] {
  if (typeof window === "undefined") return [];
  const desktopLocale = window.desktopBridge?.getSystemLocale?.();
  if (desktopLocale) return [desktopLocale];
  if (typeof navigator === "undefined") return [];
  return navigator.languages ?? [navigator.language];
}

/** Returns the saved device choice, or system when storage is absent, blocked, or invalid. */
export function readLocalePreference(): LocalePreference {
  if (typeof window === "undefined") return "system";
  try {
    const preference = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocalePreference(preference) ? preference : "system";
  } catch {
    return "system";
  }
}

/**
 * Saves a language choice on this device without throwing on blocked storage.
 * @param preference Supported choice to persist, including system.
 * @returns Whether storage accepted the choice; callers must handle false before reloading.
 */
export function writeLocalePreference(preference: LocalePreference): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, preference);
    return true;
  } catch {
    return false;
  }
}

/** Resolves the saved device choice against the current host's language tags. */
export function resolveActiveLocale(): Locale {
  return resolveLocale(readLocalePreference(), readSystemLocaleTags());
}
