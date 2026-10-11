/** Resolves persisted device preferences for native UI, including startup before a renderer exists. */
import type { UiLocalePreference } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ElectronApp from "../electron/ElectronApp.ts";
import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";
import { desktopMessages, type DesktopMessages, type UiLocale } from "./desktopMessages.ts";

/** Resolves a device choice; Chinese region and script variants use Simplified Chinese. */
export function resolveUiLocale(preference: UiLocalePreference, systemLocale: string): UiLocale {
  if (preference !== "system") return preference;
  return systemLocale.split(/[-_]/)[0]?.toLowerCase() === "zh" ? "zh-CN" : "en";
}

/** Reads current native language and persists renderer reports without owning menus or windows. */
export class DesktopUiLocale extends Context.Service<
  DesktopUiLocale,
  {
    readonly current: Effect.Effect<UiLocale>;
    readonly messages: Effect.Effect<DesktopMessages>;
    readonly setPreference: (
      preference: UiLocalePreference,
    ) => Effect.Effect<boolean, DesktopAppSettings.DesktopSettingsWriteError>;
  }
>()("@t3tools/desktop/i18n/DesktopUiLocale") {}

const make = Effect.gen(function* () {
  const settings = yield* DesktopAppSettings.DesktopAppSettings;
  const app = yield* ElectronApp.ElectronApp;
  const current = Effect.gen(function* () {
    const { uiLocalePreference } = yield* settings.get;
    if (uiLocalePreference !== "system") return uiLocalePreference;
    // Startup failure reporting can run before Electron's OS locale is available.
    const systemLocale = yield* app.systemLocale.pipe(Effect.catchDefect(() => Effect.succeed("")));
    return resolveUiLocale(uiLocalePreference, systemLocale);
  });
  return DesktopUiLocale.of({
    current,
    messages: current.pipe(Effect.map(desktopMessages)),
    setPreference: (preference) =>
      settings.setUiLocalePreference(preference).pipe(Effect.map((change) => change.changed)),
  });
});
export const layer = Layer.effect(DesktopUiLocale, make);

/** Supplies a fixed native language to tests that do not exercise preference persistence. */
export const layerTest = (locale: UiLocale = "en") =>
  Layer.succeed(DesktopUiLocale, {
    current: Effect.succeed(locale),
    messages: Effect.succeed(desktopMessages(locale)),
    setPreference: () => Effect.succeed(false),
  });
