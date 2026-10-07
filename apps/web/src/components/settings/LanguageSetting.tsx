/** Edits the device-local UI language and reloads only after the preference is saved. */
import { t } from "~/i18n";
import {
  isLocalePreference,
  LOCALE_DISPLAY_NAMES,
  readLocalePreference,
  SUPPORTED_LOCALES,
  writeLocalePreference,
} from "~/i18n/locale";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { toastManager } from "../ui/toast";
import { SettingResetButton, SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

/** Renders a device-local setting; selection and reset persist before reloading the page. */
export function LanguageSetting() {
  const preference = readLocalePreference();

  /**
   * Saves a validated choice and reloads the UI; failed storage leaves the current page running.
   * @param value Selected preference; unsupported and unchanged values are ignored.
   */
  function changeLanguage(value: unknown): void {
    if (!isLocalePreference(value) || value === preference) return;
    if (!writeLocalePreference(value)) {
      toastManager.add({
        type: "error",
        title: t.settings.rows.language.saveError,
        description: t.settings.rows.language.saveErrorDescription,
      });
      return;
    }
    window.location.reload();
  }

  return (
    <SettingsSection id="appearance-language" title={t.settings.sections.appearanceLanguage}>
      <SettingsRow
        {...searchableSetting("language")}
        description={t.settings.rows.language.description}
        resetAction={
          preference !== "system" ? (
            <SettingResetButton
              label={t.settings.rows.language.title}
              tooltip={t.settings.rows.language.reset}
              onClick={() => changeLanguage("system")}
            />
          ) : null
        }
        control={
          <div className="w-full sm:w-40">
            <Select value={preference} onValueChange={changeLanguage}>
              <SelectTrigger size="sm" aria-label={t.settings.rows.language.ariaLabel}>
                <SelectValue>
                  {preference === "system"
                    ? t.settings.rows.language.options.system
                    : LOCALE_DISPLAY_NAMES[preference]}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="system">
                  {t.settings.rows.language.options.system}
                </SelectItem>
                {SUPPORTED_LOCALES.map((locale) => (
                  <SelectItem hideIndicator key={locale} value={locale}>
                    {LOCALE_DISPLAY_NAMES[locale]}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
        }
      />
    </SettingsSection>
  );
}
