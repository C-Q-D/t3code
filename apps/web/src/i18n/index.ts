/** Installs UI dictionaries before main evaluates; keeps non-English messages in lazy chunks. */
import { en, type Messages } from "./locales/en";
import { resolveActiveLocale, type Locale } from "./locale";

export let t: Messages = en;
export let activeLocale: Locale = "en";

/**
 * Replaces UI messages and updates the document language when a document exists.
 * @param locale Language represented by messages.
 * @param messages Complete dictionary matching the English key and value types.
 */
export function installMessages(locale: Locale, messages: Messages): void {
  t = messages;
  activeLocale = locale;
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.lang = locale;
  }
}

/**
 * Installs the startup language; English needs no network request and load failures fall back to it.
 * Returns without changing messages or activeLocale when window, document, or
 * document.documentElement is absent.
 * @param locale Optional explicit language; otherwise uses the saved device and host preferences.
 * @param load Chinese dictionary loader; defaults to the separate bundled chunk.
 * @returns A promise that resolves after installation, fallback, or a skipped installation;
 * dictionary load failures do not reject it.
 */
export async function installLocaleMessages(
  locale?: Locale,
  load = (): Promise<{ messages: Messages } | undefined> => import("./locales/zh-CN"),
): Promise<void> {
  // Node has navigator too; partial document stubs must not select a host language.
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    !document.documentElement
  ) {
    return;
  }
  const resolvedLocale = locale ?? resolveActiveLocale();
  if (resolvedLocale === "en") {
    installMessages("en", en);
    return;
  }
  try {
    const module = await load();
    if (!module) throw new Error("Chinese dictionary was not available");
    installMessages("zh-CN", module.messages);
  } catch (error) {
    console.error("[i18n] Could not load zh-CN messages; using English.", error);
    installMessages("en", en);
  }
}
